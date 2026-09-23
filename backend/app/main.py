import json
import hashlib, uuid
from collections import defaultdict
from datetime import datetime, timezone, date, time, timedelta
from decimal import Decimal
from urllib.parse import urlparse

from fastapi import FastAPI, Depends, File, Form, HTTPException, UploadFile, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import settings
from .db import Base, engine, get_db
from .models import Account, Category, Transaction, TransactionSource, ImportBatch, ImportPreview, AIConversation, AISetting, Owner, User, Debt, InvestmentHolding
from .schemas import AccountCreate, CashTransactionCreate, ManualTransactionCreate, AISettingsIn, AIQuestion, OwnerLogin, TransactionUpdate
from .services.dedupe import fingerprint, find_match
from .services.importer import parse_statement
from .services.secrets import encrypt
from .services.ai import ask_model
from .upi_imports import router as upi_imports_router
from .bank_imports import router as bank_imports_router
from .finance_features import router as finance_features_router
from .shortcuts import router as shortcuts_router
from .investments import router as investments_router
from .users import router as users_router, current_user_id, linked_user_ids, resolve_ai_provider_user_id, require_family_ai_insights, scoped_family_user_ids, shared_linked_user_ids
from .services.auth import (
    SESSION_COOKIE,
    SESSION_MAX_AGE,
    verify_password,
    create_session,
    read_session_claims,
)

NATIVE_APP_ORIGINS={
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
}
CONFIGURED_CORS_ORIGINS={x.strip().rstrip("/") for x in settings.cors_origins.split(",") if x.strip()}

app = FastAPI(title="Ledger v1 API")
app.include_router(upi_imports_router)
app.include_router(bank_imports_router)
app.include_router(users_router)
app.include_router(finance_features_router)
app.include_router(shortcuts_router)
app.include_router(investments_router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(CONFIGURED_CORS_ORIGINS|NATIVE_APP_ORIGINS),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
PREVIEWS = {}

PUBLIC_API_PATHS = {
    "/api/health",
    "/api/auth/status",
    "/api/auth/login",
    "/api/auth/signup",
    "/api/auth/logout",
    "/api/shortcuts/transaction",
}

def _origin_allowed(request: Request, origin: str) -> bool:
    try:
        if urlparse(origin).netloc == request.headers.get("host", ""):
            return True
    except Exception:
        return False
    return origin.rstrip("/") in (CONFIGURED_CORS_ORIGINS|NATIVE_APP_ORIGINS)

@app.middleware("http")
async def auth_guard(request: Request, call_next):
    path = request.url.path
    if request.method == "OPTIONS" or not path.startswith("/api/") or path in PUBLIC_API_PATHS:
        return await call_next(request)

    claims = read_session_claims(_session_token_from_request(request))
    if not claims:
        return JSONResponse({"detail": "Not authenticated"}, status_code=401)

    request.state.auth = claims
    if claims.get("role") not in {"user", "owner"}:
        return JSONResponse({"detail": "Not authenticated"}, status_code=401)
    if claims.get("role") == "owner" and int(claims.get("sub", 0)) != 1:
        return JSONResponse({"detail": "Not authenticated"}, status_code=401)

    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        origin = request.headers.get("origin")
        if origin and not _origin_allowed(request, origin):
            return JSONResponse({"detail": "Origin not allowed"}, status_code=403)

    return await call_next(request)

@app.on_event("startup")
def startup():
    Base.metadata.create_all(engine)

@app.get("/api/health")
def health():
    return {"status": "ok"}

def _session_token_from_request(request: Request):
    cookie_token = request.cookies.get(SESSION_COOKIE)
    if cookie_token:
        return cookie_token
    authorization = request.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
        return token or None
    return None

def _set_session_cookie(response: Response, request: Request, token: str):
    forwarded = request.headers.get("x-forwarded-proto", "").split(",")[0].strip()
    secure = request.url.scheme == "https" or forwarded == "https"
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        secure=secure,
        samesite="none" if secure else "lax",
        path="/",
    )

@app.get("/api/auth/status")
def auth_status(request: Request, db: Session = Depends(get_db)):
    owner = db.get(Owner, 1)
    claims = read_session_claims(_session_token_from_request(request))
    if not claims:
        return {
            "setup_required": owner is None and db.scalar(select(func.count(User.id))) == 0,
            "authenticated": False,
            "role": None,
            "email": None,
            "user_id": None,
            "name": None,
            "handle": None,
        }

    if claims.get("role") == "user":
        user = db.get(User, int(claims["sub"]))
        return {
            "setup_required": False,
            "authenticated": user is not None,
            "role": "user",
            "email": user.email if user else None,
            "user_id": user.id if user else None,
            "name": user.name if user else None,
            "handle": f"@{user.handle}" if user else None,
        }

    if claims.get("role") == "owner" and owner:
        user = db.scalar(select(User).where(func.lower(User.email) == owner.email.lower()))
        return {
            "setup_required": False,
            "authenticated": user is not None,
            "role": "user",
            "email": user.email if user else owner.email,
            "user_id": user.id if user else None,
            "name": user.name if user else "Owner",
            "handle": f"@{user.handle}" if user else None,
        }

    return {
        "setup_required": False,
        "authenticated": False,
        "role": None,
        "email": None,
        "user_id": None,
        "name": None,
        "handle": None,
    }

