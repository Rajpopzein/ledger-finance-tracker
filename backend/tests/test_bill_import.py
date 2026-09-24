from datetime import datetime, timezone
from decimal import Decimal

from fastapi import Request
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from backend.app.bills import bill_commit
from backend.app.db import Base
from backend.app.main import _current_available_balance
from backend.app.models import Account, AvailableBalance, Debt, Transaction, TransactionSource, User
from backend.app.schemas import BillExpenseCreate


def _db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return Session(engine)


def _user():
    return User(
        email="bill@example.com",
        handle="bill_user",
        name="Bill User",
        password_salt="salt",
        password_hash="hash",
    )


def _request(user_id: int):
    request = Request({"type": "http", "method": "POST", "path": "/", "headers": []})
    request.state.auth = {"role": "user", "sub": str(user_id)}
    return request


def test_bill_commit_creates_verified_cash_expense_with_bill_source():
    db = _db()
    user = _user()
    db.add(user)
    db.flush()

    result = bill_commit(
        BillExpenseCreate(
            amount=Decimal("325.50"),
            payment_method="cash",
            category="Food & Dining",
            txn_at=datetime(2026, 9, 24, 12, 0, tzinfo=timezone.utc),
            merchant="Cafe",
            note="Lunch bill",
            source_file_name="receipt.jpg",
            source_hash="a" * 64,
        ),
        _request(user.id),
        db,
    )

    assert result["duplicate"] is False
    tx = db.get(Transaction, result["transaction_id"])
    assert tx is not None
    assert tx.direction == "debit"
    assert tx.txn_type == "cash_expense"
    assert tx.payment_method == "cash"
    assert tx.verification_status == "verified"
    assert tx.category.name == "Food & Dining"
    assert tx.account.type == "cash"
    assert any(source.source_type == "bill" for source in tx.sources)


def test_same_bill_hash_is_not_added_twice():
    db = _db()
    user = _user()
    db.add(user)
    db.flush()
    payload = BillExpenseCreate(
        amount=Decimal("999.00"),
        payment_method="cash",
        category="Shopping",
        txn_at=datetime(2026, 9, 24, 12, 0, tzinfo=timezone.utc),
        merchant="Store",
        source_file_name="bill.png",
        source_hash="b" * 64,
    )

    first = bill_commit(payload, _request(user.id), db)
    second = bill_commit(payload, _request(user.id), db)

    assert first["duplicate"] is False
    assert second["duplicate"] is True
    assert second["transaction_id"] == first["transaction_id"]
    assert len(db.scalars(select(Transaction)).all()) == 1
    assert len(db.scalars(select(TransactionSource)).all()) == 1


def test_credit_card_bill_updates_card_outstanding():
    db = _db()
    user = _user()
    db.add(user)
    db.flush()
    card = Debt(
        user_id=user.id,
        lender="Test Card",
        debt_type="credit_card",
        principal=Decimal("10000.00"),
        outstanding_balance=Decimal("1000.00"),
        status="active",
        source_type="manual",
    )
    db.add(card)
    db.flush()

    result = bill_commit(
        BillExpenseCreate(
            amount=Decimal("250.00"),
            payment_method="credit_card",
            credit_card_id=card.id,
            category="Groceries",
            txn_at=datetime(2026, 9, 24, 12, 0, tzinfo=timezone.utc),
            merchant="Supermarket",
            source_file_name="grocery.jpg",
            source_hash="c" * 64,
        ),
        _request(user.id),
        db,
    )

    db.refresh(card)
    tx = db.get(Transaction, result["transaction_id"])
    assert tx.txn_type == "credit_card_purchase"
    assert tx.account_id is None
    assert card.outstanding_balance == Decimal("1250.00")


def test_bank_bill_uses_selected_bank_account():
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

    result = bill_commit(
        BillExpenseCreate(
            amount=Decimal("780.00"),
            payment_method="bank",
            account_id=bank.id,
            category="Bills & Subscriptions",
            txn_at=datetime(2026, 9, 24, 12, 0, tzinfo=timezone.utc),
            merchant="Electricity",
            source_file_name="power.pdf",
            source_hash="d" * 64,
        ),
        _request(user.id),
        db,
    )

    tx = db.get(Transaction, result["transaction_id"])
    assert tx.payment_method == "bank"
    assert tx.account_id == bank.id
    assert tx.txn_type == "expense"


def test_upi_bill_uses_paid_at_to_reduce_current_available_balance():
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

    now = datetime.now(timezone.utc)
    db.add(AvailableBalance(
        user_id=user.id,
        bank_balance=Decimal("5000.00"),
        cash_balance=Decimal("250.00"),
        as_of=now.replace(microsecond=0),
    ))
    db.commit()

    paid_at = now.replace(microsecond=0)
    paid_at = paid_at.replace(second=min(59, paid_at.second + 1))

    result = bill_commit(
        BillExpenseCreate(
            amount=Decimal("800.00"),
            payment_method="upi",
            account_id=bank.id,
            category="Bills & Subscriptions",
            txn_at=datetime(2026, 9, 1, 12, 0, tzinfo=timezone.utc),
            paid_at=paid_at,
            merchant="Electricity Board",
            source_file_name="electricity.pdf",
            source_hash="e" * 64,
        ),
        _request(user.id),
        db,
    )

    tx = db.get(Transaction, result["transaction_id"])
    assert tx.txn_at == paid_at
    assert result["bill_date"] == "2026-09-01"

    state = _current_available_balance(db, user.id)
    assert state is not None
    assert state["bank_balance"] == Decimal("4200.00")
    assert state["cash_balance"] == Decimal("250.00")
    assert state["total"] == Decimal("4450.00")
