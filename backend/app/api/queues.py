"""
queues.py
---------
API de las colas transaccionales.

Endpoints de gestión (los usa el frontend):
  GET  /api/queues                     lista con conteos por estado
  POST /api/queues                     crear cola
  GET  /api/queues/{id}                detalle + conteos
  GET  /api/queues/{id}/items          listado paginado, filtrable por estado
  GET  /api/queue-items/{item_id}      detalle + timeline de eventos + evidencias

Endpoints que consumen los BOTS (requieren token de worker):
  POST /api/queues/{id}/items          Add Queue Item (bulk)
  POST /api/queues/{id}/next-item      GetTransactionItem (claim atómico)
  POST /api/queue-items/{id}/status    SetTransactionStatus
  POST /api/queue-items/{id}/progress  reportar progreso
  POST /api/queue-items/{id}/evidence  adjuntar captura/archivo
"""

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, storage
from ..db import get_db
from ..dto import evidence_dict, event_dict, execution_dict, queue_item_dict
from ..schemas import OkOut, ProgressIn, QueueIn, QueueItemIn, SetStatusIn
from ..services import queue_service
from .deps import require_worker


class ItemStateIn(BaseModel):
    status: str                      # New | Abandoned | Successful | Failed
    note: str | None = None


class BulkStateIn(BaseModel):
    status: str
    item_ids: list[str] | None = None
    from_status: str | None = None


class BulkDeleteIn(BaseModel):
    item_ids: list[str] | None = None
    from_status: str | None = None

router = APIRouter(tags=["queues"])


# ===== Gestión ==============================================================
@router.get("/api/queues")
def list_queues(db: Session = Depends(get_db)):
    out = []
    for q in db.scalars(select(models.Queue).order_by(models.Queue.id)).all():
        out.append({
            "id": q.id, "name": q.name, "description": q.description,
            "max_retries": q.max_retries, "retry_delay_seconds": q.retry_delay_seconds,
            "counts": queue_service.counts_by_status(db, q.id),
        })
    return out


@router.post("/api/queues")
def create_queue(payload: QueueIn, db: Session = Depends(get_db)):
    if db.scalar(select(models.Queue).where(models.Queue.name == payload.name)):
        raise HTTPException(409, f"ya existe una cola '{payload.name}'")
    q = models.Queue(**payload.model_dump())
    db.add(q)
    db.commit()
    return {"id": q.id, "name": q.name, "counts": queue_service.counts_by_status(db, q.id)}


@router.get("/api/queues/{queue_id}")
def get_queue(queue_id: int, db: Session = Depends(get_db)):
    q = db.get(models.Queue, queue_id)
    if q is None:
        raise HTTPException(404, "cola no encontrada")
    linked = db.scalars(select(models.Process).where(models.Process.queue_id == queue_id)).all()
    return {
        "id": q.id, "name": q.name, "description": q.description,
        "max_retries": q.max_retries, "retry_delay_seconds": q.retry_delay_seconds,
        "counts": queue_service.counts_by_status(db, q.id),
        "producers": [{"id": p.id, "name": p.name} for p in linked
                      if getattr(p, "kind", "") == "dispatcher"],
        "consumers": [{"id": p.id, "name": p.name} for p in linked
                      if getattr(p, "kind", "") == "performer"],
    }


@router.delete("/api/queues/{queue_id}", response_model=OkOut)
def delete_queue(queue_id: int, db: Session = Depends(get_db)):
    if db.get(models.Queue, queue_id) is None:
        return OkOut()
    queue_service.delete_queue(db, queue_id)
    return OkOut(detail="cola eliminada")


@router.get("/api/queues/{queue_id}/items")
def list_items(queue_id: int, status: str | None = None, page: int = 1, size: int = 50,
               db: Session = Depends(get_db)):
    return queue_service.list_items(db, queue_id, status, page, min(size, 200))


@router.patch("/api/queue-items/{item_id}/state")
def set_item_state(item_id: str, body: ItemStateIn, db: Session = Depends(get_db)):
    """Override manual del estado (desde la UI, no desde un bot)."""
    try:
        return queue_service.manual_set_state(db, item_id, body.status, body.note)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/api/queues/{queue_id}/bulk-state", response_model=OkOut)
