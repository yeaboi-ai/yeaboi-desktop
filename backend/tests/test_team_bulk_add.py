"""Tests for bulk add + chain-invite team flows (W4)."""

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


async def _add_org_member(db_session, org_id, email):
    u = User(email=email, name=email.split("@")[0], role="member")
    db_session.add(u)
    await db_session.flush()
    db_session.add(OrgMember(org_id=org_id, user_id=u.id, role="member"))
    await db_session.commit()
    return u


# ─── Bulk add ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_bulk_add_three_users(
    client, auth_headers, db_session, sample_team, auth_user_as_org_admin
):
    u1 = await _add_org_member(db_session, sample_team.org_id, "a@example.com")
    u2 = await _add_org_member(db_session, sample_team.org_id, "b@example.com")
    u3 = await _add_org_member(db_session, sample_team.org_id, "c@example.com")

    resp = await client.post(
        f"/api/teams/{sample_team.id}/members",
        headers=auth_headers,
        json={"user_ids": [u1.id, u2.id, u3.id]},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert len(body["added"]) == 3
    assert body["skipped_existing"] == []


@pytest.mark.asyncio
async def test_bulk_add_is_idempotent(
    client, auth_headers, db_session, sample_team, auth_user_as_org_admin
):
    u1 = await _add_org_member(db_session, sample_team.org_id, "dup@example.com")
    # First call adds the row
    r1 = await client.post(
        f"/api/teams/{sample_team.id}/members",
        headers=auth_headers,
        json={"user_ids": [u1.id]},
    )
    assert r1.status_code == 201
    assert len(r1.json()["added"]) == 1

    # Repeat — should be idempotent: 0 added, 1 skipped
    r2 = await client.post(
        f"/api/teams/{sample_team.id}/members",
        headers=auth_headers,
        json={"user_ids": [u1.id]},
    )
    assert r2.status_code == 201
    body = r2.json()
    assert body["added"] == []
    assert u1.id in body["skipped_existing"]


@pytest.mark.asyncio
async def test_single_user_id_path_still_works(
    client, auth_headers, db_session, sample_team, auth_user_as_org_admin
):
    u = await _add_org_member(db_session, sample_team.org_id, "solo@example.com")
    resp = await client.post(
        f"/api/teams/{sample_team.id}/members",
        headers=auth_headers,
        json={"user_id": u.id},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["user_id"] == u.id
    assert body["email"] == "solo@example.com"


@pytest.mark.asyncio
async def test_bulk_add_rejects_non_org_members(
    client, auth_headers, sample_team, auth_user_as_org_admin
):
    resp = await client.post(
        f"/api/teams/{sample_team.id}/members",
        headers=auth_headers,
        json={"user_ids": ["nonexistent-id-1", "nonexistent-id-2"]},
    )
    assert resp.status_code == 400


# ─── Chain invite ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_invite_with_team_id_creates_team_row(
    client, auth_headers, db_session, sample_team, auth_user_as_org_admin
):
    resp = await client.post(
        f"/api/orgs/{sample_team.org_id}/invite",
        headers=auth_headers,
        json={"email": "newhire@example.com", "team_id": sample_team.id},
    )
    assert resp.status_code == 201

    # Verify org_members + team_members rows
    list_resp = await client.get(
        f"/api/teams/{sample_team.id}/members", headers=auth_headers
    )
    assert list_resp.status_code == 200
    emails = [m["email"] for m in list_resp.json()]
    assert "newhire@example.com" in emails


@pytest.mark.asyncio
async def test_invite_without_team_id_does_not_add_to_team(
    client, auth_headers, db_session, sample_team, auth_user_as_org_admin
):
    resp = await client.post(
        f"/api/orgs/{sample_team.org_id}/invite",
        headers=auth_headers,
        json={"email": "orgonly@example.com"},
    )
    assert resp.status_code == 201

    list_resp = await client.get(
        f"/api/teams/{sample_team.id}/members", headers=auth_headers
    )
    assert list_resp.status_code == 200
    emails = [m["email"] for m in list_resp.json()]
    assert "orgonly@example.com" not in emails
