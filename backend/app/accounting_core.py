from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .models import (
    Account,
    AvailableBalance,
    BalanceSnapshot,
    DebtPayment,
    MonthlyClose,
    ReconciliationItem,
    Transaction,
    TransactionSource,
)
from .schemas import MonthEndBalanceUpdate, MonthlyCloseCreate, ReconciliationResolve
from .services.dedupe import fingerprint
from .users import current_user_id

router = APIRouter()
INDIA_TZ = timezone(timedelta(hours=5, minutes=30))


def _balance_deltas(items):
    bank_delta = Decimal("0")
    cash_delta = Decimal("0")
    for tx in items:
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
    return bank_delta, cash_delta


def _balance_at(db: Session, user_id: int, at: datetime):
    snapshot = db.scalar(
        select(BalanceSnapshot)
        .where(
            BalanceSnapshot.user_id == user_id,
            BalanceSnapshot.as_of <= at,
        )
        .order_by(BalanceSnapshot.as_of.desc(), BalanceSnapshot.id.desc())
        .limit(1)
    )

    if snapshot:
        bank = Decimal(snapshot.bank_balance)
        cash = Decimal(snapshot.cash_balance)
        baseline_at = snapshot.as_of
    else:
        current = db.scalar(
            select(AvailableBalance).where(AvailableBalance.user_id == user_id)
        )
        if not current or current.as_of > at:
            return None
        bank = Decimal(current.bank_balance)
        cash = Decimal(current.cash_balance)
        baseline_at = current.as_of

    rows = db.scalars(
        select(Transaction).where(
            Transaction.user_id == user_id,
            Transaction.excluded_from_analytics == False,
            Transaction.txn_at > baseline_at,
            Transaction.txn_at <= at,
        )
    ).all()
    bank_delta, cash_delta = _balance_deltas(rows)
    bank += bank_delta
    cash += cash_delta
    return {
        "bank_balance": bank,
        "cash_balance": cash,
        "total": bank + cash,
        "baseline_at": baseline_at,
    }


def _month_bounds(month_key: str):
    year, month = (int(part) for part in month_key.split("-"))
    start_date = date(year, month, 1)
    next_date = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    start = datetime.combine(start_date, time.min, tzinfo=INDIA_TZ).astimezone(timezone.utc)
    end = datetime.combine(next_date, time.min, tzinfo=INDIA_TZ).astimezone(timezone.utc)
    return start_date, next_date, start, end


def _serialize_close(row: MonthlyClose):
    return {
        "id": row.id,
        "month_key": row.month_key,
        "opening_balance": float(row.opening_balance) if row.opening_balance is not None else None,
        "closing_bank_balance": float(row.closing_bank_balance),
        "closing_cash_balance": float(row.closing_cash_balance),
        "closing_balance": float(row.closing_balance),
        "income": float(row.income),
        "liquid_spending": float(row.liquid_spending),
        "credit_card_spending": float(row.credit_card_spending),
        "investments": float(row.investments),
        "debt_payments": float(row.debt_payments),
        "savings": float(row.savings),
        "closed_at": row.closed_at.isoformat() if row.closed_at else None,
    }


@router.get("/api/balance/history")
def balance_history(request: Request, limit: int = 30, db: Session = Depends(get_db)):
    user_id = current_user_id(request)
    limit = max(1, min(limit, 100))
    rows = db.scalars(
        select(BalanceSnapshot)
        .where(BalanceSnapshot.user_id == user_id)
        .order_by(BalanceSnapshot.as_of.desc(), BalanceSnapshot.id.desc())
        .limit(limit)
    ).all()
    return {
        "items": [
            {
                "id": row.id,
                "bank_balance": float(row.bank_balance),
                "cash_balance": float(row.cash_balance),
                "total": float(row.bank_balance + row.cash_balance),
                "as_of": row.as_of.isoformat(),
                "source": row.source,
            }
            for row in rows
        ]
    }


