"""
queue_service.py
----------------
Motor de las COLAS TRANSACCIONALES. Es el corazón del orquestador.

Operaciones:
  add_items          -> encolar (bulk) items New.
  claim_next_item    -> tomar ATÓMICAMENTE el próximo New y pasarlo a InProgress.
  set_item_status    -> cerrar un item (success / application_error / business_error)
                        aplicando la política de reintentos de la cola.
  reap_stale_items   -> liberar items InProgress cuyo worker murió.

Concurrencia:
  En PostgreSQL el claim usa `FOR UPDATE SKIP LOCKED`: N workers pueden
  pedir items a la misma cola en paralelo sin pisarse ni bloquearse.
  En SQLite (dev local) se usa la misma sentencia sin esa cláusula; como
  SQLite serializa las escrituras igual queda consistente.
"""

import json
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete as sa_delete, func, select, text
from sqlalchemy.orm import Session

from .. import models, storage
from ..dto import queue_item_dict


def _purge_evidence_files(db: Session, item_ids: list[str]) -> None:
    """Borra del disco los archivos de evidencia de estos ítems (la fila en
    la tabla Evidence se borra aparte, esto es solo el storage_key físico)."""
    if not item_ids:
        return
    for storage_key in db.scalars(
        select(models.Evidence.storage_key).where(models.Evidence.item_id.in_(item_ids))
    ).all():
        try:
            storage.delete(storage_key)
        except Exception:
            pass

_CLAIM_PG = text(
    """
    UPDATE queue_items
       SET status = 'InProgress',
           locked_by = :worker,
           locked_at = :now,
           started_at = :now,
           processing_execution_id = :eid
     WHERE id = (
         SELECT id FROM queue_items
          WHERE queue_id = :qid
            AND status = 'New'
            AND (defer_date IS NULL OR defer_date <= :now)
          ORDER BY priority DESC, created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
     )
 RETURNING id
    """
)

