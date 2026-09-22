import csv
import io
import json
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from openpyxl import load_workbook
import xlrd

APP_LABELS = {
    "google_pay": "Google Pay",
    "phonepe": "PhonePe",
}

DATE_KEYS = [
    "date", "transaction date", "txn date", "timestamp", "time",
    "transaction time", "paid on", "created at", "completed at", "last updated time"
]
AMOUNT_KEYS = [
    "amount", "transaction amount", "txn amount", "amount paid",
    "total amount", "value", "total price"
]
DESC_KEYS = [
    "description", "merchant", "merchant name", "name", "payee", "payee name",
    "recipient", "recipient name", "paid to", "received from", "title",
    "counterparty", "transaction note", "note"
]
TYPE_KEYS = [
    "type", "direction", "transaction type", "txn type", "payment type",
    "flow", "debit credit", "dr cr"
]
STATUS_KEYS = ["status", "transaction status", "payment status", "state"]
REF_KEYS = [
    "upi transaction id", "upi txn id", "upi id", "upi rrn", "rrn", "utr",
    "transaction id", "txn id", "reference id", "reference", "ref no", "ref id"
]

SUCCESS_WORDS = {"success", "successful", "completed", "complete", "paid", "received"}
FAIL_WORDS = {"failed", "failure", "declined", "pending", "processing", "cancelled", "canceled", "expired", "reversed"}

def app_label(app: str) -> str:
    if app not in APP_LABELS:
        raise ValueError("Supported UPI apps are Google Pay and PhonePe")
    return APP_LABELS[app]

def _norm(value) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").strip().lower()).strip()

def _key(row, candidates):
    lookup = {_norm(k): k for k in row.keys() if k is not None}
    for candidate in candidates:
        key = _norm(candidate)
        if key in lookup:
            return lookup[key]
    return None

def _decimal(value):
    if value in (None, ""):
        return None
    raw = str(value).strip()
    negative = raw.startswith("(") and raw.endswith(")")
    cleaned = re.sub(r"[^0-9.\-]", "", raw)
    try:
        amount = Decimal(cleaned)
        return -amount if negative else amount
    except (InvalidOperation, ValueError):
        return None

def _date(value):
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time())

    raw = str(value or "").strip()
    if not raw:
        raise ValueError("Missing transaction date")

    iso_candidate = raw.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(iso_candidate)
    except ValueError:
        pass

    formats = (
        "%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%y",
        "%d-%b-%Y", "%d %b %Y", "%d-%b-%y", "%d %b %y",
        "%d/%m/%Y %H:%M:%S", "%d-%m-%Y %H:%M:%S",
        "%d/%m/%Y %H:%M", "%d-%m-%Y %H:%M",
        "%d %b %Y, %I:%M %p", "%d %b %Y %I:%M %p",
        "%b %d, %Y, %I:%M:%S %p", "%b %d, %Y %I:%M:%S %p",
        "%b %d, %Y, %I:%M %p", "%b %d, %Y %I:%M %p",
    )
    for fmt in formats:
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            pass
    raise ValueError(f"Unsupported transaction date: {raw}")

def _status_ok(value):
    raw = _norm(value)
    if not raw:
        return True
    tokens = set(raw.split())
    if tokens & FAIL_WORDS:
        return False
    if tokens & SUCCESS_WORDS:
        return True
    return True

def _direction(*values):
    raw = " ".join(_norm(v) for v in values if v not in (None, ""))
    if not raw:
        return None

    credit_phrases = (
        "received from", "money received", "received", "credit",
        "cashback", "refund", "refunded", "reward"
    )
    debit_phrases = (
        "paid to", "sent to", "money sent", "debit",
        "payment to", "paid", "sent", "purchase"
    )

    if any(phrase in raw for phrase in credit_phrases):
        return "credit"
    if any(phrase in raw for phrase in debit_phrases):
        return "debit"

    tokens = set(raw.split())
    if "cr" in tokens:
        return "credit"
    if "dr" in tokens:
        return "debit"
    return None

def _reference(value):
    raw = str(value or "").strip()
    if not raw:
        return None

    # Prefer UPI/UTR/RRN-like numeric references but keep non-numeric IDs too.
    match = re.search(r"(?<!\d)(\d{9,18})(?!\d)", raw)
    if match:
        return match.group(1)
    return raw[:80]