@app.post("/api/auth/login")
def auth_login(body: OwnerLogin, request: Request, response: Response, db: Session = Depends(get_db)):
    email = str(body.email).strip().lower()
    user = db.scalar(select(User).where(func.lower(User.email) == email))
    if user is not None and verify_password(body.password, user.password_salt, user.password_hash):
        token = create_session(user.id, "user")
        _set_session_cookie(response, request, token)
        return {"ok": True, "email": user.email, "role": "user", "session_token": token}

    owner = db.scalar(select(Owner).where(func.lower(Owner.email) == email))
    if owner is not None and verify_password(body.password, owner.password_salt, owner.password_hash):
        migrated = db.scalar(select(User).where(func.lower(User.email) == email))
        if migrated:
            token = create_session(migrated.id, "user")
            _set_session_cookie(response, request, token)
            return {"ok": True, "email": migrated.email, "role": "user", "session_token": token}

    raise HTTPException(401, "Invalid email or password")

@app.post("/api/auth/logout")
def auth_logout(response: Response):
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}

@app.get("/api/accounts")
def accounts(request:Request, db:Session=Depends(get_db)):
    user_id=current_user_id(request)
    rows=db.scalars(
        select(Account)
        .where(Account.user_id==user_id, Account.is_active==True)
        .order_by(Account.id)
    ).all()
    return _serialize_accounts(rows)

@app.post("/api/accounts")
def create_account(body:AccountCreate, request:Request, db:Session=Depends(get_db)):
    user_id=current_user_id(request)
    institution=body.institution.strip()
    mask=(body.account_mask or "").strip() or None
    existing=db.scalar(select(Account).where(
        Account.user_id==user_id,
        func.lower(Account.institution)==institution.lower(),
        Account.account_mask==mask,
        Account.type==body.type,
    ))
    if existing:
        return {"id":existing.id,"name":existing.name,"institution":existing.institution,"mask":existing.account_mask,"type":existing.type}
    display=body.name.strip() if body.name and body.name.strip() else f"{institution}{' ••'+mask[-4:] if mask else ''}"
    account=Account(user_id=user_id,name=display,institution=institution,account_mask=mask,type=body.type,is_active=True)
    db.add(account); db.commit(); db.refresh(account)
    return {"id":account.id,"name":account.name,"institution":account.institution,"mask":account.account_mask,"type":account.type}

DEFAULT_CATEGORIES=["Food & Dining","Fuel","Groceries","EMI & Loans","Shopping","Bills & Subscriptions","Travel","Health","Payroll","Investments","Other"]

def _serialize_accounts(rows):
    return [{"id":a.id,"name":a.name,"institution":a.institution,"mask":a.account_mask,"type":a.type} for a in rows]

def _serialize_categories(db:Session,user_id:int):
    existing={c.name:c.id for c in db.scalars(
        select(Category).where(Category.user_id==user_id).order_by(Category.name)
    ).all()}
    return [{"id":existing.get(name),"name":name} for name in DEFAULT_CATEGORIES] + [{"id":cid,"name":name} for name,cid in existing.items() if name not in DEFAULT_CATEGORIES]

def _serialize_ai_settings(s:AISetting|None):
    if not s:
        return {"provider":None,"status":"not_configured"}
    return {
        "provider":s.provider,
        "base_url":s.base_url,
        "model":s.model,
        "context_limit":s.context_limit,
        "temperature":float(s.temperature),
        "allow_amounts":s.allow_amounts,
        "allow_merchants":s.allow_merchants,
        "allow_categories":s.allow_categories,
        "allow_dates":s.allow_dates,
        "allow_balances":s.allow_balances,
        "allow_notes":s.allow_notes,
        "has_api_key":bool(s.api_key_encrypted),
        "status":"configured" if s.provider and s.model else "not_configured",
    }

def _serialize_ai_capabilities(db:Session,user_id:int):
    providers=[]
    own=db.scalar(select(AISetting).where(AISetting.user_id==user_id))
    if own and own.provider and own.model:
        providers.append({
            "user_id":user_id,
            "name":"You",
            "provider":own.provider,
            "model":own.model,
            "own":True,
            "ai_insights":True,
            "ai_categorization":True,
        })
    insights=set(shared_linked_user_ids(db,user_id,"ai_insights"))
    categorization=set(shared_linked_user_ids(db,user_id,"ai_categorization"))
    for other_id in linked_user_ids(db,user_id):
        if other_id not in insights and other_id not in categorization:
            continue
        setting=db.scalar(select(AISetting).where(AISetting.user_id==other_id))
        if not setting or not setting.provider or not setting.model:
            continue
        other=db.get(User,other_id)
        providers.append({
            "user_id":other_id,
            "name":other.name if other else "Family member",
            "provider":setting.provider,
            "model":setting.model,
            "own":False,
            "ai_insights":other_id in insights,
            "ai_categorization":other_id in categorization,
        })
    return {"providers":providers}

@app.get("/api/categories")
def categories(request:Request, db:Session=Depends(get_db)):
    user_id=current_user_id(request)
    return _serialize_categories(db,user_id)

