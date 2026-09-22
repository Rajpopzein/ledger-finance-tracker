import hashlib, uuid
from collections import defaultdict
from datetime import datetime, timezone, date, time, timedelta
from decimal import Decimal
from urllib.parse import urlparse

from fastapi import FastAPI, Depends, File, Form, HTTPException, UploadFile, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import settings
from .db import Base, engine, get_db
from .models import Account, Category, Transaction, TransactionSource, ImportBatch, AISetting, Owner
from .schemas import AccountCreate, CashTransactionCreate, AISettingsIn, AIQuestion, OwnerSetup, OwnerLogin
from .services.dedupe import fingerprint, find_match
from .services.importer import parse_statement
from .services.secrets import encrypt
from .services.ai import ask_model
from .services.auth import (
    SESSION_COOKIE,
    SESSION_MAX_AGE,
    hash_password,
    verify_password,
    create_session,
    read_session,
)

app = FastAPI(title="Ledger v1 API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[x.strip() for x in settings.cors_origins.split(",") if x.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
PREVIEWS = {}

PUBLIC_API_PATHS = {
    "/api/health",
    "/api/auth/status",
    "/api/auth/setup",
    "/api/auth/login",
    "/api/auth/logout",
}

def _origin_allowed(request: Request, origin: str) -> bool:
    try:
        if urlparse(origin).netloc == request.headers.get("host", ""):
            return True
    except Exception:
        return False
    configured = {x.strip().rstrip("/") for x in settings.cors_origins.split(",") if x.strip()}
    return origin.rstrip("/") in configured

@app.middleware("http")
async def auth_guard(request: Request, call_next):
    path = request.url.path
    if request.method == "OPTIONS" or not path.startswith("/api/") or path in PUBLIC_API_PATHS:
        return await call_next(request)

    owner_id = read_session(request.cookies.get(SESSION_COOKIE))
    if owner_id != 1:
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

def _set_session_cookie(response: Response, request: Request, token: str):
    forwarded = request.headers.get("x-forwarded-proto", "").split(",")[0].strip()
    secure = request.url.scheme == "https" or forwarded == "https"
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )

@app.get("/api/auth/status")
def auth_status(request: Request, db: Session = Depends(get_db)):
    owner = db.get(Owner, 1)
    session_owner = read_session(request.cookies.get(SESSION_COOKIE))
    return {
        "setup_required": owner is None,
        "authenticated": owner is not None and session_owner == owner.id,
        "email": owner.email if owner is not None and session_owner == owner.id else None,
    }

@app.post("/api/auth/setup")
def auth_setup(body: OwnerSetup, request: Request, response: Response, db: Session = Depends(get_db)):
    if db.get(Owner, 1) is not None:
        raise HTTPException(409, "Owner account is already configured")

    email = str(body.email).strip().lower()
    salt, password_hash = hash_password(body.password)
    token = create_session(1)
    owner = Owner(id=1, email=email, password_salt=salt, password_hash=password_hash)
    db.add(owner)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Owner account is already configured")

    _set_session_cookie(response, request, token)
    return {"ok": True, "email": email}

@app.post("/api/auth/login")
def auth_login(body: OwnerLogin, request: Request, response: Response, db: Session = Depends(get_db)):
    email = str(body.email).strip().lower()
    owner = db.scalar(select(Owner).where(func.lower(Owner.email) == email))
    if owner is None or not verify_password(body.password, owner.password_salt, owner.password_hash):
        raise HTTPException(401, "Invalid email or password")

    _set_session_cookie(response, request, create_session(owner.id))
    return {"ok": True, "email": owner.email}

@app.post("/api/auth/logout")
def auth_logout(response: Response):
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}

@app.get("/api/accounts")
def accounts(db:Session=Depends(get_db)):
    return [{"id":a.id,"name":a.name,"institution":a.institution,"mask":a.account_mask,"type":a.type} for a in db.scalars(select(Account).where(Account.is_active==True).order_by(Account.id)).all()]

@app.post("/api/accounts")
def create_account(body:AccountCreate, db:Session=Depends(get_db)):
    institution=body.institution.strip()
    mask=(body.account_mask or "").strip() or None
    existing=db.scalar(select(Account).where(func.lower(Account.institution)==institution.lower(), Account.account_mask==mask, Account.type==body.type))
    if existing:
        return {"id":existing.id,"name":existing.name,"institution":existing.institution,"mask":existing.account_mask,"type":existing.type}
    display=body.name.strip() if body.name and body.name.strip() else f"{institution}{' ••'+mask[-4:] if mask else ''}"
    account=Account(name=display,institution=institution,account_mask=mask,type=body.type,is_active=True)
    db.add(account); db.commit(); db.refresh(account)
    return {"id":account.id,"name":account.name,"institution":account.institution,"mask":account.account_mask,"type":account.type}

