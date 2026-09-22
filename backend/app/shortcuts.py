import hashlib
import secrets
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .db import get_db
from .models import Account, Category, ShortcutToken, Transaction, TransactionSource
from .services.dedupe import fingerprint
from .users import current_user_id

router = APIRouter()

class ShortcutTransactionIn(BaseModel):
    amount: Decimal = Field(gt=0)
    direction: str = Field(pattern="^(debit|credit)$")
    merchant: str = Field(min_length=1, max_length=160)
    note: str | None = Field(default=None, max_length=500)
    account_name: str | None = Field(default=None, max_length=100)
    category: str | None = Field(default=None, max_length=80)
    txn_at: datetime | None = None

def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def _shortcut_user(
    authorization: str | None,
    db: Session,
) -> tuple[int, ShortcutToken]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Shortcut token required")
    raw = authorization[7:].strip()
    if not raw:
        raise HTTPException(401, "Shortcut token required")
    token = db.scalar(
        select(ShortcutToken).where(
            ShortcutToken.token_hash == _hash_token(raw),
            ShortcutToken.revoked_at.is_(None),
        )
    )
    if not token:
        raise HTTPException(401, "Shortcut token is invalid or revoked")
    return token.user_id, token

@router.get("/api/shortcuts/status")
def shortcut_status(request: Request, db: Session = Depends(get_db)):
    user_id = current_user_id(request)
    token = db.scalar(select(ShortcutToken).where(ShortcutToken.user_id == user_id))
    accounts = db.scalars(
        select(Account)
        .where(Account.user_id == user_id, Account.is_active == True)
        .order_by(Account.type, Account.name)
    ).all()
    return {
        "configured": bool(token and token.revoked_at is None),
        "created_at": token.created_at.isoformat() if token and token.created_at else None,
        "last_used_at": token.last_used_at.isoformat() if token and token.last_used_at else None,
        "accounts": [{"name": a.name, "type": a.type} for a in accounts],
    }

@router.post("/api/shortcuts/token")
def create_shortcut_token(request: Request, db: Session = Depends(get_db)):
    user_id = current_user_id(request)
    raw = "led_" + secrets.token_urlsafe(32)
    token_hash = _hash_token(raw)
    row = db.scalar(select(ShortcutToken).where(ShortcutToken.user_id == user_id))
    now = datetime.now(timezone.utc)
    if row:
        row.token_hash = token_hash
        row.created_at = now
        row.last_used_at = None
        row.revoked_at = None
    else:
        row = ShortcutToken(
            user_id=user_id,
            token_hash=token_hash,
            created_at=now,
        )
        db.add(row)
    db.commit()
    return {
        "token": raw,
        "created_at": now.isoformat(),
        "shown_once": True,
    }

@router.delete("/api/shortcuts/token")
def revoke_shortcut_token(request: Request, db: Session = Depends(get_db)):
    user_id = current_user_id(request)
    row = db.scalar(select(ShortcutToken).where(ShortcutToken.user_id == user_id))
    if row:
        row.revoked_at = datetime.now(timezone.utc)
        db.commit()
    return {"ok": True}

@router.post("/api/shortcuts/transaction")
def shortcut_transaction(
    body: ShortcutTransactionIn,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    user_id, shortcut_token = _shortcut_user(authorization, db)
    account = None
    if body.account_name and body.account_name.strip():
        account = db.scalar(
            select(Account).where(
                Account.user_id == user_id,
                Account.is_active == True,
                func.lower(Account.name) == body.account_name.strip().lower(),
            )
        )
        if not account:
            raise HTTPException(400, "Account name was not found in Ledger")
    else:
        account = db.scalar(
            select(Account).where(
                Account.user_id == user_id,
                Account.type == "cash",
                Account.is_active == True,
            )
        )
        if not account:
            account = Account(
                user_id=user_id,
                name="Cash",
                institution="Cash",
                type="cash",
                is_active=True,
            )
            db.add(account)
            db.flush()

    category = None
    if body.category and body.category.strip():
        category = db.scalar(
            select(Category).where(
                Category.user_id == user_id,
                func.lower(Category.name) == body.category.strip().lower(),
            )
        )
        if not category:
            category = Category(user_id=user_id, name=body.category.strip())
            db.add(category)
            db.flush()

    txn_at = body.txn_at or datetime.now(timezone.utc)
    description = (body.note or body.merchant).strip()
    amount = Decimal(body.amount)
    fp = fingerprint(
        account.id,
        txn_at,
        amount,
        body.direction,
        description,
    )
    tx = Transaction(
        user_id=user_id,
        account_id=account.id,
        category_id=category.id if category else None,
        txn_at=txn_at,
        amount=amount,
        direction=body.direction,
        txn_type="income" if body.direction == "credit" else "expense",
        payment_method="shortcut",
        merchant=body.merchant.strip(),
        description_raw=body.note.strip() if body.note else None,
        fingerprint=fp,
        verification_status="manual",
    )
    tx.sources.append(
        TransactionSource(
            source_type="iphone_shortcut",
            source_name="Apple Shortcuts",
        )
    )
    shortcut_token.last_used_at = datetime.now(timezone.utc)
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return {
        "ok": True,
        "transaction_id": tx.id,
        "amount": float(tx.amount),
        "direction": tx.direction,
        "merchant": tx.merchant,
        "account": account.name,
        "category": category.name if category else "Uncategorized",
    }
