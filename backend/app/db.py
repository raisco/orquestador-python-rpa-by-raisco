"""
db.py
-----
Motor SQLAlchemy 2.0 (síncrono) + fábrica de sesiones. Se usa igual desde
la API (dependencia `get_db`) y desde los workers de Celery (sesión manual).

El código es agnóstico del motor: con `DATABASE_URL` sqlite corre en local
sin Docker; con postgresql corre en el compose. Lo único específico por
motor es el `claim` de la cola (ver services/queue_service.py) y unos
PRAGMA de SQLite para que aguante escrituras desde varios hilos/procesos.
"""

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings

_is_sqlite = settings.database_url.startswith("sqlite")

engine = create_engine(
    settings.database_url,
    future=True,
    pool_pre_ping=True,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
)

if _is_sqlite:

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _record):  # noqa: ANN001
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")      # lectores no bloquean al escritor
        cur.execute("PRAGMA busy_timeout=5000")     # espera 5s antes de 'database is locked'
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)


class Base(DeclarativeBase):
    pass


def get_db():
    """Dependencia FastAPI: una sesión por request, siempre cerrada."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