DEFAULT_CATEGORIES=["Food & Dining","Fuel","Groceries","EMI & Loans","Shopping","Bills & Subscriptions","Travel","Health","Payroll","Investments","Other"]

@app.get("/api/categories")
def categories(db:Session=Depends(get_db)):
    existing={c.name:c.id for c in db.scalars(select(Category).order_by(Category.name)).all()}
    return [{"id":existing.get(name),"name":name} for name in DEFAULT_CATEGORIES] + [{"id":cid,"name":name} for name,cid in existing.items() if name not in DEFAULT_CATEGORIES]

def _bounds(from_date:date|None,to_date:date|None):
    start=datetime.combine(from_date,time.min,tzinfo=timezone.utc) if from_date else None
    end=datetime.combine(to_date + timedelta(days=1),time.min,tzinfo=timezone.utc) if to_date else None
    return start,end

def _filtered_stmt(from_date:date|None,to_date:date|None):
    stmt=select(Transaction)
    start,end=_bounds(from_date,to_date)
    if start is not None: stmt=stmt.where(Transaction.txn_at>=start)
    if end is not None: stmt=stmt.where(Transaction.txn_at<end)
    return stmt

@app.get("/api/transactions")
def transactions(q:str|None=None, status:str|None=None, from_date:date|None=None, to_date:date|None=None, db:Session=Depends(get_db)):
    stmt=_filtered_stmt(from_date,to_date).order_by(Transaction.txn_at.desc()).limit(500)
    items=db.scalars(stmt).all()
    if q:
        needle=q.lower(); items=[t for t in items if needle in (t.merchant or "").lower() or needle in (t.description_raw or "").lower() or needle in (t.bank_ref or "").lower() or needle in (t.upi_ref or "").lower()]
    if status: items=[t for t in items if t.verification_status==status]
    return [serialize_tx(t) for t in items]

def serialize_tx(t):
    return {"id":t.id,"txn_at":t.txn_at.isoformat(),"amount":float(t.amount),"direction":t.direction,"txn_type":t.txn_type,"merchant":t.merchant,"description":t.description_raw,"payment_method":t.payment_method,"verification_status":t.verification_status,"excluded":t.excluded_from_analytics,"account":t.account.name if t.account else "Cash","category":t.category.name if t.category else "Uncategorized","sources":[{"type":src.source_type,"name":src.source_name} for src in t.sources]}

@app.post("/api/transactions/cash")
def create_cash(body:CashTransactionCreate, db:Session=Depends(get_db)):
    category=db.scalar(select(Category).where(func.lower(Category.name)==body.category.lower()))
    if not category:
        category=Category(name=body.category); db.add(category); db.flush()
    cash=db.scalar(select(Account).where(Account.type=="cash"))
    if not cash:
        cash=Account(name="Cash",institution="Cash",type="cash",is_active=True)
        db.add(cash); db.flush()
    fp=fingerprint(cash.id, body.txn_at, body.amount, "debit", body.note or body.category)
    tx=Transaction(account_id=cash.id,category_id=category.id,txn_at=body.txn_at,amount=body.amount,direction="debit",txn_type="cash_expense",payment_method="cash",merchant=body.note or body.category,description_raw=body.note,fingerprint=fp,verification_status="manual")
    tx.sources.append(TransactionSource(source_type="manual",source_name="Manual Cash Entry"))
    db.add(tx); db.commit(); db.refresh(tx)
    return serialize_tx(tx)

@app.patch("/api/transactions/{tx_id}/exclude")
def exclude(tx_id:int, db:Session=Depends(get_db)):
    tx=db.get(Transaction,tx_id)
    if not tx: raise HTTPException(404,"Transaction not found")
    tx.excluded_from_analytics=not tx.excluded_from_analytics; db.commit()
    return {"id":tx.id,"excluded":tx.excluded_from_analytics}

@app.get("/api/summary")
def summary(from_date:date|None=None, to_date:date|None=None, db:Session=Depends(get_db)):
    items=db.scalars(_filtered_stmt(from_date,to_date).where(Transaction.excluded_from_analytics==False)).all()
    income=sum((t.amount for t in items if t.direction=="credit" and t.txn_type!="internal_transfer"),Decimal("0"))
    spent=sum((t.amount for t in items if t.direction=="debit" and t.txn_type not in ("internal_transfer","investment")),Decimal("0"))
    verified=sum(1 for t in items if t.verification_status=="verified")
    review=sum(1 for t in items if t.verification_status=="needs_review")
    cats=defaultdict(Decimal)
    for t in items:
        if t.direction=="debit" and t.txn_type not in ("internal_transfer","investment"):
            cats[t.category.name if t.category else "Uncategorized"] += t.amount
    anchor=to_date or date.today()
    anchor=date(anchor.year,anchor.month,1)
    months=[]
    for offset in range(5,-1,-1):
        y=anchor.year
        m=anchor.month-offset
        while m<=0: y-=1; m+=12
        month_start=date(y,m,1)
        next_month=date(y+1,1,1) if m==12 else date(y,m+1,1)
        month_items=db.scalars(_filtered_stmt(month_start,next_month-timedelta(days=1)).where(Transaction.excluded_from_analytics==False)).all()
        m_income=sum((t.amount for t in month_items if t.direction=="credit" and t.txn_type!="internal_transfer"),Decimal("0"))
        m_spent=sum((t.amount for t in month_items if t.direction=="debit" and t.txn_type not in ("internal_transfer","investment")),Decimal("0"))
        months.append({"label":month_start.strftime("%b"),"income":float(m_income),"spent":float(m_spent)})
    return {"income":float(income),"spent":float(spent),"available":float(income-spent),"verified":verified,"total":len(items),"needs_review":review,"categories":[{"name":k,"amount":float(v)} for k,v in sorted(cats.items(),key=lambda x:x[1],reverse=True)],"cashflow":months}