def _matrix_rows(matrix):
    if not matrix:
        return []

    aliases = {_norm(x) for x in DATE_KEYS + AMOUNT_KEYS + DESC_KEYS + REF_KEYS}
    header_index = None
    for index, values in enumerate(matrix[:40]):
        normalized = {_norm(v) for v in values if v not in (None, "")}
        date_hit = bool(normalized & {_norm(x) for x in DATE_KEYS})
        amount_hit = bool(normalized & {_norm(x) for x in AMOUNT_KEYS})
        useful_hits = len(normalized & aliases)
        if date_hit and amount_hit and useful_hits >= 2:
            header_index = index
            break

    if header_index is None:
        raise ValueError("Could not identify UPI transaction columns in this file")

    headers = [str(v).strip() if v is not None else "" for v in matrix[header_index]]
    return [
        dict(zip(headers, values))
        for values in matrix[header_index + 1:]
        if any(v not in (None, "") for v in values)
    ]

def _collect_json_rows(value):
    rows = []

    def walk(node):
        if isinstance(node, list):
            for item in node:
                walk(item)
            return
        if not isinstance(node, dict):
            return

        normalized = {_norm(k) for k in node.keys()}
        has_date = bool(normalized & {_norm(x) for x in DATE_KEYS})
        has_amount = bool(normalized & {_norm(x) for x in AMOUNT_KEYS})
        if has_date and has_amount:
            rows.append(node)

        for child in node.values():
            if isinstance(child, (dict, list)):
                walk(child)

    walk(value)
    return rows

def normalize_upi_rows(rows, app: str):
    label = app_label(app)
    out = []
    unresolved = 0

    for row in rows:
        date_key = _key(row, DATE_KEYS)
        amount_key = _key(row, AMOUNT_KEYS)
        desc_key = _key(row, DESC_KEYS)
        type_key = _key(row, TYPE_KEYS)
        status_key = _key(row, STATUS_KEYS)
        ref_key = _key(row, REF_KEYS)

        if not date_key or not amount_key:
            continue
        if status_key and not _status_ok(row.get(status_key)):
            continue

        try:
            txn_at = _date(row.get(date_key))
        except ValueError:
            continue

        raw_amount = _decimal(row.get(amount_key))
        if raw_amount is None or raw_amount == 0:
            continue

        description = str(row.get(desc_key) or "").strip() if desc_key else ""
        type_value = row.get(type_key) if type_key else ""
        direction = _direction(type_value, description)

        if direction is None:
            if raw_amount < 0:
                direction = "debit"
            elif str(row.get(amount_key) or "").strip().startswith("+"):
                direction = "credit"

        if direction is None:
            unresolved += 1
            continue

        reference = _reference(row.get(ref_key)) if ref_key else None
        if not reference:
            # Some exports place the UPI/UTR inside a description field.
            reference = _reference(description) if re.search(r"\b(?:upi|utr|rrn|ref)\b", description, re.I) else None

        merchant = description or label
        out.append({
            "txn_at": txn_at,
            "amount": abs(raw_amount),
            "direction": direction,
            "description": description or f"{label} transaction",
            "merchant": merchant[:160],
            "upi_ref": reference,
            "source_app": app,
            "source_label": label,
        })

    if unresolved and not out:
        raise ValueError(
            "Transactions were found, but Ledger could not determine whether they were sent or received. "
            "Use an export that includes transaction type/direction."
        )

    return out

def parse_upi_statement(app: str, name: str, content: bytes):
    app_label(app)
    lower = name.lower()

    if lower.endswith(".csv"):
        text = content.decode("utf-8-sig", errors="replace")
        matrix = list(csv.reader(io.StringIO(text)))
        return normalize_upi_rows(_matrix_rows(matrix), app)

    if lower.endswith(".xlsx"):
        wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        ws = wb.active
        matrix = list(ws.iter_rows(values_only=True))
        return normalize_upi_rows(_matrix_rows(matrix), app)

    if lower.endswith(".xls"):
        book = xlrd.open_workbook(file_contents=content)
        sheet = book.sheet_by_index(0)
        matrix = []
        for row_index in range(sheet.nrows):
            values = []
            for cell in sheet.row(row_index):
                if cell.ctype == xlrd.XL_CELL_DATE:
                    values.append(xlrd.xldate_as_datetime(cell.value, book.datemode))
                else:
                    values.append(cell.value)
            matrix.append(values)
        return normalize_upi_rows(_matrix_rows(matrix), app)

    if lower.endswith(".json"):
        try:
            payload = json.loads(content.decode("utf-8-sig", errors="replace"))
        except json.JSONDecodeError as exc:
            raise ValueError("Invalid JSON export") from exc
        return normalize_upi_rows(_collect_json_rows(payload), app)

    raise ValueError("UPI app import supports CSV, XLSX, XLS and JSON files")
