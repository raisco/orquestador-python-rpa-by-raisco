"""
RPA Challenge — Performer
=========================
Consume la cola transaccional y completa el formulario dinámico de
rpachallenge.com (los campos cambian de posición cada ronda: se ubican por
el atributo estable `ng-reflect-name`).

Se ejecuta en paralelo: levantá varios workers (o `docker compose up
--scale worker=3`) y cada uno toma items distintos de la misma cola sin
pisarse. Un item sin alguna columna -> BusinessError (no reintenta);
cualquier otro fallo -> reintento automático según la config de la cola.
"""

from orchestrator_sdk import BusinessError, TransactionalBot

COLUMN_TO_FIELD = {
    "First Name": "labelFirstName",
    "Last Name": "labelLastName",
    "Company Name": "labelCompanyName",
    "Role in Company": "labelRole",
    "Address": "labelAddress",
    "Email": "labelEmail",
    "Phone Number": "labelPhone",
}


class RpaChallengePerformer(TransactionalBot):
    use_browser = True
    ignore_https_errors = True   # red corporativa con inspección TLS

    def setup(self):
        self.page = self.new_page()
        self.page.goto("https://rpachallenge.com/", wait_until="domcontentloaded")
        self.page.get_by_role("button", name="Start").click()
        self.log("navegador listo, challenge iniciado")

    def process_item(self, item):
        data = item.specific_data
        for column, field in COLUMN_TO_FIELD.items():
            if column not in data or str(data[column]).strip() in ("", "nan"):
                raise BusinessError(f"falta la columna '{column}' en el item {item.reference}")
            self.page.fill(f'input[ng-reflect-name="{field}"]', str(data[column]))
        self.page.get_by_role("button", name="Submit").click()
        return {"submitted": True, "reference": item.reference}


if __name__ == "__main__":
    RpaChallengePerformer().run()
