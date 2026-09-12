"""Catálogo de procesos, ejecución manual y versionado."""

from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models
from ..config import settings
from ..db import get_db
from ..dto import process_dict, version_dict
from ..schemas import OkOut, ProcessIn, ProcessUpdate, RunOut, VersionIn
from ..services import execution_service, version_service

router = APIRouter(prefix="/api/processes", tags=["processes"])

_BOTS_ROOT = Path(settings.bots_dir).resolve()


def _scan_bots() -> dict[str, list[str]]:
    """Carpetas de bot y sus archivos .py, para poblar los selects del alta/edición."""
    out: dict[str, list[str]] = {}
    if not _BOTS_ROOT.is_dir():
        return out
    for sub in sorted(p for p in _BOTS_ROOT.iterdir() if p.is_dir() and p.name != "__pycache__"):
        # solo los .py de PRIMER nivel: son los candidatos a entrypoint.
        # Los módulos de soporte (subpaquetes) se importan solos, no se eligen.
        scripts = sorted(f.name for f in sub.glob("*.py") if f.name != "__init__.py")
        if scripts:
            out[sub.name] = scripts
    return out


def _check_entrypoint(bot_dir: str, entrypoint: str) -> None:
    target = _BOTS_ROOT / bot_dir / entrypoint
    if not target.is_file():
        avail = _scan_bots()
        raise HTTPException(
            400,
            f"No existe '{bot_dir}/{entrypoint}' en la carpeta de bots. "
            f"Carpeta = subdirectorio bajo bots/ (ej. 'rpa_challenge'); "
            f"Entrypoint = archivo .py dentro de esa carpeta (ej. 'performer.py'). "
            f"Disponibles: {avail}",
        )




def _would_cycle(db: Session, process_id: int, new_after_id: int) -> bool:
    """True si encadenar process_id -> new_after_id cerraría un ciclo."""
    cur, depth = new_after_id, 0
    while cur is not None and depth < 100:
        if cur == process_id:
            return True
        nxt = db.get(models.Process, cur)
        cur = nxt.after_process_id if nxt else None
        depth += 1
    return False


def _with_stats(db: Session, p: models.Process) -> dict:
    since = datetime.now(timezone.utc) - timedelta(days=7)
    execs = db.scalars(
        select(models.Execution).where(
            models.Execution.process_id == p.id, models.Execution.created_at >= since
        )
    ).all()
    done = [e for e in execs if e.status in (models.EXEC_SUCCESS, models.EXEC_FAILED)]
    ok = sum(1 for e in done if e.status == models.EXEC_SUCCESS)
    last = max((e for e in execs if e.started_at), key=lambda e: e.started_at, default=None)
    active_version = db.get(models.ProcessVersion, p.active_version_id) if p.active_version_id else None
    after = db.get(models.Process, p.after_process_id) if getattr(p, "after_process_id", None) else None
    return process_dict(p, extra={
        "queue_name": (db.get(models.Queue, p.queue_id).name if p.queue_id else None),
        "active_version": active_version.version if active_version else None,
        "success_rate_7d": round(100 * ok / len(done), 1) if done else None,
        "runs_7d": len(execs),
        "last_status": last.status if last else None,
        "last_run": last.started_at.isoformat() if last else None,
        "after_process_name": after.name if after else None,
    })


@router.get("")
def list_processes(db: Session = Depends(get_db)):
    return [_with_stats(db, p) for p in db.scalars(select(models.Process).order_by(models.Process.id)).all()]


@router.get("/bot-scripts")
def bot_scripts():
    """{ '<carpeta>': ['archivo1.py', ...] } — para los selects del alta/edición de procesos."""
    return _scan_bots()


@router.post("")
def create_process(payload: ProcessIn, db: Session = Depends(get_db)):
    if db.scalar(select(models.Process).where(models.Process.key == payload.key)):
        raise HTTPException(409, f"ya existe un proceso con key '{payload.key}'")
    _check_entrypoint(payload.bot_dir, payload.entrypoint)
    queue_id = None
    if payload.queue_name:
        q = db.scalar(select(models.Queue).where(models.Queue.name == payload.queue_name))
        if q is None:
            raise HTTPException(400, f"la cola '{payload.queue_name}' no existe")
        queue_id = q.id
    if payload.after_process_id is not None and db.get(models.Process, payload.after_process_id) is None:
        raise HTTPException(400, "el proceso del que depende no existe")
    p = models.Process(
        key=payload.key, name=payload.name, description=payload.description,
        kind=payload.kind, bot_dir=payload.bot_dir, entrypoint=payload.entrypoint,
        queue_id=queue_id, max_concurrency=payload.max_concurrency,
        after_process_id=payload.after_process_id, after_policy=payload.after_policy,
    )
    db.add(p)
    db.commit()
    return _with_stats(db, p)


