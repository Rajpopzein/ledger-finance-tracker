from datetime import datetime, timezone
from decimal import Decimal

from starlette.requests import Request
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from backend.app.accounting_core import create_monthly_close, prepare_monthly_close, resolve_reconciliation, save_month_end_balance
from backend.app.db import Base
from backend.app.finance_features import add_debt_payment
from backend.app.main import _create_manual_transaction, _current_available_balance, _spending_breakdown
from backend.app.models import (
    Account,
    AvailableBalance,
    BalanceSnapshot,
    CreditCardTransactionLink,
    Debt,
    ImportBatch,
    MonthlyClose,
    ReconciliationItem,
    Transaction,
    TransactionSource,
    User,
)
from backend.app.schemas import DebtPaymentCreate, MonthEndBalanceUpdate, MonthlyCloseCreate, ReconciliationResolve


def _db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return Session(engine)


def _user():
    return User(
        email="accounting@example.com",
        handle="accounting_user",
        name="Accounting User",
        password_salt="salt",
        password_hash="hash",
    )


def _request(user_id: int):
    request = Request({"type": "http", "method": "POST", "path": "/", "headers": []})
    request.state.auth = {"role": "user", "sub": str(user_id)}
    return request


def test_specific_credit_card_purchase_increases_outstanding_once():
    db = _db()
    user = _user()
    db.add(user)
    db.flush()
    card = Debt(
        user_id=user.id,
        lender="Test Card",
        debt_type="credit_card",
        principal=Decimal("100000.00"),
        outstanding_balance=Decimal("1000.00"),
        status="active",
        source_type="manual",
    )
    db.add(card)
    db.flush()

    kwargs = dict(
        user_id=user.id,
        amount=Decimal("500.00"),
        direction="debit",
        payment_method="credit_card",
        category_name="Shopping",
        txn_at=datetime(2026, 9, 24, 10, 0, tzinfo=timezone.utc),
        merchant="Store",
        note=None,
        account_id=None,
        credit_card_id=card.id,
        db=db,
    )
    first = _create_manual_transaction(**kwargs)
    second = _create_manual_transaction(**kwargs)

    db.refresh(card)
    assert first["id"] == second["id"]
    assert card.outstanding_balance == Decimal("1500.00")
    link = db.scalar(
        select(CreditCardTransactionLink).where(
            CreditCardTransactionLink.transaction_id == first["id"]
        )
    )
    assert link is not None
    assert link.debt_id == card.id
    assert link.entry_type == "purchase"


def test_credit_card_payment_reduces_liquid_balance_but_not_spending():
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
    card = Debt(
        user_id=user.id,
        lender="Test Card",
        debt_type="credit_card",
        principal=Decimal("100000.00"),
        outstanding_balance=Decimal("1000.00"),
        status="active",
        source_type="manual",
    )
    db.add_all([bank, card])
    db.flush()
    db.add(
        AvailableBalance(
            user_id=user.id,
            bank_balance=Decimal("2000.00"),
            cash_balance=Decimal("100.00"),
            as_of=datetime(2026, 9, 24, 9, 0, tzinfo=timezone.utc),
        )
    )
    db.commit()

    add_debt_payment(
        card.id,
        DebtPaymentCreate(
            amount=Decimal("300.00"),
            paid_at=datetime(2026, 9, 24, 10, 0, tzinfo=timezone.utc),
            note="Card bill",
            payment_method="upi",
            account_id=bank.id,
        ),
        _request(user.id),
        db,
    )

    db.refresh(card)
    assert card.outstanding_balance == Decimal("700.00")
    state = _current_available_balance(db, user.id)
    assert state is not None
    assert state["total"] == Decimal("1800.00")

    rows = db.scalars(select(Transaction).where(Transaction.user_id == user.id)).all()
    assert len(rows) == 1
    assert rows[0].txn_type == "credit_card_payment"
    spending = _spending_breakdown(rows)
    assert spending["total"] == Decimal("0")


def test_reconciliation_merge_keeps_one_transaction_and_adds_statement_source():
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
        txn_at=datetime(2026, 9, 20, 10, 0, tzinfo=timezone.utc),
        merchant="Amazon",
        note=None,
        account_id=bank.id,
        db=db,
    )
    batch = ImportBatch(
        account_id=bank.id,
        file_name="statement.csv",
        file_hash="a" * 64,
        status="committed",
    )
    db.add(batch)
    db.flush()
    item = ReconciliationItem(
        user_id=user.id,
        account_id=bank.id,
        import_batch_id=batch.id,
        candidate_transaction_id=manual["id"],
        source_row_index=0,
        source_type="csv",
        source_name="statement.csv",
        external_hash="a" * 64,
        txn_at=datetime(2026, 9, 20, 18, 0, tzinfo=timezone.utc),
        amount=Decimal("499.00"),
        direction="debit",
        description_raw="UPI REF 123",
        bank_ref="123",
        match_method="ambiguous_amount_date",
        match_score=Decimal("0.6000"),
        status="needs_review",
    )
    db.add(item)
    db.commit()

    result = resolve_reconciliation(
        item.id,
        ReconciliationResolve(action="merge"),
        _request(user.id),
        db,
    )

    assert result["status"] == "resolved"
    assert result["resolution"] == "merge"
    rows = db.scalars(select(Transaction).where(Transaction.user_id == user.id)).all()
    assert len(rows) == 1
    tx = rows[0]
    assert tx.bank_ref == "123"
    assert any(source.source_name == "statement.csv" for source in tx.sources)


