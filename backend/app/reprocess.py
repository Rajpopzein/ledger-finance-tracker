import hashlib
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .models import Account, ImportBatch, Transaction, TransactionSource
from .services.dedupe import fingerprint, normalize_text
from .services.importer import parse_statement
from .users import current_user_id

router = APIRouter()

def _fallback_key(txn_at, amount, description):
    return (
        txn_at.date().isoformat(),
        Decimal(amount).quantize(Decimal("0.01")),
        normalize_text(description),
    )

@router.post("/api/imports/reprocess")
async def reprocess_statement(
    request: Request,
    account_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    account = db.get(Account, account_id)
    if not account or account.user_id != user_id:
        raise HTTPException(404, "Account not found")
    content = await file.read()
    file_hash = hashlib.sha256(content).hexdigest()

    batch = db.scalar(
        select(ImportBatch).where(
            ImportBatch.account_id == account_id,
            ImportBatch.file_hash == file_hash,
        )
    )
    if not batch:
        raise HTTPException(404, "This statement has not been imported before")

    existing = db.scalars(
        select(Transaction)
        .join(TransactionSource, TransactionSource.transaction_id == Transaction.id)
        .where(
            Transaction.account_id == account_id,
            TransactionSource.external_hash == file_hash,
        )
    ).unique().all()

    if not existing:
        raise HTTPException(409, "No transactions are linked to this statement")

    unsafe = [
        tx for tx in existing
        if len(tx.sources) != 1 or tx.sources[0].external_hash != file_hash
    ]
    if unsafe:
        raise HTTPException(
            409,
            "Some transactions from this statement are linked to other sources, so Ledger will not replace them automatically."
        )

    try:
        rows = parse_statement(file.filename or "statement.csv", content)
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    if not rows:
        raise HTTPException(400, "No transaction rows could be parsed from this statement")

    by_ref = {}
    by_fallback = {}
    for tx in existing:
        preserved = {
            "category_id": tx.category_id,
            "excluded": tx.excluded_from_analytics,
        }
        if tx.bank_ref:
            by_ref[tx.bank_ref] = preserved
        by_fallback[_fallback_key(tx.txn_at, tx.amount, tx.description_raw or tx.merchant)] = preserved

    for tx in existing:
        db.delete(tx)
    db.flush()

    inserted = 0
    debit_count = 0
    credit_count = 0

    for row in rows:
        amount = Decimal(row["amount"])
        direction = row["direction"]
        reference = row.get("bank_ref")
        preserved = by_ref.get(reference) if reference else None
        if not preserved:
            preserved = by_fallback.get(
                _fallback_key(row["txn_at"], amount, row["description"])
            )

        tx = Transaction(
            user_id=user_id,
            account_id=account_id,
            category_id=preserved["category_id"] if preserved else None,
            txn_at=row["txn_at"],
            amount=amount,
            direction=direction,
            txn_type="income" if direction == "credit" else "expense",
            description_raw=row["description"],
            merchant=row["description"][:160],
            bank_ref=reference,
            fingerprint=fingerprint(
                account_id,
                row["txn_at"],
                amount,
                direction,
                row["description"],
            ),
            verification_status="verified",
            excluded_from_analytics=preserved["excluded"] if preserved else False,
        )
        tx.sources.append(
            TransactionSource(
                source_type=(file.filename or "statement.csv").split(".")[-1].lower(),
                source_name=file.filename or "statement.csv",
                external_hash=file_hash,
            )
        )
        db.add(tx)
        inserted += 1
        if direction == "debit":
            debit_count += 1
        else:
            credit_count += 1

    batch.file_name = file.filename or batch.file_name
    batch.status = "committed"
    batch.imported_at = datetime.now(timezone.utc)

    db.commit()

    return {
        "replaced": len(existing),
        "inserted": inserted,
        "debits": debit_count,
        "credits": credit_count,
    }
