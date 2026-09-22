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
    category: Mapped[Category | None] = relationship()
    sources: Mapped[list["TransactionSource"]] = relationship(back_populates="transaction", cascade="all, delete-orphan")

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
