"""
main.py
-------
API REST del orquestador. A diferencia de la versión anterior, este proceso
YA NO corre el worker de la cola ni el scheduler: eso vive ahora en los
workers de Celery (ver app/workers/). El API solo hace CRUD + encola tareas.

Rutas:
  /api/processes        catálogo, run manual, versionado (GitHub)
  /api/queues           colas transaccionales (gestión + endpoints de bots)
  /api/executions       historial + logs
  /api/assets           archivos de entrada
  /api/credentials      bóveda cifrada
  /api/schedules        triggers cron
  /api/metrics          métricas para el dashboard
  /api/health
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api import (
    assets,
    credentials,
    executions,
    metrics,
    processes,
    queues,
    schedules,
)
from .config import settings
from .initdb import init_db

app = FastAPI(title="Orquestador de Automatizaciones", version="4.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (processes, queues, executions, assets, credentials, schedules, metrics):
    app.include_router(module.router)


@app.on_event("startup")
def _startup() -> None:
    init_db()


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "version": app.version}


# Servir el build del frontend si existe (frontend/dist) — modo "todo en uno".
_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if _DIST.exists():
    app.mount("/", StaticFiles(directory=_DIST, html=True), name="frontend")