@app.get("/api/bootstrap")
def bootstrap(request:Request, db:Session=Depends(get_db)):
    user_id=current_user_id(request)
    user=db.get(User,user_id)
    if not user:
        raise HTTPException(404,"User not found")
    account_rows=db.scalars(
        select(Account)
        .where(Account.user_id==user_id,Account.is_active==True)
        .order_by(Account.id)
    ).all()
    ai_setting=db.scalar(select(AISetting).where(AISetting.user_id==user_id))
    return {
        "accounts":_serialize_accounts(account_rows),
        "categories":_serialize_categories(db,user_id),
        "ai_settings":_serialize_ai_settings(ai_setting),
        "ai_capabilities":_serialize_ai_capabilities(db,user_id),
        "preferences":{
            "theme_mode":user.theme_mode or "dark",
            "dashboard_template":user.dashboard_template or "balanced",
        },
    }

INDIA_TZ = timezone(timedelta(hours=5, minutes=30))

def _bounds(from_date:date|None,to_date:date|None):
    start=(
        datetime.combine(from_date,time.min,tzinfo=INDIA_TZ).astimezone(timezone.utc)
        if from_date else None
    )
    end=(
        datetime.combine(to_date + timedelta(days=1),time.min,tzinfo=INDIA_TZ).astimezone(timezone.utc)
        if to_date else None
    )
    return start,end

def _filtered_stmt(
    from_date:date|None,
    to_date:date|None,
    user_ids:list[int]|None=None,
):
    stmt=select(Transaction)
    start,end=_bounds(from_date,to_date)
    if start is not None: stmt=stmt.where(Transaction.txn_at>=start)
    if end is not None: stmt=stmt.where(Transaction.txn_at<end)
    if user_ids is not None:
        stmt=stmt.where(Transaction.user_id.in_(user_ids))
    return stmt

def _scope_user_ids(
    request:Request,
    db:Session,
    family_scope:str="self",
    family_user_id:int|None=None,
    resource:str="transactions",
    allow_empty_unshared:bool=False,
):
    return scoped_family_user_ids(
        db,
        current_user_id(request),
        family_scope,
        family_user_id,
        resource,
        allow_empty_unshared,
    )

