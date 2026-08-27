"""Tests for the team description field (W2)."""

import pytest
from sqlalchemy import select

from src.app.models.organization import OrgMember
from src.app.models.user import User


@pytest.fixture
async def auth_user_as_org_admin(db_session, sample_org):
    """auth_headers user is OrgMember(role=admin) on sample_org."""

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


@pytest.mark.asyncio
async def test_patch_description_persists(
    client, auth_headers, sample_team, auth_user_as_org_admin
):
    resp = await client.patch(
        f"/api/teams/{sample_team.id}",
        headers=auth_headers,
        json={"description": "Ships AI features for the planning platform."},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["description"] == "Ships AI features for the planning platform."

    # GET surfaces it
    get_resp = await client.get(f"/api/teams/{sample_team.id}", headers=auth_headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["description"] == "Ships AI features for the planning platform."


@pytest.mark.asyncio
async def test_patch_name_and_description(
    client, auth_headers, sample_team, auth_user_as_org_admin
):
    resp = await client.patch(
        f"/api/teams/{sample_team.id}",
        headers=auth_headers,
        json={"name": "Renamed", "description": "Updated desc"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Renamed"
    assert body["description"] == "Updated desc"


@pytest.mark.asyncio
async def test_patch_description_requires_admin(client, auth_headers, sample_team):
    # auth_headers user has no OrgMember row → _require_org_admin returns 403
    resp = await client.patch(
        f"/api/teams/{sample_team.id}",
        headers=auth_headers,
        json={"description": "should-fail"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_get_team_includes_description(
    client, auth_headers, sample_team, auth_user_as_org_admin
):
    resp = await client.get(f"/api/teams/{sample_team.id}", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    # New row defaults to NULL → None in JSON
    assert "description" in body
    assert body["description"] is None
