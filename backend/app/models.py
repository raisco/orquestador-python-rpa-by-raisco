"""
models.py
---------
Esquema completo del orquestador (SQLAlchemy 2.0, tipado con Mapped[]).

Bloques:
  Process / ProcessVersion  -> catálogo de automatizaciones + versionado (GitHub).
  Queue / QueueItem / QueueItemEvent -> COLAS TRANSACCIONALES (item-based).
  Execution                 -> historial de corridas + logs (Robot Logs).
  Evidence                  -> capturas/adjuntos de una corrida o de un item.
  Schedule                  -> triggers cron.
  Credential                -> bóveda cifrada.
  Asset                     -> archivos de entrada subidos por UI.

Columnas JSON usan el tipo genérico `JSON` (json en Postgres, TEXT-json en
SQLite) para que el mismo código corra en local y en Docker.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_uuid() -> str:
    return str(uuid.uuid4())


# --- Estados (constantes, no enums de DB, para no pelear con migraciones) -----
EXEC_PENDING, EXEC_RUNNING, EXEC_SUCCESS, EXEC_FAILED, EXEC_ABORTED = (
    "PENDING", "RUNNING", "SUCCESS", "FAILED", "ABORTED",
)

QI_NEW, QI_IN_PROGRESS, QI_SUCCESSFUL, QI_FAILED, QI_RETRIED, QI_ABANDONED = (
    "New", "InProgress", "Successful", "Failed", "Retried", "Abandoned",
)

EXC_APPLICATION = "ApplicationException"   # transitorio  -> elegible a reintento
EXC_BUSINESS = "BusinessException"         # regla de negocio -> NO se reintenta

TRIGGER_MANUAL, TRIGGER_QUEUE, TRIGGER_SCHEDULE, TRIGGER_CHAIN = "MANUAL", "QUEUE", "SCHEDULE", "CHAIN"

# Política de encadenado (Process.after_policy): qué hacer con el proceso
# encadenado cuando el proceso del que depende (after_process_id) termina.
AFTER_ON_SUCCESS, AFTER_ALWAYS = "on_success", "always"


# ===========================================================================
# Process / Version
# ===========================================================================
class Process(Base):
    __tablename__ = "processes"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(String(500))

    bot_dir: Mapped[str] = mapped_column(String(200))       # carpeta bajo bots/
    entrypoint: Mapped[str] = mapped_column(String(200))    # archivo .py dentro de bot_dir

    # Rol respecto de su cola:
    #   dispatcher -> genera items (los encola)
    #   performer  -> consume items de la cola
    #   standalone -> no usa cola
    kind: Mapped[str] = mapped_column(String(20), default="standalone")

    queue_id: Mapped[int | None] = mapped_column(ForeignKey("queues.id"))
    max_concurrency: Mapped[int] = mapped_column(Integer, default=1)

    # Sin FK dura (evita ciclo con process_versions y ALTER en SQLite).
    active_version_id: Mapped[int | None] = mapped_column(Integer)

    # Encadenado: este proceso se dispara solo cuando termina after_process_id.
    # Sin FK dura por el mismo motivo que active_version_id (auto-referencia + ALTER).
    after_process_id: Mapped[int | None] = mapped_column(Integer)
    after_policy: Mapped[str] = mapped_column(String(20), default=AFTER_ON_SUCCESS)  # on_success | always

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ProcessVersion(Base):
    """Snapshot INMUTABLE del código del bot en un commit dado. Rollback = activar otra fila."""

    __tablename__ = "process_versions"

    id: Mapped[int] = mapped_column(primary_key=True)
    process_id: Mapped[int] = mapped_column(ForeignKey("processes.id", ondelete="CASCADE"), index=True)
    version: Mapped[str] = mapped_column(String(40))           # sha corto o timestamp
    commit_sha: Mapped[str | None] = mapped_column(String(64))
    git_remote: Mapped[str | None] = mapped_column(String(300))
    snapshot_path: Mapped[str] = mapped_column(String(400))    # storage_key de bot_versions/...
    changelog: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# ===========================================================================
# Colas transaccionales
# ===========================================================================
class Queue(Base):
    __tablename__ = "queues"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(String(500))
    max_retries: Mapped[int] = mapped_column(Integer, default=1)
    retry_delay_seconds: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class QueueItem(Base):
    __tablename__ = "queue_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    queue_id: Mapped[int] = mapped_column(ForeignKey("queues.id", ondelete="CASCADE"), index=True)

    reference: Mapped[str | None] = mapped_column(String(200), index=True)   # búsqueda / dedupe
    priority: Mapped[int] = mapped_column(Integer, default=20)               # 30 alta / 20 normal / 10 baja
    status: Mapped[str] = mapped_column(String(20), default=QI_NEW, index=True)

    specific_data: Mapped[dict] = mapped_column(JSON, default=dict)          # payload de entrada
    output_data: Mapped[dict | None] = mapped_column(JSON)                   # resultado

    defer_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # no procesar antes de
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    parent_item_id: Mapped[str | None] = mapped_column(String(36))          # item original si es un reintento

    progress: Mapped[str | None] = mapped_column(String(500))
    exception_type: Mapped[str | None] = mapped_column(String(30))
    exception_reason: Mapped[str | None] = mapped_column(Text)

    # Control de concurrencia (ver queue_service.claim_next_item)
    locked_by: Mapped[str | None] = mapped_column(String(80))
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    processing_execution_id: Mapped[int | None] = mapped_column(Integer)

    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    __table_args__ = (
        Index("ix_qi_claim", "queue_id", "status", "priority", "created_at"),
    )


class QueueItemEvent(Base):
    """Auditoría append-only de cada transición de estado de un item."""

    __tablename__ = "queue_item_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[str] = mapped_column(String(36), index=True)
    from_status: Mapped[str | None] = mapped_column(String(20))
    to_status: Mapped[str] = mapped_column(String(20))
    execution_id: Mapped[int | None] = mapped_column(Integer)
    detail: Mapped[str | None] = mapped_column(Text)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# ===========================================================================
# Ejecuciones / Logs
# ===========================================================================
class Execution(Base):
    __tablename__ = "executions"

    id: Mapped[int] = mapped_column(primary_key=True)
    process_id: Mapped[int] = mapped_column(Integer, index=True)
    version_id: Mapped[int | None] = mapped_column(Integer)
    trigger: Mapped[str] = mapped_column(String(20))          # MANUAL | QUEUE | SCHEDULE
    status: Mapped[str] = mapped_column(String(20), default=EXEC_PENDING, index=True)
    worker_id: Mapped[str | None] = mapped_column(String(120))
    queue_id: Mapped[int | None] = mapped_column(Integer)

    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_s: Mapped[float | None] = mapped_column(Float)
    exit_code: Mapped[int | None] = mapped_column(Integer)

    stdout: Mapped[str | None] = mapped_column(Text)          # cola (últimos ~20k chars) para la UI
    stderr: Mapped[str | None] = mapped_column(Text)
    log_path: Mapped[str | None] = mapped_column(String(400)) # storage_key del log COMPLETO

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class Evidence(Base):
    __tablename__ = "evidence"

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[str | None] = mapped_column(String(36), index=True)
    execution_id: Mapped[int | None] = mapped_column(Integer, index=True)
    filename: Mapped[str] = mapped_column(String(200))
    storage_key: Mapped[str] = mapped_column(String(400))
    content_type: Mapped[str | None] = mapped_column(String(120))
    size: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# ===========================================================================
# Schedules / Credenciales / Assets
# ===========================================================================
class Schedule(Base):
    __tablename__ = "schedules"

    id: Mapped[int] = mapped_column(primary_key=True)
    process_id: Mapped[int] = mapped_column(Integer, index=True)
    cron: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(String(300))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_fired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Credential(Base):
    __tablename__ = "credentials"

    id: Mapped[int] = mapped_column(primary_key=True)
    service_name: Mapped[str] = mapped_column(String(160), index=True)
    username: Mapped[str] = mapped_column(String(200))
    encrypted_password: Mapped[str] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    kind: Mapped[str] = mapped_column(String(30), default="file")
    filename: Mapped[str] = mapped_column(String(200))
    content_type: Mapped[str | None] = mapped_column(String(120))
    size: Mapped[int] = mapped_column(Integer, default=0)
    storage_key: Mapped[str] = mapped_column(String(400))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