@app.get("/api/transactions")
def transactions(
    request:Request,
    q:str|None=None,
    status:str|None=None,
    direction:str|None=None,
    account_id:int|None=None,
    from_date:date|None=None,
    to_date:date|None=None,
    family_scope:str="self",
    family_user_id:int|None=None,
    page:int=1,
    page_size:int=25,
    db:Session=Depends(get_db),
):
    user_ids=_scope_user_ids(request,db,family_scope,family_user_id,"transactions")
    page=max(1,page)
    page_size=max(10,min(100,page_size))
    stmt=_filtered_stmt(from_date,to_date,user_ids)

    if account_id is not None:
        stmt=stmt.where(Transaction.account_id==account_id)
    if status:
        stmt=stmt.where(Transaction.verification_status==status)
    if direction in ("debit","credit"):
        stmt=stmt.where(Transaction.direction==direction)
    if q:
        needle=q.strip().lower()
        if needle:
            stmt=stmt.where(or_(
                func.lower(func.coalesce(Transaction.merchant,"")).contains(needle),
                func.lower(func.coalesce(Transaction.description_raw,"")).contains(needle),
            ))

    count_stmt=select(func.count()).select_from(stmt.order_by(None).subquery())
    total=int(db.scalar(count_stmt) or 0)
    items=db.scalars(
        stmt.order_by(Transaction.txn_at.desc(),Transaction.id.desc())
        .offset((page-1)*page_size)
        .limit(page_size)
    ).all()
    pages=max(1,(total+page_size-1)//page_size)

    return {
        "items":[serialize_tx(t) for t in items],
        "page":page,
        "page_size":page_size,
        "total":total,
        "pages":pages,
    }

def serialize_tx(t):
    return {
        "id":t.id,
        "txn_at":t.txn_at.isoformat(),
        "amount":float(t.amount),
        "direction":t.direction,
        "txn_type":t.txn_type,
        "merchant":t.merchant,
        "description":t.description_raw,
        "payment_method":t.payment_method,
        "verification_status":t.verification_status,
        "excluded":t.excluded_from_analytics,
        "account_id":t.account.id if t.account else None,
        "account":t.account.name if t.account else "Cash",
        "institution":t.account.institution if t.account else "Cash",
        "category":t.category.name if t.category else "Uncategorized",
        "category_source":t.category_source,
        "can_undo_category":bool(t.category_undo_available and t.category_source=="ai"),
        "user":(
            {"id":t.user.id,"name":t.user.name,"handle":f"@{t.user.handle}"}
            if t.user else None
        ),
        "sources":[{"type":src.source_type,"name":src.source_name} for src in t.sources],
    }

def _create_manual_transaction(
    *,
    user_id:int,
    amount:Decimal,
    direction:str,
    payment_method:str,
    category_name:str,
    txn_at:datetime,
    merchant:str|None,
    note:str|None,
    account_id:int|None,
    db:Session,
):
    category=db.scalar(
        select(Category).where(
            Category.user_id==user_id,
            func.lower(Category.name)==category_name.lower(),
        )
    )
    if not category:
        category=Category(user_id=user_id,name=category_name.strip())
        db.add(category)
        db.flush()

    if payment_method=="cash":
        account=db.scalar(
            select(Account).where(
                Account.user_id==user_id,
                Account.type=="cash",
            )
        )
        if not account:
            account=Account(
                user_id=user_id,
                name="Cash",
                institution="Cash",
                type="cash",
                is_active=True,
            )
            db.add(account)
            db.flush()
    else:
        if account_id is None:
            raise HTTPException(400,"Select the bank account used for this UPI transaction")
        account=db.get(Account,account_id)
        if not account or account.user_id!=user_id or account.type!="bank" or not account.is_active:
            raise HTTPException(400,"Select a valid active bank account for this UPI transaction")

    txn_type=(
        "income" if direction=="credit"
        else "investment" if category.name=="Investments"
        else "cash_expense" if payment_method=="cash"
        else "expense"
    )
    memo=(note or merchant or category.name).strip()
    fp=fingerprint(account.id,txn_at,amount,direction,memo)
    existing=db.scalar(
        select(Transaction)
        .join(TransactionSource,TransactionSource.transaction_id==Transaction.id)
        .where(
            Transaction.user_id==user_id,
            Transaction.account_id==account.id,
            Transaction.fingerprint==fp,
            Transaction.payment_method==payment_method,
            TransactionSource.source_type=="manual",
        )
        .limit(1)
    )
    if existing:
        return serialize_tx(existing)

    tx=Transaction(
        user_id=user_id,
        account_id=account.id,
        category_id=category.id,
        category_source="manual",
        category_previous_id=None,
        category_undo_available=False,
        txn_at=txn_at,
        amount=amount,
        direction=direction,
        txn_type=txn_type,
        payment_method=payment_method,
        merchant=(merchant or note or category.name).strip(),
        description_raw=note.strip() if note else None,
        fingerprint=fp,
        verification_status="manual",
    )
    source_name="Manual Cash Entry" if payment_method=="cash" else "Manual UPI Entry"
    tx.sources.append(TransactionSource(source_type="manual",source_name=source_name))
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return serialize_tx(tx)

@app.post("/api/transactions/manual")
def create_manual_transaction(body:ManualTransactionCreate, request:Request, db:Session=Depends(get_db)):
    user_id=current_user_id(request)
    return _create_manual_transaction(
        user_id=user_id,
        amount=body.amount,
        direction=body.direction,
        payment_method=body.payment_method,
        category_name=body.category,
        txn_at=body.txn_at,
        merchant=body.merchant,
        note=body.note,
        account_id=body.account_id,
        db=db,
    )

@app.post("/api/transactions/cash")
def create_cash(body:CashTransactionCreate, request:Request, db:Session=Depends(get_db)):
    # Backward-compatible endpoint used by older clients.
    user_id=current_user_id(request)
    return _create_manual_transaction(
        user_id=user_id,
        amount=body.amount,
        direction=body.direction,
        payment_method="cash",
        category_name=body.category,
        txn_at=body.txn_at,
        merchant=None,
        note=body.note,
        account_id=None,
        db=db,
    )

@app.patch("/api/transactions/{tx_id}")
def update_transaction(
    tx_id:int,
    body:TransactionUpdate,
    request:Request,
    db:Session=Depends(get_db),
):
    user_id=current_user_id(request)
    tx=db.get(Transaction,tx_id)
    if not tx or tx.user_id!=user_id:
        raise HTTPException(404,"Transaction not found")

    values=body.model_dump(exclude_unset=True)

    if "account_id" in values:
        account_id=values.pop("account_id")
        if account_id is None:
            tx.account_id=None
        else:
            account=db.get(Account,account_id)
            if not account or account.user_id!=user_id:
                raise HTTPException(404,"Account not found")
            tx.account_id=account.id

    if "category" in values:
        category_name=(values.pop("category") or "").strip()
        if category_name:
            category=db.scalar(select(Category).where(
                Category.user_id==user_id,
                func.lower(Category.name)==category_name.lower(),
            ))
            if not category:
                category=Category(user_id=user_id,name=category_name)
                db.add(category)
                db.flush()
            tx.category_id=category.id
        else:
            tx.category_id=None
        # Any category chosen through the normal editor is a manual decision.
        # AI categorization must never overwrite it and any prior AI undo state is cleared.
        tx.category_source="manual"
        tx.category_previous_id=None
        tx.category_undo_available=False

    old_type=tx.txn_type
    field_map={
        "txn_at":"txn_at",
        "amount":"amount",
        "direction":"direction",
        "merchant":"merchant",
        "description":"description_raw",
        "excluded":"excluded_from_analytics",
    }
    for key,attr in field_map.items():
        if key in values:
            setattr(tx,attr,values[key])

    if old_type in ("income","expense") and "direction" in values:
        tx.txn_type="income" if tx.direction=="credit" else "expense"

    tx.fingerprint=fingerprint(
        tx.account_id or 0,
        tx.txn_at,
        tx.amount,
        tx.direction,
        tx.description_raw or tx.merchant or tx.txn_type,
    )
    db.commit()
    db.refresh(tx)
    return serialize_tx(tx)

@app.delete("/api/transactions/{tx_id}")
def delete_transaction(tx_id:int, request:Request, db:Session=Depends(get_db)):
    user_id=current_user_id(request)
    tx=db.get(Transaction,tx_id)
    if not tx or tx.user_id!=user_id:
        raise HTTPException(404,"Transaction not found")
    db.delete(tx)
    db.commit()
    return {"ok":True}

@app.patch("/api/transactions/{tx_id}/exclude")
def exclude(tx_id:int, request:Request, db:Session=Depends(get_db)):
    user_id=current_user_id(request)
    tx=db.get(Transaction,tx_id)
    if not tx or tx.user_id!=user_id: raise HTTPException(404,"Transaction not found")
    tx.excluded_from_analytics=not tx.excluded_from_analytics; db.commit()
    return {"id":tx.id,"excluded":tx.excluded_from_analytics}

@app.get("/api/summary")
def summary(
    request:Request,
    from_date:date|None=None,
    to_date:date|None=None,
    family_scope:str="self",
    family_user_id:int|None=None,
    db:Session=Depends(get_db),
):
    transaction_user_ids=_scope_user_ids(request,db,family_scope,family_user_id,"transactions",True)
    debt_user_ids=_scope_user_ids(request,db,family_scope,family_user_id,"debts",True)
    investment_user_ids=_scope_user_ids(request,db,family_scope,family_user_id,"investments",True)

    items=db.scalars(
        _filtered_stmt(from_date,to_date,transaction_user_ids)
        .where(Transaction.excluded_from_analytics==False)
    ).all()
    new_income=sum((t.amount for t in items if t.direction=="credit" and t.txn_type!="internal_transfer"),Decimal("0"))
    spent=sum((t.amount for t in items if t.direction=="debit" and t.txn_type not in ("internal_transfer","investment")),Decimal("0"))

    opening_balance=Decimal("0")
    opening_cash_outflow=Decimal("0")
    if from_date is not None:
        opening_items=db.scalars(
            _filtered_stmt(None,from_date-timedelta(days=1),transaction_user_ids)
            .where(Transaction.excluded_from_analytics==False)
        ).all()
        opening_income=sum((t.amount for t in opening_items if t.direction=="credit" and t.txn_type!="internal_transfer"),Decimal("0"))
        opening_spent=sum((
            t.amount for t in opening_items
            if t.direction=="debit" and t.txn_type not in ("internal_transfer","investment")
        ),Decimal("0"))
        opening_cash_outflow=sum((
            t.amount for t in opening_items
            if t.direction=="debit" and t.txn_type!="internal_transfer"
        ),Decimal("0"))
        opening_balance=opening_income-opening_spent

    income=opening_balance+new_income
    current_cash_outflow=sum((
        t.amount for t in items
        if t.direction=="debit" and t.txn_type!="internal_transfer"
    ),Decimal("0"))
    liquid_balance=(opening_income if from_date is not None else Decimal("0"))-opening_cash_outflow+new_income-current_cash_outflow

    debt_rows=db.scalars(
        select(Debt).where(
            Debt.user_id.in_(debt_user_ids),
            Debt.status!="closed",
        )
    ).all()
    debt_outstanding=sum((d.outstanding_balance for d in debt_rows),Decimal("0"))

    investment_rows=db.scalars(
        select(InvestmentHolding).where(InvestmentHolding.user_id.in_(investment_user_ids))
    ).all()
    investment_value=sum((
        holding.current_value
        if holding.current_value is not None
        else holding.invested_amount
        for holding in investment_rows
    ),Decimal("0"))
    net_worth=liquid_balance+investment_value-debt_outstanding
    verified=sum(1 for t in items if t.verification_status=="verified")
    review=sum(1 for t in items if t.verification_status=="needs_review")
    cats=defaultdict(Decimal)
    for t in items:
        if t.direction=="debit" and t.txn_type not in ("internal_transfer","investment"):
            cats[t.category.name if t.category else "Uncategorized"] += t.amount
    anchor=to_date or datetime.now(INDIA_TZ).date()
    anchor=date(anchor.year,anchor.month,1)
    months=[]
    for offset in range(5,-1,-1):
        y=anchor.year
        m=anchor.month-offset
        while m<=0: y-=1; m+=12
        month_start=date(y,m,1)
        next_month=date(y+1,1,1) if m==12 else date(y,m+1,1)
        month_items=db.scalars(
            _filtered_stmt(
                month_start,
                next_month-timedelta(days=1),
                transaction_user_ids,
            ).where(Transaction.excluded_from_analytics==False)
        ).all()
        m_new_income=sum((t.amount for t in month_items if t.direction=="credit" and t.txn_type!="internal_transfer"),Decimal("0"))
        m_spent=sum((t.amount for t in month_items if t.direction=="debit" and t.txn_type not in ("internal_transfer","investment")),Decimal("0"))
        before_month=db.scalars(
            _filtered_stmt(None,month_start-timedelta(days=1),transaction_user_ids)
            .where(Transaction.excluded_from_analytics==False)
        ).all()
        m_opening_income=sum((t.amount for t in before_month if t.direction=="credit" and t.txn_type!="internal_transfer"),Decimal("0"))
        m_opening_spent=sum((
            t.amount for t in before_month
            if t.direction=="debit" and t.txn_type not in ("internal_transfer","investment")
        ),Decimal("0"))
        m_opening=m_opening_income-m_opening_spent
        months.append({
            "label":month_start.strftime("%b"),
            "opening_balance":float(m_opening),
            "new_income":float(m_new_income),
            "income":float(m_opening+m_new_income),
            "spent":float(m_spent),
        })
    family_items=db.scalars(
        _filtered_stmt(from_date,to_date,_scope_user_ids(request,db,"all",None,"transactions"))
        .where(Transaction.excluded_from_analytics==False)
    ).all()
    family_totals=defaultdict(Decimal)
    family_meta={}
    for t in family_items:
        if t.direction!="debit" or t.txn_type in ("internal_transfer","investment") or not t.user:
            continue
        key=f"user:{t.user.id}"
        family_meta[key]={
            "id":t.user.id,
            "handle":f"@{t.user.handle}",
            "name":t.user.name,
        }
        family_totals[key]+=t.amount

    family_spending=[
        {
            **family_meta[key],
            "amount":float(amount),
        }
        for key,amount in sorted(family_totals.items(),key=lambda x:x[1],reverse=True)
    ]

    return {
        "opening_balance":float(opening_balance),
        "new_income":float(new_income),
        "income":float(income),
        "spent":float(spent),
        "available":float(max(Decimal("0"),new_income-spent)),
        "liquid_balance":float(liquid_balance),
        "investment_value":float(investment_value),
        "debt_outstanding":float(debt_outstanding),
        "debt_count":len(debt_rows),
        "net_worth":float(net_worth),
        "verified":verified,
        "total":len(items),
        "needs_review":review,
        "categories":[{"name":k,"amount":float(v)} for k,v in sorted(cats.items(),key=lambda x:x[1],reverse=True)],
        "cashflow":months,
        "family_spending":family_spending,
    }

@app.post("/api/imports/preview")
async def preview(request:Request, account_id:int=Form(...), file:UploadFile=File(...), password:str|None=Form(None), db:Session=Depends(get_db)):
    user_id=current_user_id(request)
    account=db.get(Account,account_id)
    if not account or account.user_id!=user_id:
        raise HTTPException(404,"Account not found")
    content=await file.read(); file_hash=hashlib.sha256(content).hexdigest()
    existing_batch=db.scalar(select(ImportBatch).where(ImportBatch.account_id==account_id,ImportBatch.file_hash==file_hash))
    already_imported=False
    if existing_batch:
        existing_source=db.scalar(
            select(TransactionSource.id)
            .join(Transaction, TransactionSource.transaction_id==Transaction.id)
            .where(
                Transaction.account_id==account_id,
                TransactionSource.external_hash==file_hash,
            )
            .limit(1)
        )
        already_imported=bool(existing_source)
    try:
        rows=parse_statement(file.filename or "statement.csv",content,password)
    except ValueError as e:
        raise HTTPException(400,str(e))
    if not rows:
        raise HTTPException(
            400,
            "No transaction rows could be parsed from this statement. Check the bank CSV/XLSX headers and date/amount columns."
        )
    if already_imported:
        return {
            "already_imported":True,
            "batch_id":existing_batch.id,
            "detected":len(rows),
            "debits":sum(1 for row in rows if row["direction"]=="debit"),
            "credits":sum(1 for row in rows if row["direction"]=="credit"),
            "new":0,
            "existing":0,
            "matched":0,
            "review":0,
            "items":[],
        }
    classified=[]; counts={"new":0,"existing":0,"matched":0,"review":0}
    for row in rows:
        match,method,score=find_match(db,account_id=account_id,txn_at=row["txn_at"],amount=row["amount"],direction=row["direction"],description=row["description"],bank_ref=row.get("bank_ref"))
        state="new"
        if match and method in ("upi_ref","bank_ref","fingerprint"):
            state = "existing" if match.verification_status == "verified" else "matched"
        elif match:
            state="review"
        counts[state]+=1
        classified.append({**row,"amount":str(row["amount"]),"state":state,"match_id":match.id if match else None,"match_method":method,"score":score})
    token=str(uuid.uuid4())
    stored_items=[]
    for row in classified:
        stored_items.append({
            **row,
            "txn_at":row["txn_at"].isoformat(),
            "amount":str(row["amount"]),
        })
    db.add(ImportPreview(
        token=token,
        account_id=account_id,
        file_name=file.filename or "statement.csv",
        file_hash=file_hash,
        payload_json=json.dumps({
            "items":stored_items,
            "existing_batch_id":existing_batch.id if existing_batch else None,
        }),
    ))
    db.commit()
    debit_count=sum(1 for row in classified if row["direction"]=="debit")
    credit_count=sum(1 for row in classified if row["direction"]=="credit")
    return {
        "preview_token":token,
        "already_imported":False,
        "detected":len(rows),
        "debits":debit_count,
        "credits":credit_count,
        **counts,
        "items":classified[:100],
    }

@app.post("/api/imports/commit/{token}")
def commit(token:str, request:Request, db:Session=Depends(get_db)):
    user_id=current_user_id(request)
    preview_record=db.get(ImportPreview,token)
    if not preview_record:
        raise HTTPException(404,"Import preview not found. Upload the statement again.")
    account=db.get(Account,preview_record.account_id)
    if not account or account.user_id!=user_id:
        raise HTTPException(404,"Import preview not found")
    payload=json.loads(preview_record.payload_json)
    items=payload.get("items") or []
    if not items:
        raise HTTPException(400,"Cannot commit an empty import")

    data={
        "account_id":preview_record.account_id,
        "file_name":preview_record.file_name,
        "file_hash":preview_record.file_hash,
        "items":items,
        "existing_batch_id":payload.get("existing_batch_id"),
    }
    for row in data["items"]:
        row["txn_at"]=datetime.fromisoformat(row["txn_at"])

    batch=None
    if data.get("existing_batch_id"):
        batch=db.get(ImportBatch,data["existing_batch_id"])
    if batch:
        batch.file_name=data["file_name"]
        batch.status="committed"
        batch.imported_at=datetime.now(timezone.utc)
    else:
        batch=ImportBatch(account_id=data["account_id"],file_name=data["file_name"],file_hash=data["file_hash"],status="committed")
        db.add(batch)
    db.flush(); inserted=matched=review=0
    for row in data["items"]:
        amount=Decimal(row["amount"])
        if row["state"] in ("existing", "matched") and row["match_id"]:
            tx=db.get(Transaction,row["match_id"])
            if row["state"] == "matched":
                tx.verification_status="verified"
                matched+=1
            if not any(s.external_hash == data["file_hash"] for s in tx.sources):
                tx.sources.append(TransactionSource(source_type=data["file_name"].split(".")[-1].lower(),source_name=data["file_name"],external_hash=data["file_hash"]))
            continue
        if row["state"]=="review": review+=1; continue
        fp=fingerprint(data["account_id"],row["txn_at"],amount,row["direction"],row["description"])
        tx=Transaction(user_id=user_id,account_id=data["account_id"],txn_at=row["txn_at"],amount=amount,direction=row["direction"],txn_type="income" if row["direction"]=="credit" else "expense",description_raw=row["description"],merchant=row["description"][:160],bank_ref=row.get("bank_ref"),fingerprint=fp,verification_status="verified")
        tx.sources.append(TransactionSource(source_type=data["file_name"].split(".")[-1].lower(),source_name=data["file_name"],external_hash=data["file_hash"])); db.add(tx); inserted+=1
    db.delete(preview_record)
    db.commit()
    return {"inserted":inserted,"matched":matched,"review":review,"batch_id":batch.id}

@app.get("/api/ai/settings")
def get_ai_settings(request:Request, db:Session=Depends(get_db)):
    user_id=current_user_id(request)
    s=db.scalar(select(AISetting).where(AISetting.user_id==user_id))
    return _serialize_ai_settings(s)

@app.put("/api/ai/settings")
def save_ai_settings(body:AISettingsIn, request:Request, db:Session=Depends(get_db)):
    user_id=current_user_id(request)
    s=db.scalar(select(AISetting).where(AISetting.user_id==user_id))
    if not s:
        s=AISetting(id=user_id,user_id=user_id)
    s.provider=body.provider;s.base_url=body.base_url;s.model=body.model;s.context_limit=body.context_limit;s.temperature=Decimal(str(body.temperature));s.allow_amounts=body.allow_amounts;s.allow_merchants=body.allow_merchants;s.allow_categories=body.allow_categories;s.allow_dates=body.allow_dates;s.allow_balances=body.allow_balances;s.allow_notes=body.allow_notes
    if body.api_key: s.api_key_encrypted=encrypt(body.api_key)
    db.add(s);db.commit();return {"ok":True}

def _ai_history_item(row:AIConversation, include_response:bool=False):
    item={
        "id":row.id,
        "title":row.title,
        "question":row.question,
        "provider":row.provider,
        "model":row.model,
        "provider_user_id":row.provider_user_id,
        "family_scope":row.family_scope,
        "family_user_id":row.family_user_id,
        "from_date":row.period_from,
        "to_date":row.period_to,
        "created_at":row.created_at.isoformat() if row.created_at else None,
    }
    if include_response:
        item["response"]=row.response
    else:
        item["response_preview"]=(row.response[:180]+"…") if len(row.response)>180 else row.response
    return item

@app.get("/api/ai/capabilities")
def ai_capabilities(request:Request, db:Session=Depends(get_db)):
    return _serialize_ai_capabilities(db,current_user_id(request))

@app.get("/api/ai/history")
def ai_history(request:Request, limit:int=40, db:Session=Depends(get_db)):
    user_id=current_user_id(request)
    limit=max(1,min(limit,100))
    rows=db.scalars(
        select(AIConversation)
        .where(AIConversation.user_id==user_id)
        .order_by(AIConversation.created_at.desc())
        .limit(limit)
    ).all()
    return {"items":[_ai_history_item(row) for row in rows]}

@app.get("/api/ai/history/{history_id}")
def ai_history_detail(history_id:int, request:Request, db:Session=Depends(get_db)):
    user_id=current_user_id(request)
    row=db.get(AIConversation,history_id)
    if not row or row.user_id!=user_id:
        raise HTTPException(404,"AI history item not found")
    return _ai_history_item(row,True)

@app.delete("/api/ai/history/{history_id}")
def delete_ai_history(history_id:int, request:Request, db:Session=Depends(get_db)):
    user_id=current_user_id(request)
    row=db.get(AIConversation,history_id)
    if not row or row.user_id!=user_id:
        raise HTTPException(404,"AI history item not found")
    db.delete(row)
    db.commit()
    return {"ok":True}

@app.delete("/api/ai/history")
def clear_ai_history(request:Request, db:Session=Depends(get_db)):
    user_id=current_user_id(request)
    rows=db.scalars(select(AIConversation).where(AIConversation.user_id==user_id)).all()
    for row in rows:
        db.delete(row)
    db.commit()
    return {"ok":True,"deleted":len(rows)}

@app.post("/api/ai/ask")
async def ai_ask(body:AIQuestion, request:Request, db:Session=Depends(get_db)):
    user_id=current_user_id(request)

    if body.family_scope in ("family","all") and body.family_user_id is None:
        raise HTTPException(400,"Select Self or a specific family member for AI Insights")

    target_user_id=body.family_user_id
    if target_user_id is not None:
        require_family_ai_insights(db,user_id,target_user_id)
        data=summary(request,body.from_date,body.to_date,"all",target_user_id,db)
        debt_user_ids=scoped_family_user_ids(
            db,user_id,"all",target_user_id,"debts",True
        )
    else:
        data=summary(request,body.from_date,body.to_date,"self",None,db)
        debt_user_ids=[user_id]

    preferred_provider=body.provider_user_id
    if target_user_id is not None and preferred_provider not in (None,user_id,target_user_id):
        raise HTTPException(403,"Family-member AI data can only use your provider or that family member's shared provider")
    if target_user_id is not None and preferred_provider is None:
        own_setting=db.scalar(select(AISetting).where(AISetting.user_id==user_id))
        preferred_provider=user_id if own_setting and own_setting.provider and own_setting.model else target_user_id

    provider_user_id=resolve_ai_provider_user_id(
        db,user_id,"ai_insights",preferred_provider
    )
    provider_setting=db.scalar(select(AISetting).where(AISetting.user_id==provider_user_id))

    debts=db.scalars(
        select(Debt).where(Debt.user_id.in_(debt_user_ids),Debt.status=="active").order_by(Debt.created_at.desc())
    ).all()
    period_income=float(data["new_income"])
    period_spending=float(data["spent"])
    period_cash_flow=period_income-period_spending
    category_rows=[]
    for category in data["categories"][:10]:
        amount=float(category["amount"])
        category_rows.append({
            "name":category["name"],
            "amount":amount,
            "share_percent":round((amount/period_spending*100),1) if period_spending>0 else 0.0,
        })

    safe={
        "period":{
            "from":body.from_date.isoformat() if body.from_date else None,
            "to":body.to_date.isoformat() if body.to_date else None,
        },
        "period_income":period_income,
        "period_spending":period_spending,
        "period_cash_flow":period_cash_flow,
        "available":max(0.0,period_cash_flow),
        "overspent_by":max(0.0,-period_cash_flow),
        "opening_balance_reconstructed":float(data["opening_balance"]),
        "investment_value":float(data["investment_value"]),
        "estimated_net_worth":float(data["net_worth"]),
        "categories":category_rows,
        "debt":{
            "total_outstanding":float(sum((d.outstanding_balance for d in debts),Decimal("0"))),
            "loan_outstanding":float(sum((d.outstanding_balance for d in debts if d.debt_type!="credit_card"),Decimal("0"))),
            "credit_card_outstanding":float(sum((d.outstanding_balance for d in debts if d.debt_type=="credit_card"),Decimal("0"))),
            "monthly_loan_emi":float(sum(((d.emi_amount or Decimal("0")) for d in debts if d.debt_type!="credit_card"),Decimal("0"))),
            "monthly_card_minimum_due":float(sum(((d.emi_amount or Decimal("0")) for d in debts if d.debt_type=="credit_card"),Decimal("0"))),
            "monthly_commitments":float(sum((d.emi_amount or Decimal("0") for d in debts),Decimal("0"))),
            "items":[
                {
                    "lender":d.lender,
                    "type":d.debt_type,
                    "outstanding":float(d.outstanding_balance),
                    "interest_rate":float(d.interest_rate) if d.interest_rate is not None else None,
                    "monthly_commitment":float(d.emi_amount) if d.emi_amount is not None else None,
                    "monthly_commitment_type":"minimum_due" if d.debt_type=="credit_card" else "emi",
                    "next_due_date":d.next_due_date.date().isoformat() if d.next_due_date else None,
                }
                for d in debts[:20]
            ],
        },
        "data_notes":[
            "period_income contains only credit transactions recorded by Ledger inside the selected period; it may not represent all real-world income if imports are incomplete.",
            "opening_balance_reconstructed is historical ledger carry-forward and must not be described as current-period income.",
            "category totals describe recorded transactions and are not proof that a scheduled EMI or credit-card minimum due was paid, missed, late or partial.",
            "available is floored at zero; overspent_by carries any negative period cash-flow amount.",
        ],
    }
    try:
        answer=await ask_model(db,provider_user_id,body.question,safe)
    except Exception as e:
        raise HTTPException(400,str(e))

    title=" ".join(body.question.strip().split())
    if len(title)>80:
        title=title[:77].rstrip()+"..."
    history=AIConversation(
        user_id=user_id,
        provider_user_id=provider_user_id,
        title=title,
        question=body.question.strip(),
        response=answer,
        provider=provider_setting.provider if provider_setting else None,
        model=provider_setting.model if provider_setting else None,
        family_scope="family_member" if target_user_id is not None else "self",
        family_user_id=target_user_id,
        period_from=body.from_date.isoformat() if body.from_date else None,
        period_to=body.to_date.isoformat() if body.to_date else None,
    )
    db.add(history)
    db.commit()
    db.refresh(history)
    return {
        "answer":answer,
        "calculated":safe,
        "history_id":history.id,
        "provider_user_id":provider_user_id,
        "provider":provider_setting.provider if provider_setting else None,
        "model":provider_setting.model if provider_setting else None,
    }
