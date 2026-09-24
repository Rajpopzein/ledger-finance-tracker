from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from starlette.requests import Request

from backend.app.db import Base
from backend.app.finance_features import delete_transaction
from backend.app.main import _create_manual_transaction, _current_available_balance
from backend.app.models import (
    Account,
    AvailableBalance,
    Budget,
    Category,
    Commitment,
    Debt,
    InternalTransfer,
    Transaction,
    User,
)
from backend.app.planning import complete_commitment, create_internal_transfer, planning_summary
from backend.app.schemas import InternalTransferCreate
from backend.app.services.dedupe import find_match


def _db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return Session(engine)


def _user():
    return User(
        email="planning@example.com",
        handle="planning_user",
        name="Planning User",
        password_salt="salt",
        password_hash="hash",
    )


def _request(user_id: int):
    request = Request({"type": "http", "method": "POST", "path": "/", "headers": []})
    request.state.auth = {"role": "user", "sub": str(user_id)}
    return request


def _bank(db: Session, user_id: int, name: str):
    row = Account(
        user_id=user_id,
        name=name,
        institution=name,
        type="bank",
        is_active=True,
    )
    db.add(row)
    db.flush()
    return row


def test_internal_transfer_creates_linked_pair_and_is_duplicate_safe():
    db = _db()
    user = _user()
    db.add(user)
    db.flush()
    source = _bank(db, user.id, "HDFC")
    destination = _bank(db, user.id, "SBI")
    transferred_at = datetime(2026, 9, 24, 10, 0, tzinfo=timezone.utc)

    body = InternalTransferCreate(
        amount=Decimal("10000.00"),
        from_account_id=source.id,
        to_account_id=destination.id,
        txn_at=transferred_at,
        note="Move to savings",
    )
    first = create_internal_transfer(body, _request(user.id), db)
    second = create_internal_transfer(body, _request(user.id), db)

    assert first["id"] == second["id"]
    assert first["status"] == "awaiting_statements"

    rows = db.scalars(
        select(Transaction)
        .where(Transaction.user_id == user.id)
        .order_by(Transaction.direction)
    ).all()
    assert len(rows) == 2
    assert {row.txn_type for row in rows} == {"internal_transfer"}
    debit = next(row for row in rows if row.direction == "debit")
    credit = next(row for row in rows if row.direction == "credit")
    assert debit.account_id == source.id
    assert credit.account_id == destination.id
    assert debit.amount == Decimal("10000.00")
    assert credit.amount == Decimal("10000.00")

    links = db.scalars(select(InternalTransfer).where(InternalTransfer.user_id == user.id)).all()
    assert len(links) == 1


def test_transfer_sides_reconcile_to_the_correct_owned_accounts():
    db = _db()
    user = _user()
    db.add(user)
    db.flush()
    source = _bank(db, user.id, "HDFC")
    destination = _bank(db, user.id, "SBI")
    transferred_at = datetime(2026, 9, 24, 10, 0, tzinfo=timezone.utc)

    create_internal_transfer(
        InternalTransferCreate(
            amount=Decimal("2500.00"),
            from_account_id=source.id,
            to_account_id=destination.id,
            txn_at=transferred_at,
            note=None,
        ),
        _request(user.id),
        db,
    )

    debit_match, debit_method, debit_score = find_match(
        db,
        account_id=source.id,
        txn_at=transferred_at + timedelta(hours=2),
        amount=Decimal("2500.00"),
        direction="debit",
        description="IMPS TRANSFER TO OWN ACCOUNT",
    )
    credit_match, credit_method, credit_score = find_match(
        db,
        account_id=destination.id,
        txn_at=transferred_at + timedelta(hours=2),
        amount=Decimal("2500.00"),
        direction="credit",
        description="IMPS RECEIVED OWN ACCOUNT",
    )

    assert debit_match is not None
    assert debit_match.account_id == source.id
    assert debit_method == "manual_amount_date"
    assert debit_score == 0.94

    assert credit_match is not None
    assert credit_match.account_id == destination.id
    assert credit_method == "manual_amount_date"
    assert credit_score == 0.94


def test_deleting_one_transfer_side_deletes_the_whole_pair():
    db = _db()
    user = _user()
    db.add(user)
    db.flush()
    source = _bank(db, user.id, "HDFC")
    destination = _bank(db, user.id, "SBI")
    result = create_internal_transfer(
        InternalTransferCreate(
            amount=Decimal("999.00"),
            from_account_id=source.id,
            to_account_id=destination.id,
            txn_at=datetime(2026, 9, 24, 10, 0, tzinfo=timezone.utc),
            note=None,
        ),
        _request(user.id),
        db,
    )

    delete_result = delete_transaction(
        result["outgoing_transaction_id"],
        _request(user.id),
        db,
    )

    assert delete_result["deleted_transfer_pair"] is True
    assert db.scalars(select(Transaction).where(Transaction.user_id == user.id)).all() == []
    assert db.scalars(select(InternalTransfer).where(InternalTransfer.user_id == user.id)).all() == []


