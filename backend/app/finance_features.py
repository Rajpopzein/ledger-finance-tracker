import io
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pypdf import PdfReader
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .db import get_db
from .models import Account, Category, Debt, DebtPayment, Transaction
from .schemas import AICategorizeRequest, DebtCreate, DebtPaymentCreate, DebtUpdate, TransactionCategoryUpdate, TransactionUpdate
from .services.ai import categorize_transactions, extract_debt_from_document
from .services.dedupe import fingerprint
from .users import current_user_id, resolve_ai_provider_user_id, scoped_family_user_ids

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
    provider_user_id = resolve_ai_provider_user_id(
        db,
        user_id,
        "ai_categorization",
        body.provider_user_id,
    )
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
    eligible = [
        tx for tx in txs
        if (tx.category_id is None and tx.category_source is None) or tx.category_source == "ai"
    ]
    if not eligible:
        return {"requested": len(ids), "eligible": 0, "applied": 0, "items": []}

    payload = [
        {
            "transaction_id": tx.id,
            "direction": tx.direction,
            "amount": float(tx.amount),
            "date": tx.txn_at.date().isoformat(),
            "merchant": tx.merchant,
            "description": tx.description_raw,
        }
        for tx in eligible
    ]

    try:
        suggestions = await categorize_transactions(db, provider_user_id, payload, allowed)
    except Exception as exc:
        raise HTTPException(400, str(exc))

    by_id = {tx.id: tx for tx in eligible}
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
        if tx.direction == "debit":
            tx.txn_type = "investment" if category.name == "Investments" else ("expense" if tx.txn_type == "investment" else tx.txn_type)
        tx.category_source = "ai"
        tx.category_undo_available = True
        applied.append(suggestion)

    db.commit()
    return {
        "requested": len(ids),
        "eligible": len(eligible),
        "applied": len(applied),
        "items": applied,
        "provider_user_id": provider_user_id,
    }

