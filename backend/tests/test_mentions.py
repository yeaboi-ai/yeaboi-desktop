"""Tests for the @mention resolution helper."""

import pytest

from src.app.models.base import gen_uuid
from src.app.models.organization import Organization, OrgMember
from src.app.models.user import User
from src.app.services.mentions import resolve_mentions


def _make_org() -> Organization:
    return Organization(id=gen_uuid(), name="Test Org", slug=gen_uuid()[:8])


def _make_user(email: str) -> User:
    return User(id=gen_uuid(), email=email, name="Test User")


@pytest.mark.anyio
async def test_resolve_mentions_matches_on_email_prefix(db_session):
    """@alice matches a user with email alice@example.com who is an org member."""
    org = _make_org()
    db_session.add(org)
    await db_session.flush()

    user = _make_user("alice@example.com")
    db_session.add(user)
    await db_session.flush()

    db_session.add(OrgMember(org_id=org.id, user_id=user.id, role="member"))
    await db_session.commit()

    result = await resolve_mentions(db_session, org.id, "Hey @alice can you check this?")
    assert result == [user.id]


@pytest.mark.anyio
async def test_resolve_mentions_ignores_unknown(db_session):
    """@nobody does not match any user — returns empty list."""
    org = _make_org()
    db_session.add(org)
    await db_session.flush()

    user = _make_user("alice@example.com")
    db_session.add(user)
    await db_session.flush()

    db_session.add(OrgMember(org_id=org.id, user_id=user.id, role="member"))
    await db_session.commit()

    result = await resolve_mentions(db_session, org.id, "Hey @nobody can you check this?")
    assert result == []


@pytest.mark.anyio
async def test_resolve_mentions_dedupes(db_session):
    """Mentioning @alice twice returns only one user ID."""
    org = _make_org()
    db_session.add(org)
    await db_session.flush()

    user = _make_user("alice@example.com")
    db_session.add(user)
    await db_session.flush()

    db_session.add(OrgMember(org_id=org.id, user_id=user.id, role="member"))
    await db_session.commit()

    result = await resolve_mentions(db_session, org.id, "@alice and @alice again")
    assert result == [user.id]


@pytest.mark.anyio
async def test_resolve_mentions_case_insensitive(db_session):
    """@ALICE matches alice@example.com (case-insensitive)."""
    org = _make_org()
    db_session.add(org)
    await db_session.flush()

    user = _make_user("alice@example.com")
    db_session.add(user)
    await db_session.flush()

    db_session.add(OrgMember(org_id=org.id, user_id=user.id, role="member"))
    await db_session.commit()

    result = await resolve_mentions(db_session, org.id, "Hey @ALICE!")
    assert result == [user.id]


@pytest.mark.anyio
async def test_resolve_mentions_non_member_ignored(db_session):
    """@bob is not returned when bob is not a member of the org."""
    org = _make_org()
    other_org = _make_org()
    db_session.add_all([org, other_org])
    await db_session.flush()

    user = _make_user("bob@example.com")
    db_session.add(user)
    await db_session.flush()

    # bob is in other_org only
    db_session.add(OrgMember(org_id=other_org.id, user_id=user.id, role="member"))
    await db_session.commit()

    result = await resolve_mentions(db_session, org.id, "Hey @bob!")
    assert result == []


@pytest.mark.anyio
async def test_resolve_mentions_empty_text(db_session):
    """Empty text returns empty list without errors."""
    org = _make_org()
    db_session.add(org)
    await db_session.commit()

    result = await resolve_mentions(db_session, org.id, "")
    assert result == []
