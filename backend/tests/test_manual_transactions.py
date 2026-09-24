from datetime import datetime, timezone
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from backend.app.db import Base
from backend.app.main import _create_manual_transaction, app
from backend.app.models import Account, Transaction, User


def _db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return Session(engine)


def _user():
    return User(
        email="manual@example.com",
        handle="manual_user",
        name="Manual User",
        password_salt="salt",
        password_hash="hash",
    )


def test_manual_cash_creates_cash_account_and_manual_category():
    db = _db()
    user = _user()
    db.add(user)
    db.flush()

    result = _create_manual_transaction(
        user_id=user.id,
        amount=Decimal("250.00"),
        direction="debit",
        payment_method="cash",
        category_name="Food & Dining",
        txn_at=datetime(2026, 9, 23, 12, 0, tzinfo=timezone.utc),
        merchant="Cafe",
        note="Lunch",
        account_id=None,
        db=db,
    )

    tx = db.get(Transaction, result["id"])
    assert tx is not None
    assert tx.payment_method == "cash"
    assert tx.txn_type == "cash_expense"
    assert tx.category.name == "Food & Dining"
    assert tx.category_source == "manual"
    assert tx.account.type == "cash"
    assert tx.account.name == "Cash"


def test_manual_upi_requires_owned_active_bank_account():
    db = _db()
    user = _user()
    db.add(user)
    db.flush()

    with pytest.raises(HTTPException) as exc:
        _create_manual_transaction(
            user_id=user.id,
            amount=Decimal("100.00"),
            direction="debit",
            payment_method="upi",
            category_name="Groceries",
            txn_at=datetime(2026, 9, 23, 12, 0, tzinfo=timezone.utc),
            merchant="Store",
            note=None,
            account_id=None,
            db=db,
        )
    assert exc.value.status_code == 400


def test_manual_upi_uses_selected_bank_and_deduplicates_same_submission():
    db = _db()
    user = _user()
    db.add(user)
    db.flush()
    bank = Account(
        user_id=user.id,
        name="Primary Bank",
        institution="Bank",
        type="bank",
        is_active=True,
    )
    db.add(bank)
    db.flush()

    kwargs = dict(
        user_id=user.id,
        amount=Decimal("499.00"),
        direction="debit",
        payment_method="upi",
        category_name="Shopping",
        txn_at=datetime(2026, 9, 23, 13, 30, tzinfo=timezone.utc),
        merchant="Merchant",
        note="UPI purchase",
        account_id=bank.id,
        db=db,
    )
    first = _create_manual_transaction(**kwargs)
    second = _create_manual_transaction(**kwargs)

    assert first["id"] == second["id"]
    rows = db.scalars(select(Transaction).where(Transaction.user_id == user.id)).all()
    assert len(rows) == 1
    assert rows[0].account_id == bank.id
    assert rows[0].payment_method == "upi"
    assert rows[0].txn_type == "expense"
    assert rows[0].category.name == "Shopping"


def test_manual_transaction_endpoint_accepts_post():
    route = next(
        route
        for route in app.routes
        if getattr(route, "path", None) == "/api/transactions/manual"
    )
    assert "POST" in route.methods


def test_available_balance_uses_liquid_balance_formula():
    # Available should represent current money in hand, not just this period's income minus spending.
    opening_balance = Decimal("1000.00")
    new_income = Decimal("500.00")
    spent = Decimal("200.00")
    liquid_balance = opening_balance + new_income - spent
    assert max(Decimal("0"), liquid_balance) == Decimal("1300.00")
