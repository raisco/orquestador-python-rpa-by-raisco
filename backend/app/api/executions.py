"""
executions.py
-------------
Historial de corridas + logs (equivalente a Robot Logs de UiPath).

GET /api/executions                 listado liviano (sin logs), filtrable por process_id
GET /api/executions/{id}            detalle CON stdout/stderr (cola de ~20k chars)
GET /api/executions/{id}/log        log COMPLETO en texto plano (desde storage/logs/)
GET /api/evidence/{id}/content      descarga un adjunto/captura
"""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .. import models, storage
from ..api.deps import require_worker
from ..db import get_db
from ..dto import evidence_dict, execution_dict
from ..schemas import OkOut

router = APIRouter(tags=["executions"])


class DeleteExecutionsIn(BaseModel):
    ids: list[int]


def _delete_one(db: Session, e: models.Execution) -> None:
    if e.log_path:
        try:
            storage.delete(e.log_path)
        except Exception:
            pass
    for ev in db.scalars(select(models.Evidence).where(models.Evidence.execution_id == e.id)).all():
        try:
            storage.delete(ev.storage_key)
        except Exception:
            pass
    db.execute(delete(models.Evidence).where(models.Evidence.execution_id == e.id))
    db.delete(e)


@router.get("/api/executions")
def list_executions(process_id: int | None = None, queue_id: int | None = None,
                    limit: int = 100, db: Session = Depends(get_db)):
    q = select(models.Execution).order_by(models.Execution.id.desc())
    if process_id is not None:
        q = q.where(models.Execution.process_id == process_id)
    if queue_id is not None:
        q = q.where(models.Execution.queue_id == queue_id)
    q = q.limit(min(limit, 500))
    names = {p.id: p.name for p in db.scalars(select(models.Process)).all()}
    return [execution_dict(e, process_name=names.get(e.process_id)) for e in db.scalars(q).all()]


@router.post("/api/executions/delete", response_model=OkOut)
def delete_executions(body: DeleteExecutionsIn, db: Session = Depends(get_db)):
    """Borra varias ejecuciones (y sus logs/evidencias). No toca corridas en curso."""
    rows = db.scalars(
        select(models.Execution).where(
            models.Execution.id.in_(body.ids),
            models.Execution.status != models.EXEC_RUNNING,
        )
    ).all()
    for e in rows:
        _delete_one(db, e)
    db.commit()
    return OkOut(detail=f"{len(rows)} ejecución(es) borrada(s)")


@router.delete("/api/executions/{execution_id}", response_model=OkOut)
def delete_execution(execution_id: int, db: Session = Depends(get_db)):
    e = db.get(models.Execution, execution_id)
    if e is None:
        return OkOut()
    if e.status == models.EXEC_RUNNING:
        raise HTTPException(409, "no se puede borrar una ejecución en curso")
    _delete_one(db, e)
    db.commit()
    return OkOut()


@router.get("/api/executions/{execution_id}")
def get_execution(execution_id: int, db: Session = Depends(get_db)):
    e = db.get(models.Execution, execution_id)
    if e is None:
        raise HTTPException(404, "ejecución no encontrada")
    p = db.get(models.Process, e.process_id)
    d = execution_dict(e, with_logs=True, process_name=p.name if p else None)
    evs = db.scalars(select(models.Evidence).where(models.Evidence.execution_id == execution_id)).all()
    d["evidence"] = [evidence_dict(ev) for ev in evs]
    return d


@router.post("/api/executions/{execution_id}/evidence", dependencies=[Depends(require_worker)])
async def add_execution_evidence(execution_id: int, file: UploadFile = File(...),
                                 db: Session = Depends(get_db)):
    """Adjunta un archivo (salida, captura, reporte) a la ejecución. Lo usan los bots."""
    ex = db.get(models.Execution, execution_id)
    if ex is None:
        raise HTTPException(404, "ejecución no encontrada")
    data = await file.read()
    key = storage.save_bytes("evidence", f"executions/{execution_id}/{file.filename}", data)
    ev = models.Evidence(
        execution_id=execution_id, filename=file.filename, storage_key=key,
        content_type=file.content_type, size=len(data),
    )
    db.add(ev)
    db.commit()
    return evidence_dict(ev)


@router.get("/api/executions/{execution_id}/log", response_class=PlainTextResponse)
def get_execution_log(execution_id: int, download: bool = False, db: Session = Depends(get_db)):
    e = db.get(models.Execution, execution_id)
    if e is None:
        raise HTTPException(404, "ejecución no encontrada")
    if e.log_path and storage.exists(e.log_path):
        text = storage.read_bytes(e.log_path).decode("utf-8", "replace")
    else:
        text = (e.stdout or "") + ("\n----- STDERR -----\n" + e.stderr if e.stderr else "")
    headers = (
        {"Content-Disposition": f'attachment; filename="ejecucion-{execution_id}.log"'}
        if download else {}
    )
    return PlainTextResponse(text, headers=headers)


@router.get("/api/evidence/{evidence_id}/content")
def get_evidence(evidence_id: int, db: Session = Depends(get_db)):
    ev = db.get(models.Evidence, evidence_id)
    if ev is None or not storage.exists(ev.storage_key):
        raise HTTPException(404, "evidencia no encontrada")
    return FileResponse(storage.path_for(ev.storage_key), media_type=ev.content_type or "application/octet-stream",
                        filename=ev.filename)
