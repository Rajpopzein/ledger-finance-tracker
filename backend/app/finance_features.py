import io
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pypdf import PdfReader
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .db import get_db
from .models import Category, Debt, DebtPayment, Transaction
from .schemas import AICategorizeRequest, DebtCreate, DebtPaymentCreate, DebtUpdate
from .services.ai import categorize_transactions, extract_debt_from_document
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

def _category(db: Session, user_id: int, name: str):
    existing = db.scalar(
        select(Category).where(
            Category.user_id == user_id,
            func.lower(Category.name) == name.lower(),
        )
    )
    if existing:
        return existing
    category = Category(user_id=user_id, name=name)
    db.add(category)
    db.flush()
    return category

@router.post("/api/transactions/ai-categorize")
async def ai_categorize_transactions(
    body: AICategorizeRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    ids = list(dict.fromkeys(body.transaction_ids))[:100]
    txs = db.scalars(
        select(Transaction).where(
            Transaction.user_id == user_id,
            Transaction.id.in_(ids),
        )
    ).all()
    if not txs:
        raise HTTPException(404, "No matching transactions found")

    custom = db.scalars(
        select(Category.name).where(Category.user_id == user_id).order_by(Category.name)
    ).all()
    allowed = list(dict.fromkeys([*DEFAULT_CATEGORIES, *custom]))
    payload = [
        {
            "transaction_id": tx.id,
            "direction": tx.direction,
            "amount": float(tx.amount),
            "date": tx.txn_at.date().isoformat(),
            "merchant": tx.merchant,
            "description": tx.description_raw,
        }
        for tx in txs
    ]

    try:
        suggestions = await categorize_transactions(db, user_id, payload, allowed)
    except Exception as exc:
        raise HTTPException(400, str(exc))

    by_id = {tx.id: tx for tx in txs}
    applied = []
    for suggestion in suggestions:
        tx = by_id.get(suggestion["transaction_id"])
        if not tx:
            continue
        category = _category(db, user_id, suggestion["category"])
        if tx.category_id == category.id:
            continue
        tx.category_previous_id = tx.category_id
        tx.category_id = category.id
        tx.category_source = "ai"
        tx.category_undo_available = True
        applied.append(suggestion)

    db.commit()
    return {
        "requested": len(ids),
        "applied": len(applied),
        "items": applied,
    }

@router.post("/api/transactions/{tx_id}/category/undo")
def undo_ai_category(
    tx_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    tx = db.get(Transaction, tx_id)
    if not tx or tx.user_id != user_id:
        raise HTTPException(404, "Transaction not found")
    if not tx.category_undo_available or tx.category_source != "ai":
        raise HTTPException(400, "No AI category change is available to undo")

    tx.category_id = tx.category_previous_id
    tx.category_previous_id = None
    tx.category_source = None
    tx.category_undo_available = False
    db.commit()
    return {"ok": True, "transaction_id": tx.id}

def _serialize_debt(debt: Debt, payments: list[DebtPayment] | None = None):
    return {
        "id": debt.id,
        "lender": debt.lender,
        "debt_type": debt.debt_type,
        "principal": float(debt.principal),
        "outstanding_balance": float(debt.outstanding_balance),
        "interest_rate": float(debt.interest_rate) if debt.interest_rate is not None else None,
        "emi_amount": float(debt.emi_amount) if debt.emi_amount is not None else None,
        "start_date": debt.start_date.isoformat() if debt.start_date else None,
        "end_date": debt.end_date.isoformat() if debt.end_date else None,
        "next_due_date": debt.next_due_date.isoformat() if debt.next_due_date else None,
        "status": debt.status,
        "notes": debt.notes,
        "source_type": debt.source_type,
        "source_file_name": debt.source_file_name,
        "created_at": debt.created_at.isoformat() if debt.created_at else None,
        "payments": [
            {
                "id": p.id,
                "amount": float(p.amount),
                "paid_at": p.paid_at.isoformat(),
                "note": p.note,
            }
            for p in (payments or [])
        ],
    }

@router.get("/api/debts")
def list_debts(request: Request, db: Session = Depends(get_db)):
    user_id = current_user_id(request)
    debts = db.scalars(
        select(Debt)
        .where(Debt.user_id == user_id)
        .order_by(Debt.status.asc(), Debt.created_at.desc())
    ).all()
    payments = db.scalars(
        select(DebtPayment)
        .where(DebtPayment.user_id == user_id)
        .order_by(DebtPayment.paid_at.desc())
    ).all()
    by_debt: dict[int, list[DebtPayment]] = {}
    for payment in payments:
        by_debt.setdefault(payment.debt_id, []).append(payment)
    total_outstanding = sum(
        (d.outstanding_balance for d in debts if d.status == "active"),
        Decimal("0"),
    )
    monthly_emi = sum(
        (d.emi_amount or Decimal("0") for d in debts if d.status == "active"),
        Decimal("0"),
    )
    return {
        "items": [_serialize_debt(d, by_debt.get(d.id, [])) for d in debts],
        "total_outstanding": float(total_outstanding),
        "monthly_emi": float(monthly_emi),
        "active_count": sum(1 for d in debts if d.status == "active"),
    }

@router.post("/api/debts")
def create_debt(
    body: DebtCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    debt = Debt(
        user_id=user_id,
        lender=body.lender.strip(),
        debt_type=body.debt_type.strip(),
        principal=body.principal,
        outstanding_balance=body.outstanding_balance,
        interest_rate=body.interest_rate,
        emi_amount=body.emi_amount,
        start_date=body.start_date,
        end_date=body.end_date,
        next_due_date=body.next_due_date,
        status=body.status,
        notes=body.notes,
        source_type=body.source_type,
        source_file_name=body.source_file_name,
    )
    db.add(debt)
    db.commit()
    db.refresh(debt)
    return _serialize_debt(debt)

@router.patch("/api/debts/{debt_id}")
def update_debt(
    debt_id: int,
    body: DebtUpdate,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    debt = db.get(Debt, debt_id)
    if not debt or debt.user_id != user_id:
        raise HTTPException(404, "Debt not found")
    values = body.model_dump(exclude_unset=True)
    for key, value in values.items():
        setattr(debt, key, value)
    if debt.outstanding_balance <= 0:
        debt.outstanding_balance = Decimal("0")
        debt.status = "closed"
    db.commit()
    db.refresh(debt)
    return _serialize_debt(debt)

@router.post("/api/debts/{debt_id}/payments")
def add_debt_payment(
    debt_id: int,
    body: DebtPaymentCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    debt = db.get(Debt, debt_id)
    if not debt or debt.user_id != user_id:
        raise HTTPException(404, "Debt not found")
    payment = DebtPayment(
        debt_id=debt.id,
        user_id=user_id,
        amount=body.amount,
        paid_at=body.paid_at,
        note=body.note,
    )
    debt.outstanding_balance = max(Decimal("0"), debt.outstanding_balance - body.amount)
    if debt.outstanding_balance == 0:
        debt.status = "closed"
    db.add(payment)
    db.commit()
    db.refresh(debt)
    return _serialize_debt(debt, [payment])

def _loan_document_text(filename: str, content: bytes) -> str:
    lower = filename.lower()
    if lower.endswith(".pdf"):
        try:
            reader = PdfReader(io.BytesIO(content))
            text = "\n".join((page.extract_text() or "") for page in reader.pages)
        except Exception as exc:
            raise HTTPException(400, "Could not read this PDF") from exc
        if not text.strip():
            raise HTTPException(400, "This PDF has no selectable text. Image-only loan documents are not supported yet.")
        return text
    if lower.endswith(".txt"):
        try:
            return content.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise HTTPException(400, "Text document must be UTF-8") from exc
    raise HTTPException(400, "Upload a searchable PDF or TXT loan document")

@router.post("/api/debts/ai-preview")
async def debt_ai_preview(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    content = await file.read()
    if len(content) > 8 * 1024 * 1024:
        raise HTTPException(400, "Loan document must be 8 MB or smaller")
    filename = file.filename or "loan-document.pdf"
    text = _loan_document_text(filename, content)
    try:
        extracted = await extract_debt_from_document(db, user_id, filename, text)
    except Exception as exc:
        raise HTTPException(400, str(exc))
    return {
        "file_name": filename,
        "preview": extracted,
        "requires_confirmation": True,
        "privacy": "Account numbers, IFSC codes, UPI IDs and long identifiers are redacted before AI processing.",
    }
