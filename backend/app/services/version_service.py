"""
version_service.py
------------------
Versionado del código de los bots, con GitHub como fuente de verdad.

Al "publicar una versión" de un proceso:
  1. se lee el commit actual del repo (`git rev-parse HEAD`) y el remote;
  2. se copia la carpeta del bot (`bots/<bot_dir>/`) a un snapshot
     INMUTABLE bajo `storage/bot_versions/<bot_dir>/<version>/`;
  3. se registra la fila en `process_versions` y se marca como activa.

El worker SIEMPRE ejecuta desde el snapshot de la versión activa, así una
corrida es 100% reproducible. Rollback = activar otra versión (no se borra
ni se reescribe historial).

Si el proyecto todavía no es un repo git, la versión cae a un timestamp
`YYYYmmdd-HHMMSS` y `commit_sha` queda nulo — el flujo sigue funcionando.
"""

import shutil
import subprocess
from datetime import datetime
from pathlib import Path

from sqlalchemy.orm import Session

from .. import models, storage
from ..config import settings


def _git(args: list[str], cwd: Path) -> str | None:
    try:
        out = subprocess.run(["git", *args], cwd=str(cwd), capture_output=True, text=True, timeout=10)
        return out.stdout.strip() or None if out.returncode == 0 else None
    except Exception:
        return None


def publish_version(db: Session, process: models.Process, changelog: str | None) -> models.ProcessVersion:
    bots_root = Path(settings.bots_dir).resolve()
    src = bots_root / process.bot_dir
    if not src.is_dir():
        raise FileNotFoundError(f"No existe la carpeta del bot: {src}")

    sha = _git(["rev-parse", "HEAD"], bots_root)
    remote = _git(["remote", "get-url", "origin"], bots_root)
    version = sha[:8] if sha else datetime.now().strftime("%Y%m%d-%H%M%S")

    snapshot_key = f"bot_versions/{process.bot_dir}/{version}"
    dest = storage.path_for(snapshot_key)
    if dest.exists():
        shutil.rmtree(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src, dest, ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".venv", "venv"))

    pv = models.ProcessVersion(
        process_id=process.id,
        version=version,
        commit_sha=sha,
        git_remote=remote,
        snapshot_path=snapshot_key,
        changelog=changelog,
    )
    db.add(pv)
    db.flush()
    process.active_version_id = pv.id
    db.commit()
    return pv


def activate_version(db: Session, process: models.Process, version_id: int) -> models.ProcessVersion:
    pv = db.get(models.ProcessVersion, version_id)
    if pv is None or pv.process_id != process.id:
        raise LookupError("versión no encontrada para este proceso")
    process.active_version_id = pv.id
    db.commit()
    return pv
