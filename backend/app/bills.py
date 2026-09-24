import hashlib
import io
from datetime import datetime, time, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pypdf import PdfReader
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .db import get_db
from .models import Account, Category, CreditCardTransactionLink, Debt, Transaction, TransactionSource
from .schemas import BillExpenseCreate
from .services.bill_ai import extract_bill_from_document
from .services.dedupe import fingerprint
from .users import current_user_id

router = APIRouter()

DEFAULT_CATEGORIES = [
    "Food & Dining",
    "Fuel",
    "Groceries",
    "EMI & Loans",
    "Shopping",
    "Bills & Subscriptions",
    "Travel",
    "Health",
    "Payroll",
    "Investments",
    "Other",
]

ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
    "text/plain",
}


def _category(db: Session, user_id: int, name: str) -> Category:
    existing = db.scalar(
        select(Category).where(
            Category.user_id == user_id,
            func.lower(Category.name) == name.lower(),
        )
    )
    if existing:
        return existing
    category = Category(user_id=user_id, name=name.strip())
    db.add(category)
    db.flush()
    return category


def _extract_text(filename: str, mime_type: str, content: bytes) -> str:
    lower = filename.lower()
    if mime_type == "application/pdf" or lower.endswith(".pdf"):
        try:
            reader = PdfReader(io.BytesIO(content))
            return "\n".join((page.extract_text() or "") for page in reader.pages)
        except Exception:
            return ""
    if mime_type == "text/plain" or lower.endswith(".txt"):
        try:
            return content.decode("utf-8")
        except UnicodeDecodeError:
            return ""
    return ""


@router.post("/api/bills/ai-preview")
async def bill_ai_preview(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    content = await file.read()
    if not content:
        raise HTTPException(400, "Bill file is empty")
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(400, "Bill must be 10 MB or smaller")

    filename = (file.filename or "bill").strip()[:255]
    mime_type = (file.content_type or "").lower()
    if mime_type not in ALLOWED_MIME_TYPES:
        lower = filename.lower()
        if lower.endswith((".jpg", ".jpeg")):
            mime_type = "image/jpeg"
        elif lower.endswith(".png"):
            mime_type = "image/png"
        elif lower.endswith(".webp"):
            mime_type = "image/webp"
        elif lower.endswith(".pdf"):
            mime_type = "application/pdf"
        elif lower.endswith(".txt"):
            mime_type = "text/plain"
        else:
            raise HTTPException(400, "Upload a JPG, PNG, WEBP, PDF or TXT bill")

    custom = db.scalars(
        select(Category.name).where(Category.user_id == user_id).order_by(Category.name)
    ).all()
    allowed_categories = list(dict.fromkeys([*DEFAULT_CATEGORIES, *custom]))
    document_text = _extract_text(filename, mime_type, content)

    try:
        preview = await extract_bill_from_document(
            db,
            user_id,
            filename,
            mime_type,
            content=content,
            document_text=document_text,
            allowed_categories=allowed_categories,
        )
    except Exception as exc:
        raise HTTPException(400, str(exc))

    return {
        "file_name": filename,
        "file_hash": hashlib.sha256(content).hexdigest(),
        "preview": preview,
        "requires_confirmation": True,
        "privacy": "The bill is used for extraction and is not stored by Ledger. Review the extracted values before adding the expense.",
    }


@router.post("/api/bills/commit")
def bill_commit(
    body: BillExpenseCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)

    if body.source_hash:
        existing_by_file = db.scalar(
            select(Transaction)
            .join(TransactionSource, TransactionSource.transaction_id == Transaction.id)
            .where(
                Transaction.user_id == user_id,
                TransactionSource.source_type == "bill",
                TransactionSource.external_hash == body.source_hash,
            )
            .limit(1)
        )
        if existing_by_file:
            return {
                "transaction_id": existing_by_file.id,
                "duplicate": True,
                "message": "This bill was already added.",
            }

    category = _category(db, user_id, body.category)
    account = None
    credit_card = None

    if body.payment_method == "cash":
        account = db.scalar(
            select(Account).where(
                Account.user_id == user_id,
                Account.type == "cash",
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
    elif body.payment_method in ("upi", "bank"):
        if body.account_id is None:
            raise HTTPException(400, "Select the bank account used to pay this bill")
        account = db.get(Account, body.account_id)
        if not account or account.user_id != user_id or account.type != "bank" or not account.is_active:
            raise HTTPException(400, "Select a valid active bank account")
    elif body.payment_method == "credit_card":
        if body.credit_card_id is None:
            raise HTTPException(400, "Select the credit card used to pay this bill")
        credit_card = db.get(Debt, body.credit_card_id)
        if (
            not credit_card
            or credit_card.user_id != user_id
            or credit_card.debt_type != "credit_card"
        ):
            raise HTTPException(400, "Select a valid credit card")
    else:
        raise HTTPException(400, "Unsupported payment method")

    txn_at = body.txn_at
    if txn_at.tzinfo is None:
        txn_at = txn_at.replace(tzinfo=timezone.utc)

    memo = (body.note or body.merchant or body.category).strip()
    fp = fingerprint(account.id if account else 0, txn_at, body.amount, "debit", memo)

    existing = db.scalar(
        select(Transaction).where(
            Transaction.user_id == user_id,
            Transaction.fingerprint == fp,
            Transaction.direction == "debit",
            Transaction.amount == body.amount,
        ).limit(1)
    )
    if existing:
        has_bill_source = any(src.source_type == "bill" for src in existing.sources)
        if not has_bill_source:
            existing.sources.append(TransactionSource(
                source_type="bill",
                source_name=f"Bill · {(body.source_file_name or 'uploaded bill')[:220]}",
                external_hash=body.source_hash,
            ))
            db.commit()
        return {
            "transaction_id": existing.id,
            "duplicate": True,
            "message": "Matched an existing expense. The bill was linked instead of creating a duplicate.",
        }

    txn_type = (
        "credit_card_purchase" if body.payment_method == "credit_card"
        else "investment" if category.name == "Investments"
        else "cash_expense" if body.payment_method == "cash"
        else "expense"
    )
    tx = Transaction(
        user_id=user_id,
        account_id=account.id if account else None,
        category_id=category.id,
        category_source="manual",
        category_previous_id=None,
        category_undo_available=False,
        txn_at=txn_at,
        amount=body.amount,
        direction="debit",
        txn_type=txn_type,
        payment_method=body.payment_method,
        merchant=body.merchant.strip(),
        description_raw=body.note.strip() if body.note else "Added from uploaded bill",
        fingerprint=fp,
        verification_status="verified",
    )
    tx.sources.append(TransactionSource(
        source_type="bill",
        source_name=f"Bill · {(body.source_file_name or 'uploaded bill')[:220]}",
        external_hash=body.source_hash,
    ))
    db.add(tx)
    db.flush()

    if credit_card is not None:
        credit_card.outstanding_balance = Decimal(credit_card.outstanding_balance) + Decimal(body.amount)
        if credit_card.status == "closed":
            credit_card.status = "active"
        db.add(CreditCardTransactionLink(
            user_id=user_id,
            transaction_id=tx.id,
            debt_id=credit_card.id,
            entry_type="purchase",
            amount=body.amount,
        ))

    db.commit()
    return {
        "transaction_id": tx.id,
        "duplicate": False,
        "amount": float(tx.amount),
        "merchant": tx.merchant,
        "category": category.name,
        "message": "Expense added from bill.",
    }
