"""
config.py
---------
Configuración central leída de variables de entorno (o de un archivo .env
en la raíz de `backend/`). Un solo objeto `settings` importable desde
cualquier módulo — API, workers y el arranque de la base.

Valores por defecto = modo desarrollo local SIN Docker (SQLite + Redis
local). En `docker-compose.yml` se sobrescriben por env para apuntar a
Postgres y a los servicios del compose.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- Base de datos -------------------------------------------------------
    # dev local:  sqlite:///./control.db
    # docker:     postgresql+psycopg://orch:orch@db/orchestrator
    database_url: str = "sqlite:///./control.db"

    # --- Broker de tareas (Celery) ---------------------------------------------
    redis_url: str = "redis://localhost:6379/0"

    # --- Almacenamiento de archivos (inputs, evidencias, logs, snapshots) -----
    storage_dir: str = "./storage"

    # --- Ubicación del código de los bots y del SDK --------------------------
    bots_dir: str = "./bots"
    sdk_dir: str = "./sdk"

    # --- URL de la API que los bots usan para hablar con el orquestador -------
    orch_api_url: str = "http://localhost:8000"

    # --- Token compartido bot <-> API (Bearer) ------------------------------
    worker_token: str = "dev-worker-token"

    # --- Ejecución --------------------------------------------------------------
    job_timeout_seconds: int = 600
    stale_item_minutes: int = 30

    # --- Zona horaria (para interpretar los cron de las programaciones) -------
    tz: str = "America/Argentina/Buenos_Aires"

    # --- CORS ---------------------------------------------------------------
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
