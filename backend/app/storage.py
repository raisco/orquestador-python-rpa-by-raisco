"""
storage.py
----------
Almacén de archivos del orquestador. Hoy es el sistema de archivos local
(carpeta `STORAGE_DIR`, montada como volumen en Docker). La firma de las
funciones está pensada para poder cambiar a S3/MinIO más adelante sin
tocar ni la API ni los bots.

Categorías (subcarpetas):
  assets/        -> archivos de entrada subidos por el usuario (challenge.xlsx)
  evidence/      -> capturas y adjuntos de ejecuciones / queue items
  logs/          -> stdout+stderr completo de cada ejecución (<execution_id>.log)
  bot_versions/  -> snapshots inmutables del código de cada bot por versión
"""

from pathlib import Path

from .config import settings

ROOT = Path(settings.storage_dir).resolve()


def _ensure(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def save_bytes(category: str, key: str, data: bytes) -> str:
    """Guarda `data` en <ROOT>/<category>/<key>. Devuelve la storage_key ('category/key')."""
    dest = _ensure(ROOT / category / key)
    dest.write_bytes(data)
    return f"{category}/{key}"


def path_for(storage_key: str) -> Path:
    """Ruta absoluta en disco para una storage_key ya guardada."""
    return ROOT / storage_key


def read_bytes(storage_key: str) -> bytes:
    return (ROOT / storage_key).read_bytes()


def exists(storage_key: str) -> bool:
    return (ROOT / storage_key).exists()
