import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..models import AISetting
from .secrets import decrypt

SYSTEM = "You are a read-only personal finance analyst. Explain only the supplied calculated data. Never invent transactions, balances, or recommendations not supported by the data. Never claim to modify records."

async def ask_model(db: Session, user_id: int, prompt: str, context: dict) -> str:
    s = db.scalar(select(AISetting).where(AISetting.user_id == user_id))
    if not s or not s.provider or not s.model:
        raise ValueError("AI provider is not configured")
    text = f"{SYSTEM}\n\nUser question: {prompt}\n\nCalculated finance data:\n{context}"
    timeout=httpx.Timeout(30.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        if s.provider == "local":
            if not s.base_url: raise ValueError("Local AI base URL is required")
            headers={}
            key=decrypt(s.api_key_encrypted)
            if key: headers["Authorization"] = f"Bearer {key}"
            r=await client.post(s.base_url.rstrip("/")+"/chat/completions", headers=headers, json={
                "model":s.model,"messages":[{"role":"user","content":text}],"temperature":float(s.temperature)
            })
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]
        if s.provider == "gemini":
            key=decrypt(s.api_key_encrypted)
            if not key: raise ValueError("Gemini API key is required")
            url=f"https://generativelanguage.googleapis.com/v1beta/models/{s.model}:generateContent"
            r=await client.post(url, headers={"x-goog-api-key":key,"Content-Type":"application/json"}, json={
                "contents":[{"parts":[{"text":text}]}],
                "generationConfig":{"temperature":float(s.temperature)}
            })
            r.raise_for_status()
            return r.json()["candidates"][0]["content"]["parts"][0]["text"]
    raise ValueError("Unsupported AI provider")
