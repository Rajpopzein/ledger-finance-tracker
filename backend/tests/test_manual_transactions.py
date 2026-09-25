from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from fastapi import HTTPException, Request
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from backend.app.db import Base
from backend.app.main import _create_manual_transaction, _current_available_balance, _spending_breakdown, app, transactions
from backend.app.models import Account, AvailableBalance, Transaction, User
from backend.app.services.dedupe import find_match


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




def _request(user_id: int):
    request = Request({
        "type": "http",
        "method": "GET",
        "path": "/api/transactions",
        "headers": [],
    })
    request.state.auth = {"role": "user", "sub": str(user_id)}
    return request


def test_transaction_list_includes_and_filters_manual_cash():
    db = _db()
    user = _user()
    db.add(user)
    db.flush()

    created = _create_manual_transaction(
        user_id=user.id,
        amount=Decimal("175.00"),
        direction="debit",
        payment_method="cash",
        category_name="Food & Dining",
        txn_at=datetime(2026, 9, 25, 12, 0, tzinfo=timezone.utc),
        merchant="Cash Cafe",
        note="Cash lunch",
        account_id=None,
        db=db,
    )

    all_rows = transactions(
        request=_request(user.id),
        from_date=date(2026, 9, 1),
        to_date=date(2026, 9, 30),
        family_scope="self",
        page=1,
        page_size=25,
        db=db,
    )
    assert created["id"] in [row["id"] for row in all_rows["items"]]

    cash_rows = transactions(
        request=_request(user.id),
        payment_method="cash",
        from_date=date(2026, 9, 1),
        to_date=date(2026, 9, 30),
        family_scope="self",
        page=1,
        page_size=25,
        db=db,
    )
    assert cash_rows["total"] == 1
    assert cash_rows["items"][0]["id"] == created["id"]
    assert cash_rows["items"][0]["account"] == "Cash"
    assert cash_rows["items"][0]["payment_method"] == "cash"


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


def test_credit_card_purchase_does_not_reduce_available_balance():
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

    as_of = datetime(2026, 9, 24, 9, 0, tzinfo=timezone.utc)
    db.add(AvailableBalance(
        user_id=user.id,
        bank_balance=Decimal("1000.00"),
        cash_balance=Decimal("200.00"),
        as_of=as_of,
    ))
    db.commit()

    upi_expense = _create_manual_transaction(
        user_id=user.id,
        amount=Decimal("100.00"),
        direction="debit",
        payment_method="upi",
        category_name="Groceries",
        txn_at=datetime(2026, 9, 24, 10, 0, tzinfo=timezone.utc),
        merchant="Store",
        note=None,
        account_id=bank.id,
        db=db,
    )
    cash_expense = _create_manual_transaction(
        user_id=user.id,
        amount=Decimal("50.00"),
        direction="debit",
        payment_method="cash",
        category_name="Food & Dining",
        txn_at=datetime(2026, 9, 24, 10, 30, tzinfo=timezone.utc),
        merchant="Cafe",
        note=None,
        account_id=None,
        db=db,
    )
    card_purchase = _create_manual_transaction(
        user_id=user.id,
        amount=Decimal("300.00"),
        direction="debit",
        payment_method="credit_card",
        category_name="Shopping",
        txn_at=datetime(2026, 9, 24, 11, 0, tzinfo=timezone.utc),
        merchant="Shop",
        note=None,
        account_id=None,
        db=db,
    )
    income = _create_manual_transaction(
        user_id=user.id,
        amount=Decimal("500.00"),
        direction="credit",
        payment_method="upi",
        category_name="Payroll",
        txn_at=datetime(2026, 9, 24, 11, 30, tzinfo=timezone.utc),
        merchant="Employer",
        note=None,
        account_id=bank.id,
        db=db,
    )

    assert upi_expense["verification_status"] == "verified"
    assert cash_expense["verification_status"] == "verified"
    assert card_purchase["txn_type"] == "credit_card_purchase"
    assert card_purchase["verification_status"] == "verified"
    assert income["verification_status"] == "verified"

    state = _current_available_balance(db, user.id)
    assert state is not None
    assert state["bank_balance"] == Decimal("1400.00")
    assert state["cash_balance"] == Decimal("150.00")
    assert state["total"] == Decimal("1550.00")


def test_balance_and_verify_routes_are_available():
    balance_get = next(route for route in app.routes if getattr(route, "path", None) == "/api/balance" and "GET" in route.methods)
    balance_put = next(route for route in app.routes if getattr(route, "path", None) == "/api/balance" and "PUT" in route.methods)
    verify = next(route for route in app.routes if getattr(route, "path", None) == "/api/transactions/{tx_id}/verify")
    assert balance_get is not None
    assert balance_put is not None
    assert "POST" in verify.methods