@router.get("/api/monthly-closes")
def monthly_closes(request: Request, db: Session = Depends(get_db)):
    user_id = current_user_id(request)
    rows = db.scalars(
        select(MonthlyClose)
        .where(MonthlyClose.user_id == user_id)
        .order_by(MonthlyClose.month_key.desc())
    ).all()
    return {"items": [_serialize_close(row) for row in rows]}


def _month_end_at(month_key: str):
    _, _, _, end = _month_bounds(month_key)
    return end - timedelta(microseconds=1)


def _month_end_snapshot(db: Session, user_id: int, month_key: str):
    at = _month_end_at(month_key)
    return db.scalar(
        select(BalanceSnapshot)
        .where(
            BalanceSnapshot.user_id == user_id,
            BalanceSnapshot.source == "month_end",
            BalanceSnapshot.as_of == at,
        )
        .order_by(BalanceSnapshot.id.desc())
        .limit(1)
    )


def _month_close_values(db: Session, user_id: int, month_key: str):
    start_date, _, start, end = _month_bounds(month_key)
    closing = _balance_at(db, user_id, end - timedelta(microseconds=1))

    prev_date = start_date - timedelta(days=1)
    prev_key = f"{prev_date.year:04d}-{prev_date.month:02d}"
    previous_close = db.scalar(
        select(MonthlyClose).where(
            MonthlyClose.user_id == user_id,
            MonthlyClose.month_key == prev_key,
        )
    )
    opening = Decimal(previous_close.closing_balance) if previous_close else None
    if opening is None:
        opening_state = _balance_at(db, user_id, start - timedelta(microseconds=1))
        opening = opening_state["total"] if opening_state else None

    txs = db.scalars(
        select(Transaction).where(
            Transaction.user_id == user_id,
            Transaction.excluded_from_analytics == False,
            Transaction.txn_at >= start,
            Transaction.txn_at < end,
        )
    ).all()

    income = sum(
        (
            tx.amount
            for tx in txs
            if tx.direction == "credit" and tx.txn_type != "internal_transfer"
        ),
        Decimal("0"),
    )
    spending = [
        tx
        for tx in txs
        if tx.direction == "debit"
        and tx.txn_type
        not in ("internal_transfer", "investment", "credit_card_payment")
    ]
    card_spending = sum(
        (
            tx.amount
            for tx in spending
            if tx.txn_type == "credit_card_purchase"
            or tx.payment_method == "credit_card"
        ),
        Decimal("0"),
    )
    total_spending = sum((tx.amount for tx in spending), Decimal("0"))
    liquid_spending = total_spending - card_spending
    investments = sum(
        (tx.amount for tx in txs if tx.direction == "debit" and tx.txn_type == "investment"),
        Decimal("0"),
    )
    debt_payments = sum(
        db.scalars(
            select(DebtPayment.amount).where(
                DebtPayment.user_id == user_id,
                DebtPayment.paid_at >= start,
                DebtPayment.paid_at < end,
            )
        ).all(),
        Decimal("0"),
    )
    savings = income - total_spending - investments

    review_transactions = [
        tx for tx in txs
        if tx.verification_status not in ("verified", "manual")
    ]
    reconciliation_review = db.scalars(
        select(ReconciliationItem).where(
            ReconciliationItem.user_id == user_id,
            ReconciliationItem.status == "needs_review",
            ReconciliationItem.txn_at >= start,
            ReconciliationItem.txn_at < end,
        )
    ).all()

    return {
        "opening_balance": opening,
        "closing": closing,
        "income": income,
        "liquid_spending": liquid_spending,
        "credit_card_spending": card_spending,
        "investments": investments,
        "debt_payments": debt_payments,
        "savings": savings,
        "review_transactions": len(review_transactions),
        "reconciliation_review": len(reconciliation_review),
    }