@router.patch("/api/transactions/{tx_id}")
def update_transaction(
    tx_id: int,
    body: TransactionUpdate,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    tx = db.get(Transaction, tx_id)
    if not tx or tx.user_id != user_id:
        raise HTTPException(404, "Transaction not found")

    values = body.model_dump(exclude_unset=True)
    if "account_id" in values:
        account_id = values.pop("account_id")
        if account_id is not None:
            account = db.get(Account, account_id)
            if not account or account.user_id != user_id:
                raise HTTPException(400, "Account not found")
            tx.account_id = account.id
    category_name = None
    category_was_updated = "category" in values
    if category_was_updated:
        category_name = values.pop("category")
        tx.category_id = _category(db, user_id, category_name).id if category_name else None
        tx.category_source = "manual" if category_name else None
        tx.category_previous_id = None
        tx.category_undo_available = False
    if "description" in values:
        tx.description_raw = values.pop("description")
    if "excluded" in values:
        tx.excluded_from_analytics = values.pop("excluded")
    for key, value in values.items():
        setattr(tx, key, value)

    is_investment = (
        category_name == "Investments"
        if category_was_updated
        else bool(tx.category and tx.category.name == "Investments")
    )
    tx.txn_type = (
        "internal_transfer" if tx.txn_type == "internal_transfer"
        else "income" if tx.direction == "credit"
        else "investment" if is_investment
        else "expense"
    )
    tx.fingerprint = fingerprint(
        tx.account_id or 0,
        tx.txn_at,
        tx.amount,
        tx.direction,
        tx.description_raw or tx.merchant or "",
    )
    tx.verification_status = "manual"
    db.commit()
    db.refresh(tx)
    return {"ok": True, "transaction_id": tx.id}

@router.delete("/api/transactions/{tx_id}")
def delete_transaction(
    tx_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    tx = db.get(Transaction, tx_id)
    if not tx or tx.user_id != user_id:
        raise HTTPException(404, "Transaction not found")
    db.delete(tx)
    db.commit()
    return {"ok": True}

@router.patch("/api/transactions/{tx_id}/category")
def set_transaction_category(
    tx_id: int,
    body: TransactionCategoryUpdate,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    tx = db.get(Transaction, tx_id)
    if not tx or tx.user_id != user_id:
        raise HTTPException(404, "Transaction not found")
    requested = body.category.strip()
    if requested.lower() == "uncategorized":
        tx.category_id = None
        if tx.direction == "debit" and tx.txn_type == "investment":
            tx.txn_type = "expense"
        category_name = "Uncategorized"
    else:
        category = _category(db, user_id, requested)
        tx.category_id = category.id
        if tx.direction == "debit":
            tx.txn_type = "investment" if category.name == "Investments" else ("expense" if tx.txn_type == "investment" else tx.txn_type)
        category_name = category.name
    tx.category_previous_id = None
    tx.category_source = "manual"
    tx.category_undo_available = False
    db.commit()
    return {
        "ok": True,
        "transaction_id": tx.id,
        "category": category_name,
        "category_source": "manual",
        "can_undo_category": False,
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

    previous = db.get(Category, tx.category_previous_id) if tx.category_previous_id else None
    tx.category_id = tx.category_previous_id
    if tx.direction == "debit":
        tx.txn_type = "investment" if previous and previous.name == "Investments" else ("expense" if tx.txn_type == "investment" else tx.txn_type)
    tx.category_previous_id = None
    tx.category_source = None
    tx.category_undo_available = False
    db.commit()
    return {"ok": True, "transaction_id": tx.id}

def _serialize_debt(debt: Debt, payments: list[DebtPayment] | None = None):
    return {
        "id": debt.id,
        "user_id": debt.user_id,
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
def list_debts(
    request: Request,
    family_scope: str = "self",
    family_user_id: int | None = None,
    db: Session = Depends(get_db),
):
    viewer_user_id = current_user_id(request)
    user_ids = scoped_family_user_ids(
        db,
        viewer_user_id,
        family_scope,
        family_user_id,
        "debts",
    )
    debts = db.scalars(
        select(Debt)
        .where(Debt.user_id.in_(user_ids))
        .order_by(Debt.status.asc(), Debt.created_at.desc())
    ).all()
    payments = db.scalars(
        select(DebtPayment)
        .where(DebtPayment.user_id.in_(user_ids))
        .order_by(DebtPayment.paid_at.desc())
    ).all()
    by_debt: dict[int, list[DebtPayment]] = {}
    for payment in payments:
        by_debt.setdefault(payment.debt_id, []).append(payment)
    total_outstanding = sum(
        (d.outstanding_balance for d in debts if d.status == "active"),
        Decimal("0"),
    )
    loan_outstanding = sum(
        (d.outstanding_balance for d in debts if d.status == "active" and d.debt_type != "credit_card"),
        Decimal("0"),
    )
    credit_card_outstanding = sum(
        (d.outstanding_balance for d in debts if d.status == "active" and d.debt_type == "credit_card"),
        Decimal("0"),
    )
    monthly_loan_emi = sum(
        (d.emi_amount or Decimal("0") for d in debts if d.status == "active" and d.debt_type != "credit_card"),
        Decimal("0"),
    )
    monthly_card_minimum_due = sum(
        (d.emi_amount or Decimal("0") for d in debts if d.status == "active" and d.debt_type == "credit_card"),
        Decimal("0"),
    )
    monthly_emi = monthly_loan_emi + monthly_card_minimum_due
    return {
        "items": [_serialize_debt(d, by_debt.get(d.id, [])) for d in debts],
        "total_outstanding": float(total_outstanding),
        "loan_outstanding": float(loan_outstanding),
        "credit_card_outstanding": float(credit_card_outstanding),
        "monthly_emi": float(monthly_emi),
        "monthly_loan_emi": float(monthly_loan_emi),
        "monthly_card_minimum_due": float(monthly_card_minimum_due),
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

@router.delete("/api/debts/{debt_id}")
def delete_debt(
    debt_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    debt = db.get(Debt, debt_id)
    if not debt or debt.user_id != user_id:
        raise HTTPException(404, "Debt not found")
    db.delete(debt)
    db.commit()
    return {"ok": True}

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
