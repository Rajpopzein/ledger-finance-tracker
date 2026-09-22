import os
from pathlib import Path
from cryptography.fernet import Fernet
from ..config import settings


def _fernet():
    env_key = os.getenv("SECRET_KEY")
    if env_key:
        return Fernet(env_key.encode())

    path = Path(settings.secret_key_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_bytes(Fernet.generate_key())
        try:
            path.chmod(0o600)
        except OSError:
            pass
    return Fernet(path.read_bytes())


def encrypt(value: str | None):
    return _fernet().encrypt(value.encode()).decode() if value else None


def decrypt(value: str | None):
    return _fernet().decrypt(value.encode()).decode() if value else None
