import hashlib
from decimal import Decimal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .db import get_db
from .models import Account, ImportBatch, ReconciliationItem, Transaction, TransactionSource
from .services.dedupe import fingerprint, find_match
from .services.importer import parse_statement
from .users import current_user_id

router = APIRouter()

def _source_type(file_name: str) -> str:
    name = (file_name or "statement.csv").lower()
    if "." not in name:
        return "statement"
    return name.rsplit(".", 1)[-1]

def _parse(file_name: str, content: bytes, password: str | None = None):
    try:
        rows = parse_statement(file_name, content, password)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    if not rows:
        raise HTTPException(
            400,
            "No transaction rows could be parsed from this statement."
        )
    return rows

def _has_file_source(db: Session, account_id: int, file_hash: str):
    transaction_source = db.scalar(
        select(TransactionSource.id)
        .join(Transaction, TransactionSource.transaction_id == Transaction.id)
        .where(
            Transaction.account_id == account_id,
            TransactionSource.external_hash == file_hash,
        )
        .limit(1)
    )
    if transaction_source:
        return transaction_source
    return db.scalar(
        select(ReconciliationItem.id)
        .where(
            ReconciliationItem.account_id == account_id,
            ReconciliationItem.external_hash == file_hash,
        )
        .limit(1)
    )

def _classify(db: Session, account_id: int, row):
    match, method, score = find_match(
        db,
        account_id=account_id,
        txn_at=row["txn_at"],
        amount=row["amount"],
        direction=row["direction"],
        description=row["description"],
        bank_ref=row.get("bank_ref"),
    )

    if match and method in ("upi_ref", "bank_ref", "fingerprint", "manual_amount_date"):
        state = "existing" if match.verification_status == "verified" else "matched"
    elif match:
        state = "review"
    else:
        state = "new"

    return match, method, score, state

@router.post("/api/imports/bank/commit")
async def commit_bank_statement(
    request: Request,
    account_id: int = Form(...),
    file: UploadFile = File(...),
    password: str | None = Form(None),
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    account = db.get(Account, account_id)
    if not account or account.user_id != user_id:
        raise HTTPException(404, "Account not found")
    content = await file.read()
    file_name = file.filename or "statement.csv"
    file_hash = hashlib.sha256(content).hexdigest()

    if _has_file_source(db, account_id, file_hash):
        return {
            "already_imported": True,
            "inserted": 0,
            "matched": 0,
            "review": 0,
        }

    rows = _parse(file_name, content, password)

    batch = db.scalar(
        select(ImportBatch).where(
            ImportBatch.account_id == account_id,
            ImportBatch.file_hash == file_hash,
        )
    )

    if not batch:
        batch = ImportBatch(
            account_id=account_id,
            file_name=file_name,
            file_hash=file_hash,
            status="committed",
        )
        db.add(batch)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            if _has_file_source(db, account_id, file_hash):
                return {
                    "already_imported": True,
                    "inserted": 0,
                    "matched": 0,
                    "review": 0,
                }
            batch = db.scalar(
                select(ImportBatch).where(
                    ImportBatch.account_id == account_id,
                    ImportBatch.file_hash == file_hash,
                )
            )
            if not batch:
                raise HTTPException(409, "Statement import is already in progress")
    else:
        batch.file_name = file_name
        batch.status = "committed"

    inserted = 0
    matched = 0
    review = 0
    source_type = _source_type(file_name)

    for row_index, row in enumerate(rows):
        match, method, score, state = _classify(db, account_id, row)
        amount = Decimal(row["amount"])

        if state in ("existing", "matched") and match:
            if state == "matched":
                match.verification_status = "verified"
                matched += 1

            if not any(
                src.external_hash == file_hash
                for src in match.sources
            ):
                match.sources.append(
                    TransactionSource(
                        source_type=source_type,
                        source_name=file_name,
                        external_hash=file_hash,
                    )
                )
            if not match.bank_ref and row.get("bank_ref"):
                match.bank_ref = row["bank_ref"]
            continue

        if state == "review":
            db.add(
                ReconciliationItem(
                    user_id=user_id,
                    account_id=account_id,
                    import_batch_id=batch.id,
                    candidate_transaction_id=match.id if match else None,
                    source_row_index=row_index,
                    source_type=source_type,
                    source_name=file_name,
                    external_hash=file_hash,
                    txn_at=row["txn_at"],
                    amount=amount,
                    direction=row["direction"],
                    description_raw=row["description"],
                    bank_ref=row.get("bank_ref"),
                    match_method=method,
                    match_score=Decimal(str(score)),
                    status="needs_review",
                )
            )
            review += 1
            continue

        tx = Transaction(
            user_id=user_id,
            account_id=account_id,
            txn_at=row["txn_at"],
            amount=amount,
            direction=row["direction"],
            txn_type="income" if row["direction"] == "credit" else "expense",
            description_raw=row["description"],
            merchant=row["description"][:160],
            bank_ref=row.get("bank_ref"),
            fingerprint=fingerprint(
                account_id,
                row["txn_at"],
                amount,
                row["direction"],
                row["description"],
            ),
            verification_status="verified",
        )
        tx.sources.append(
            TransactionSource(
                source_type=source_type,
                source_name=file_name,
                external_hash=file_hash,
            )
        )
        db.add(tx)
        inserted += 1

    db.commit()
    return {
        "already_imported": False,
        "inserted": inserted,
        "matched": matched,
        "review": review,
        "batch_id": batch.id,
        "detected": len(rows),
    }
