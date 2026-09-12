"""Métricas para el dashboard general y el panel por bot."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..services import metrics_service

router = APIRouter(prefix="/api/metrics", tags=["metrics"])


@router.get("/overview")
def overview(db: Session = Depends(get_db)):
    return metrics_service.overview(db)


@router.get("/processes/{process_id}/summary")
def summary(process_id: int, days: int = 7, db: Session = Depends(get_db)):
    return metrics_service.process_summary(db, process_id, days)


@router.get("/processes/{process_id}/timeseries")
def timeseries(process_id: int, days: int = 14, db: Session = Depends(get_db)):
    return metrics_service.process_timeseries(db, process_id, days)


@router.get("/processes/{process_id}/duration-histogram")
def duration_histogram(process_id: int, days: int = 14, db: Session = Depends(get_db)):
    return metrics_service.duration_histogram(db, process_id, days)


@router.get("/processes/{process_id}/queue-throughput")
def queue_throughput(process_id: int, hours: int = 24, db: Session = Depends(get_db)):
    return metrics_service.queue_throughput(db, process_id, hours)