@app.post("/api/imports/preview")
async def preview(account_id:int=Form(...), file:UploadFile=File(...), db:Session=Depends(get_db)):
    content=await file.read(); file_hash=hashlib.sha256(content).hexdigest()
    existing_batch=db.scalar(select(ImportBatch).where(ImportBatch.account_id==account_id,ImportBatch.file_hash==file_hash))
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
        if existing_source:
            return {"already_imported":True,"batch_id":existing_batch.id,"new":0,"existing":0,"matched":0,"review":0,"items":[]}
    try:
        rows=parse_statement(file.filename or "statement.csv",content)
    except ValueError as e:
        raise HTTPException(400,str(e))
    if not rows:
        raise HTTPException(
            400,
            "No transaction rows could be parsed from this statement. Check the bank CSV/XLSX headers and date/amount columns."
        )
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
    PREVIEWS[token]={
        "account_id":account_id,
        "file_name":file.filename,
        "file_hash":file_hash,
        "items":classified,
        "existing_batch_id":existing_batch.id if existing_batch else None,
    }
    return {"preview_token":token,"already_imported":False,"detected":len(rows),**counts,"items":classified[:100]}

@app.post("/api/imports/commit/{token}")
def commit(token:str, db:Session=Depends(get_db)):
    data=PREVIEWS.pop(token,None)
    if not data: raise HTTPException(404,"Preview expired")
    if not data["items"]:
        raise HTTPException(400,"Cannot commit an empty import")
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
        tx=Transaction(account_id=data["account_id"],txn_at=row["txn_at"],amount=amount,direction=row["direction"],txn_type="income" if row["direction"]=="credit" else "expense",description_raw=row["description"],merchant=row["description"][:160],bank_ref=row.get("bank_ref"),fingerprint=fp,verification_status="verified")
        tx.sources.append(TransactionSource(source_type=data["file_name"].split(".")[-1].lower(),source_name=data["file_name"],external_hash=data["file_hash"])); db.add(tx); inserted+=1
    db.commit(); return {"inserted":inserted,"matched":matched,"review":review,"batch_id":batch.id}

@app.get("/api/ai/settings")
def get_ai_settings(db:Session=Depends(get_db)):
    s=db.get(AISetting,1)
    if not s: return {"provider":None,"status":"not_configured"}
    return {"provider":s.provider,"base_url":s.base_url,"model":s.model,"context_limit":s.context_limit,"temperature":float(s.temperature),"allow_amounts":s.allow_amounts,"allow_merchants":s.allow_merchants,"allow_categories":s.allow_categories,"allow_dates":s.allow_dates,"allow_balances":s.allow_balances,"allow_notes":s.allow_notes,"has_api_key":bool(s.api_key_encrypted),"status":"configured" if s.provider and s.model else "not_configured"}

@app.put("/api/ai/settings")
def save_ai_settings(body:AISettingsIn, db:Session=Depends(get_db)):
    s=db.get(AISetting,1) or AISetting(id=1)
    s.provider=body.provider;s.base_url=body.base_url;s.model=body.model;s.context_limit=body.context_limit;s.temperature=Decimal(str(body.temperature));s.allow_amounts=body.allow_amounts;s.allow_merchants=body.allow_merchants;s.allow_categories=body.allow_categories;s.allow_dates=body.allow_dates;s.allow_balances=body.allow_balances;s.allow_notes=body.allow_notes
    if body.api_key: s.api_key_encrypted=encrypt(body.api_key)
    db.add(s);db.commit();return {"ok":True}

@app.post("/api/ai/ask")
async def ai_ask(body:AIQuestion, db:Session=Depends(get_db)):
    data=summary(body.from_date, body.to_date, db)
    safe={"income":data["income"],"spent":data["spent"],"available":data["available"],"categories":data["categories"][:10]}
    try: answer=await ask_model(db,body.question,safe)
    except Exception as e: raise HTTPException(400,str(e))
    return {"answer":answer,"calculated":safe}
