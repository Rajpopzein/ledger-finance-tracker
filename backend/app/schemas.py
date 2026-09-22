from datetime import datetime, date
from decimal import Decimal
from pydantic import BaseModel, EmailStr, Field

class OwnerSetup(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)

class OwnerLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

class FamilySignup(BaseModel):
    member_code: str = Field(min_length=1, max_length=64)
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)

class AccountCreate(BaseModel):
    institution: str = Field(min_length=1, max_length=100)
    account_mask: str | None = Field(default=None, max_length=8)
    name: str | None = Field(default=None, max_length=100)
    type: str = "bank"

class FamilyMemberCreate(BaseModel):
    member_code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=100)

class FamilyMemberTag(BaseModel):
    family_member_id: int | None = None

class CashTransactionCreate(BaseModel):
    amount: Decimal = Field(gt=0)
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
