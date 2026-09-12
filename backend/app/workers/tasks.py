"""
tasks.py
--------
Tareas Celery.

run_process : lanza el bot de un proceso como subprocess AISLADO, captura
              stdout/stderr, y persiste todo en `executions` + archivo de log.
              Aplica un límite de concurrencia POR PROCESO usando slots en
              Redis (así 10 corridas del mismo bot pesado no saturan la máquina).
tick        : cada 30s revisa la tabla `schedules` y dispara los procesos cuyo
              cron venció (reemplaza APScheduler).
reap        : cada 60s libera queue_items InProgress de workers caídos.

Cómo llegan los logs del bot a la app (resumen):
  el bot escribe con print()/logging a stdout/stderr -> subprocess los
  captura en memoria del worker -> el worker los escribe en
  storage/logs/<execution_id>.log (completo) y guarda los últimos ~20k
  chars en executions.stdout/stderr -> la API los sirve -> el front hace
  polling de /api/executions/<id> mientras el estado sea RUNNING.
"""

import os
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from croniter import croniter
from sqlalchemy import select

from .. import models, storage
from ..config import settings
from ..db import SessionLocal
from ..timeutils import as_local, now_local
from .celery_app import celery

try:  # Redis es obligatorio para el modo worker; en modo inline puede faltar
    import redis as _redis_lib

    _redis = _redis_lib.Redis.from_url(settings.redis_url, socket_connect_timeout=2)
except Exception:  # pragma: no cover
    _redis = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Límite de concurrencia por proceso (slots en Redis)
# ---------------------------------------------------------------------------
def _acquire_slot(process_id: int, max_slots: int, token: str) -> str | None:
    if _redis is None:
        return "no-redis"  # dev inline: sin límite
    for k in range(max(1, max_slots)):
        key = f"slot:proc:{process_id}:{k}"
        try:
            if _redis.set(key, token, nx=True, ex=settings.job_timeout_seconds + 30):
                return key
        except Exception:
            return "no-redis"
    return None


def _release_slot(slot: str | None) -> None:
    if slot and slot not in ("no-redis", None) and _redis is not None:
        try:
            _redis.delete(slot)
        except Exception:
            pass


# ---------------------------------------------------------------------------
@celery.task(bind=True, name="app.workers.tasks.run_process", max_retries=None)
def run_process(self, process_id: int, trigger: str = models.TRIGGER_MANUAL,
                execution_id: int | None = None, queue_id: int | None = None):
    db = SessionLocal()
    slot = None
    try:
        proc = db.get(models.Process, process_id)
        if proc is None:
            return None

        token = getattr(self.request, "id", None) or "inline"
        slot = _acquire_slot(process_id, proc.max_concurrency, token)
        if slot is None:
            # sin cupo -> reintentar más tarde sin ejecutar
            raise self.retry(countdown=10)

        version = db.get(models.ProcessVersion, proc.active_version_id) if proc.active_version_id else None

        if execution_id:
            ex = db.get(models.Execution, execution_id)
        else:
            ex = models.Execution(process_id=process_id, trigger=trigger,
                                  queue_id=queue_id or proc.queue_id)
            db.add(ex)
            db.flush()
        ex.status = models.EXEC_RUNNING
        ex.started_at = _now()
        ex.worker_id = getattr(self.request, "hostname", None) or "inline"
        ex.version_id = version.id if version else None
        db.commit()
        exec_id = ex.id

        # ----- resolver desde dónde se ejecuta el bot -----
        if version:
            workdir = storage.path_for(version.snapshot_path)          # snapshot inmutable
        else:
            workdir = Path(settings.bots_dir).resolve() / proc.bot_dir  # código vivo (sin versión aún)
        script = workdir / proc.entrypoint

        env = {
            **os.environ,
            "PYTHONUNBUFFERED": "1",
            "PYTHONPATH": os.pathsep.join(
                [str(Path(settings.sdk_dir).resolve()), os.environ.get("PYTHONPATH", "")]
            ),
            "EXECUTION_ID": str(exec_id),
            "WORKER_ID": ex.worker_id,
            "ORCH_API_URL": settings.orch_api_url,
            "ORCH_TOKEN": settings.worker_token,
            "QUEUE_ID": str(queue_id or proc.queue_id or ""),
        }

        if not script.exists():
            _finish(db, exec_id, models.EXEC_FAILED, 0.0, -1, "",
                    f"No existe el entrypoint: {script}")
            return exec_id

        t0 = time.monotonic()
        try:
            r = subprocess.run(
                [sys.executable, str(script)],
                cwd=str(workdir),
                capture_output=True,
                text=True,
                timeout=settings.job_timeout_seconds,
                env=env,
            )
            out, err, code = r.stdout, r.stderr, r.returncode
            status = models.EXEC_SUCCESS if code == 0 else models.EXEC_FAILED
        except subprocess.TimeoutExpired as e:
            out = e.stdout if isinstance(e.stdout, str) else ""
            err = (e.stderr if isinstance(e.stderr, str) else "") + "\n[executor] TIMEOUT"
            code, status = -1, models.EXEC_FAILED

        _finish(db, exec_id, status, round(time.monotonic() - t0, 2), code, out, err)
        return exec_id
    finally:
        _release_slot(slot)
        db.close()


