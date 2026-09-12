"""
schemas.py
----------
Modelos Pydantic v2 de entrada/salida de la API. Las respuestas de listado
suelen devolverse como dicts ya serializados desde los services; acá se
concentran sobre todo los payloads de entrada y algunos DTO de salida.
"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# --- Processes -------------------------------------------------------------
class ProcessIn(BaseModel):
    key: str = Field(pattern=r"^[a-z0-9_\-]+$", max_length=80)
    name: str
    description: str | None = None
    bot_dir: str
    entrypoint: str = "main.py"
    kind: str = "standalone"          # dispatcher | performer | standalone
    queue_name: str | None = None
    max_concurrency: int = 1
    after_process_id: int | None = None     # se dispara solo cuando termina este otro proceso
    after_policy: str = "on_success"        # on_success | always


class ProcessUpdate(BaseModel):
    """Todos opcionales: solo se aplican los campos presentes."""
    key: str | None = Field(default=None, pattern=r"^[a-z0-9_\-]+$", max_length=80)
    name: str | None = None
    description: str | None = None
    kind: str | None = None                 # dispatcher | performer | standalone
    bot_dir: str | None = None
    entrypoint: str | None = None
    queue_name: str | None = None           # "" o null => sin cola
    max_concurrency: int | None = None
    after_process_id: int | None = None     # null => sin dependencia
    after_policy: str | None = None         # on_success | always


class VersionIn(BaseModel):
    changelog: str | None = None


# --- Queues -------------------------------------------------------------
class QueueIn(BaseModel):
    name: str = Field(max_length=120)
    description: str | None = None
    max_retries: int = 1
    retry_delay_seconds: int = 0


class QueueItemIn(BaseModel):
    reference: str | None = None
    priority: int = 20
    specific_data: dict[str, Any] = {}
    defer_seconds: int | None = None      # posponer N segundos desde ahora


class SetStatusIn(BaseModel):
    result: str                            # success | application_error | business_error
    output_data: dict[str, Any] | None = None
    reason: str | None = None


class ProgressIn(BaseModel):
    text: str


# --- Schedules -------------------------------------------------------------
class ScheduleIn(BaseModel):
    process_id: int
    cron: str
    description: str | None = None


class ScheduleUpdate(BaseModel):
    """Todos opcionales: solo se aplican los campos presentes."""
    process_id: int | None = None
    cron: str | None = None
    description: str | None = None


# --- Credentials -------------------------------------------------------------
class CredentialIn(BaseModel):
    service_name: str
    username: str
    password: str
    notes: str | None = None


class RevealOut(BaseModel):
    id: int
    username: str
    password: str


# --- salida genérica -------------------------------------------------------
class OkOut(BaseModel):
    status: str = "ok"
    detail: str | None = None


class RunOut(BaseModel):
    execution_id: int
    status: str
    detail: str | None = None
