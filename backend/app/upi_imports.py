import hashlib
from datetime import timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, Request
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .db import get_db
from .models import Account, ImportBatch, Transaction, TransactionSource
from .services.dedupe import fingerprint, find_match
from .services.upi_importer import app_label, parse_upi_statement
from .users import current_user_id

router = APIRouter()

def _source_type():
    return "upi_app"

def _existing_file_source(db: Session, account_id: int, file_hash: str, label: str):
    return db.scalar(
        select(TransactionSource.id)
        .join(Transaction, TransactionSource.transaction_id == Transaction.id)
        .where(
            Transaction.account_id == account_id,
            TransactionSource.source_type == _source_type(),
            TransactionSource.source_name == label,
            TransactionSource.external_hash == file_hash,
        )
        .limit(1)
    )

def _classify(db: Session, account_id: int, row):
    upi_ref = row.get("upi_ref")

    if upi_ref:
        ref_text = str(upi_ref).strip()
        ref_conditions = [
            Transaction.upi_ref == ref_text,
            Transaction.bank_ref == ref_text,
        ]
        if ref_text.isdigit() and len(ref_text) >= 9:
            ref_prefix = ref_text[:9]
            ref_conditions.extend([
                Transaction.upi_ref.contains(ref_prefix),
                Transaction.bank_ref.contains(ref_prefix),
            ])

        exact = db.scalar(
            select(Transaction).where(
                Transaction.account_id == account_id,
                or_(*ref_conditions),
            )
        )
        if exact:
            return exact, "upi_ref", 1.0, "existing"

    match, method, score = find_match(
        db,
        account_id=account_id,
        txn_at=row["txn_at"],
        amount=row["amount"],
        direction=row["direction"],
        description=row["description"],
        upi_ref=upi_ref,
        bank_ref=upi_ref,
    )
    if match and method in ("upi_ref", "bank_ref", "fingerprint"):
        return match, method, score, "existing"
    if match:
        return match, method, score, "review"

    # A unique same-day amount/direction hit is useful evidence, but not safe
    # enough to merge automatically when the descriptions differ.
    start = row["txn_at"] - timedelta(days=1)
    end = row["txn_at"] + timedelta(days=1)
    candidates = db.scalars(
        select(Transaction).where(
            Transaction.account_id == account_id,
            Transaction.amount == row["amount"],
            Transaction.direction == row["direction"],
            Transaction.txn_at >= start,
            Transaction.txn_at <= end,
        )
    ).all()
    if candidates:
        return candidates[0], "amount_date", 0.7, "review"

    return None, "new", 0.0, "new"

def _parse(app: str, file: UploadFile, content: bytes):
    try:
        label = app_label(app)
        rows = parse_upi_statement(app, file.filename or "upi-export.csv", content)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    if not rows:
        raise HTTPException(400, "No successful UPI transactions could be parsed from this export")
    return label, rows

@router.post("/api/imports/upi/preview")
async def preview_upi(
    request: Request,
    account_id: int = Form(...),
    app: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    account = db.get(Account, account_id)
    if not account or account.user_id != user_id:
        raise HTTPException(404, "Account not found")
    content = await file.read()
    file_hash = hashlib.sha256(content).hexdigest()
    label, rows = _parse(app, file, content)

    if _existing_file_source(db, account_id, file_hash, label):
        return {
            "already_imported": True,
            "app": label,
            "detected": len(rows),
            "new": 0,
            "existing": len(rows),
            "review": 0,
            "debits": sum(1 for row in rows if row["direction"] == "debit"),
            "credits": sum(1 for row in rows if row["direction"] == "credit"),
            "items": [],
        }

    counts = {"new": 0, "existing": 0, "review": 0}
    items = []
    for row in rows:
        match, method, score, state = _classify(db, account_id, row)
        counts[state] += 1
        items.append({
            "txn_at": row["txn_at"].isoformat(),
            "amount": float(row["amount"]),
            "direction": row["direction"],
            "merchant": row["merchant"],
            "upi_ref": row.get("upi_ref"),
            "state": state,
            "match_id": match.id if match else None,
            "match_method": method,
            "score": score,
        })

    return {
        "already_imported": False,
        "app": label,
        "detected": len(rows),
        "debits": sum(1 for row in rows if row["direction"] == "debit"),
        "credits": sum(1 for row in rows if row["direction"] == "credit"),
        **counts,
        "items": items[:100],
    }

@router.post("/api/imports/upi/commit")
async def commit_upi(
    request: Request,
    account_id: int = Form(...),
    app: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    account = db.get(Account, account_id)
    if not account or account.user_id != user_id:
        raise HTTPException(404, "Account not found")
    content = await file.read()
    file_hash = hashlib.sha256(content).hexdigest()
    label, rows = _parse(app, file, content)

    if _existing_file_source(db, account_id, file_hash, label):
        return {
            "already_imported": True,
            "inserted": 0,
            "linked": 0,
            "review": 0,
            "app": label,
        }

    batch = db.scalar(
        select(ImportBatch).where(
            ImportBatch.account_id == account_id,
            ImportBatch.file_hash == file_hash,
        )
    )
    if not batch:
        batch = ImportBatch(
            account_id=account_id,
            file_name=file.filename or f"{label}-export",
            file_hash=file_hash,
            status="committed",
        )
        db.add(batch)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            batch = db.scalar(
                select(ImportBatch).where(
                    ImportBatch.account_id == account_id,
                    ImportBatch.file_hash == file_hash,
                )
            )

    inserted = 0
    linked = 0
    review = 0

    for row in rows:
        match, method, score, state = _classify(db, account_id, row)

        if state == "review":
            review += 1
            continue

        if state == "existing" and match:
            duplicate_source = any(
                src.source_type == _source_type()
                and src.source_name == label
                and src.external_hash == file_hash
                for src in match.sources
            )
            if not duplicate_source:
                match.sources.append(
                    TransactionSource(
                        source_type=_source_type(),
                        source_name=label,
                        external_hash=file_hash,
                    )
                )
            if not match.upi_ref and row.get("upi_ref"):
                match.upi_ref = row["upi_ref"]
            if not match.payment_method:
                match.payment_method = "upi"
            linked += 1
            continue

        fp = fingerprint(
            account_id,
            row["txn_at"],
            row["amount"],
            row["direction"],
            row["description"],
        )
        tx = Transaction(
            user_id=user_id,
            account_id=account_id,
            txn_at=row["txn_at"],
            amount=row["amount"],
            direction=row["direction"],
            txn_type="income" if row["direction"] == "credit" else "expense",
            payment_method="upi",
            merchant=row["merchant"],
            description_raw=row["description"],
            upi_ref=row.get("upi_ref"),
            fingerprint=fp,
            verification_status="verified" if row.get("upi_ref") else "pending",
        )
        tx.sources.append(
            TransactionSource(
                source_type=_source_type(),
                source_name=label,
                external_hash=file_hash,
            )
        )
        db.add(tx)
        inserted += 1

    db.commit()
    return {
        "already_imported": False,
        "inserted": inserted,
        "linked": linked,
        "review": review,
        "app": label,
    }
