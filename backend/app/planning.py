import calendar
import hashlib
import re
from collections import defaultdict
from statistics import median
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .models import (
    Account,
    AvailableBalance,
    Budget,
    Category,
    Commitment,
    Debt,
    InternalTransfer,
    PredictionDismissal,
    Transaction,
    TransactionSource,
)
from .schemas import BudgetUpsert, CommitmentCreate, CommitmentUpdate, InternalTransferCreate
from .services.dedupe import fingerprint
from .users import current_user_id

router = APIRouter()
INDIA_TZ = timezone(timedelta(hours=5, minutes=30))


def _category(db: Session, user_id: int, name: str):
    normalized = name.strip()
    row = db.scalar(
        select(Category).where(
            Category.user_id == user_id,
            Category.name.ilike(normalized),
        )
    )
    if row:
        return row
    row = Category(user_id=user_id, name=normalized)
    db.add(row)
    db.flush()
    return row


def _current_balance(db: Session, user_id: int):
    snapshot = db.scalar(
        select(AvailableBalance).where(AvailableBalance.user_id == user_id)
    )
    if not snapshot:
        return None
    rows = db.scalars(
        select(Transaction).where(
            Transaction.user_id == user_id,
            Transaction.excluded_from_analytics == False,
            Transaction.txn_at >= snapshot.as_of,
        )
    ).all()
    bank_delta = Decimal("0")
    cash_delta = Decimal("0")
    for tx in rows:
        if (
            tx.txn_type in ("internal_transfer", "credit_card_purchase")
            or tx.payment_method == "credit_card"
        ):
            continue
        delta = tx.amount if tx.direction == "credit" else -tx.amount
        is_cash = tx.payment_method == "cash" or (
            tx.account is not None and tx.account.type == "cash"
        )
        if is_cash:
            cash_delta += delta
        else:
            bank_delta += delta
    bank = Decimal(snapshot.bank_balance) + bank_delta
    cash = Decimal(snapshot.cash_balance) + cash_delta
    return {
        "bank_balance": bank,
        "cash_balance": cash,
        "total": bank + cash,
        "as_of": snapshot.as_of,
    }


def _transfer_status(outgoing: Transaction, incoming: Transaction):
    outgoing_reconciled = any(source.source_type != "manual" for source in outgoing.sources)
    incoming_reconciled = any(source.source_type != "manual" for source in incoming.sources)
    if outgoing_reconciled and incoming_reconciled:
        status = "reconciled"
    elif outgoing_reconciled or incoming_reconciled:
        status = "partially_reconciled"
    else:
        status = "awaiting_statements"
    return status, outgoing_reconciled, incoming_reconciled


def _serialize_transfer(db: Session, row: InternalTransfer):
    outgoing = db.get(Transaction, row.outgoing_transaction_id)
    incoming = db.get(Transaction, row.incoming_transaction_id)
    source = db.get(Account, row.from_account_id)
    destination = db.get(Account, row.to_account_id)
    if not outgoing or not incoming:
        raise HTTPException(409, "Transfer ledger pair is incomplete")
    status, outgoing_reconciled, incoming_reconciled = _transfer_status(outgoing, incoming)
    return {
        "id": row.id,
        "amount": float(row.amount),
        "transferred_at": row.transferred_at.isoformat(),
        "note": row.note,
        "from_account": {
            "id": source.id,
            "name": source.name,
            "reconciled": outgoing_reconciled,
        } if source else None,
        "to_account": {
            "id": destination.id,
            "name": destination.name,
            "reconciled": incoming_reconciled,
        } if destination else None,
        "outgoing_transaction_id": outgoing.id,
        "incoming_transaction_id": incoming.id,
        "status": status,
    }


