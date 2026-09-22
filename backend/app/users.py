import re

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .db import get_db
from .models import FamilyLink, User
from .schemas import FamilyLinkAction, FamilyLinkCreate, UserProfileUpdate, UserSignup
from .services.auth import hash_password

router = APIRouter()

HANDLE_RE = re.compile(r"^[a-z0-9_]{3,40}$")

def normalize_handle(value: str) -> str:
    handle = value.strip().lower()
    if handle.startswith("@"):
        handle = handle[1:]
    if not HANDLE_RE.fullmatch(handle):
        raise HTTPException(
            400,
            "Handle must be 3-40 characters using only letters, numbers and underscore.",
        )
    return handle

def current_user_id(request: Request) -> int:
    claims = getattr(request.state, "auth", None)
    if not claims or claims.get("role") not in ("user", "owner"):
        raise HTTPException(401, "Not authenticated")
    return int(claims["sub"])

def serialize_user(user: User):
    return {
        "id": user.id,
        "email": user.email,
        "handle": f"@{user.handle}",
        "handle_raw": user.handle,
        "name": user.name,
        "phone": user.phone,
    }

def serialize_public_user(user: User):
    return {
        "id": user.id,
        "handle": f"@{user.handle}",
        "name": user.name,
    }

@router.post("/api/auth/signup")
def signup(body: UserSignup, db: Session = Depends(get_db)):
    email = str(body.email).strip().lower()
    handle = normalize_handle(body.handle)

    if db.scalar(select(User.id).where(func.lower(User.email) == email)):
        raise HTTPException(409, "Email is already registered")
    if db.scalar(select(User.id).where(func.lower(User.handle) == handle)):
        raise HTTPException(409, "Handle is already taken")

    salt, password_hash = hash_password(body.password)
    user = User(
        email=email,
        handle=handle,
        name=body.name.strip(),
        password_salt=salt,
        password_hash=password_hash,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Email or handle is already in use")
    db.refresh(user)
    return serialize_user(user)

@router.get("/api/profile")
def profile(request: Request, db: Session = Depends(get_db)):
    user = db.get(User, current_user_id(request))
    if not user:
        raise HTTPException(404, "User not found")
    return serialize_user(user)

@router.put("/api/profile")
def update_profile(
    body: UserProfileUpdate,
    request: Request,
    db: Session = Depends(get_db),
):
    user = db.get(User, current_user_id(request))
    if not user:
        raise HTTPException(404, "User not found")

    handle = normalize_handle(body.handle)
    collision = db.scalar(
        select(User.id).where(
            func.lower(User.handle) == handle,
            User.id != user.id,
        )
    )
    if collision:
        raise HTTPException(409, "Handle is already taken")

    user.name = body.name.strip()
    user.handle = handle
    user.phone = (body.phone or "").strip() or None
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Handle is already taken")
    db.refresh(user)
    return serialize_user(user)

def linked_user_ids(db: Session, user_id: int) -> list[int]:
    links = db.scalars(
        select(FamilyLink).where(
            FamilyLink.status == "accepted",
            or_(
                FamilyLink.requester_user_id == user_id,
                FamilyLink.target_user_id == user_id,
            ),
        )
    ).all()
    ids = []
    for link in links:
        ids.append(
            link.target_user_id
            if link.requester_user_id == user_id
            else link.requester_user_id
        )
    return list(dict.fromkeys(ids))

@router.get("/api/family-network")
def family_network(request: Request, db: Session = Depends(get_db)):
    user_id = current_user_id(request)
    links = db.scalars(
        select(FamilyLink)
        .where(
            or_(
                FamilyLink.requester_user_id == user_id,
                FamilyLink.target_user_id == user_id,
            )
        )
        .order_by(FamilyLink.created_at.desc())
    ).all()

    linked = []
    incoming = []
    outgoing = []

    for link in links:
        other_id = (
            link.target_user_id
            if link.requester_user_id == user_id
            else link.requester_user_id
        )
        other = db.get(User, other_id)
        if not other:
            continue

        item = {
            "link_id": link.id,
            "user": serialize_public_user(other),
            "status": link.status,
            "direction": "outgoing" if link.requester_user_id == user_id else "incoming",
            "label": (
                link.requester_label
                if link.requester_user_id == user_id
                else link.target_label
            ),
        }

        if link.status == "accepted":
            linked.append(item)
        elif link.requester_user_id == user_id:
            outgoing.append(item)
        else:
            incoming.append(item)

    return {
        "linked": linked,
        "incoming": incoming,
        "outgoing": outgoing,
    }

@router.post("/api/family-links")
def create_family_link(
    body: FamilyLinkCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    handle = normalize_handle(body.handle)
    target = db.scalar(select(User).where(func.lower(User.handle) == handle))

    if not target:
        raise HTTPException(404, "No user found with that handle")
    if target.id == user_id:
        raise HTTPException(400, "You cannot link yourself")

    existing = db.scalar(
        select(FamilyLink).where(
            or_(
                and_(
                    FamilyLink.requester_user_id == user_id,
                    FamilyLink.target_user_id == target.id,
                ),
                and_(
                    FamilyLink.requester_user_id == target.id,
                    FamilyLink.target_user_id == user_id,
                ),
            )
        )
    )
    if existing:
        if existing.status == "accepted":
            raise HTTPException(409, "This user is already linked to your family")
        if existing.status == "pending":
            raise HTTPException(409, "A family invitation already exists")
        db.delete(existing)
        db.flush()

    link = FamilyLink(
        requester_user_id=user_id,
        target_user_id=target.id,
        status="pending",
        requester_label=(body.label or "").strip() or None,
    )
    db.add(link)
    db.commit()
    db.refresh(link)

    return {
        "link_id": link.id,
        "status": link.status,
        "user": serialize_public_user(target),
    }

@router.post("/api/family-links/{link_id}/action")
def family_link_action(
    link_id: int,
    body: FamilyLinkAction,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    link = db.get(FamilyLink, link_id)
    if not link or link.target_user_id != user_id:
        raise HTTPException(404, "Family invitation not found")
    if link.status != "pending":
        raise HTTPException(409, "This invitation is no longer pending")

    if body.action == "accept":
        link.status = "accepted"
        db.commit()
        return {"ok": True, "status": "accepted"}

    db.delete(link)
    db.commit()
    return {"ok": True, "status": "rejected"}

@router.delete("/api/family-links/{link_id}")
def remove_family_link(
    link_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = current_user_id(request)
    link = db.get(FamilyLink, link_id)
    if not link or user_id not in (link.requester_user_id, link.target_user_id):
        raise HTTPException(404, "Family link not found")
    db.delete(link)
    db.commit()
    return {"ok": True}