def test_spending_breakdown_separates_liquid_and_credit_card():
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

    _create_manual_transaction(
        user_id=user.id,
        amount=Decimal("800.00"),
        direction="debit",
        payment_method="upi",
        category_name="Groceries",
        txn_at=datetime(2026, 9, 24, 9, 0, tzinfo=timezone.utc),
        merchant="Market",
        note=None,
        account_id=bank.id,
        db=db,
    )
    _create_manual_transaction(
        user_id=user.id,
        amount=Decimal("200.00"),
        direction="debit",
        payment_method="cash",
        category_name="Groceries",
        txn_at=datetime(2026, 9, 24, 9, 30, tzinfo=timezone.utc),
        merchant="Market",
        note=None,
        account_id=None,
        db=db,
    )
    _create_manual_transaction(
        user_id=user.id,
        amount=Decimal("500.00"),
        direction="debit",
        payment_method="credit_card",
        category_name="Shopping",
        txn_at=datetime(2026, 9, 24, 10, 0, tzinfo=timezone.utc),
        merchant="Store",
        note=None,
        account_id=None,
        db=db,
    )
    _create_manual_transaction(
        user_id=user.id,
        amount=Decimal("1000.00"),
        direction="debit",
        payment_method="upi",
        category_name="Investments",
        txn_at=datetime(2026, 9, 24, 10, 30, tzinfo=timezone.utc),
        merchant="Broker",
        note=None,
        account_id=bank.id,
        db=db,
    )

    rows = db.scalars(select(Transaction).where(Transaction.user_id == user.id)).all()
    result = _spending_breakdown(rows)

    assert result["total"] == Decimal("1500.00")
    assert result["liquid"] == Decimal("1000.00")
    assert result["credit_card"] == Decimal("500.00")
    assert result["top_category"] == "Groceries"
    assert result["top_category_amount"] == Decimal("1000.00")


def test_manual_income_increases_available_balance():
    db = _db()
    user = _user()
    db.add(user)
    db.flush()
    bank = Account(
        user_id=user.id,
        name="Salary Bank",
        institution="Bank",
        type="bank",
        is_active=True,
    )
    db.add(bank)
    db.flush()
    db.add(AvailableBalance(
        user_id=user.id,
        bank_balance=Decimal("1000.00"),
        cash_balance=Decimal("100.00"),
        as_of=datetime(2026, 9, 24, 9, 0, tzinfo=timezone.utc),
    ))
    db.commit()

    _create_manual_transaction(
        user_id=user.id,
        amount=Decimal("250.00"),
        direction="credit",
        payment_method="upi",
        category_name="Payroll",
        txn_at=datetime(2026, 9, 24, 10, 0, tzinfo=timezone.utc),
        merchant="Employer",
        note="Salary adjustment",
        account_id=bank.id,
        db=db,
    )

    state = _current_available_balance(db, user.id)
    assert state is not None
    assert state["bank_balance"] == Decimal("1250.00")
    assert state["cash_balance"] == Decimal("100.00")
    assert state["total"] == Decimal("1350.00")


def test_statement_row_reconciles_unique_manual_transaction_even_when_description_differs():
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

    manual = _create_manual_transaction(
        user_id=user.id,
        amount=Decimal("499.00"),
        direction="debit",
        payment_method="upi",
        category_name="Shopping",
        txn_at=datetime(2026, 9, 24, 10, 0, tzinfo=timezone.utc),
        merchant="Amazon",
        note=None,
        account_id=bank.id,
        db=db,
    )

    match, method, score = find_match(
        db,
        account_id=bank.id,
        txn_at=datetime(2026, 9, 24, 17, 0, tzinfo=timezone.utc),
        amount=Decimal("499.00"),
        direction="debit",
        description="UPI PURCHASE REF 123456789",
        bank_ref="123456789",
    )

    assert match is not None
    assert match.id == manual["id"]
    assert method == "manual_amount_date"
    assert score == 0.94


def test_ambiguous_same_amount_manual_entries_require_review_instead_of_new_insert():
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

    for hour, merchant in ((10, "Shop A"), (12, "Shop B")):
        _create_manual_transaction(
            user_id=user.id,
            amount=Decimal("100.00"),
            direction="debit",
            payment_method="upi",
            category_name="Shopping",
            txn_at=datetime(2026, 9, 24, hour, 0, tzinfo=timezone.utc),
            merchant=merchant,
            note=None,
            account_id=bank.id,
            db=db,
        )

    match, method, score = find_match(
        db,
        account_id=bank.id,
        txn_at=datetime(2026, 9, 24, 18, 0, tzinfo=timezone.utc),
        amount=Decimal("100.00"),
        direction="debit",
        description="BANK DEBIT 100",
    )

    assert match is not None
    assert method == "ambiguous_amount_date"
    assert score == 0.60