@router.post("/api/transfers")
def create_internal_transfer(
    body: InternalTransferCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    if body.from_account_id == body.to_account_id:
        raise HTTPException(400, "Source and destination accounts must be different")

    source = db.get(Account, body.from_account_id)
    destination = db.get(Account, body.to_account_id)
    for account, label in ((source, "source"), (destination, "destination")):
        if (
            not account
            or account.user_id != user_id
            or account.type != "bank"
            or not account.is_active
        ):
            raise HTTPException(400, f"Select a valid active {label} bank account")

    amount_key = str(body.amount.quantize(Decimal("0.01")))
    raw_key = (
        f"{user_id}|{source.id}|{destination.id}|{amount_key}|"
        f"{body.txn_at.astimezone(timezone.utc).isoformat()}"
    )
    transfer_key = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
    existing = db.scalar(
        select(InternalTransfer).where(
            InternalTransfer.user_id == user_id,
            InternalTransfer.transfer_key == transfer_key,
        )
    )
    if existing:
        return _serialize_transfer(db, existing)

    category = _category(db, user_id, "Internal Transfer")
    note = (body.note or "").strip() or None
    outgoing_description = note or f"Own account transfer to {destination.name}"
    incoming_description = note or f"Own account transfer from {source.name}"

    outgoing = Transaction(
        user_id=user_id,
        account_id=source.id,
        category_id=category.id,
        category_source="manual",
        txn_at=body.txn_at,
        amount=body.amount,
        direction="debit",
        txn_type="internal_transfer",
        payment_method="internal_transfer",
        merchant=f"Transfer to {destination.name}",
        description_raw=outgoing_description,
        fingerprint=fingerprint(
            source.id,
            body.txn_at,
            body.amount,
            "debit",
            outgoing_description,
        ),
        verification_status="verified",
    )
    outgoing.sources.append(
        TransactionSource(source_type="manual", source_name="Own Account Transfer")
    )
    incoming = Transaction(
        user_id=user_id,
        account_id=destination.id,
        category_id=category.id,
        category_source="manual",
        txn_at=body.txn_at,
        amount=body.amount,
        direction="credit",
        txn_type="internal_transfer",
        payment_method="internal_transfer",
        merchant=f"Transfer from {source.name}",
        description_raw=incoming_description,
        fingerprint=fingerprint(
            destination.id,
            body.txn_at,
            body.amount,
            "credit",
            incoming_description,
        ),
        verification_status="verified",
    )
    incoming.sources.append(
        TransactionSource(source_type="manual", source_name="Own Account Transfer")
    )
    db.add_all([outgoing, incoming])
    db.flush()

    transfer = InternalTransfer(
        user_id=user_id,
        from_account_id=source.id,
        to_account_id=destination.id,
        outgoing_transaction_id=outgoing.id,
        incoming_transaction_id=incoming.id,
        amount=body.amount,
        transferred_at=body.txn_at,
        note=note,
        transfer_key=transfer_key,
    )
    db.add(transfer)
    db.commit()
    db.refresh(transfer)
    return _serialize_transfer(db, transfer)


@router.get("/api/transfers")
def list_internal_transfers(
    request: Request,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    rows = db.scalars(
        select(InternalTransfer)
        .where(InternalTransfer.user_id == user_id)
        .order_by(InternalTransfer.transferred_at.desc(), InternalTransfer.id.desc())
        .limit(max(1, min(limit, 100)))
    ).all()
    return {"items": [_serialize_transfer(db, row) for row in rows]}


def _serialize_budget(row: Budget, spent: Decimal):
    limit = Decimal(row.monthly_limit)
    remaining = limit - spent
    return {
        "id": row.id,
        "category": row.category.name,
        "monthly_limit": float(limit),
        "spent": float(spent),
        "remaining": float(max(Decimal("0"), remaining)),
        "over_by": float(max(Decimal("0"), -remaining)),
        "percent": float((spent / limit) * Decimal("100")) if limit > 0 else 0.0,
        "is_active": row.is_active,
    }


@router.get("/api/budgets")
def list_budgets(request: Request, db: Session = Depends(get_db)):
    user_id = current_user_id(request)
    now = datetime.now(INDIA_TZ)
    start = datetime(now.year, now.month, 1, tzinfo=INDIA_TZ).astimezone(timezone.utc)
    next_month = (
        datetime(now.year + 1, 1, 1, tzinfo=INDIA_TZ)
        if now.month == 12
        else datetime(now.year, now.month + 1, 1, tzinfo=INDIA_TZ)
    ).astimezone(timezone.utc)
    txs = db.scalars(
        select(Transaction).where(
            Transaction.user_id == user_id,
            Transaction.excluded_from_analytics == False,
            Transaction.txn_at >= start,
            Transaction.txn_at < next_month,
            Transaction.direction == "debit",
            Transaction.txn_type.notin_(("internal_transfer", "investment", "credit_card_payment")),
        )
    ).all()
    spent_by_category: dict[int, Decimal] = {}
    for tx in txs:
        if tx.category_id is not None:
            spent_by_category[tx.category_id] = (
                spent_by_category.get(tx.category_id, Decimal("0")) + tx.amount
            )
    rows = db.scalars(
        select(Budget)
        .where(Budget.user_id == user_id)
        .order_by(Budget.is_active.desc(), Budget.id.asc())
    ).all()
    return {
        "month": now.strftime("%B %Y"),
        "items": [
            _serialize_budget(row, spent_by_category.get(row.category_id, Decimal("0")))
            for row in rows
        ],
    }


@router.put("/api/budgets")
def upsert_budget(
    body: BudgetUpsert,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    category = _category(db, user_id, body.category)
    row = db.scalar(
        select(Budget).where(
            Budget.user_id == user_id,
            Budget.category_id == category.id,
        )
    )
    if row:
        row.monthly_limit = body.monthly_limit
        row.is_active = body.is_active
    else:
        row = Budget(
            user_id=user_id,
            category_id=category.id,
            monthly_limit=body.monthly_limit,
            is_active=body.is_active,
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "category": category.name,
        "monthly_limit": float(row.monthly_limit),
        "is_active": row.is_active,
    }


@router.delete("/api/budgets/{budget_id}")
def delete_budget(
    budget_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    row = db.get(Budget, budget_id)
    if not row or row.user_id != user_id:
        raise HTTPException(404, "Budget not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


def _add_month(value: datetime):
    year = value.year + (1 if value.month == 12 else 0)
    month = 1 if value.month == 12 else value.month + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def _effective_due(value: datetime, recurrence: str, now: datetime):
    due = value
    if due.tzinfo is None:
        due = due.replace(tzinfo=timezone.utc)
    return due


def _serialize_commitment(row: Commitment, now: datetime):
    due = _effective_due(row.next_due_date, row.recurrence, now)
    return {
        "id": row.id,
        "title": row.title,
        "amount": float(row.amount),
        "next_due_date": due.isoformat(),
        "stored_due_date": row.next_due_date.isoformat(),
        "recurrence": row.recurrence,
        "category": row.category.name if row.category else None,
        "is_active": row.is_active,
        "notes": row.notes,
        "source": "manual",
        "overdue": due < now,
    }


@router.get("/api/commitments")
def list_commitments(request: Request, db: Session = Depends(get_db)):
    user_id = current_user_id(request)
    now = datetime.now(timezone.utc)
    rows = db.scalars(
        select(Commitment)
        .where(Commitment.user_id == user_id)
        .order_by(Commitment.is_active.desc(), Commitment.next_due_date.asc())
    ).all()
    return {"items": [_serialize_commitment(row, now) for row in rows]}


@router.post("/api/commitments")
def create_commitment(
    body: CommitmentCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    category = _category(db, user_id, body.category) if body.category else None
    row = Commitment(
        user_id=user_id,
        title=body.title.strip(),
        amount=body.amount,
        next_due_date=body.next_due_date,
        recurrence=body.recurrence,
        category_id=category.id if category else None,
        is_active=body.is_active,
        notes=(body.notes or "").strip() or None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _serialize_commitment(row, datetime.now(timezone.utc))


@router.patch("/api/commitments/{commitment_id}")
def update_commitment(
    commitment_id: int,
    body: CommitmentUpdate,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    row = db.get(Commitment, commitment_id)
    if not row or row.user_id != user_id:
        raise HTTPException(404, "Commitment not found")
    values = body.model_dump(exclude_unset=True)
    if "category" in values:
        category_name = values.pop("category")
        category = _category(db, user_id, category_name) if category_name else None
        row.category_id = category.id if category else None
    for key, value in values.items():
        if key in ("title", "notes") and isinstance(value, str):
            value = value.strip() or None
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return _serialize_commitment(row, datetime.now(timezone.utc))


@router.post("/api/commitments/{commitment_id}/complete")
def complete_commitment(
    commitment_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    row = db.get(Commitment, commitment_id)
    if not row or row.user_id != user_id:
        raise HTTPException(404, "Commitment not found")
    if row.recurrence == "monthly":
        row.next_due_date = _add_month(row.next_due_date)
    else:
        row.is_active = False
    db.commit()
    db.refresh(row)
    return _serialize_commitment(row, datetime.now(timezone.utc))


@router.delete("/api/commitments/{commitment_id}")
def delete_commitment(
    commitment_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    row = db.get(Commitment, commitment_id)
    if not row or row.user_id != user_id:
        raise HTTPException(404, "Commitment not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


def _prediction_key(value: str):
    return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()


def _prediction_label(tx: Transaction):
    raw = (tx.merchant or tx.description_raw or "").strip()
    if not raw:
        return "Recurring payment"
    cleaned = re.sub(r"\s+", " ", raw)
    return cleaned[:80]


def _add_months(value: datetime, months: int = 1):
    year = value.year + ((value.month - 1 + months) // 12)
    month = ((value.month - 1 + months) % 12) + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def _predicted_recurring_commitments(db: Session, user_id: int, now: datetime, horizon: datetime):
    history_start = now - timedelta(days=190)
    txs = db.scalars(
        select(Transaction).where(
            Transaction.user_id == user_id,
            Transaction.excluded_from_analytics == False,
            Transaction.direction == "debit",
            Transaction.txn_at >= history_start,
            Transaction.txn_type.notin_(("internal_transfer", "investment", "credit_card_payment")),
        ).order_by(Transaction.txn_at.asc())
    ).all()

    groups: dict[str, list[Transaction]] = defaultdict(list)
    for tx in txs:
        label = _prediction_label(tx)
        key = _prediction_key(label)
        if len(key) < 3:
            continue
        groups[key].append(tx)

    predicted = []
    for key, rows in groups.items():
        if len(rows) < 2:
            continue
        rows.sort(key=lambda tx: tx.txn_at)
        dates = [tx.txn_at if tx.txn_at.tzinfo else tx.txn_at.replace(tzinfo=timezone.utc) for tx in rows]
        amounts = [Decimal(tx.amount) for tx in rows]
        intervals = [(dates[i] - dates[i - 1]).days for i in range(1, len(dates))]
        if not intervals:
            continue

        typical_interval = median(intervals)
        if not 25 <= typical_interval <= 35:
            continue

        typical_amount = Decimal(str(median([float(v) for v in amounts])))
        if typical_amount <= 0:
            continue
        amount_deviation = max((abs(v - typical_amount) / typical_amount for v in amounts), default=Decimal("0"))
        if amount_deviation > Decimal("0.20"):
            continue

        last = dates[-1]
        next_due = _add_months(last)
        while next_due < now - timedelta(days=3):
            next_due = _add_months(next_due)
        if next_due > horizon:
            continue

        interval_score = max(0.0, 1.0 - abs(float(typical_interval) - 30.0) / 10.0)
        amount_score = max(0.0, 1.0 - float(amount_deviation))
        history_score = min(1.0, len(rows) / 4.0)
        confidence = round((interval_score * 0.4 + amount_score * 0.35 + history_score * 0.25), 2)
        if confidence < 0.75:
            continue

        last_row = rows[-1]
        predicted.append({
            "id": f"predicted:{hashlib.sha1(key.encode('utf-8')).hexdigest()[:12]}",
            "prediction_key": key,
            "title": _prediction_label(last_row),
            "amount": float(typical_amount.quantize(Decimal("0.01"))),
            "next_due_date": next_due.isoformat(),
            "recurrence": "monthly",
            "category": last_row.category.name if last_row.category else None,
            "is_active": True,
            "notes": f"Predicted from {len(rows)} similar payments",
            "source": "ai_predicted" if confidence < 0.90 else "recurring",
            "confidence": confidence,
            "history_count": len(rows),
            "overdue": next_due < now,
        })
    return predicted


def _same_commitment(a: dict, b: dict):
    title_a = _prediction_key(a.get("title", ""))
    title_b = _prediction_key(b.get("title", ""))
    if title_a and title_b and (title_a in title_b or title_b in title_a):
        amount_a = Decimal(str(a.get("amount", 0)))
        amount_b = Decimal(str(b.get("amount", 0)))
        base = max(amount_a, amount_b, Decimal("1"))
        return abs(amount_a - amount_b) / base <= Decimal("0.20")
    return False


@router.delete("/api/predictions/{prediction_id}")
def dismiss_prediction(
    prediction_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    now = datetime.now(timezone.utc)
    candidates = _predicted_recurring_commitments(db, user_id, now, now + timedelta(days=370))
    candidate = next((item for item in candidates if str(item["id"]) == prediction_id), None)
    if not candidate:
        raise HTTPException(404, "Prediction not found")
    existing = db.scalar(
        select(PredictionDismissal).where(
            PredictionDismissal.user_id == user_id,
            PredictionDismissal.prediction_key == candidate["prediction_key"],
        )
    )
    if not existing:
        db.add(PredictionDismissal(
            user_id=user_id,
            prediction_key=candidate["prediction_key"],
            title=candidate["title"],
        ))
        db.commit()
    return {"ok": True}


@router.get("/api/planning-summary")
def planning_summary(
    request: Request,
    db: Session = Depends(get_db),
    months: int = 1,
):
    user_id = current_user_id(request)
    months = max(1, min(months, 12))
    now = datetime.now(timezone.utc)
    horizon = _add_months(now, months)

    manual_rows = db.scalars(
        select(Commitment).where(
            Commitment.user_id == user_id,
            Commitment.is_active == True,
        )
    ).all()
    upcoming = []
    for row in manual_rows:
        item = _serialize_commitment(row, now)
        due = datetime.fromisoformat(item["next_due_date"])
        if due <= horizon:
            upcoming.append(item)

    debt_rows = db.scalars(
        select(Debt).where(
            Debt.user_id == user_id,
            Debt.status == "active",
            Debt.emi_amount.is_not(None),
            Debt.emi_amount > 0,
            Debt.next_due_date.is_not(None),
        )
    ).all()
    for debt in debt_rows:
        due = debt.next_due_date
        if due.tzinfo is None:
            due = due.replace(tzinfo=timezone.utc)
        if due <= horizon:
            upcoming.append({
                "id": f"debt:{debt.id}",
                "title": debt.lender,
                "amount": float(debt.emi_amount),
                "next_due_date": due.isoformat(),
                "recurrence": "debt",
                "category": "EMI & Loans",
                "is_active": True,
                "notes": None,
                "source": "credit_card" if debt.debt_type == "credit_card" else "loan",
                "overdue": due < now,
            })

    dismissed = set(db.scalars(
        select(PredictionDismissal.prediction_key).where(
            PredictionDismissal.user_id == user_id
        )
    ).all())
    predicted = _predicted_recurring_commitments(db, user_id, now, horizon)
    for candidate in predicted:
        if candidate["prediction_key"] in dismissed:
            continue
        if not any(_same_commitment(candidate, existing) for existing in upcoming):
            upcoming.append(candidate)

    # Expand recurring manual/debt/predicted commitments across the selected planning horizon.
    expanded = []
    for item in upcoming:
        due = datetime.fromisoformat(item["next_due_date"])
        expanded.append(item)
        if item.get("recurrence") in ("monthly", "debt") or item.get("source") in ("loan", "credit_card", "recurring", "ai_predicted"):
            next_due = _add_months(due)
            occurrence = 2
            while next_due <= horizon:
                clone = dict(item)
                clone["id"] = f'{item["id"]}:m{occurrence}'
                clone["next_due_date"] = next_due.isoformat()
                clone["overdue"] = False
                clone["future_occurrence"] = True
                expanded.append(clone)
                next_due = _add_months(next_due)
                occurrence += 1
    upcoming = expanded
    upcoming.sort(key=lambda item: item["next_due_date"])
    committed = sum((Decimal(str(item["amount"])) for item in upcoming), Decimal("0"))
    balance = _current_balance(db, user_id)
    available = balance["total"] if balance else Decimal("0")
    safe = max(Decimal("0"), available - committed)

    budgets = list_budgets(request, db)
    active_budgets = [item for item in budgets["items"] if item["is_active"]]
    budget_limit = sum((Decimal(str(item["monthly_limit"])) for item in active_budgets), Decimal("0"))
    budget_spent = sum((Decimal(str(item["spent"])) for item in active_budgets), Decimal("0"))

    return {
        "balance_configured": bool(balance),
        "available_balance": float(available),
        "planning_months": months,
        "planning_until": horizon.isoformat(),
        "committed_in_horizon": float(committed),
        "committed_next_30_days": float(committed) if months == 1 else float(sum((Decimal(str(item["amount"])) for item in upcoming if datetime.fromisoformat(item["next_due_date"]) <= now + timedelta(days=30)), Decimal("0"))),
        "safe_to_spend": float(safe),
        "upcoming": upcoming,
        "budget_month": budgets["month"],
        "budget_limit": float(budget_limit),
        "budget_spent": float(budget_spent),
        "budgets": active_budgets,
    }
