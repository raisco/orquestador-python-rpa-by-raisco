"""
deps.py
-------
Dependencias compartidas de la API.

require_worker: valida el header `Authorization: Bearer <WORKER_TOKEN>` en
los endpoints que consumen los BOTS (claim de cola, set status, evidencias,
descarga de assets/credenciales). Es un token compartido simple, suficiente
para el PoC; el camino a OIDC/JWT por usuario está en el MANUAL_TECNICO.
"""

from fastapi import Header, HTTPException, status

from ..config import settings


def require_worker(authorization: str = Header(default="")) -> None:
    token = authorization.removeprefix("Bearer ").strip()
    if token != settings.worker_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "token de worker inválido")
