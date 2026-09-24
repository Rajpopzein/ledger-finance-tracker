import base64
import json
from decimal import Decimal

import httpx
from sqlalchemy.orm import Session

from .ai import BILL_DOCUMENT_SYSTEM, _call_model, _json_from_text, _setting, redact_sensitive_text
from .secrets import decrypt


async def extract_bill_from_document(
    db: Session,
    user_id: int,
    filename: str,
    mime_type: str,
    *,
    content: bytes | None,
    document_text: str | None,
    allowed_categories: list[str],
) -> dict:
    safe_name = redact_sensitive_text(filename)[:255]
    safe_text = redact_sensitive_text(document_text or "")[:30000]
    user_text = (
        f"Filename: {safe_name}\n"
        f"Allowed categories: {json.dumps(allowed_categories, ensure_ascii=False)}\n\n"
        "Extract the expense represented by this bill. "
        "Use ISO YYYY-MM-DD for bill_date. "
        "Numbers must not contain currency symbols or commas. "
        "payment_method_suggestion must be one of cash, upi, bank, credit_card, unknown. "
        "Use unknown when payment method is not clearly shown. "
        "Use null for unsupported fields.\n\n"
        "Return exactly this JSON shape:\n"
        '{"merchant":null,"bill_date":null,"total_amount":null,"subtotal":null,'
        '"tax_amount":null,"category":null,"payment_method_suggestion":"unknown",'
        '"note":null,"confidence":0.0}'
    )
    if safe_text:
        user_text += "\n\nDocument text:\n" + safe_text

    setting = _setting(db, user_id)
    binary = content or b""
    if binary and setting.provider == "gemini":
        key = decrypt(setting.api_key_encrypted)
        if not key:
            raise ValueError("Gemini API key is required")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{setting.model}:generateContent"
        parts = [
            {"text": user_text},
            {
                "inlineData": {
                    "mimeType": mime_type,
                    "data": base64.b64encode(binary).decode("ascii"),
                }
            },
        ]
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
            response = await client.post(
                url,
                headers={"x-goog-api-key": key, "Content-Type": "application/json"},
                json={
                    "systemInstruction": {"parts": [{"text": BILL_DOCUMENT_SYSTEM}]},
                    "contents": [{"role": "user", "parts": parts}],
                    "generationConfig": {"temperature": 0.0},
                },
            )
            response.raise_for_status()
            raw = response.json()["candidates"][0]["content"]["parts"][0]["text"]
    elif binary and setting.provider == "local" and mime_type.startswith("image/"):
        if not setting.base_url:
            raise ValueError("Local AI base URL is required")
        headers = {"Content-Type": "application/json"}
        key = decrypt(setting.api_key_encrypted)
        if key:
            headers["Authorization"] = f"Bearer {key}"
        data_url = f"data:{mime_type};base64,{base64.b64encode(binary).decode('ascii')}"
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
            response = await client.post(
                setting.base_url.rstrip("/") + "/chat/completions",
                headers=headers,
                json={
                    "model": setting.model,
                    "messages": [
                        {"role": "system", "content": BILL_DOCUMENT_SYSTEM},
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": user_text},
                                {"type": "image_url", "image_url": {"url": data_url}},
                            ],
                        },
                    ],
                    "temperature": 0.0,
                },
            )
            response.raise_for_status()
            raw = response.json()["choices"][0]["message"]["content"]
    else:
        if not safe_text:
            raise ValueError("This bill needs a vision-capable AI model")
        raw = await _call_model(db, user_id, BILL_DOCUMENT_SYSTEM, user_text, temperature=0.0)

    data = _json_from_text(raw)
    if not isinstance(data, dict):
        raise ValueError("AI could not extract bill details")

    allowed = set(allowed_categories)
    category = str(data.get("category") or "")
    if category not in allowed:
        category = "Other" if "Other" in allowed else (allowed_categories[0] if allowed_categories else "")

    result = {
        "merchant": redact_sensitive_text(str(data.get("merchant") or ""))[:160] or None,
        "bill_date": data.get("bill_date"),
        "total_amount": data.get("total_amount"),
        "subtotal": data.get("subtotal"),
        "tax_amount": data.get("tax_amount"),
        "category": category or None,
        "payment_method_suggestion": str(data.get("payment_method_suggestion") or "unknown"),
        "note": redact_sensitive_text(str(data.get("note") or ""))[:1000] or None,
        "confidence": data.get("confidence", 0.0),
    }
    if result["payment_method_suggestion"] not in {"cash", "upi", "bank", "credit_card", "unknown"}:
        result["payment_method_suggestion"] = "unknown"
    for key in ("total_amount", "subtotal", "tax_amount"):
        value = result[key]
        if value in (None, ""):
            result[key] = None
            continue
        try:
            result[key] = float(Decimal(str(value).replace(",", "")))
        except Exception:
            result[key] = None
    try:
        result["confidence"] = max(0.0, min(1.0, float(result["confidence"] or 0.0)))
    except Exception:
        result["confidence"] = 0.0
    return result
