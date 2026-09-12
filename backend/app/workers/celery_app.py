"""
celery_app.py
-------------
Instancia Celery compartida por workers y beat.

Arranque:
  worker ->  celery -A app.workers.celery_app:celery worker --concurrency=2 -n w@%h
  beat   ->  celery -A app.workers.celery_app:celery beat

`task_acks_late` + `task_reject_on_worker_lost`: si un worker muere a mitad
de una corrida, la tarea vuelve a la cola en vez de perderse. El reaper
(tick de beat) libera además el queue_item que había quedado InProgress.
"""

from celery import Celery

from ..config import settings

celery = Celery("orchestrator", broker=settings.redis_url, backend=settings.redis_url)

celery.conf.update(
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,          # reparto parejo entre workers
    task_track_started=True,
    result_expires=3600,
    timezone="UTC",
    beat_schedule={
        "tick-schedules": {"task": "app.workers.tasks.tick", "schedule": 30.0},
        "reap-stale-items": {"task": "app.workers.tasks.reap", "schedule": 60.0},
    },
)

from . import tasks  # noqa: E402,F401  -> registra las tareas en la app