_CLAIM_SQLITE = text(
    """
    UPDATE queue_items
       SET status = 'InProgress',
           locked_by = :worker,
           locked_at = :now,
           started_at = :now,
           processing_execution_id = :eid
     WHERE id = (
         SELECT id FROM queue_items
          WHERE queue_id = :qid
            AND status = 'New'
            AND (defer_date IS NULL OR defer_date <= :now)
          ORDER BY priority DESC, created_at ASC
          LIMIT 1
     )
 RETURNING id
    """
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def get_queue_by_name(db: Session, name: str) -> models.Queue | None:
    return db.scalar(select(models.Queue).where(models.Queue.name == name))


# ---------------------------------------------------------------------------
def add_items(db: Session, queue_id: int, items: list[dict]) -> list[dict]:
    created: list[models.QueueItem] = []
    for it in items:
        defer = None
        if it.get("defer_seconds"):
            defer = _now() + timedelta(seconds=int(it["defer_seconds"]))
        qi = models.QueueItem(
            queue_id=queue_id,
            reference=it.get("reference"),
            priority=it.get("priority", 20),
            specific_data=it.get("specific_data") or {},
            defer_date=defer,
        )
        db.add(qi)
        created.append(qi)
    db.flush()
    for qi in created:
        db.add(models.QueueItemEvent(item_id=qi.id, from_status=None, to_status=models.QI_NEW))
    db.commit()
    return [queue_item_dict(qi) for qi in created]


# ---------------------------------------------------------------------------
def claim_next_item(db: Session, queue_id: int, worker: str, execution_id: int | None) -> dict | None:
    """GetTransactionItem. Devuelve el item ya en InProgress, o None si la cola está vacía."""
    stmt = _CLAIM_PG if db.bind.dialect.name == "postgresql" else _CLAIM_SQLITE
    row = db.execute(stmt, {"qid": queue_id, "worker": worker, "now": _now(), "eid": execution_id}).first()
    if row is None:
        db.commit()
        return None
    item_id = row[0]
    db.add(models.QueueItemEvent(
        item_id=item_id, from_status=models.QI_NEW, to_status=models.QI_IN_PROGRESS,
        execution_id=execution_id,
    ))
    db.commit()
    item = db.get(models.QueueItem, item_id)
    return queue_item_dict(item)


# ---------------------------------------------------------------------------
def set_item_status(db: Session, item_id: str, *, result: str,
                    output_data: dict | None = None, reason: str | None = None) -> dict:
    """SetTransactionStatus + política de reintentos."""
    item = db.get(models.QueueItem, item_id)
    if item is None:
        raise LookupError("queue item no encontrado")
    if item.status != models.QI_IN_PROGRESS:
        raise ValueError(f"el item está en '{item.status}', no en InProgress")

    now = _now()
    item.ended_at = now
    item.locked_by = None
    item.output_data = output_data

    if result == "success":
        item.status = models.QI_SUCCESSFUL
        _event(db, item, models.QI_SUCCESSFUL)

    elif result == "business_error":
        item.status = models.QI_FAILED
        item.exception_type = models.EXC_BUSINESS
        item.exception_reason = reason
        _event(db, item, models.QI_FAILED, f"BusinessException: {reason}")

    else:  # application_error
        item.exception_type = models.EXC_APPLICATION
        item.exception_reason = reason
        queue = db.get(models.Queue, item.queue_id)
        if item.retry_count < (queue.max_retries if queue else 0):
            item.status = models.QI_RETRIED
            _event(db, item, models.QI_RETRIED,
                   f"reintento {item.retry_count + 1}/{queue.max_retries}")
            child = models.QueueItem(
                queue_id=item.queue_id,
                reference=item.reference,
                priority=item.priority,
                specific_data=item.specific_data,
                retry_count=item.retry_count + 1,
                parent_item_id=item.id,
                defer_date=(now + timedelta(seconds=queue.retry_delay_seconds))
                if queue.retry_delay_seconds else None,
            )
            db.add(child)
            db.flush()
            db.add(models.QueueItemEvent(item_id=child.id, from_status=None, to_status=models.QI_NEW,
                                         detail=f"reintento de {item.id}"))
        else:
            item.status = models.QI_FAILED
            _event(db, item, models.QI_FAILED, f"ApplicationException (sin más reintentos): {reason}")

    db.commit()
    return queue_item_dict(item)


def set_progress(db: Session, item_id: str, txt: str) -> dict:
    item = db.get(models.QueueItem, item_id)
    if item is None:
        raise LookupError("queue item no encontrado")
    item.progress = txt[:500]
    db.commit()
    return queue_item_dict(item)


def _event(db: Session, item: models.QueueItem, to_status: str, detail: str | None = None) -> None:
    db.add(models.QueueItemEvent(
        item_id=item.id, from_status=models.QI_IN_PROGRESS, to_status=to_status,
        execution_id=item.processing_execution_id, detail=detail,
    ))


# ---------------------------------------------------------------------------
def reap_stale_items(db: Session, minutes: int) -> int:
    """Items InProgress cuyo lock venció -> Abandoned. Devuelve cuántos."""
    cutoff = _now() - timedelta(minutes=minutes)
    stale = db.scalars(
        select(models.QueueItem).where(
            models.QueueItem.status == models.QI_IN_PROGRESS,
            models.QueueItem.locked_at < cutoff,
        )
    ).all()
    for item in stale:
        item.status = models.QI_ABANDONED
        item.locked_by = None
        item.ended_at = _now()
        _event(db, item, models.QI_ABANDONED, "lock vencido (worker caído)")
    db.commit()
    return len(stale)


# ---------------------------------------------------------------------------
def counts_by_status(db: Session, queue_id: int) -> dict:
    rows = db.execute(
        select(models.QueueItem.status, func.count())
        .where(models.QueueItem.queue_id == queue_id)
        .group_by(models.QueueItem.status)
    ).all()
    base = {s: 0 for s in (models.QI_NEW, models.QI_IN_PROGRESS, models.QI_SUCCESSFUL,
                           models.QI_FAILED, models.QI_RETRIED, models.QI_ABANDONED)}
    for status, n in rows:
        base[status] = n
    base["total"] = sum(v for k, v in base.items() if k != "total")
    return base


_MANUAL_STATES = {models.QI_NEW, models.QI_ABANDONED, models.QI_SUCCESSFUL, models.QI_FAILED}


def manual_set_state(db: Session, item_id: str, new_status: str, note: str | None = None) -> dict:
    """
    Override manual del estado de un item desde la UI (no desde un bot).
    Sirve para, por ejemplo, dejar solo 1 item procesable y descartar el
    resto marcándolos como Abandoned, o reponer un item a New para reintento.
    """
    if new_status not in _MANUAL_STATES:
        raise ValueError(f"estado manual no permitido: {new_status}")
    item = db.get(models.QueueItem, item_id)
    if item is None:
        raise LookupError("queue item no encontrado")

    prev = item.status
    item.status = new_status
    item.locked_by = None
    item.locked_at = None
    if new_status == models.QI_NEW:
        item.started_at = None
        item.ended_at = None
        item.exception_type = None
        item.exception_reason = None
    else:
        item.ended_at = _now()

    db.add(models.QueueItemEvent(
        item_id=item.id, from_status=prev, to_status=new_status,
        detail=f"cambio manual desde la UI{f': {note}' if note else ''}",
    ))
    db.commit()
    return queue_item_dict(item)


def bulk_set_state(db: Session, queue_id: int, *, new_status: str,
                   item_ids: list[str] | None = None, from_status: str | None = None) -> int:
    """Aplica `manual_set_state` a varios items (por id explícito o por estado origen)."""
    q = select(models.QueueItem).where(models.QueueItem.queue_id == queue_id)
    if item_ids:
        q = q.where(models.QueueItem.id.in_(item_ids))
    if from_status:
        q = q.where(models.QueueItem.status == from_status)
    rows = db.scalars(q).all()
    for item in rows:
        manual_set_state(db, item.id, new_status)
    return len(rows)


def delete_item(db: Session, item_id: str) -> None:
    """Borra un ítem (y sus eventos/evidencias) definitivamente. No se puede
    borrar un ítem que un worker está procesando en este momento."""
    item = db.get(models.QueueItem, item_id)
    if item is None:
        raise LookupError("queue item no encontrado")
    if item.status == models.QI_IN_PROGRESS:
        raise ValueError("el ítem está en curso, no se puede borrar")
    _purge_evidence_files(db, [item_id])
    db.execute(sa_delete(models.QueueItemEvent).where(models.QueueItemEvent.item_id == item_id))
    db.execute(sa_delete(models.Evidence).where(models.Evidence.item_id == item_id))
    db.delete(item)
    db.commit()


def bulk_delete_items(db: Session, queue_id: int, *,
                      item_ids: list[str] | None = None, from_status: str | None = None) -> int:
    """Borra varios ítems de una cola (por id explícito y/o estado origen).
    Nunca borra ítems InProgress."""
    q = select(models.QueueItem.id).where(
        models.QueueItem.queue_id == queue_id,
        models.QueueItem.status != models.QI_IN_PROGRESS,
    )
    if item_ids:
        q = q.where(models.QueueItem.id.in_(item_ids))
    if from_status:
        q = q.where(models.QueueItem.status == from_status)
    ids = list(db.scalars(q).all())
    if ids:
        _purge_evidence_files(db, ids)
        db.execute(sa_delete(models.QueueItemEvent).where(models.QueueItemEvent.item_id.in_(ids)))
        db.execute(sa_delete(models.Evidence).where(models.Evidence.item_id.in_(ids)))
        db.execute(sa_delete(models.QueueItem).where(models.QueueItem.id.in_(ids)))
        db.commit()
    return len(ids)


def delete_queue(db: Session, queue_id: int) -> None:
    """Borra la cola, sus items y sus eventos; desasocia los procesos que la usaban."""
    from sqlalchemy import delete as _delete, update as _update

    item_ids = [r for r in db.scalars(
        select(models.QueueItem.id).where(models.QueueItem.queue_id == queue_id)
    ).all()]
    if item_ids:
        _purge_evidence_files(db, item_ids)
        db.execute(_delete(models.QueueItemEvent).where(models.QueueItemEvent.item_id.in_(item_ids)))
        db.execute(_delete(models.Evidence).where(models.Evidence.item_id.in_(item_ids)))
    db.execute(_delete(models.QueueItem).where(models.QueueItem.queue_id == queue_id))
    db.execute(_update(models.Process).where(models.Process.queue_id == queue_id).values(queue_id=None))
    db.execute(_delete(models.Queue).where(models.Queue.id == queue_id))
    db.commit()


_ITEM_CLOSE_MSGS = {"item.ok", "item.business_error", "item.app_error"}


def extract_item_log(full_text: str, item: "models.QueueItem") -> str | None:
    """
    Un Execution corre un bot que puede procesar CIENTOS de items en un
    while loop (ver TransactionalBot.run en el SDK); el stdout de esa
    ejecución los tiene todos mezclados. Esta función aísla, dentro de ese
    stdout, sólo las líneas que van desde el `item.start` de este item
    hasta su cierre (`item.ok` / `item.business_error` / `item.app_error`),
    matcheando por el `self.log(..., item=str(item))` que emite el SDK
    (formato "<Item {reference or id} retry={n}>").

    Devuelve None si el log no tiene el formato estructurado esperado
    (bot viejo / no usa el SDK) y no se puede aislar nada.
    """
    needle = item.reference or item.id
    lines = full_text.splitlines()
    records: list[tuple[str, dict | None]] = []
    for ln in lines:
        try:
            rec = json.loads(ln)
        except (ValueError, TypeError):
            rec = None
        records.append((ln, rec if isinstance(rec, dict) else None))

    def _is_this_item(rec: dict | None) -> bool:
        val = rec.get("item") if rec else None
        return isinstance(val, str) and needle is not None and needle in val

    start_idx = None
    for i, (_ln, rec) in enumerate(records):
        if rec and rec.get("msg") == "item.start" and _is_this_item(rec):
            start_idx = i  # si hay varias corridas del mismo item, nos quedamos con la última

    if start_idx is None:
        return None

    end_idx = len(records) - 1
    for i in range(start_idx + 1, len(records)):
        _ln, rec = records[i]
        if rec and rec.get("msg") in _ITEM_CLOSE_MSGS:
            end_idx = i
            break

    return "\n".join(ln for ln, _rec in records[start_idx:end_idx + 1])


def list_items(db: Session, queue_id: int, status: str | None, page: int, size: int) -> dict:
    q = select(models.QueueItem).where(models.QueueItem.queue_id == queue_id)
    if status:
        q = q.where(models.QueueItem.status == status)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.scalars(
        q.order_by(models.QueueItem.created_at.desc())
        .offset((page - 1) * size).limit(size)
    ).all()
    return {
        "total": total,
        "page": page,
        "size": size,
        "items": [queue_item_dict(i, with_data=False) for i in rows],
    }
