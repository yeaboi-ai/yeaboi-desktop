"""Tests for GET /api/orgs/{id}/summary."""

import pytest
from sqlalchemy import select

from src.app.models.organization import OrgMember
from src.app.models.user import User


@pytest.fixture
async def auth_user_as_org_admin(db_session, sample_org):
    email = "test@example.com"
    user = (await db_session.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user is None:
        user = User(email=email, name="Test User", role="admin")
        db_session.add(user)
        await db_session.flush()
    existing = (
        await db_session.execute(
            select(OrgMember).where(OrgMember.org_id == sample_org.id, OrgMember.user_id == user.id)
        )
    ).scalar_one_or_none()
    if existing is None:
        db_session.add(OrgMember(org_id=sample_org.id, user_id=user.id, role="admin"))
    await db_session.commit()
    return user


@pytest.mark.anyio
async def test_summary_returns_expected_shape(client, auth_headers, sample_org, auth_user_as_org_admin):
    resp = await client.get(f"/api/orgs/{sample_org.id}/summary", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    for k in (
        "plan",
        "seat_limit",
        "member_count",
        "seat_usage_pct",
        "ai_spend_usd_this_month",
        "ai_spend_status",
    ):
        assert k in data
    # Free is default — seat_limit defined in SEATS_BY_PLAN
    assert data["plan"] == "free"
    assert data["seat_limit"] == 5
    assert data["member_count"] >= 1  # fixture user + auth user
    assert data["ai_spend_usd_this_month"] == 0.0
    assert data["ai_spend_status"] == "ok"


@pytest.mark.anyio
async def test_summary_seat_usage_pct(client, auth_headers, sample_org, auth_user_as_org_admin):
    resp = await client.get(f"/api/orgs/{sample_org.id}/summary", headers=auth_headers)
    data = resp.json()
    # Two members on a free plan with 5 seats → 40%
    assert data["seat_usage_pct"] == 40.0


@pytest.mark.anyio
async def test_summary_requires_org_membership(client, auth_headers, db_session):
    from src.app.models.organization import Organization

    stranger = Organization(name="Stranger", slug="stranger-org")
    db_session.add(stranger)
    await db_session.commit()
    resp = await client.get(f"/api/orgs/{stranger.id}/summary", headers=auth_headers)
    assert resp.status_code == 403
