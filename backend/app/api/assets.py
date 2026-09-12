"""
assets.py
---------
Archivos de entrada de los bots (ej. challenge.xlsx). Se suben por la UI y
los bots los descargan con el SDK (`self.assets.download("nombre", ...)`),
en vez de leer rutas locales del disco del worker.

POST /api/assets                       subir (multipart: name + file)
GET  /api/assets                       listar
DELETE /api/assets/{id}
GET  /api/assets/{name}/content        descargar por nombre  (lo usa el SDK)
"""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, storage
from ..db import get_db
from ..dto import asset_dict
from ..schemas import OkOut
from .deps import require_worker

router = APIRouter(prefix="/api/assets", tags=["assets"])


@router.get("")
def list_assets(db: Session = Depends(get_db)):
    return [asset_dict(a) for a in db.scalars(select(models.Asset).order_by(models.Asset.name)).all()]


@router.post("")
async def upload_asset(name: str = Form(...), kind: str = Form("file"),
                       file: UploadFile = File(...), db: Session = Depends(get_db)):
    data = await file.read()
    key = storage.save_bytes("assets", f"{name}/{file.filename}", data)
    existing = db.scalar(select(models.Asset).where(models.Asset.name == name))
    if existing:
        existing.filename = file.filename
        existing.content_type = file.content_type
        existing.size = len(data)
        existing.storage_key = key
    else:
        db.add(models.Asset(name=name, kind=kind, filename=file.filename,
                            content_type=file.content_type, size=len(data), storage_key=key))
    db.commit()
    return asset_dict(db.scalar(select(models.Asset).where(models.Asset.name == name)))


@router.delete("/{asset_id}", response_model=OkOut)
def delete_asset(asset_id: int, db: Session = Depends(get_db)):
    a = db.get(models.Asset, asset_id)
    if a:
        db.delete(a)
        db.commit()
    return OkOut()


@router.get("/{name}/content", dependencies=[Depends(require_worker)])
def download_asset(name: str, db: Session = Depends(get_db)):
    a = db.scalar(select(models.Asset).where(models.Asset.name == name))
    if a is None or not storage.exists(a.storage_key):
        raise HTTPException(404, f"asset '{name}' no encontrado")
    return FileResponse(storage.path_for(a.storage_key),
                        media_type=a.content_type or "application/octet-stream",
                        filename=a.filename)
