import csv
import hashlib
import io
import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

import openpyxl
import xlrd
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .models import InvestmentHolding
from .schemas import InvestmentCreate, InvestmentUpdate
from .users import current_user_id

router = APIRouter()

ALIASES = {
    "symbol": {
        "symbol","tradingsymbol","trading symbol","instrument","stock","scrip","security",
        "stock symbol","instrument name","security name","company","company name",
    },
    "name": {"name","company","company name","security name","instrument name"},
    "isin": {"isin","isin code"},
    "quantity": {"quantity","qty","qty.","net qty","net quantity","holding quantity","holdings qty"},
    "average_price": {
        "average price","avg price","avg. price","avg cost","avg. cost","average cost",
        "buy average","buy avg","avg buying price",
    },
    "invested_amount": {
        "invested amount","invested value","investment","cost value","cost","buy value",
        "total investment","invested",
    },
    "current_price": {
        "current price","ltp","last traded price","market price","last price","cmp",
    },
    "current_value": {
        "current value","cur val","cur. val","market value","value","holding value",
        "present value",
    },
}

def _norm(value) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"[_\-]+", " ", text)
    text = re.sub(r"[^a-z0-9. ]+", "", text)
    return re.sub(r"\s+", " ", text).strip()

def _decimal(value) -> Decimal | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() in {"na","n/a","-","--","none","null"}:
        return None
    text = text.replace("₹","").replace(",","").replace("%","").strip()
    text = re.sub(r"[^0-9.\-]", "", text)
    if not text or text in {"-",".","-."}:
        return None
    try:
        return Decimal(text)
    except InvalidOperation:
        return None

def _rows_from_csv(content: bytes):
    text = None
    for encoding in ("utf-8-sig","utf-8","cp1252"):
        try:
            text = content.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        raise ValueError("Could not decode CSV file")
    return [list(row) for row in csv.reader(io.StringIO(text))]

def _rows_from_xlsx(content: bytes):
    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True, read_only=True)
    rows = []
    for ws in wb.worksheets:
        sheet_rows = [list(r) for r in ws.iter_rows(values_only=True)]
        if sheet_rows:
            rows.extend(sheet_rows)
    return rows

def _rows_from_xls(content: bytes):
    book = xlrd.open_workbook(file_contents=content)
    rows = []
    for sheet in book.sheets():
        for r in range(sheet.nrows):
            rows.append(sheet.row_values(r))
    return rows

def _read_rows(filename: str, content: bytes):
    lower = filename.lower()
    if lower.endswith(".csv"):
        return _rows_from_csv(content)
    if lower.endswith(".xlsx"):
        return _rows_from_xlsx(content)
    if lower.endswith(".xls"):
        return _rows_from_xls(content)
    raise ValueError("Upload a CSV, XLSX or XLS holdings file")

def _header_map(row):
    normalized = [_norm(v) for v in row]
    mapping = {}
    for field, aliases in ALIASES.items():
        for idx, value in enumerate(normalized):
            if value in aliases:
                mapping[field] = idx
                break
    return mapping

def _cell(row, mapping, key):
    idx = mapping.get(key)
    if idx is None or idx >= len(row):
        return None
    return row[idx]

