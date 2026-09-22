from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .db import get_db
from .models import FamilyMember, Transaction
from .schemas import FamilyMemberCreate, FamilyMemberTag

router = APIRouter()

def serialize_member(member: FamilyMember):
    return {
        "id": member.id,
        "member_code": member.member_code,
        "name": member.name,
        "is_active": member.is_active,
    }

@router.get("/api/family-members")
def family_members(db: Session = Depends(get_db)):
    members = db.scalars(
        select(FamilyMember)
        .where(FamilyMember.is_active == True)
        .order_by(func.lower(FamilyMember.name), FamilyMember.id)
    ).all()
    return [serialize_member(member) for member in members]

@router.post("/api/family-members")
def create_family_member(body: FamilyMemberCreate, db: Session = Depends(get_db)):
    code = body.member_code.strip()
    name = body.name.strip()

    existing = db.scalar(
        select(FamilyMember).where(func.lower(FamilyMember.member_code) == code.lower())
    )
    if existing:
        if not existing.is_active:
            existing.is_active = True
            existing.name = name
            db.commit()
            db.refresh(existing)
        return serialize_member(existing)

    member = FamilyMember(member_code=code, name=name, is_active=True)
    db.add(member)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Family member ID already exists")
    db.refresh(member)
    return serialize_member(member)

@router.patch("/api/transactions/{tx_id}/family-member")
def tag_transaction(
    tx_id: int,
    body: FamilyMemberTag,
    db: Session = Depends(get_db),
):
    tx = db.get(Transaction, tx_id)
    if not tx:
        raise HTTPException(404, "Transaction not found")

    if body.family_member_id is not None:
        member = db.get(FamilyMember, body.family_member_id)
        if not member or not member.is_active:
            raise HTTPException(404, "Family member not found")

    tx.family_member_id = body.family_member_id
    db.commit()
    db.refresh(tx)

    return {
        "id": tx.id,
        "family_member": serialize_member(tx.family_member) if tx.family_member else None,
    }
