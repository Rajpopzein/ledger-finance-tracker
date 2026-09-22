import csv, io, re
from datetime import datetime
from decimal import Decimal, InvalidOperation
from openpyxl import load_workbook

DATE_KEYS = ["date", "transaction date", "txn date", "value date"]
DESC_KEYS = ["description", "narration", "details", "transaction remarks", "remarks"]
DEBIT_KEYS = ["debit", "withdrawal", "withdrawal amt", "debit amount"]
CREDIT_KEYS = ["credit", "deposit", "deposit amt", "credit amount"]
AMOUNT_KEYS = ["amount", "transaction amount"]
TYPE_KEYS = ["type", "dr/cr", "transaction type"]
REF_KEYS = ["reference", "ref no", "utr", "transaction id", "chq/ref no"]

def _key(row, candidates):
    lookup = {str(k).strip().lower(): k for k in row.keys() if k is not None}
    for c in candidates:
        if c in lookup: return lookup[c]
    return None

def _decimal(v):
    if v in (None, ""): return Decimal("0")
    s = re.sub(r"[^0-9.\-]", "", str(v))
    try: return Decimal(s or "0")
    except InvalidOperation: return Decimal("0")

def _date(v):
    if isinstance(v, datetime): return v
    raw = str(v).strip()
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%y", "%d-%b-%Y", "%d %b %Y"):
        try: return datetime.strptime(raw, fmt)
        except ValueError: pass
    raise ValueError(f"Unsupported date: {raw}")

def normalize_rows(rows):
    out=[]
    for row in rows:
        dk=_key(row, DATE_KEYS); desc=_key(row, DESC_KEYS); debit=_key(row, DEBIT_KEYS); credit=_key(row, CREDIT_KEYS); amountk=_key(row, AMOUNT_KEYS); typek=_key(row, TYPE_KEYS); refk=_key(row, REF_KEYS)
        if not dk or not desc: continue
        debit_amt=_decimal(row.get(debit)) if debit else Decimal("0")
        credit_amt=_decimal(row.get(credit)) if credit else Decimal("0")
        if debit or credit:
            if debit_amt > 0: amount, direction = debit_amt, "debit"
            elif credit_amt > 0: amount, direction = credit_amt, "credit"
            else: continue
        elif amountk:
            amount=abs(_decimal(row.get(amountk)))
            t=str(row.get(typek, "")).lower() if typek else ""
            direction="credit" if "cr" in t or "credit" in t else "debit"
        else: continue
        try: txn_at=_date(row.get(dk))
        except Exception: continue
        description=str(row.get(desc) or "").strip()
        ref=str(row.get(refk) or "").strip() if refk else None
        out.append({"txn_at":txn_at,"amount":amount,"direction":direction,"description":description,"bank_ref":ref or None})
    return out

def parse_statement(name: str, content: bytes):
    lower=name.lower()
    if lower.endswith(".csv"):
        text=content.decode("utf-8-sig", errors="replace")
        return normalize_rows(list(csv.DictReader(io.StringIO(text))))
    if lower.endswith(".xlsx"):
        wb=load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        ws=wb.active
        values=list(ws.iter_rows(values_only=True))
        if not values: return []
        headers=[str(x).strip() if x is not None else "" for x in values[0]]
        rows=[dict(zip(headers,row)) for row in values[1:]]
        return normalize_rows(rows)
    raise ValueError("Only CSV and XLSX are enabled in v1")