def test_safe_to_spend_subtracts_upcoming_commitments_and_budget_spend():
    db = _db()
    user = _user()
    db.add(user)
    db.flush()
    bank = _bank(db, user.id, "Primary Bank")

    now = datetime.now(timezone.utc)
    db.add(
        AvailableBalance(
            user_id=user.id,
            bank_balance=Decimal("5000.00"),
            cash_balance=Decimal("0.00"),
            as_of=now - timedelta(hours=2),
        )
    )
    db.flush()

    _create_manual_transaction(
        user_id=user.id,
        amount=Decimal("100.00"),
        direction="debit",
        payment_method="upi",
        category_name="Groceries",
        txn_at=now - timedelta(hours=1),
        merchant="Market",
        note=None,
        account_id=bank.id,
        db=db,
    )

    groceries = db.scalar(
        select(Category).where(
            Category.user_id == user.id,
            Category.name == "Groceries",
        )
    )
    db.add(
        Budget(
            user_id=user.id,
            category_id=groceries.id,
            monthly_limit=Decimal("1000.00"),
            is_active=True,
        )
    )
    db.add(
        Commitment(
            user_id=user.id,
            title="Rent",
            amount=Decimal("500.00"),
            next_due_date=now + timedelta(days=5),
            recurrence="monthly",
            category_id=None,
            is_active=True,
        )
    )
    db.add(
        Debt(
            user_id=user.id,
            lender="Card minimum",
            debt_type="credit_card",
            principal=Decimal("10000.00"),
            outstanding_balance=Decimal("3000.00"),
            emi_amount=Decimal("700.00"),
            next_due_date=now + timedelta(days=10),
            status="active",
            source_type="manual",
        )
    )
    db.commit()

    summary = planning_summary(_request(user.id), db)

    assert summary["available_balance"] == 4900.0
    assert summary["committed_next_30_days"] == 1200.0
    assert summary["safe_to_spend"] == 3700.0
    assert summary["budget_limit"] == 1000.0
    assert summary["budget_spent"] == 100.0
    assert summary["budgets"][0]["remaining"] == 900.0


def test_internal_transfer_does_not_change_aggregate_available_balance():
    db = _db()
    user = _user()
    db.add(user)
    db.flush()
    source = _bank(db, user.id, "HDFC")
    destination = _bank(db, user.id, "SBI")
    baseline = datetime(2026, 9, 24, 9, 0, tzinfo=timezone.utc)
    db.add(
        AvailableBalance(
            user_id=user.id,
            bank_balance=Decimal("15000.00"),
            cash_balance=Decimal("500.00"),
            as_of=baseline,
        )
    )
    db.commit()

    create_internal_transfer(
        InternalTransferCreate(
            amount=Decimal("5000.00"),
            from_account_id=source.id,
            to_account_id=destination.id,
            txn_at=baseline + timedelta(hours=1),
            note=None,
        ),
        _request(user.id),
        db,
    )

    state = _current_available_balance(db, user.id)
    assert state is not None
    assert state["bank_balance"] == Decimal("15000.00")
    assert state["cash_balance"] == Decimal("500.00")
    assert state["total"] == Decimal("15500.00")


def test_transfer_rejects_same_source_and_destination():
    db = _db()
    user = _user()
    db.add(user)
    db.flush()
    source = _bank(db, user.id, "HDFC")

    with pytest.raises(HTTPException) as exc:
        create_internal_transfer(
            InternalTransferCreate(
                amount=Decimal("100.00"),
                from_account_id=source.id,
                to_account_id=source.id,
                txn_at=datetime.now(timezone.utc),
                note=None,
            ),
            _request(user.id),
            db,
        )
    assert exc.value.status_code == 400


def test_mark_paid_advances_monthly_commitment_and_closes_one_time():
    db = _db()
    user = _user()
    db.add(user)
    db.flush()
    due = datetime.now(timezone.utc) + timedelta(days=3)
    monthly = Commitment(
        user_id=user.id,
        title="Rent",
        amount=Decimal("1000.00"),
        next_due_date=due,
        recurrence="monthly",
        is_active=True,
    )
    one_time = Commitment(
        user_id=user.id,
        title="Insurance",
        amount=Decimal("500.00"),
        next_due_date=due,
        recurrence="one_time",
        is_active=True,
    )
    db.add_all([monthly, one_time])
    db.commit()

    monthly_result = complete_commitment(monthly.id, _request(user.id), db)
    one_time_result = complete_commitment(one_time.id, _request(user.id), db)

    db.refresh(monthly)
    db.refresh(one_time)
    assert monthly_result["is_active"] is True
    assert monthly.next_due_date.month != due.month or monthly.next_due_date.year != due.year
    assert one_time_result["is_active"] is False
    assert one_time.is_active is False


def test_stale_monthly_debt_is_rolled_forward_without_historical_duplicates():
    db = _db()
    user = _user()
    db.add(user)
    db.flush()
    now = datetime.now(timezone.utc)
    db.add(AvailableBalance(user_id=user.id, bank_balance=Decimal("50000.00"), cash_balance=Decimal("0.00"), as_of=now))
    db.add(Debt(
        user_id=user.id,
        lender="Old EMI",
        debt_type="loan",
        principal=Decimal("100000.00"),
        outstanding_balance=Decimal("50000.00"),
        emi_amount=Decimal("10000.00"),
        next_due_date=now - timedelta(days=150),
        status="active",
        source_type="manual",
    ))
    db.commit()

    summary = planning_summary(_request(user.id), db, months=1)
    emis = [item for item in summary["upcoming"] if item["title"] == "Old EMI"]
    assert len(emis) == 1
    due = datetime.fromisoformat(emis[0]["next_due_date"])
    assert due >= now
    assert due <= now + timedelta(days=32)
    assert summary["committed_in_horizon"] == 10000.0
