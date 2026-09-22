import hashlib, re
from datetime import datetime, timedelta
from decimal import Decimal
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..models import Transaction

def normalize_text(value: str | None) -> str:
    if not value:
        return ""
    value = value.upper().strip()
    value = re.sub(r"\b(UPI|NEFT|IMPS|POS|DEBIT|CREDIT)\b", " ", value)
    return re.sub(r"[^A-Z0-9]+", " ", value).strip()

def fingerprint(account_id: int, txn_at: datetime, amount: Decimal, direction: str, description: str | None) -> str:
    payload = f"{account_id}|{txn_at.date().isoformat()}|{amount.quantize(Decimal('0.01'))}|{direction}|{normalize_text(description)}"
    return hashlib.sha256(payload.encode()).hexdigest()

def find_match(db: Session, *, account_id: int, txn_at: datetime, amount: Decimal, direction: str, description: str | None, upi_ref: str | None = None, bank_ref: str | None = None):
    if upi_ref:
        hit = db.scalar(select(Transaction).where(Transaction.account_id == account_id, Transaction.upi_ref == upi_ref))
        if hit: return hit, "upi_ref", 1.0
    if bank_ref:
        hit = db.scalar(select(Transaction).where(Transaction.account_id == account_id, Transaction.bank_ref == bank_ref))
        if hit: return hit, "bank_ref", 1.0
    fp = fingerprint(account_id, txn_at, amount, direction, description)
    hit = db.scalar(select(Transaction).where(Transaction.account_id == account_id, Transaction.fingerprint == fp))
    if hit: return hit, "fingerprint", 0.98
    candidates = db.scalars(select(Transaction).where(
        Transaction.account_id == account_id,
        Transaction.amount == amount,
        Transaction.direction == direction,
        Transaction.txn_at >= txn_at - timedelta(days=1),
        Transaction.txn_at <= txn_at + timedelta(days=1),
    )).all()
    normalized = normalize_text(description)
    for candidate in candidates:
        c = normalize_text(candidate.description_raw or candidate.merchant)
        if normalized and c and (normalized in c or c in normalized):
            return candidate, "possible", 0.82
    return None, "new", 0.0