@router.get("/{process_id}")
def get_process(process_id: int, db: Session = Depends(get_db)):
    p = db.get(models.Process, process_id)
    if p is None:
        raise HTTPException(404, "proceso no encontrado")
    return _with_stats(db, p)


@router.patch("/{process_id}")
def update_process(process_id: int, payload: ProcessUpdate, db: Session = Depends(get_db)):
    p = db.get(models.Process, process_id)
    if p is None:
        raise HTTPException(404, "proceso no encontrado")

    data = payload.model_dump(exclude_unset=True)

    if "key" in data and data["key"] is not None and data["key"] != p.key:
        if db.scalar(select(models.Process).where(models.Process.key == data["key"], models.Process.id != process_id)):
            raise HTTPException(409, f"ya existe un proceso con key '{data['key']}'")
        p.key = data.pop("key")
    else:
        data.pop("key", None)

    if "queue_name" in data:
        name = (data.pop("queue_name") or "").strip()
        if name:
            q = db.scalar(select(models.Queue).where(models.Queue.name == name))
            if q is None:
                raise HTTPException(400, f"la cola '{name}' no existe")
            p.queue_id = q.id
        else:
            p.queue_id = None

    if "after_process_id" in data:
        apid = data.pop("after_process_id")
        if apid is None:
            p.after_process_id = None
        elif apid == process_id:
            raise HTTPException(400, "un proceso no puede depender de sí mismo")
        elif db.get(models.Process, apid) is None:
            raise HTTPException(400, "el proceso del que depende no existe")
        elif _would_cycle(db, process_id, apid):
            raise HTTPException(400, "esa dependencia genera un ciclo entre procesos")
        else:
            p.after_process_id = apid

    for field in ("name", "description", "kind", "bot_dir", "entrypoint", "max_concurrency", "after_policy"):
        if field in data and data[field] is not None:
            setattr(p, field, data[field])

    if ("bot_dir" in data or "entrypoint" in data):
        _check_entrypoint(p.bot_dir, p.entrypoint)

    db.commit()
    return _with_stats(db, p)


@router.delete("/{process_id}", response_model=OkOut)
def delete_process(process_id: int, db: Session = Depends(get_db)):
    p = db.get(models.Process, process_id)
    if p:
        db.execute(
            models.Process.__table__.update()
            .where(models.Process.after_process_id == process_id)
            .values(after_process_id=None)
        )
        db.delete(p)
        db.execute(models.Schedule.__table__.delete().where(models.Schedule.process_id == process_id))
        db.commit()
    return OkOut()


@router.post("/{process_id}/run", response_model=RunOut)
def run_process_now(process_id: int, db: Session = Depends(get_db)):
    p = db.get(models.Process, process_id)
    if p is None:
        raise HTTPException(404, "proceso no encontrado")
    ex = execution_service.enqueue_run(db, p, models.TRIGGER_MANUAL)
    return RunOut(execution_id=ex.id, status=ex.status, detail="ejecución encolada")


# --- Versionado ---------------------------------------------------------
@router.get("/{process_id}/versions")
def list_versions(process_id: int, db: Session = Depends(get_db)):
    p = db.get(models.Process, process_id)
    if p is None:
        raise HTTPException(404, "proceso no encontrado")
    rows = db.scalars(
        select(models.ProcessVersion)
        .where(models.ProcessVersion.process_id == process_id)
        .order_by(models.ProcessVersion.id.desc())
    ).all()
    return [version_dict(v, active_version_id=p.active_version_id) for v in rows]


@router.post("/{process_id}/versions")
def publish_version(process_id: int, payload: VersionIn, db: Session = Depends(get_db)):
    p = db.get(models.Process, process_id)
    if p is None:
        raise HTTPException(404, "proceso no encontrado")
    try:
        v = version_service.publish_version(db, p, payload.changelog)
    except FileNotFoundError as e:
        raise HTTPException(400, str(e))
    return version_dict(v, active_version_id=p.active_version_id)


@router.post("/{process_id}/versions/{version_id}/activate")
def activate_version(process_id: int, version_id: int, db: Session = Depends(get_db)):
    p = db.get(models.Process, process_id)
    if p is None:
        raise HTTPException(404, "proceso no encontrado")
    try:
        v = version_service.activate_version(db, p, version_id)
    except LookupError as e:
        raise HTTPException(404, str(e))
    return version_dict(v, active_version_id=p.active_version_id)
