"""
RPA Challenge — Dispatcher
==========================
Corre 1 vez. Lee el Excel de entrada y crea 1 queue item por fila en la
cola del proceso. Después, N performers consumen esos items en paralelo.

El Excel se toma del asset 'rpa_challenge_input' (subilo por la UI en
Recursos > Assets). Si ese asset no existe, cae al Excel público del
sitio, para que la demo funcione out-of-the-box.
"""

import tempfile

import pandas as pd
import requests
import urllib3

from orchestrator_sdk import Bot

FALLBACK_XLSX = "https://rpachallenge.com/assets/downloadFiles/challenge.xlsx"


class RpaChallengeDispatcher(Bot):
    def run(self):
        path = tempfile.mktemp(suffix=".xlsx")
        try:
            self.assets.download("rpa_challenge_input", path)
            self.log("Excel tomado del asset 'rpa_challenge_input'")
        except Exception:
            self.log("asset no encontrado, descargando el Excel público del sitio", level="WARN")
            # verify=False: red corporativa con inspección TLS. Lo ideal es
            # subir el archivo como asset 'rpa_challenge_input' y no depender
            # de la salida a internet.
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
            resp = requests.get(FALLBACK_XLSX, timeout=30, verify=False)
            resp.raise_for_status()
            with open(path, "wb") as fh:
                fh.write(resp.content)

        df = pd.read_excel(path)
        df.columns = [c.strip() for c in df.columns]

        items = [
            {"reference": f"row-{idx + 1}", "priority": 20, "specific_data": row.to_dict()}
            for idx, row in df.iterrows()
        ]
        self.add_queue_items(items)
        self.log(f"encolados {len(items)} items en la cola {self.queue_id}")


if __name__ == "__main__":
    RpaChallengeDispatcher()()
