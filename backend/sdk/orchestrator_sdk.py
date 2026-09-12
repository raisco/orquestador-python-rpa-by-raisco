"""
orchestrator_sdk.py  —  el "framework" de bots
==============================================

Un bot del orquestador es una clase. El SDK le resuelve gratis:

  * consumo de la cola transaccional (claim -> process -> set status)
  * política de reintentos (ApplicationException reintenta, BusinessException no)
  * captura de pantalla automática al fallar (si usa navegador)
  * logging estructurado a stdout (que el orquestador captura y muestra)
  * acceso a assets (archivos de entrada) y a la bóveda de credenciales
  * ciclo de vida del navegador Playwright (opcional)

El SDK se comunica con la API por HTTP. Las variables de entorno las
inyecta el worker al lanzar el bot:

  ORCH_API_URL   base de la API              (ej. http://api:8000)
  ORCH_TOKEN     bearer token de worker
  EXECUTION_ID   id de la corrida actual
  WORKER_ID      nombre del worker
  QUEUE_ID       id de la cola asociada al proceso

--------------------------------------------------------------------------
Bot transaccional (dispatcher/performer):

    from orchestrator_sdk import TransactionalBot, BusinessError

    class MiBot(TransactionalBot):
        use_browser = True

        def setup(self):
            self.page = self.browser.new_page()

        def process_item(self, item):
            if not item.specific_data.get("email"):
                raise BusinessError("sin email")
            ...
            return {"ok": True}          # -> output_data del item

    if __name__ == "__main__":
        MiBot().run()

Bot de una sola pasada (no transaccional):

    from orchestrator_sdk import Bot

    class Reporte(Bot):
        def run(self):
            xlsx = self.assets.download("input.xlsx", "/tmp/in.xlsx")
            ...
            self.attach_evidence("/tmp/salida.pdf")
"""

from __future__ import annotations

import json
import os
import sys
import time
import traceback
from datetime import datetime, timezone

import httpx


class BusinessError(Exception):
    """Regla de negocio incumplida. El item se marca Failed y NO se reintenta."""


class _Item:
    """Vista cómoda de un queue item."""

    def __init__(self, raw: dict):
        self._raw = raw
        self.id: str = raw["id"]
        self.reference = raw.get("reference")
        self.retry_count: int = raw.get("retry_count", 0)
        self.specific_data: dict = raw.get("specific_data") or {}

    def __repr__(self) -> str:
        return f"<Item {self.reference or self.id} retry={self.retry_count}>"


class _Assets:
    def __init__(self, client: httpx.Client):
        self._c = client

    def download(self, name: str, to_path: str) -> str:
        r = self._c.get(f"/api/assets/{name}/content")
        r.raise_for_status()
        with open(to_path, "wb") as fh:
            fh.write(r.content)
        return to_path


class _Credentials:
    def __init__(self, client: httpx.Client):
        self._c = client

    def get(self, service_name: str) -> dict:
        r = self._c.get(f"/api/credentials/by-name/{service_name}")
        r.raise_for_status()
        return r.json()  # {"id", "username", "password"}


class _BaseBot:
    def __init__(self):
        base = os.environ.get("ORCH_API_URL", "http://localhost:8000")
        token = os.environ.get("ORCH_TOKEN", "dev-worker-token")
        self._api = httpx.Client(base_url=base, timeout=60,
                                 headers={"Authorization": f"Bearer {token}"})
        self.execution_id = os.environ.get("EXECUTION_ID")
        self.worker_id = os.environ.get("WORKER_ID", "local")
        self.queue_id = os.environ.get("QUEUE_ID") or None
        self.assets = _Assets(self._api)
        self.credentials = _Credentials(self._api)

    # -- logging estructurado: una línea JSON por evento a stdout --------------
    def log(self, message: str, level: str = "INFO", **fields):
        # hora local del contenedor (ver TZ en docker-compose.yml)
        rec = {"ts": datetime.now().astimezone().isoformat(timespec="seconds"), "level": level,
               "bot": type(self).__name__, "execution_id": self.execution_id,
               "msg": message, **fields}
        print(json.dumps(rec, ensure_ascii=False, default=str), flush=True)

    def add_queue_items(self, items: list[dict], queue_id: str | None = None):
        """Encola items (bulk). Lo usan los dispatchers. `items` = [{reference, priority, specific_data}]."""
        qid = queue_id or self.queue_id
        if not qid:
            raise RuntimeError("no hay QUEUE_ID: asigná una cola al proceso")
        r = self._api.post(f"/api/queues/{qid}/items", json=items)
        r.raise_for_status()
        return r.json()

    def attach_execution_file(self, file_path: str):
        """Adjunta un archivo a la EJECUCIÓN actual (salida, reporte, captura).
        Se ve/descarga desde el detalle de la corrida. Sirve para bots sin cola."""
        if not self.execution_id:
            self.log("attach_execution_file ignorado: sin EXECUTION_ID", level="WARN")
            return
        with open(file_path, "rb") as fh:
            self._api.post(
                f"/api/executions/{self.execution_id}/evidence",
                files={"file": (os.path.basename(file_path), fh)},
            )

    def attach_evidence(self, file_path: str, item_id: str | None = None):
        with open(file_path, "rb") as fh:
            files = {"file": (os.path.basename(file_path), fh)}
            target = item_id or getattr(self, "_current_item_id", None)
            if not target:
                self.log("attach_evidence ignorado: sin item_id", level="WARN")
                return
            self._api.post(f"/api/queue-items/{target}/evidence", files=files)


