"""
crypto_utils.py
----------------
Cifrado simétrico local para la Bóveda de Credenciales (Fernet = AES-128
CBC + HMAC). La clave maestra se genera una vez en `secret.key` (junto al
código del backend) y NO debe subirse a un repo compartido: si se pierde,
las credenciales guardadas quedan irrecuperables.

Para producción real conviene un vault dedicado (HashiCorp Vault, Azure
Key Vault). Para el PoC local esto alcanza.
"""

from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

KEY_PATH = Path(__file__).resolve().parent.parent / "secret.key"


def _load_or_create_key() -> bytes:
    if KEY_PATH.exists():
        return KEY_PATH.read_bytes()
    key = Fernet.generate_key()
    KEY_PATH.write_bytes(key)
    return key


_fernet = Fernet(_load_or_create_key())


def encrypt_value(plain_text: str) -> str:
    return _fernet.encrypt(plain_text.encode("utf-8")).decode("utf-8")


def decrypt_value(token: str) -> str:
    try:
        return _fernet.decrypt(token.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise ValueError("No se pudo descifrar el valor: token inválido o corrupto.") from exc
