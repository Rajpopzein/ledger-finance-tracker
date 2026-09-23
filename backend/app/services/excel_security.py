import io

import msoffcrypto

EXCEL_PASSWORD_REQUIRED = "EXCEL_PASSWORD_REQUIRED"
EXCEL_PASSWORD_INVALID = "EXCEL_PASSWORD_INVALID"


def unlock_excel(filename: str, content: bytes, password: str | None = None) -> bytes:
    """Decrypt password-to-open protected Excel files in memory.

    Unencrypted or unsupported Excel files are returned unchanged so the
    normal parser can produce the appropriate format error.
    """
    lower = (filename or "").lower()
    if not lower.endswith((".xlsx", ".xls")):
        return content

    try:
        office_file = msoffcrypto.OfficeFile(io.BytesIO(content))
        encrypted = office_file.is_encrypted()
    except Exception:
        return content

    if not encrypted:
        return content

    if not password:
        raise ValueError(EXCEL_PASSWORD_REQUIRED)

    try:
        office_file.load_key(password=password)
        decrypted = io.BytesIO()
        office_file.decrypt(decrypted)
        return decrypted.getvalue()
    except Exception as exc:
        raise ValueError(EXCEL_PASSWORD_INVALID) from exc
