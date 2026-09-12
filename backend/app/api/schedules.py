"""
schedules.py
------------
Triggers cron. La ejecución real la dispara la tarea Celery `tick` (cada
30s revisa esta tabla). `next_run` se calcula con croniter para mostrarlo
en la UI.
"""

from datetime import datetime

from croniter import croniter
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from ..schemas import OkOut, ScheduleIn, ScheduleUpdate
from ..timeutils import now_local

router = APIRouter(prefix="/api/schedules", tags=["schedules"])


def _pub(db: Session, s: models.Schedule) -> dict:
    proc = db.get(models.Process, s.process_id)
    nxt = None
    if s.enabled:
        try:
            nxt = croniter(s.cron, now_local()).get_next(datetime).isoformat()
        except Exception:
            nxt = None
    return {
        "id": s.id, "process_id": s.process_id,
        "process_name": proc.name if proc else f"(proceso #{s.process_id})",
        "cron": s.cron, "description": s.description, "enabled": s.enabled,
        "last_fired_at": s.last_fired_at.isoformat() if s.last_fired_at else None,
        "next_run": nxt,
    }


@router.get("")
def list_schedules(db: Session = Depends(get_db)):
    return [_pub(db, s) for s in db.scalars(select(models.Schedule).order_by(models.Schedule.id.desc())).all()]


@router.post("")
def create_schedule(payload: ScheduleIn, db: Session = Depends(get_db)):
    if db.get(models.Process, payload.process_id) is None:
        raise HTTPException(404, "proceso no encontrado")
    try:
        croniter(payload.cron, now_local())
    except Exception as e:
        raise HTTPException(400, f"cron inválido: {e}")
    s = models.Schedule(process_id=payload.process_id, cron=payload.cron, description=payload.description)
    db.add(s)
    db.commit()
    return _pub(db, s)


@router.patch("/{schedule_id}")
def update_schedule(schedule_id: int, payload: ScheduleUpdate, db: Session = Depends(get_db)):
    s = db.get(models.Schedule, schedule_id)
    if s is None:
        raise HTTPException(404, "schedule no encontrado")
    data = payload.model_dump(exclude_unset=True)
    if "process_id" in data and data["process_id"] is not None:
        if db.get(models.Process, data["process_id"]) is None:
            raise HTTPException(404, "proceso no encontrado")
        s.process_id = data["process_id"]
    if "cron" in data and data["cron"] is not None:
        try:
            croniter(data["cron"], now_local())
        except Exception as e:
            raise HTTPException(400, f"cron inválido: {e}")
        s.cron = data["cron"]
    if "description" in data:
        s.description = data["description"]
    db.commit()
    return _pub(db, s)


@router.patch("/{schedule_id}/toggle")
def toggle_schedule(schedule_id: int, db: Session = Depends(get_db)):
    s = db.get(models.Schedule, schedule_id)
    if s is None:
        raise HTTPException(404, "schedule no encontrado")
    s.enabled = not s.enabled
    db.commit()
    return _pub(db, s)


@router.delete("/{schedule_id}", response_model=OkOut)
def delete_schedule(schedule_id: int, db: Session = Depends(get_db)):
    s = db.get(models.Schedule, schedule_id)
    if s:
        db.delete(s)
        db.commit()
    return OkOut()
