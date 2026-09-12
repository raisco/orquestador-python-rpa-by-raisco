"""
Reporte Rápido con Credencial
=============================
Bot de una sola pasada (sin cola): toma una credencial de la bóveda,
simula un login contra un sistema y genera un reporte de texto que
queda adjunto a la ejecución. Sirve para mostrar el flujo completo
credenciales -> proceso -> output sin depender de un sitio externo.
"""

import tempfile
from datetime import datetime

from orchestrator_sdk import Bot

CREDENTIAL_NAME = "sistema_demo"


class ReporteRapido(Bot):
    def run(self):
        cred = self.credentials.get(CREDENTIAL_NAME)
        self.log(f"credencial obtenida de la bóveda: usuario '{cred['username']}'")

        self.log("conectando al sistema (simulado)...")
        self.log("login OK, generando reporte")

        now = datetime.now().astimezone()
        lines = [
            "REPORTE RAPIDO - Orquestador RAISCO",
            f"Generado: {now.isoformat(timespec='seconds')}",
            f"Sistema: {CREDENTIAL_NAME}",
            f"Usuario utilizado: {cred['username']}",
            "Estado: OK",
        ]

        path = tempfile.mktemp(suffix=".txt")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write("\n".join(lines) + "\n")

        self.attach_execution_file(path)
        self.log("reporte generado y adjuntado a la ejecucion")


if __name__ == "__main__":
    ReporteRapido()()
