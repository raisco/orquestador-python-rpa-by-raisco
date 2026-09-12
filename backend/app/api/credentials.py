"""
credentials.py
--------------
Bóveda de credenciales cifrada. La contraseña en claro solo se devuelve
bajo pedido explícito: por UI en `/reveal`, o por los bots vía el SDK en
`/by-name/{name}` (con token de worker).
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from ..crypto_utils import decrypt_value, encrypt_value
from ..db import get_db
from ..schemas import CredentialIn, OkOut, RevealOut
from .deps import require_worker

router = APIRouter(prefix="/api/credentials", tags=["credentials"])


def _pub(c: models.Credential) -> dict:
    return {"id": c.id, "service_name": c.service_name, "username": c.username,
            "notes": c.notes, "created_at": c.created_at.isoformat()}


@router.get("")
def list_credentials(db: Session = Depends(get_db)):
    return [_pub(c) for c in db.scalars(select(models.Credential).order_by(models.Credential.id.desc())).all()]


@router.post("")
def create_credential(payload: CredentialIn, db: Session = Depends(get_db)):
    c = models.Credential(
        service_name=payload.service_name, username=payload.username,
        encrypted_password=encrypt_value(payload.password), notes=payload.notes,
    )
    db.add(c)
    db.commit()
    return _pub(c)


@router.delete("/{credential_id}", response_model=OkOut)
def delete_credential(credential_id: int, db: Session = Depends(get_db)):
    c = db.get(models.Credential, credential_id)
    if c:
        db.delete(c)
        db.commit()
    return OkOut()


@router.get("/{credential_id}/reveal", response_model=RevealOut)
def reveal_credential(credential_id: int, db: Session = Depends(get_db)):
    c = db.get(models.Credential, credential_id)
    if c is None:
        raise HTTPException(404, "credencial no encontrada")
    return RevealOut(id=c.id, username=c.username, password=decrypt_value(c.encrypted_password))


@router.get("/by-name/{service_name}", response_model=RevealOut, dependencies=[Depends(require_worker)])
def get_credential_for_bot(service_name: str, db: Session = Depends(get_db)):
    c = db.scalar(
        select(models.Credential).where(models.Credential.service_name == service_name)
        .order_by(models.Credential.id.desc())
    )
    if c is None:
        raise HTTPException(404, f"no hay credencial para '{service_name}'")
    return RevealOut(id=c.id, username=c.username, password=decrypt_value(c.encrypted_password))
