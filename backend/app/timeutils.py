"""
timeutils.py
------------
Hora "local" del orquestador, según `settings.tz` (o la env TZ). Las
programaciones cron se interpretan en esta zona: si el usuario pone "8:00"
quiere decir las 8 de Argentina, no UTC.
"""

from datetime import datetime

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None

from .config import settings


def local_tz():
    if ZoneInfo is not None:
        try:
            return ZoneInfo(settings.tz)
        except Exception:
            pass
    return datetime.now().astimezone().tzinfo


def now_local() -> datetime:
    return datetime.now(local_tz())


def as_local(dt: datetime | None) -> datetime | None:
    """Normaliza un datetime (naive => se asume local) a la zona local."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=local_tz())
    return dt.astimezone(local_tz())