def parse_holdings(filename: str, content: bytes):
    rows = _read_rows(filename, content)
    if not rows:
        raise ValueError("Investment file is empty")

    header_index = None
    mapping = None
    for idx, row in enumerate(rows[:40]):
        candidate = _header_map(row)
        if "symbol" in candidate and (
            "quantity" in candidate
            or "invested_amount" in candidate
            or "current_value" in candidate
        ):
            header_index = idx
            mapping = candidate
            break

    if header_index is None or mapping is None:
        raise ValueError(
            "Could not find a supported holdings table. Export holdings from Groww/Zerodha as CSV, XLSX or XLS."
        )

    parsed = []
    for row in rows[header_index + 1:]:
        symbol_raw = _cell(row, mapping, "symbol")
        symbol = str(symbol_raw or "").strip()
        if not symbol:
            continue
        if _norm(symbol) in {"total","grand total","summary"}:
            continue

        quantity = _decimal(_cell(row, mapping, "quantity")) or Decimal("0")
        avg_price = _decimal(_cell(row, mapping, "average_price"))
        invested = _decimal(_cell(row, mapping, "invested_amount"))
        current_price = _decimal(_cell(row, mapping, "current_price"))
        current_value = _decimal(_cell(row, mapping, "current_value"))

        if invested is None and quantity and avg_price is not None:
            invested = quantity * avg_price
        if current_value is None and quantity and current_price is not None:
            current_value = quantity * current_price

        if (
            quantity == 0
            and (invested is None or invested == 0)
            and (current_value is None or current_value == 0)
        ):
            continue

        parsed.append({
            "symbol": symbol[:80],
            "name": (str(_cell(row, mapping, "name") or "").strip() or None),
            "isin": (str(_cell(row, mapping, "isin") or "").strip() or None),
            "quantity": quantity,
            "average_price": avg_price,
            "invested_amount": invested or Decimal("0"),
            "current_price": current_price,
            "current_value": current_value,
        })

    if not parsed:
        raise ValueError("No investment holdings were found in this file")
    return parsed

def _serialize(row: InvestmentHolding):
    current = row.current_value
    pnl = (current - row.invested_amount) if current is not None else None
    return {
        "id": row.id,
        "platform": row.platform,
        "asset_type": row.asset_type,
        "symbol": row.symbol,
        "name": row.name,
        "isin": row.isin,
        "quantity": float(row.quantity),
        "average_price": float(row.average_price) if row.average_price is not None else None,
        "invested_amount": float(row.invested_amount),
        "current_price": float(row.current_price) if row.current_price is not None else None,
        "current_value": float(current) if current is not None else None,
        "pnl": float(pnl) if pnl is not None else None,
        "as_of_date": row.as_of_date.isoformat() if row.as_of_date else None,
        "source_type": row.source_type,
        "source_file_name": row.source_file_name,
    }

@router.get("/api/investments")
def list_investments(request: Request, db: Session = Depends(get_db)):
    user_id = current_user_id(request)
    items = db.scalars(
        select(InvestmentHolding)
        .where(InvestmentHolding.user_id == user_id)
        .order_by(InvestmentHolding.platform, InvestmentHolding.symbol)
    ).all()
    invested = sum((x.invested_amount for x in items), Decimal("0"))
    current = sum(
        (x.current_value if x.current_value is not None else x.invested_amount for x in items),
        Decimal("0"),
    )
    return {
        "items": [_serialize(x) for x in items],
        "invested_amount": float(invested),
        "current_value": float(current),
        "pnl": float(current - invested),
        "count": len(items),
    }

