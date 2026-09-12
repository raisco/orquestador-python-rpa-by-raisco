"""
metrics_service.py
------------------
Cálculo de métricas para el dashboard por bot. Las agregaciones se hacen
en Python sobre ventanas acotadas (últimos N días) para que el mismo
código corra en SQLite y en Postgres sin depender de `percentile_cont`.

Para volúmenes grandes se migraría a una tabla rollup
`execution_stats_daily` refrescada por Celery Beat (ver MANUAL_TECNICO).
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models


def _since(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


def _pct(values: list[float], p: float) -> float | None:
    if not values:
        return None
    s = sorted(values)
    k = max(0, min(len(s) - 1, int(round((p / 100) * (len(s) - 1)))))
    return round(s[k], 2)


def overview(db: Session) -> dict:
    since = _since(1)
    execs = db.scalars(select(models.Execution).where(models.Execution.created_at >= since)).all()
    done = [e for e in execs if e.status in (models.EXEC_SUCCESS, models.EXEC_FAILED)]
    ok = [e for e in done if e.status == models.EXEC_SUCCESS]
    return {
        "processes": db.scalar(select(func.count()).select_from(models.Process)),
        "queues": db.scalar(select(func.count()).select_from(models.Queue)),
        "executions_24h": len(execs),
        "success_rate_24h": round(100 * len(ok) / len(done), 1) if done else None,
        "active_now": db.scalar(
            select(func.count()).select_from(models.Execution)
            .where(models.Execution.status == models.EXEC_RUNNING)
        ),
        "items_pending": db.scalar(
            select(func.count()).select_from(models.QueueItem)
            .where(models.QueueItem.status == models.QI_NEW)
        ),
    }


def process_summary(db: Session, process_id: int, days: int) -> dict:
    since = _since(days)
    execs = db.scalars(
        select(models.Execution).where(
            models.Execution.process_id == process_id,
            models.Execution.created_at >= since,
        )
    ).all()
    done = [e for e in execs if e.status in (models.EXEC_SUCCESS, models.EXEC_FAILED)]
    ok = [e for e in done if e.status == models.EXEC_SUCCESS]
    durations = [e.duration_s for e in done if e.duration_s is not None]
    last = max((e.started_at for e in execs if e.started_at), default=None)

    # items de la(s) cola(s) asociada(s) al proceso
    proc = db.get(models.Process, process_id)
    items = []
    if proc and proc.queue_id:
        items = db.scalars(
            select(models.QueueItem).where(
                models.QueueItem.queue_id == proc.queue_id,
                models.QueueItem.created_at >= since,
            )
        ).all()

    return {
        "runs": len(execs),
        "success": len(ok),
        "failed": len(done) - len(ok),
        "success_rate": round(100 * len(ok) / len(done), 1) if done else None,
        "avg_duration_s": round(sum(durations) / len(durations), 2) if durations else None,
        "p95_duration_s": _pct(durations, 95),
        "last_run": last.isoformat() if last else None,
        "active_now": sum(1 for e in execs if e.status == models.EXEC_RUNNING),
        "items_total": len(items),
        "items_successful": sum(1 for i in items if i.status == models.QI_SUCCESSFUL),
        "items_business": sum(1 for i in items if i.exception_type == models.EXC_BUSINESS),
        "items_app": sum(1 for i in items if i.exception_type == models.EXC_APPLICATION
                         and i.status == models.QI_FAILED),
    }


def process_timeseries(db: Session, process_id: int, days: int) -> list[dict]:
    since = _since(days)
    execs = db.scalars(
        select(models.Execution).where(
            models.Execution.process_id == process_id,
            models.Execution.created_at >= since,
            models.Execution.status.in_([models.EXEC_SUCCESS, models.EXEC_FAILED, models.EXEC_ABORTED]),
        )
    ).all()
    buckets: dict[str, dict] = {}
    for i in range(days + 1):
        day = (datetime.now(timezone.utc) - timedelta(days=days - i)).strftime("%Y-%m-%d")
        buckets[day] = {"ts": day, "success": 0, "failed": 0, "aborted": 0}
    for e in execs:
        day = (e.started_at or e.created_at).strftime("%Y-%m-%d")
        b = buckets.get(day)
        if not b:
            continue
        if e.status == models.EXEC_SUCCESS:
            b["success"] += 1
        elif e.status == models.EXEC_FAILED:
            b["failed"] += 1
        else:
            b["aborted"] += 1
    return list(buckets.values())


def duration_histogram(db: Session, process_id: int, days: int, bins: int = 8) -> list[dict]:
    since = _since(days)
    durations = [
        e.duration_s for e in db.scalars(
            select(models.Execution).where(
                models.Execution.process_id == process_id,
                models.Execution.created_at >= since,
                models.Execution.duration_s.isnot(None),
            )
        ).all()
    ]
    if not durations:
        return []
    lo, hi = min(durations), max(durations)
    if hi == lo:
        hi = lo + 1
    step = (hi - lo) / bins
    out = []
    for b in range(bins):
        a, z = lo + b * step, lo + (b + 1) * step
        count = sum(1 for d in durations if (a <= d < z) or (b == bins - 1 and d == z))
        out.append({"bucket": f"{a:.0f}-{z:.0f}s", "count": count})
    return out


def queue_throughput(db: Session, process_id: int, hours: int) -> list[dict]:
    proc = db.get(models.Process, process_id)
    if not proc or not proc.queue_id:
        return []
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    events = db.scalars(
        select(models.QueueItemEvent)
        .join(models.QueueItem, models.QueueItem.id == models.QueueItemEvent.item_id)
        .where(models.QueueItem.queue_id == proc.queue_id, models.QueueItemEvent.at >= since)
    ).all()
    buckets: dict[str, dict] = {}
    for i in range(hours + 1):
        h = (datetime.now(timezone.utc) - timedelta(hours=hours - i)).strftime("%Y-%m-%d %H:00")
        buckets[h] = {"ts": h, "successful": 0, "failed": 0, "retried": 0}
    for ev in events:
        h = ev.at.strftime("%Y-%m-%d %H:00")
        b = buckets.get(h)
        if not b:
            continue
        if ev.to_status == models.QI_SUCCESSFUL:
            b["successful"] += 1
        elif ev.to_status == models.QI_FAILED:
            b["failed"] += 1
        elif ev.to_status == models.QI_RETRIED:
            b["retried"] += 1
    return list(buckets.values())