@router.get("/api/monthly-closes/{month_key}/prepare")
def prepare_monthly_close(
    month_key: str,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    try:
        _month_bounds(month_key)
    except Exception:
        raise HTTPException(400, "Month must use YYYY-MM format")

    existing = db.scalar(
        select(MonthlyClose).where(
            MonthlyClose.user_id == user_id,
            MonthlyClose.month_key == month_key,
        )
    )
    month_end = _month_end_snapshot(db, user_id, month_key)
    values = _month_close_values(db, user_id, month_key)
    closing = values["closing"]

    return {
        "month_key": month_key,
        "already_closed": bool(existing),
        "close": _serialize_close(existing) if existing else None,
        "month_end_balance_confirmed": bool(month_end),
        "month_end_balance": (
            {
                "bank_balance": float(month_end.bank_balance),
                "cash_balance": float(month_end.cash_balance),
                "total": float(month_end.bank_balance + month_end.cash_balance),
                "as_of": month_end.as_of.isoformat(),
            }
            if month_end
            else (
                {
                    "bank_balance": float(closing["bank_balance"]),
                    "cash_balance": float(closing["cash_balance"]),
                    "total": float(closing["total"]),
                    "as_of": _month_end_at(month_key).isoformat(),
                }
                if closing
                else None
            )
        ),
        "review_transactions": values["review_transactions"],
        "reconciliation_review": values["reconciliation_review"],
        "summary": {
            "opening_balance": float(values["opening_balance"]) if values["opening_balance"] is not None else None,
            "income": float(values["income"]),
            "liquid_spending": float(values["liquid_spending"]),
            "credit_card_spending": float(values["credit_card_spending"]),
            "investments": float(values["investments"]),
            "debt_payments": float(values["debt_payments"]),
            "savings": float(values["savings"]),
            "closing_balance": float(closing["total"]) if closing else None,
        },
    }


@router.put("/api/monthly-closes/{month_key}/balance")
def save_month_end_balance(
    month_key: str,
    body: MonthEndBalanceUpdate,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    existing_close = db.scalar(
        select(MonthlyClose).where(
            MonthlyClose.user_id == user_id,
            MonthlyClose.month_key == month_key,
        )
    )
    if existing_close:
        raise HTTPException(400, "This month is already closed")

    try:
        at = _month_end_at(month_key)
    except Exception:
        raise HTTPException(400, "Month must use YYYY-MM format")

    snapshot = _month_end_snapshot(db, user_id, month_key)
    if snapshot:
        snapshot.bank_balance = body.bank_balance
        snapshot.cash_balance = body.cash_balance
    else:
        snapshot = BalanceSnapshot(
            user_id=user_id,
            bank_balance=body.bank_balance,
            cash_balance=body.cash_balance,
            as_of=at,
            source="month_end",
        )
        db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    return {
        "month_key": month_key,
        "bank_balance": float(snapshot.bank_balance),
        "cash_balance": float(snapshot.cash_balance),
        "total": float(snapshot.bank_balance + snapshot.cash_balance),
        "as_of": snapshot.as_of.isoformat(),
    }


@router.post("/api/monthly-closes")
def create_monthly_close(
    body: MonthlyCloseCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    existing = db.scalar(
        select(MonthlyClose).where(
            MonthlyClose.user_id == user_id,
            MonthlyClose.month_key == body.month_key,
        )
    )
    if existing:
        return {"already_closed": True, "close": _serialize_close(existing)}

    month_end = _month_end_snapshot(db, user_id, body.month_key)
    if not month_end:
        raise HTTPException(
            400,
            "Enter and confirm the month-end bank and cash balances before closing the month.",
        )

    values = _month_close_values(db, user_id, body.month_key)
    closing = values["closing"]
    if not closing:
        raise HTTPException(
            400,
            "No balance baseline exists for this month. Enter the month-end bank and cash balances first.",
        )

    row = MonthlyClose(
        user_id=user_id,
        month_key=body.month_key,
        opening_balance=values["opening_balance"],
        closing_bank_balance=closing["bank_balance"],
        closing_cash_balance=closing["cash_balance"],
        closing_balance=closing["total"],
        income=values["income"],
        liquid_spending=values["liquid_spending"],
        credit_card_spending=values["credit_card_spending"],
        investments=values["investments"],
        debt_payments=values["debt_payments"],
        savings=values["savings"],
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"already_closed": False, "close": _serialize_close(row)}


def _serialize_reconciliation(row: ReconciliationItem, db: Session):
    candidate = db.get(Transaction, row.candidate_transaction_id) if row.candidate_transaction_id else None
    return {
        "id": row.id,
        "account_id": row.account_id,
        "txn_at": row.txn_at.isoformat(),
        "amount": float(row.amount),
        "direction": row.direction,
        "description": row.description_raw,
        "bank_ref": row.bank_ref,
        "source_name": row.source_name,
        "match_method": row.match_method,
        "match_score": float(row.match_score) if row.match_score is not None else None,
        "status": row.status,
        "resolution": row.resolution,
        "candidate": (
            {
                "id": candidate.id,
                "txn_at": candidate.txn_at.isoformat(),
                "amount": float(candidate.amount),
                "direction": candidate.direction,
                "merchant": candidate.merchant,
                "description": candidate.description_raw,
                "verification_status": candidate.verification_status,
            }
            if candidate
            else None
        ),
    }


@router.get("/api/reconciliation")
def reconciliation_items(
    request: Request,
    status: str = "needs_review",
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    stmt = select(ReconciliationItem).where(ReconciliationItem.user_id == user_id)
    if status:
        stmt = stmt.where(ReconciliationItem.status == status)
    rows = db.scalars(
        stmt.order_by(ReconciliationItem.txn_at.desc(), ReconciliationItem.id.desc())
    ).all()
    return {"items": [_serialize_reconciliation(row, db) for row in rows]}


@router.post("/api/reconciliation/{item_id}/resolve")
def resolve_reconciliation(
    item_id: int,
    body: ReconciliationResolve,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    item = db.get(ReconciliationItem, item_id)
    if not item or item.user_id != user_id:
        raise HTTPException(404, "Reconciliation item not found")
    if item.status != "needs_review":
        return _serialize_reconciliation(item, db)

    if body.action == "merge":
        candidate = db.get(Transaction, item.candidate_transaction_id) if item.candidate_transaction_id else None
        if not candidate or candidate.user_id != user_id:
            raise HTTPException(400, "No candidate transaction is available to merge")
        duplicate_source = any(
            src.external_hash == item.external_hash and src.source_name == item.source_name
            for src in candidate.sources
        )
        if not duplicate_source:
            candidate.sources.append(
                TransactionSource(
                    source_type=item.source_type,
                    source_name=item.source_name,
                    external_hash=item.external_hash,
                )
            )
        if not candidate.bank_ref and item.bank_ref:
            candidate.bank_ref = item.bank_ref
        candidate.verification_status = "verified"

    elif body.action == "keep_both":
        fp = fingerprint(
            item.account_id,
            item.txn_at,
            item.amount,
            item.direction,
            item.description_raw,
        )
        tx = Transaction(
            user_id=user_id,
            account_id=item.account_id,
            txn_at=item.txn_at,
            amount=item.amount,
            direction=item.direction,
            txn_type="income" if item.direction == "credit" else "expense",
            description_raw=item.description_raw,
            merchant=(item.description_raw or "Statement transaction")[:160],
            bank_ref=item.bank_ref,
            fingerprint=fp,
            verification_status="verified",
        )
        tx.sources.append(
            TransactionSource(
                source_type=item.source_type,
                source_name=item.source_name,
                external_hash=item.external_hash,
            )
        )
        db.add(tx)

    item.status = "resolved"
    item.resolution = body.action
    item.resolved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return _serialize_reconciliation(item, db)
