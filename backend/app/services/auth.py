import base64
import hashlib
import hmac
import json
import os
import time
from .secrets import encrypt, decrypt

SESSION_COOKIE = "ledger_session"
SESSION_MAX_AGE = 60 * 60 * 24 * 7

def hash_password(password: str, salt: bytes | None = None) -> tuple[str, str]:
    salt = salt or os.urandom(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=2**14,
        r=8,
        p=1,
        dklen=64,
    )
    return base64.urlsafe_b64encode(salt).decode(), base64.urlsafe_b64encode(digest).decode()

def verify_password(password: str, salt_b64: str, hash_b64: str) -> bool:
    salt = base64.urlsafe_b64decode(salt_b64.encode())
    _, candidate = hash_password(password, salt)
    return hmac.compare_digest(candidate, hash_b64)

def create_session(owner_id: int) -> str:
    payload = json.dumps(
        {"sub": owner_id, "exp": int(time.time()) + SESSION_MAX_AGE},
        separators=(",", ":"),
    )
    return encrypt(payload)

def read_session(token: str | None) -> int | None:
    if not token:
        return None
    try:
        payload = json.loads(decrypt(token))
        if int(payload.get("exp", 0)) < int(time.time()):
            return None
        return int(payload["sub"])
    except Exception:
        return None
