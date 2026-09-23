from datetime import datetime, timezone
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from backend.app.db import Base
from backend.app.main import _delete_bank_account_with_history
from backend.app.models import (
    Account,
    ImportBatch,
    ImportPreview,
    Transaction,
    TransactionSource,
    User,
)


def _db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return Session(engine)


def _user(email: str, handle: str):
    return User(
        email=email,
        handle=handle,
        name=handle,
        password_salt="salt",
        password_hash="hash",
    )


def test_bank_delete_requires_explicit_transaction_confirmation():
    db = _db()
    user = _user("owner@example.com", "owner")
    db.add(user)
    db.flush()
    account = Account(
        user_id=user.id,
        name="Primary Bank",
        institution="Bank",
        type="bank",
        is_active=True,
    )
    db.add(account)
    db.commit()

    with pytest.raises(HTTPException) as exc:
        _delete_bank_account_with_history(
            db,
            user.id,
            account.id,
            delete_transactions=False,
        )

    assert exc.value.status_code == 400
    assert db.get(Account, account.id) is not None


def test_bank_delete_removes_account_transactions_sources_and_import_history():
    db = _db()
    user = _user("owner@example.com", "owner2")
    db.add(user)
    db.flush()
    account = Account(
        user_id=user.id,
        name="Salary Bank",
        institution="Bank",
        type="bank",
        is_active=True,
    )
    db.add(account)
    db.flush()

    transaction = Transaction(
        user_id=user.id,
        account_id=account.id,
        txn_at=datetime(2026, 9, 23, 12, 0, tzinfo=timezone.utc),
        amount=Decimal("125.00"),
        direction="debit",
        txn_type="expense",
        payment_method="upi",
        merchant="Store",
        description_raw="UPI purchase",
        fingerprint="f" * 64,
        verification_status="manual",
    )
    transaction.sources.append(
        TransactionSource(
            source_type="manual",
            source_name="Manual UPI Entry",
        )
    )
    db.add(transaction)
    db.add(
        ImportBatch(
            account_id=account.id,
            file_name="statement.csv",
            file_hash="a" * 64,
            status="committed",
        )
    )
    db.add(
        ImportPreview(
            token="preview-token",
            account_id=account.id,
            file_name="statement.csv",
            file_hash="b" * 64,
            payload_json='{"items":[]}',
        )
    )
    db.commit()

    result = _delete_bank_account_with_history(
        db,
        user.id,
        account.id,
        delete_transactions=True,
    )

    assert result["deleted_transactions"] == 1
    assert db.get(Account, account.id) is None
    assert db.scalars(select(Transaction)).all() == []
    assert db.scalars(select(TransactionSource)).all() == []
    assert db.scalars(select(ImportBatch)).all() == []
    assert db.scalars(select(ImportPreview)).all() == []


def test_user_cannot_delete_another_users_bank_account():
    db = _db()
    owner = _user("owner@example.com", "owner3")
    other = _user("other@example.com", "other3")
    db.add_all([owner, other])
    db.flush()
    account = Account(
        user_id=owner.id,
        name="Owner Bank",
        institution="Bank",
        type="bank",
        is_active=True,
    )
    db.add(account)
    db.commit()

    with pytest.raises(HTTPException) as exc:
        _delete_bank_account_with_history(
            db,
            other.id,
            account.id,
            delete_transactions=True,
        )

    assert exc.value.status_code == 404
    assert db.get(Account, account.id) is not None
