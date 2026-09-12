"""
dto.py
------
Serializadores ORM -> dict para las respuestas de la API. Se mantienen acá
(y no como métodos del modelo) para que el esquema de la respuesta sea
explícito y fácil de versionar.
"""

from datetime import datetime

from . import models


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def process_dict(p: "models.Process", *, extra: dict | None = None) -> dict:
    d = {
        "id": p.id,
        "key": p.key,
        "name": p.name,
        "description": p.description,
        "kind": getattr(p, "kind", "standalone"),
        "bot_dir": p.bot_dir,
        "entrypoint": p.entrypoint,
        "queue_id": p.queue_id,
        "max_concurrency": p.max_concurrency,
        "active_version_id": p.active_version_id,
        "after_process_id": getattr(p, "after_process_id", None),
        "after_policy": getattr(p, "after_policy", "on_success"),
        "created_at": _iso(p.created_at),
    }
    if extra:
        d.update(extra)
    return d


def version_dict(v: "models.ProcessVersion", *, active_version_id: int | None = None) -> dict:
    return {
        "id": v.id,
        "process_id": v.process_id,
        "version": v.version,
        "commit_sha": v.commit_sha,
        "git_remote": v.git_remote,
        "changelog": v.changelog,
        "is_active": v.id == active_version_id,
        "created_at": _iso(v.created_at),
    }


def queue_item_dict(i: "models.QueueItem", *, with_data: bool = True) -> dict:
    d = {
        "id": i.id,
        "queue_id": i.queue_id,
        "reference": i.reference,
        "priority": i.priority,
        "status": i.status,
        "retry_count": i.retry_count,
        "parent_item_id": i.parent_item_id,
        "progress": i.progress,
        "exception_type": i.exception_type,
        "exception_reason": i.exception_reason,
        "locked_by": i.locked_by,
        "processing_execution_id": i.processing_execution_id,
        "started_at": _iso(i.started_at),
        "ended_at": _iso(i.ended_at),
        "created_at": _iso(i.created_at),
    }
    if with_data:
        d["specific_data"] = i.specific_data
        d["output_data"] = i.output_data
    return d


def event_dict(e: "models.QueueItemEvent") -> dict:
    return {
        "id": e.id,
        "from_status": e.from_status,
        "to_status": e.to_status,
        "execution_id": e.execution_id,
        "detail": e.detail,
        "at": _iso(e.at),
    }


def execution_dict(e: "models.Execution", *, with_logs: bool = False, process_name: str | None = None) -> dict:
    d = {
        "id": e.id,
        "process_id": e.process_id,
        "process_name": process_name,
        "version_id": e.version_id,
        "trigger": e.trigger,
        "status": e.status,
        "worker_id": e.worker_id,
        "queue_id": e.queue_id,
        "started_at": _iso(e.started_at),
        "finished_at": _iso(e.finished_at),
        "duration_s": e.duration_s,
        "exit_code": e.exit_code,
        "created_at": _iso(e.created_at),
    }
    if with_logs:
        d["stdout"] = e.stdout
        d["stderr"] = e.stderr
        d["log_path"] = e.log_path
    return d


def evidence_dict(ev: "models.Evidence") -> dict:
    return {
        "id": ev.id,
        "item_id": ev.item_id,
        "execution_id": ev.execution_id,
        "filename": ev.filename,
        "content_type": ev.content_type,
        "size": ev.size,
        "created_at": _iso(ev.created_at),
        "url": f"/api/evidence/{ev.id}/content",
    }


def asset_dict(a: "models.Asset") -> dict:
    return {
        "id": a.id,
        "name": a.name,
        "kind": a.kind,
        "filename": a.filename,
        "content_type": a.content_type,
        "size": a.size,
        "updated_at": _iso(a.updated_at),
        "created_at": _iso(a.created_at),
    }
