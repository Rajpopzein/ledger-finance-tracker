from datetime import datetime, date
from decimal import Decimal
from pydantic import BaseModel, EmailStr, Field

class UserSignup(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    name: str = Field(min_length=1, max_length=100)
    handle: str = Field(min_length=3, max_length=40)

class UserProfileUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    handle: str = Field(min_length=3, max_length=40)
    phone: str | None = Field(default=None, max_length=30)

class UserPreferencesUpdate(BaseModel):
    theme_mode: str = Field(pattern="^(light|dark|system)$")
    dashboard_template: str = Field(pattern="^(balanced|focus|insights)$")

class FamilyLinkCreate(BaseModel):
    handle: str = Field(min_length=3, max_length=40)
    label: str | None = Field(default=None, max_length=50)

class FamilyLinkAction(BaseModel):
    action: str = Field(pattern="^(accept|reject)$")

class FamilySharingUpdate(BaseModel):
    transactions: bool
    debts: bool
    investments: bool
    ai_insights: bool = False
    ai_categorization: bool = False

class OwnerLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

class AccountCreate(BaseModel):
    institution: str = Field(min_length=1, max_length=100)
    account_mask: str | None = Field(default=None, max_length=8)
    name: str | None = Field(default=None, max_length=100)
    type: str = "bank"

class CashTransactionCreate(BaseModel):
    amount: Decimal = Field(gt=0)
    direction: str = Field(default="debit", pattern="^(credit|debit)$")
    category: str
    txn_at: datetime
    note: str | None = None

class AISettingsIn(BaseModel):
    provider: str | None = None
    base_url: str | None = None
    model: str | None = None
    api_key: str | None = None
    context_limit: int | None = None
    temperature: float = 0.2
    allow_amounts: bool = True
    allow_merchants: bool = True
    allow_categories: bool = True
    allow_dates: bool = True
    allow_balances: bool = False
    allow_notes: bool = False

class AIQuestion(BaseModel):
    question: str = Field(min_length=2, max_length=500)
    from_date: date | None = None
    to_date: date | None = None
    family_scope: str = Field(default="self", pattern="^(self|family|all)$")
    family_user_id: int | None = None
    provider_user_id: int | None = None


class AICategorizeRequest(BaseModel):
    transaction_ids: list[int] = Field(min_length=1, max_length=100)
    provider_user_id: int | None = None

class DebtCreate(BaseModel):
    lender: str = Field(min_length=1, max_length=160)
    debt_type: str = Field(default="loan", min_length=1, max_length=50)
    principal: Decimal = Field(gt=0)
    outstanding_balance: Decimal = Field(ge=0)
    interest_rate: Decimal | None = Field(default=None, ge=0, le=100)
    emi_amount: Decimal | None = Field(default=None, ge=0)
    start_date: datetime | None = None
    end_date: datetime | None = None
    next_due_date: datetime | None = None
    status: str = Field(default="active", pattern="^(active|closed|paused)$")
    notes: str | None = Field(default=None, max_length=2000)
    source_type: str = Field(default="manual", max_length=30)
    source_file_name: str | None = Field(default=None, max_length=255)

class DebtUpdate(BaseModel):
    lender: str | None = Field(default=None, min_length=1, max_length=160)
    debt_type: str | None = Field(default=None, min_length=1, max_length=50)
    principal: Decimal | None = Field(default=None, gt=0)
    outstanding_balance: Decimal | None = Field(default=None, ge=0)
    interest_rate: Decimal | None = Field(default=None, ge=0, le=100)
    emi_amount: Decimal | None = Field(default=None, ge=0)
    start_date: datetime | None = None
    end_date: datetime | None = None
    next_due_date: datetime | None = None
    status: str | None = Field(default=None, pattern="^(active|closed|paused)$")
    notes: str | None = Field(default=None, max_length=2000)

class DebtPaymentCreate(BaseModel):
    amount: Decimal = Field(gt=0)
    paid_at: datetime
    note: str | None = Field(default=None, max_length=255)


class TransactionUpdate(BaseModel):
    account_id: int | None = None
    txn_at: datetime | None = None
    amount: Decimal | None = Field(default=None, gt=0)
    direction: str | None = Field(default=None, pattern="^(debit|credit)$")
    merchant: str | None = Field(default=None, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    category: str | None = Field(default=None, max_length=80)
    excluded: bool | None = None

class TransactionCategoryUpdate(BaseModel):
    category: str = Field(min_length=1, max_length=80)

class InvestmentCreate(BaseModel):
    platform: str = Field(default="Manual", min_length=1, max_length=50)
    asset_type: str = Field(default="equity", min_length=1, max_length=40)
    symbol: str = Field(min_length=1, max_length=80)
    name: str | None = Field(default=None, max_length=160)
    isin: str | None = Field(default=None, max_length=20)
    quantity: Decimal = Field(default=Decimal("0"), ge=0)
    average_price: Decimal | None = Field(default=None, ge=0)
    invested_amount: Decimal = Field(default=Decimal("0"), ge=0)
    current_price: Decimal | None = Field(default=None, ge=0)
    current_value: Decimal | None = Field(default=None, ge=0)
    as_of_date: datetime | None = None

class InvestmentUpdate(BaseModel):
    platform: str | None = Field(default=None, min_length=1, max_length=50)
    asset_type: str | None = Field(default=None, min_length=1, max_length=40)
    symbol: str | None = Field(default=None, min_length=1, max_length=80)
    name: str | None = Field(default=None, max_length=160)
    isin: str | None = Field(default=None, max_length=20)
    quantity: Decimal | None = Field(default=None, ge=0)
    average_price: Decimal | None = Field(default=None, ge=0)
    invested_amount: Decimal | None = Field(default=None, ge=0)
    current_price: Decimal | None = Field(default=None, ge=0)
    current_value: Decimal | None = Field(default=None, ge=0)
    as_of_date: datetime | None = None
