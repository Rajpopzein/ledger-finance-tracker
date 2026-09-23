from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from backend.app.db import Base
from backend.app.models import (
    AISetting,
    FamilyAISharingPreference,
    FamilyLink,
    User,
)
from backend.app.users import (
    family_link_sharing,
    resolve_ai_provider_user_id,
    shared_linked_user_ids,
)


def _db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return Session(engine)


def _user(email: str, handle: str, name: str):
    return User(
        email=email,
        handle=handle,
        name=name,
        password_salt="salt",
        password_hash="hash",
    )


def test_ai_sharing_is_opt_in_while_existing_data_sharing_stays_on():
    db = _db()
    owner = _user("owner@example.com", "owner_1", "Owner")
    family = _user("family@example.com", "family_1", "Family")
    db.add_all([owner, family])
    db.flush()
    link = FamilyLink(
        requester_user_id=owner.id,
        target_user_id=family.id,
        status="accepted",
    )
    db.add(link)
    db.commit()

    sharing = family_link_sharing(db, link, owner.id)
    assert sharing["transactions"] is True
    assert sharing["debts"] is True
    assert sharing["investments"] is True
    assert sharing["ai_insights"] is False
    assert sharing["ai_categorization"] is False


def test_shared_ai_provider_requires_explicit_capability():
    db = _db()
    owner = _user("owner@example.com", "owner_2", "Owner")
    family = _user("family@example.com", "family_2", "Family")
    db.add_all([owner, family])
    db.flush()
    link = FamilyLink(
        requester_user_id=owner.id,
        target_user_id=family.id,
        status="accepted",
    )
    db.add(link)
    db.flush()
    db.add(AISetting(
        user_id=owner.id,
        provider="gemini",
        model="gemini-test",
    ))
    db.commit()

    assert owner.id not in shared_linked_user_ids(db, family.id, "ai_insights")

    ai_pref = FamilyAISharingPreference(
        family_link_id=link.id,
        owner_user_id=owner.id,
        share_ai_insights=True,
        share_ai_categorization=False,
    )
    db.add(ai_pref)
    db.commit()

    assert owner.id in shared_linked_user_ids(db, family.id, "ai_insights")
    assert owner.id not in shared_linked_user_ids(db, family.id, "ai_categorization")
    assert resolve_ai_provider_user_id(
        db,
        family.id,
        "ai_insights",
        owner.id,
    ) == owner.id