def bulk_set_state(queue_id: int, body: BulkStateIn, db: Session = Depends(get_db)):
    try:
        n = queue_service.bulk_set_state(
            db, queue_id, new_status=body.status,
            item_ids=body.item_ids, from_status=body.from_status,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    return OkOut(detail=f"{n} ítem(s) actualizados")


@router.delete("/api/queue-items/{item_id}", response_model=OkOut)
def delete_item(item_id: str, db: Session = Depends(get_db)):
    try:
        queue_service.delete_item(db, item_id)
    except LookupError:
        return OkOut()
    except ValueError as e:
        raise HTTPException(409, str(e))
    return OkOut(detail="ítem eliminado")


@router.post("/api/queues/{queue_id}/bulk-delete", response_model=OkOut)
def bulk_delete(queue_id: int, body: BulkDeleteIn, db: Session = Depends(get_db)):
    n = queue_service.bulk_delete_items(
        db, queue_id, item_ids=body.item_ids, from_status=body.from_status,
    )
    return OkOut(detail=f"{n} ítem(s) eliminados")


@router.get("/api/queue-items/{item_id}")
def get_item(item_id: str, db: Session = Depends(get_db)):
    item = db.get(models.QueueItem, item_id)
    if item is None:
        raise HTTPException(404, "item no encontrado")
    events = db.scalars(
        select(models.QueueItemEvent).where(models.QueueItemEvent.item_id == item_id)
        .order_by(models.QueueItemEvent.id)
    ).all()
    evs = db.scalars(select(models.Evidence).where(models.Evidence.item_id == item_id)).all()
    d = queue_item_dict(item)
    d["events"] = [event_dict(e) for e in events]
    d["evidence"] = [evidence_dict(e) for e in evs]
    if item.processing_execution_id:
        ex = db.get(models.Execution, item.processing_execution_id)
        if ex is not None:
            d["execution"] = execution_dict(ex)
            if ex.log_path and storage.exists(ex.log_path):
                full_text = storage.read_bytes(ex.log_path).decode("utf-8", "replace")
            else:
                full_text = (ex.stdout or "")
                if ex.stderr:
                    full_text += "\n----- STDERR -----\n" + ex.stderr
            isolated = queue_service.extract_item_log(full_text, item)
            d["item_log"] = isolated if isolated is not None else full_text
            d["item_log_isolated"] = isolated is not None
    return d


# ===== Consumidos por los bots ============================================
@router.post("/api/queues/{queue_id}/items", dependencies=[Depends(require_worker)])
def add_items(queue_id: int, items: list[QueueItemIn], db: Session = Depends(get_db)):
    if db.get(models.Queue, queue_id) is None:
        raise HTTPException(404, "cola no encontrada")
    return queue_service.add_items(db, queue_id, [i.model_dump() for i in items])


@router.post("/api/queues/{queue_id}/next-item", dependencies=[Depends(require_worker)])
def next_item(queue_id: int, worker_id: str = "worker", execution_id: int | None = None,
              db: Session = Depends(get_db)):
    item = queue_service.claim_next_item(db, queue_id, worker_id, execution_id)
    if item is None:
        return Response(status_code=204)
    return item


@router.post("/api/queue-items/{item_id}/status", dependencies=[Depends(require_worker)])
def set_status(item_id: str, body: SetStatusIn, db: Session = Depends(get_db)):
    try:
        return queue_service.set_item_status(
            db, item_id, result=body.result, output_data=body.output_data, reason=body.reason
        )
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(409, str(e))


@router.post("/api/queue-items/{item_id}/progress", dependencies=[Depends(require_worker)])
def set_progress(item_id: str, body: ProgressIn, db: Session = Depends(get_db)):
    try:
        return queue_service.set_progress(db, item_id, body.text)
    except LookupError as e:
        raise HTTPException(404, str(e))


@router.post("/api/queue-items/{item_id}/evidence", dependencies=[Depends(require_worker)])
async def add_evidence(item_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    item = db.get(models.QueueItem, item_id)
    if item is None:
        raise HTTPException(404, "item no encontrado")
    data = await file.read()
    key = storage.save_bytes("evidence", f"items/{item_id}/{file.filename}", data)
    ev = models.Evidence(
        item_id=item_id, execution_id=item.processing_execution_id,
        filename=file.filename, storage_key=key,
        content_type=file.content_type, size=len(data),
    )
    db.add(ev)
    db.commit()
    return evidence_dict(ev)