class Bot(_BaseBot):
    """Bot de una sola pasada. Implementá `run()`. exit code != 0 => FAILED."""

    def run(self):  # override
        raise NotImplementedError

    def __call__(self):
        try:
            self.run()
        except Exception as exc:  # noqa: BLE001
            self.log(f"bot falló: {exc}", level="ERROR", traceback=traceback.format_exc())
            sys.exit(1)


class TransactionalBot(_BaseBot):
    """
    Bot que consume una cola transaccional. Implementá `process_item(item)`.
    Opcionalmente `setup()` / `teardown()`. Con `use_browser = True` el
    framework abre y cierra Chromium (Playwright) por vos: usás `self.browser`.
    """

    use_browser: bool = False
    poll_empty_exits: bool = True  # si la cola queda vacía, el bot termina

    # Ignorar errores de certificado TLS. Ponelo en True si corrés detrás de
    # un proxy corporativo con inspección HTTPS (Zscaler, Netskope, etc.):
    # el Chromium del contenedor no confía en el CA de la empresa y falla con
    # net::ERR_CERT_AUTHORITY_INVALID. Lo aplica self.new_page().
    ignore_https_errors: bool = False

    # -- hooks del usuario -----------------------------------------------------
    def setup(self):  # noqa: D401
        ...

    def process_item(self, item: _Item) -> dict | None:
        raise NotImplementedError

    def teardown(self):
        ...

    def new_page(self, **kwargs):
        """
        Abre una página nueva aplicando `ignore_https_errors` de la clase.
        Usalo en setup() en vez de self.browser.new_page().
        """
        kwargs.setdefault("ignore_https_errors", self.ignore_https_errors)
        return self.browser.new_page(**kwargs)

    # Flags de Chromium seguros para correr dentro de un contenedor Docker
    # (como root, sin /dev/shm grande). Sin --no-sandbox, Chromium aborta
    # de entrada con "Running as root without --no-sandbox is not supported".
    browser_args = ["--no-sandbox", "--disable-dev-shm-usage"]

    # -- motor ---------------------------------------------------------------
    def run(self):
        self._pw = None
        self.browser = None
        if self.use_browser:
            from playwright.sync_api import sync_playwright

            self._pw = sync_playwright().start()
            self.browser = self._pw.chromium.launch(headless=True, args=self.browser_args)

        processed = ok = failed = 0
        try:
            try:
                self.setup()
            except Exception as exc:  # noqa: BLE001
                self.log(f"setup() falló: {exc}", level="ERROR", traceback=traceback.format_exc())
                raise
            if not self.queue_id:
                raise RuntimeError("el proceso no tiene cola asignada (QUEUE_ID vacío)")

            while True:
                raw = self._claim()
                if raw is None:
                    self.log("cola vacía, fin de la corrida", processed=processed, ok=ok, failed=failed)
                    break
                item = _Item(raw)
                self._current_item_id = item.id
                self.log("item.start", item=str(item))
                t0 = time.monotonic()
                try:
                    output = self.process_item(item)
                    self._set_status(item.id, "success", output_data=output)
                    ok += 1
                    self.log("item.ok", item=str(item), seconds=round(time.monotonic() - t0, 2))
                except BusinessError as be:
                    self._set_status(item.id, "business_error", reason=str(be))
                    failed += 1
                    self.log("item.business_error", item=str(item), reason=str(be), level="WARN")
                except Exception as exc:  # noqa: BLE001
                    shot = self._screenshot()
                    if shot:
                        self._upload_bytes(item.id, "error.png", shot, "image/png")
                    self._set_status(item.id, "application_error",
                                     reason=f"{exc}\n{traceback.format_exc()}")
                    failed += 1
                    self.log("item.app_error", item=str(item), error=str(exc), level="ERROR")
                processed += 1
        finally:
            try:
                self.teardown()
            finally:
                if self.browser:
                    self.browser.close()
                if self._pw:
                    self._pw.stop()

        if failed and not ok:
            sys.exit(1)  # todo falló -> la corrida se marca FAILED

    # -- llamadas HTTP -----------------------------------------------------
    def _claim(self) -> dict | None:
        r = self._api.post(f"/api/queues/{self.queue_id}/next-item",
                           params={"worker_id": self.worker_id, "execution_id": self.execution_id})
        if r.status_code == 204:
            return None
        r.raise_for_status()
        return r.json()

    def _set_status(self, item_id: str, result: str, output_data=None, reason=None):
        self._api.post(f"/api/queue-items/{item_id}/status",
                       json={"result": result, "output_data": output_data, "reason": reason})

    def _upload_bytes(self, item_id: str, filename: str, data: bytes, content_type: str):
        self._api.post(f"/api/queue-items/{item_id}/evidence",
                       files={"file": (filename, data, content_type)})

    def _screenshot(self) -> bytes | None:
        if not self.browser:
            return None
        try:
            for ctx in self.browser.contexts:
                for page in ctx.pages:
                    return page.screenshot()
        except Exception:
            return None
        return None
