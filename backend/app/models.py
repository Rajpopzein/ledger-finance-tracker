from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, DateTime, Numeric, Boolean, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .db import Base

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    handle: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    theme_mode: Mapped[str] = mapped_column(String(20), default="dark")
    dashboard_template: Mapped[str] = mapped_column(String(30), default="balanced")
    password_salt: Mapped[str] = mapped_column(String(255))
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

class FamilyLink(Base):
    __tablename__ = "family_links"
    __table_args__ = (
        UniqueConstraint("requester_user_id", "target_user_id", name="uq_family_link_pair"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    requester_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    target_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    requester_label: Mapped[str | None] = mapped_column(String(50), nullable=True)
    target_label: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

class FamilySharingPreference(Base):
    __tablename__ = "family_sharing_preferences"
    __table_args__ = (
        UniqueConstraint("family_link_id", "owner_user_id", name="uq_family_sharing_link_owner"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    family_link_id: Mapped[int] = mapped_column(ForeignKey("family_links.id", ondelete="CASCADE"), index=True)
    owner_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    share_transactions: Mapped[bool] = mapped_column(Boolean, default=True)
    share_debts: Mapped[bool] = mapped_column(Boolean, default=True)
    share_investments: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

class FamilyAISharingPreference(Base):
    __tablename__ = "family_ai_sharing_preferences"
    __table_args__ = (
        UniqueConstraint("family_link_id", "owner_user_id", name="uq_family_ai_sharing_link_owner"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    family_link_id: Mapped[int] = mapped_column(ForeignKey("family_links.id", ondelete="CASCADE"), index=True)
    owner_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    share_ai_insights: Mapped[bool] = mapped_column(Boolean, default=False)
    share_ai_categorization: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

class AIConversation(Base):
    __tablename__ = "ai_conversations"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    provider_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    question: Mapped[str] = mapped_column(Text)
    response: Mapped[str] = mapped_column(Text)
    provider: Mapped[str | None] = mapped_column(String(30), nullable=True)
    model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    family_scope: Mapped[str] = mapped_column(String(20), default="self")
    family_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    period_from: Mapped[str | None] = mapped_column(String(10), nullable=True)
    period_to: Mapped[str | None] = mapped_column(String(10), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)

class Owner(Base):
    __tablename__ = "owners"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_salt: Mapped[str] = mapped_column(String(255))
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

class Account(Base):
    __tablename__ = "accounts"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    institution: Mapped[str] = mapped_column(String(100))
    account_mask: Mapped[str | None] = mapped_column(String(8), nullable=True)
    type: Mapped[str] = mapped_column(String(30), default="bank")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    user: Mapped[User | None] = relationship()

class AvailableBalance(Base):
    __tablename__ = "available_balances"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True)
    bank_balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    cash_balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    as_of: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

class BalanceSnapshot(Base):
    __tablename__ = "balance_snapshots"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    bank_balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    cash_balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    as_of: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)
    source: Mapped[str] = mapped_column(String(30), default="manual")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

class MonthlyClose(Base):
    __tablename__ = "monthly_closes"
    __table_args__ = (
        UniqueConstraint("user_id", "month_key", name="uq_monthly_close_user_month"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    month_key: Mapped[str] = mapped_column(String(7), index=True)
    opening_balance: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    closing_bank_balance: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    closing_cash_balance: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    closing_balance: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    income: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    liquid_spending: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    credit_card_spending: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    investments: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    debt_payments: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    savings: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    closed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_category_user_name"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(80))

class Transaction(Base):
    __tablename__ = "transactions"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"), nullable=True, index=True)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True, index=True)
    category_previous_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    category_source: Mapped[str | None] = mapped_column(String(20), nullable=True)
    category_undo_available: Mapped[bool] = mapped_column(Boolean, default=False)
    txn_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    direction: Mapped[str] = mapped_column(String(10))
    txn_type: Mapped[str] = mapped_column(String(30), default="expense")
    payment_method: Mapped[str | None] = mapped_column(String(30), nullable=True)
    merchant: Mapped[str | None] = mapped_column(String(160), nullable=True)
    description_raw: Mapped[str | None] = mapped_column(Text, nullable=True)
    upi_ref: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    bank_ref: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    fingerprint: Mapped[str] = mapped_column(String(64), index=True)
    verification_status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    excluded_from_analytics: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    account: Mapped[Account | None] = relationship()
    user: Mapped[User | None] = relationship()
    category: Mapped[Category | None] = relationship(foreign_keys=[category_id])
    sources: Mapped[list["TransactionSource"]] = relationship(back_populates="transaction", cascade="all, delete-orphan")

class CreditCardTransactionLink(Base):
    __tablename__ = "credit_card_transaction_links"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    transaction_id: Mapped[int] = mapped_column(ForeignKey("transactions.id", ondelete="CASCADE"), unique=True, index=True)
    debt_id: Mapped[int] = mapped_column(ForeignKey("debts.id", ondelete="CASCADE"), index=True)
    debt_payment_id: Mapped[int | None] = mapped_column(ForeignKey("debt_payments.id", ondelete="SET NULL"), nullable=True, index=True)
    entry_type: Mapped[str] = mapped_column(String(20))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

class InternalTransfer(Base):
    __tablename__ = "internal_transfers"
    __table_args__ = (
        UniqueConstraint("user_id", "transfer_key", name="uq_internal_transfer_user_key"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    from_account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    to_account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    outgoing_transaction_id: Mapped[int] = mapped_column(ForeignKey("transactions.id", ondelete="CASCADE"), unique=True, index=True)
    incoming_transaction_id: Mapped[int] = mapped_column(ForeignKey("transactions.id", ondelete="CASCADE"), unique=True, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    transferred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    transfer_key: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

class TransactionSource(Base):
    __tablename__ = "transaction_sources"
    id: Mapped[int] = mapped_column(primary_key=True)
    transaction_id: Mapped[int] = mapped_column(ForeignKey("transactions.id", ondelete="CASCADE"), index=True)
    source_type: Mapped[str] = mapped_column(String(30))
    source_name: Mapped[str] = mapped_column(String(255))
    external_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    transaction: Mapped[Transaction] = relationship(back_populates="sources")

class ImportBatch(Base):
    __tablename__ = "import_batches"
    __table_args__ = (UniqueConstraint("account_id", "file_hash", name="uq_import_account_filehash"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    file_name: Mapped[str] = mapped_column(String(255))
    file_hash: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(30), default="previewed")
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

class ImportPreview(Base):
    __tablename__ = "import_previews"
    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    file_name: Mapped[str] = mapped_column(String(255))
    file_hash: Mapped[str] = mapped_column(String(64), index=True)
    payload_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

class ReconciliationItem(Base):
    __tablename__ = "reconciliation_items"
    __table_args__ = (
        UniqueConstraint("import_batch_id", "source_row_index", name="uq_reconciliation_batch_row"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True)
    import_batch_id: Mapped[int] = mapped_column(ForeignKey("import_batches.id", ondelete="CASCADE"), index=True)
    candidate_transaction_id: Mapped[int | None] = mapped_column(ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True, index=True)
    source_row_index: Mapped[int] = mapped_column()
    source_type: Mapped[str] = mapped_column(String(30))
    source_name: Mapped[str] = mapped_column(String(255))
    external_hash: Mapped[str] = mapped_column(String(64), index=True)
    txn_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    direction: Mapped[str] = mapped_column(String(10))
    description_raw: Mapped[str | None] = mapped_column(Text, nullable=True)
    bank_ref: Mapped[str | None] = mapped_column(String(100), nullable=True)
    match_method: Mapped[str | None] = mapped_column(String(40), nullable=True)
    match_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 4), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="needs_review", index=True)
    resolution: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

class AISetting(Base):
    __tablename__ = "ai_settings"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    provider: Mapped[str | None] = mapped_column(String(30), nullable=True)
    base_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    api_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    context_limit: Mapped[int | None] = mapped_column(nullable=True)
    temperature: Mapped[Decimal] = mapped_column(Numeric(3, 2), default=Decimal("0.20"))
    allow_amounts: Mapped[bool] = mapped_column(Boolean, default=True)
    allow_merchants: Mapped[bool] = mapped_column(Boolean, default=True)
    allow_categories: Mapped[bool] = mapped_column(Boolean, default=True)
    allow_dates: Mapped[bool] = mapped_column(Boolean, default=True)
    allow_balances: Mapped[bool] = mapped_column(Boolean, default=False)
    allow_notes: Mapped[bool] = mapped_column(Boolean, default=False)


class Budget(Base):
    __tablename__ = "budgets"
    __table_args__ = (
        UniqueConstraint("user_id", "category_id", name="uq_budget_user_category"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete="CASCADE"), index=True)
    monthly_limit: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    category: Mapped[Category] = relationship()

class Commitment(Base):
    __tablename__ = "commitments"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    next_due_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    recurrence: Mapped[str] = mapped_column(String(20), default="monthly")
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    category: Mapped[Category | None] = relationship()

class Debt(Base):
    __tablename__ = "debts"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    lender: Mapped[str] = mapped_column(String(160))
    debt_type: Mapped[str] = mapped_column(String(50), default="loan")
    principal: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    outstanding_balance: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    interest_rate: Mapped[Decimal | None] = mapped_column(Numeric(7, 4), nullable=True)
    emi_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="active", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_type: Mapped[str] = mapped_column(String(30), default="manual")
    source_file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

class DebtPayment(Base):
    __tablename__ = "debt_payments"
    id: Mapped[int] = mapped_column(primary_key=True)
    debt_id: Mapped[int] = mapped_column(ForeignKey("debts.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class ShortcutToken(Base):
    __tablename__ = "shortcut_tokens"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class InvestmentHolding(Base):
    __tablename__ = "investment_holdings"
    __table_args__ = (
        UniqueConstraint("user_id", "platform", "symbol", name="uq_investment_user_platform_symbol"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    platform: Mapped[str] = mapped_column(String(50), default="Manual", index=True)
    asset_type: Mapped[str] = mapped_column(String(40), default="equity")
    symbol: Mapped[str] = mapped_column(String(80))
    name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    isin: Mapped[str | None] = mapped_column(String(20), nullable=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 6), default=Decimal("0"))
    average_price: Mapped[Decimal | None] = mapped_column(Numeric(14, 4), nullable=True)
    invested_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    current_price: Mapped[Decimal | None] = mapped_column(Numeric(14, 4), nullable=True)
    current_value: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    as_of_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    source_type: Mapped[str] = mapped_column(String(30), default="manual")
    source_file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