def _finish(db, exec_id: int, status: str, duration: float, code: int, out: str, err: str) -> None:
    full = (out or "") + ("\n----- STDERR -----\n" + err if err else "")
    log_key = storage.save_bytes("logs", f"{exec_id}.log", full.encode("utf-8", "replace"))
    ex = db.get(models.Execution, exec_id)
    ex.status = status
    ex.finished_at = _now()
    ex.duration_s = duration
    ex.exit_code = code
    ex.stdout = (out or "")[-20000:]
    ex.stderr = (err or "")[-20000:]
    ex.log_path = log_key
    db.commit()
    _trigger_chained(db, ex)


def _trigger_chained(db, ex: "models.Execution") -> None:
    """
    Encadenado de procesos: dispara los procesos que tienen
    `after_process_id == ex.process_id`, respetando su `after_policy`
    (on_success = solo si esta corrida terminó OK; always = siempre).
    """
    if ex.status not in (models.EXEC_SUCCESS, models.EXEC_FAILED):
        return
    chained = db.scalars(
        select(models.Process).where(models.Process.after_process_id == ex.process_id)
    ).all()
    if not chained:
        return

    from ..services import execution_service  # import tardío: evita ciclo con workers

    for nxt in chained:
        policy = getattr(nxt, "after_policy", models.AFTER_ON_SUCCESS) or models.AFTER_ON_SUCCESS
        if policy == models.AFTER_ON_SUCCESS and ex.status != models.EXEC_SUCCESS:
            continue
        execution_service.enqueue_run(db, nxt, models.TRIGGER_CHAIN)


# ---------------------------------------------------------------------------
@celery.task(name="app.workers.tasks.tick")
def tick():
    """
    Dispara los schedules cuyo cron venció desde la última corrida.
    El cron se interpreta en la ZONA LOCAL del orquestador (settings.tz),
    así "0 8 * * *" = 08:00 hora Argentina, no 08:00 UTC.
    """
    db = SessionLocal()
    try:
        now = now_local()
        for s in db.query(models.Schedule).filter_by(enabled=True).all():
            base = as_local(s.last_fired_at) or (now - timedelta(minutes=1))
            try:
                nxt = croniter(s.cron, base).get_next(datetime)
            except Exception:
                continue
            if nxt <= now:
                proc = db.get(models.Process, s.process_id)
                if proc:
                    run_process.delay(process_id=proc.id, trigger=models.TRIGGER_SCHEDULE)
                s.last_fired_at = now
        db.commit()
    finally:
        db.close()


@celery.task(name="app.workers.tasks.reap")
def reap():
    from ..services import queue_service

    db = SessionLocal()
    try:
        queue_service.reap_stale_items(db, settings.stale_item_minutes)
    finally:
        db.close()