@router.post("/api/investments")
def create_investment(
    body: InvestmentCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    symbol = body.symbol.strip().upper()
    platform = body.platform.strip()
    existing = db.scalar(
        select(InvestmentHolding).where(
            InvestmentHolding.user_id == user_id,
            InvestmentHolding.platform == platform,
            InvestmentHolding.symbol == symbol,
        )
    )
    if existing:
        raise HTTPException(409, "This investment already exists for that platform")

    invested = body.invested_amount
    if invested == 0 and body.quantity and body.average_price is not None:
        invested = body.quantity * body.average_price
    current_value = body.current_value
    if current_value is None and body.quantity and body.current_price is not None:
        current_value = body.quantity * body.current_price

    row = InvestmentHolding(
        user_id=user_id,
        platform=platform,
        asset_type=body.asset_type.strip(),
        symbol=symbol,
        name=body.name.strip() if body.name else None,
        isin=body.isin.strip().upper() if body.isin else None,
        quantity=body.quantity,
        average_price=body.average_price,
        invested_amount=invested,
        current_price=body.current_price,
        current_value=current_value,
        as_of_date=body.as_of_date or datetime.now(timezone.utc),
        source_type="manual",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _serialize(row)

@router.patch("/api/investments/{holding_id}")
def update_investment(
    holding_id: int,
    body: InvestmentUpdate,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    row = db.get(InvestmentHolding, holding_id)
    if not row or row.user_id != user_id:
        raise HTTPException(404, "Investment not found")
    values = body.model_dump(exclude_unset=True)
    if "symbol" in values and values["symbol"]:
        values["symbol"] = values["symbol"].strip().upper()
    if "platform" in values and values["platform"]:
        values["platform"] = values["platform"].strip()
    for key, value in values.items():
        setattr(row, key, value)
    if "invested_amount" not in values and ("quantity" in values or "average_price" in values):
        if row.average_price is not None:
            row.invested_amount = row.quantity * row.average_price
    if "current_value" not in values and ("quantity" in values or "current_price" in values):
        if row.current_price is not None:
            row.current_value = row.quantity * row.current_price
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _serialize(row)

@router.delete("/api/investments/{holding_id}")
def delete_investment(
    holding_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    row = db.get(InvestmentHolding, holding_id)
    if not row or row.user_id != user_id:
        raise HTTPException(404, "Investment not found")
    db.delete(row)
    db.commit()
    return {"ok": True}

@router.post("/api/investments/import/preview")
async def preview_investments(
    request: Request,
    platform: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    current_user_id(request)
    content = await file.read()
    try:
        rows = parse_holdings(file.filename or "holdings.csv", content)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    invested = sum((x["invested_amount"] for x in rows), Decimal("0"))
    current = sum(
        (x["current_value"] if x["current_value"] is not None else x["invested_amount"] for x in rows),
        Decimal("0"),
    )
    return {
        "platform": platform.strip(),
        "file_name": file.filename,
        "file_hash": hashlib.sha256(content).hexdigest(),
        "detected": len(rows),
        "invested_amount": float(invested),
        "current_value": float(current),
        "pnl": float(current - invested),
        "items": [
            {
                **x,
                "quantity": float(x["quantity"]),
                "average_price": float(x["average_price"]) if x["average_price"] is not None else None,
                "invested_amount": float(x["invested_amount"]),
                "current_price": float(x["current_price"]) if x["current_price"] is not None else None,
                "current_value": float(x["current_value"]) if x["current_value"] is not None else None,
            }
            for x in rows[:100]
        ],
    }

@router.post("/api/investments/import/commit")
async def commit_investments(
    request: Request,
    platform: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    content = await file.read()
    try:
        rows = parse_holdings(file.filename or "holdings.csv", content)
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    platform_name = platform.strip() or "Other"
    inserted = 0
    updated = 0
    now = datetime.now(timezone.utc)

    for item in rows:
        symbol = item["symbol"].upper()
        row = db.scalar(
            select(InvestmentHolding).where(
                InvestmentHolding.user_id == user_id,
                InvestmentHolding.platform == platform_name,
                InvestmentHolding.symbol == symbol,
            )
        )
        if row:
            updated += 1
        else:
            row = InvestmentHolding(
                user_id=user_id,
                platform=platform_name,
                symbol=symbol,
            )
            db.add(row)
            inserted += 1

        row.asset_type = "equity"
        row.name = item["name"]
        row.isin = item["isin"]
        row.quantity = item["quantity"]
        row.average_price = item["average_price"]
        row.invested_amount = item["invested_amount"]
        row.current_price = item["current_price"]
        row.current_value = item["current_value"]
        row.as_of_date = now
        row.source_type = "broker_import"
        row.source_file_name = file.filename or "holdings"

    db.commit()
    return {
        "platform": platform_name,
        "detected": len(rows),
        "inserted": inserted,
        "updated": updated,
    }