def test_monthly_close_is_immutable_and_keeps_card_spending_separate():
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
    db.add(
        BalanceSnapshot(
            user_id=user.id,
            bank_balance=Decimal("1000.00"),
            cash_balance=Decimal("0.00"),
            as_of=datetime(2026, 7, 31, 18, 0, tzinfo=timezone.utc),
            source="manual",
        )
    )
    db.commit()

    _create_manual_transaction(
        user_id=user.id,
        amount=Decimal("500.00"),
        direction="credit",
        payment_method="upi",
        category_name="Payroll",
        txn_at=datetime(2026, 8, 5, 9, 0, tzinfo=timezone.utc),
        merchant="Employer",
        note=None,
        account_id=bank.id,
        db=db,
    )
    _create_manual_transaction(
        user_id=user.id,
        amount=Decimal("100.00"),
        direction="debit",
        payment_method="upi",
        category_name="Groceries",
        txn_at=datetime(2026, 8, 10, 9, 0, tzinfo=timezone.utc),
        merchant="Market",
        note=None,
        account_id=bank.id,
        db=db,
    )
    _create_manual_transaction(
        user_id=user.id,
        amount=Decimal("200.00"),
        direction="debit",
        payment_method="credit_card",
        category_name="Shopping",
        txn_at=datetime(2026, 8, 12, 9, 0, tzinfo=timezone.utc),
        merchant="Store",
        note=None,
        account_id=None,
        db=db,
    )

    request = _request(user.id)
    save_month_end_balance(
        "2026-08",
        MonthEndBalanceUpdate(
            bank_balance=Decimal("1400.00"),
            cash_balance=Decimal("0.00"),
        ),
        request,
        db,
    )
    first = create_monthly_close(
        MonthlyCloseCreate(month_key="2026-08"),
        request,
        db,
    )
    second = create_monthly_close(
        MonthlyCloseCreate(month_key="2026-08"),
        request,
        db,
    )

    assert first["already_closed"] is False
    assert first["close"]["closing_balance"] == 1400.0
    assert first["close"]["liquid_spending"] == 100.0
    assert first["close"]["credit_card_spending"] == 200.0
    assert first["close"]["savings"] == 200.0
    assert second["already_closed"] is True
    closes = db.scalars(select(MonthlyClose).where(MonthlyClose.user_id == user.id)).all()
    assert len(closes) == 1



def test_month_end_balance_snapshot_does_not_overwrite_current_balance():
    db = _db()
    user = _user()
    db.add(user)
    db.flush()
    current_as_of = datetime(2026, 9, 24, 9, 0, tzinfo=timezone.utc)
    db.add(
        AvailableBalance(
            user_id=user.id,
            bank_balance=Decimal("9000.00"),
            cash_balance=Decimal("500.00"),
            as_of=current_as_of,
        )
    )
    db.commit()

    result = save_month_end_balance(
        "2026-08",
        MonthEndBalanceUpdate(
            bank_balance=Decimal("7000.00"),
            cash_balance=Decimal("300.00"),
        ),
        _request(user.id),
        db,
    )

    current = db.scalar(
        select(AvailableBalance).where(AvailableBalance.user_id == user.id)
    )
    month_end = db.scalar(
        select(BalanceSnapshot).where(
            BalanceSnapshot.user_id == user.id,
            BalanceSnapshot.source == "month_end",
        )
    )

    assert result["total"] == 7300.0
    assert current is not None
    assert current.bank_balance == Decimal("9000.00")
    assert current.cash_balance == Decimal("500.00")
    assert current.as_of.replace(tzinfo=timezone.utc) == current_as_of
    assert month_end is not None
    assert month_end.bank_balance == Decimal("7000.00")
    assert month_end.cash_balance == Decimal("300.00")


def test_prepare_monthly_close_guides_review_and_balance_confirmation():
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
    db.add(
        BalanceSnapshot(
            user_id=user.id,
            bank_balance=Decimal("1000.00"),
            cash_balance=Decimal("100.00"),
            as_of=datetime(2026, 7, 31, 18, 0, tzinfo=timezone.utc),
            source="manual",
        )
    )
    tx = Transaction(
        user_id=user.id,
        account_id=bank.id,
        txn_at=datetime(2026, 8, 10, 9, 0, tzinfo=timezone.utc),
        amount=Decimal("100.00"),
        direction="debit",
        txn_type="expense",
        merchant="Needs review",
        description_raw="Needs review",
        fingerprint="f" * 64,
        verification_status="pending",
    )
    db.add(tx)
    db.commit()

    before = prepare_monthly_close("2026-08", _request(user.id), db)
    assert before["already_closed"] is False
    assert before["month_end_balance_confirmed"] is False
    assert before["review_transactions"] == 1
    assert before["month_end_balance"]["total"] == 1000.0

    save_month_end_balance(
        "2026-08",
        MonthEndBalanceUpdate(
            bank_balance=Decimal("850.00"),
            cash_balance=Decimal("50.00"),
        ),
        _request(user.id),
        db,
    )
    after = prepare_monthly_close("2026-08", _request(user.id), db)

    assert after["month_end_balance_confirmed"] is True
    assert after["month_end_balance"]["bank_balance"] == 850.0
    assert after["month_end_balance"]["cash_balance"] == 50.0
    assert after["month_end_balance"]["total"] == 900.0
    assert after["summary"]["closing_balance"] == 900.0
