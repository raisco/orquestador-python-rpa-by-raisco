"""
execution_service.py
--------------------
Punto único para "disparar una corrida". Crea la fila en `executions`
(estado PENDING) y encola la tarea Celery `run_process`, que es la que
efectivamente lanza el subprocess del bot en un worker.

Fallback local: si no hay broker Redis disponible (dev sin Docker), la
corrida se ejecuta en un hilo del propio proceso de la API, para que el
PoC sea usable sin levantar Celery. En Docker SIEMPRE va por Celery.
"""

import threading

from sqlalchemy.orm import Session

from .. import models


def enqueue_run(db: Session, process: models.Process, trigger: str,
                queue_id: int | None = None) -> models.Execution:
    ex = models.Execution(
        process_id=process.id,
        version_id=process.active_version_id,
        trigger=trigger,
        status=models.EXEC_PENDING,
        queue_id=queue_id or process.queue_id,
    )
    db.add(ex)
    db.commit()

    from ..workers.tasks import run_process  # import tardío: evita ciclo API <-> workers

    payload = dict(process_id=process.id, trigger=trigger,
                   execution_id=ex.id, queue_id=queue_id or process.queue_id)
    try:
        run_process.delay(**payload)
    except Exception:  # broker caído (dev sin Docker) -> corre inline en un hilo
        # run_process(**payload) usa Task.__call__, que inyecta `self` correctamente
        threading.Thread(target=lambda: run_process(**payload), daemon=True).start()

    return ex
