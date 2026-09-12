"""
initdb.py
---------
Crea las tablas (si no existen), aplica micro-migraciones de columnas
nuevas (para no obligar a `docker compose down -v` en cada cambio de
esquema del PoC) y siembra datos de ejemplo.

Se ejecuta:
  - automáticamente al arrancar la API (evento startup de main.py);
  - manualmente:  python -m app.initdb

Para producción esto se reemplaza por migraciones Alembic (ver MANUAL_TECNICO).
"""

from sqlalchemy import inspect, select, text

from . import models
from .db import Base, SessionLocal, engine

SEED_QUEUE = "rpa_challenge"

SEED_PROCESSES = [
    dict(key="rpa_challenge_dispatcher", name="RPA Challenge — Dispatcher", kind="dispatcher",
         description="Lee el Excel de entrada y encola 1 item por fila en la cola rpa_challenge.",
         bot_dir="rpa_challenge", entrypoint="dispatcher.py", queue=SEED_QUEUE, max_concurrency=1),
    dict(key="rpa_challenge_performer", name="RPA Challenge — Performer", kind="performer",
         description="Consume la cola rpa_challenge y completa el formulario. Se escala con N workers.",
         bot_dir="rpa_challenge", entrypoint="performer.py", queue=SEED_QUEUE, max_concurrency=3),
]

# Columnas agregadas después de la primera versión -> ALTER best-effort.
MICRO_MIGRATIONS = {
    "processes": [
        ("kind", "VARCHAR(20) DEFAULT 'standalone'"),
        ("after_process_id", "INTEGER"),
        ("after_policy", "VARCHAR(20) DEFAULT 'on_success'"),
    ],
}


def _apply_micro_migrations() -> None:
    insp = inspect(engine)
    existing_tables = set(insp.get_table_names())
    for table, cols in MICRO_MIGRATIONS.items():
        if table not in existing_tables:
            continue
        have = {c["name"] for c in insp.get_columns(table)}
        for name, ddl in cols:
            if name not in have:
                with engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))


def init_db() -> None:
    Base.metadata.create_all(engine)
    _apply_micro_migrations()
    with SessionLocal() as db:
        queue = db.scalar(select(models.Queue).where(models.Queue.name == SEED_QUEUE))
        if queue is None:
            queue = models.Queue(name=SEED_QUEUE, description="Cola de la demo RPA Challenge",
                                 max_retries=2, retry_delay_seconds=5)
            db.add(queue)
            db.flush()

        if db.scalar(select(models.Process).limit(1)) is None:
            for spec in SEED_PROCESSES:
                db.add(models.Process(
                    key=spec["key"], name=spec["name"], description=spec["description"],
                    kind=spec["kind"], bot_dir=spec["bot_dir"], entrypoint=spec["entrypoint"],
                    queue_id=queue.id if spec["queue"] else None,
                    max_concurrency=spec["max_concurrency"],
                ))
        else:
            # instalaciones previas: fijar el `kind` de los procesos de demo
            # que quedaron en 'standalone' tras agregar la columna.
            for spec in SEED_PROCESSES:
                p = db.scalar(select(models.Process).where(models.Process.key == spec["key"]))
                if p is not None and (p.kind or "standalone") == "standalone" and spec["kind"] != "standalone":
                    p.kind = spec["kind"]
        db.commit()


if __name__ == "__main__":
    init_db()
    print("Base inicializada.")
