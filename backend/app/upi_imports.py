import hashlib
import re
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

def _user_accounts(db: Session, user_id: int):
    return db.scalars(
        select(Account)
        .where(Account.user_id == user_id, Account.is_active == True)
        .order_by(Account.id)
    ).all()

def _account_text(value: str | None):
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()

def _accounts_for_hint(accounts, hint: str | None):
    if not hint:
        return []
    hint_text = _account_text(hint)
    digit_groups = re.findall(r"\d{2,4}", str(hint))
    suffix = digit_groups[-1] if digit_groups else None

    mask_matches = []
    institution_matches = []
    for account in accounts:
        mask = re.sub(r"\D", "", str(account.account_mask or ""))
        if suffix and mask and mask.endswith(suffix):
            mask_matches.append(account)
            continue

        institution = _account_text(account.institution)
        name = _account_text(account.name)
        if (institution and institution in hint_text) or (name and name in hint_text):
            institution_matches.append(account)

    if mask_matches:
        return mask_matches
    return institution_matches

def _unassigned_upi_account(db: Session, user_id: int):
    account = db.scalar(
        select(Account).where(
            Account.user_id == user_id,
            Account.type == "upi",
            Account.institution == "UPI",
        )
    )
    if account:
        return account

    account = Account(
        user_id=user_id,
        name="UPI • Unassigned",
        institution="UPI",
        type="upi",
        is_active=True,
    )
    db.add(account)
    db.flush()
    return account

def _existing_file_source(db: Session, user_id: int, file_hash: str, label: str):
    return db.scalar(
        select(TransactionSource.id)
        .join(Transaction, TransactionSource.transaction_id == Transaction.id)
        .where(
            Transaction.user_id == user_id,
            TransactionSource.source_type == _source_type(),
            TransactionSource.source_name == label,
            TransactionSource.external_hash == file_hash,
        )
        .limit(1)
    )

def _classify(db: Session, user_id: int, row):
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
                Transaction.user_id == user_id,
                or_(*ref_conditions),
            )
        )
        if exact:
            return exact, "upi_ref", 1.0, "existing"

    # Prefer the account named by Google Pay ("Paid by"/"Paid to") before
    # trying the user's remaining accounts. Do not stop on a fuzzy hit because
    # a later account may contain an exact reference match.
    accounts = [
        account for account in _user_accounts(db, user_id)
        if not (account.type == "upi" and account.institution == "UPI")
    ]
    hinted = _accounts_for_hint(accounts, row.get("account_hint"))
    hinted_ids = {account.id for account in hinted}
    ordered_accounts = [*hinted, *[account for account in accounts if account.id not in hinted_ids]]

    review_candidate = None
    for account in ordered_accounts:
        match, method, score = find_match(
            db,
            account_id=account.id,
            txn_at=row["txn_at"],
            amount=row["amount"],
            direction=row["direction"],
            description=row["description"],
            upi_ref=upi_ref,
            bank_ref=upi_ref,
        )
        if match and method in ("upi_ref", "bank_ref", "fingerprint"):
            return match, method, score, "existing"
        if match and (review_candidate is None or score > review_candidate[2]):
            review_candidate = (match, method, score)

    if review_candidate:
        match, method, score = review_candidate
        return match, method, score, "review"

    start = row["txn_at"] - timedelta(days=1)
    end = row["txn_at"] + timedelta(days=1)
    candidates = db.scalars(
        select(Transaction).where(
            Transaction.user_id == user_id,
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
    app: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    content = await file.read()
    file_hash = hashlib.sha256(content).hexdigest()
    label, rows = _parse(app, file, content)

    if _existing_file_source(db, user_id, file_hash, label):
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
        match, method, score, state = _classify(db, user_id, row)
        counts[state] += 1
        items.append({
            "txn_at": row["txn_at"].isoformat(),
            "amount": float(row["amount"]),
            "direction": row["direction"],
            "merchant": row["merchant"],
            "upi_ref": row.get("upi_ref"),
            "state": state,
            "match_id": match.id if match else None,
            "matched_account": match.account.name if match and match.account else None,
            "account_hint": row.get("account_hint"),
            "txn_type": row.get("txn_type") or ("income" if row["direction"] == "credit" else "expense"),
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
    app: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    content = await file.read()
    file_hash = hashlib.sha256(content).hexdigest()
    label, rows = _parse(app, file, content)

    if _existing_file_source(db, user_id, file_hash, label):
        return {
            "already_imported": True,
            "inserted": 0,
            "linked": 0,
            "review": 0,
            "app": label,
        }

    fallback_account = _unassigned_upi_account(db, user_id)

    batch = db.scalar(
        select(ImportBatch).where(
            ImportBatch.account_id == fallback_account.id,
            ImportBatch.file_hash == file_hash,
        )
    )
    if not batch:
        batch = ImportBatch(
            account_id=fallback_account.id,
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
                    ImportBatch.account_id == fallback_account.id,
                    ImportBatch.file_hash == file_hash,
                )
            )
            if not batch:
                raise HTTPException(409, "UPI import is already in progress")

    inserted = 0
    linked = 0
    review = 0

    for row in rows:
        match, method, score, state = _classify(db, user_id, row)

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

        real_accounts = [
            account for account in _user_accounts(db, user_id)
            if not (account.type == "upi" and account.institution == "UPI")
        ]
        hinted_accounts = _accounts_for_hint(real_accounts, row.get("account_hint"))
        target_account = hinted_accounts[0] if len(hinted_accounts) == 1 else fallback_account

        fp = fingerprint(
            target_account.id,
            row["txn_at"],
            row["amount"],
            row["direction"],
            row["description"],
        )
        tx = Transaction(
            user_id=user_id,
            account_id=target_account.id,
            txn_at=row["txn_at"],
            amount=row["amount"],
            direction=row["direction"],
            txn_type=row.get("txn_type") or ("income" if row["direction"] == "credit" else "expense"),
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
        "fallback_account": fallback_account.name,
    }
