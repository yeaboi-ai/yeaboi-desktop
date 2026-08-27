"""Tests for the team Slack channels CRUD API."""

import pytest
from sqlalchemy import select

from src.app.models.organization import OrgMember, TeamMember
from src.app.models.user import User

# ---------------------------------------------------------------------------
# Fixture: ensure test@example.com (auth_headers user) is an org admin on
# sample_org so that _require_team_admin_or_org_admin passes.
# ---------------------------------------------------------------------------


@pytest.fixture
async def auth_user_as_org_admin(db_session, sample_org, auth_headers):
    """
    Ensure the auth_headers user (test@example.com) exists in the DB and has
    OrgMember(role='admin') on sample_org, so admin-gated endpoints accept them.
    """

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
async def test_list_empty(client, auth_headers, sample_team, auth_user_as_org_admin):
    resp = await client.get(f"/api/teams/{sample_team.id}/slack-channels", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == {"channels": []}


@pytest.mark.asyncio
async def test_create_and_list(client, auth_headers, sample_team, auth_user_as_org_admin):
    body = {"slack_channel_id": "C1", "slack_channel_name": "#x", "event_types": ["card_failed"]}
    r = await client.post(f"/api/teams/{sample_team.id}/slack-channels", headers=auth_headers, json=body)
    assert r.status_code == 201
    r = await client.get(f"/api/teams/{sample_team.id}/slack-channels", headers=auth_headers)
    assert len(r.json()["channels"]) == 1
    assert r.json()["channels"][0]["event_types"] == ["card_failed"]


@pytest.mark.asyncio
async def test_rejects_unknown_event_type(client, auth_headers, sample_team, auth_user_as_org_admin):
    r = await client.post(
        f"/api/teams/{sample_team.id}/slack-channels",
        headers=auth_headers,
        json={"slack_channel_id": "C1", "event_types": ["whoa_what"]},
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_patch_updates_event_types(client, auth_headers, sample_team, auth_user_as_org_admin):
    r = await client.post(
        f"/api/teams/{sample_team.id}/slack-channels",
        headers=auth_headers,
        json={"slack_channel_id": "C1", "event_types": ["card_failed"]},
    )
    channel_id = r.json()["id"]
    r = await client.patch(
        f"/api/teams/{sample_team.id}/slack-channels/{channel_id}",
        headers=auth_headers,
        json={"event_types": ["pr_ready"]},
    )
    assert r.status_code == 200
    assert r.json()["event_types"] == ["pr_ready"]


@pytest.mark.asyncio
async def test_delete(client, auth_headers, sample_team, auth_user_as_org_admin):
    r = await client.post(
        f"/api/teams/{sample_team.id}/slack-channels",
        headers=auth_headers,
        json={"slack_channel_id": "C1", "event_types": ["card_failed"]},
    )
    channel_id = r.json()["id"]
    r = await client.delete(f"/api/teams/{sample_team.id}/slack-channels/{channel_id}", headers=auth_headers)
    assert r.status_code == 204


@pytest.mark.asyncio
async def test_forbidden_for_non_admin(client, sample_team, db_session):
    # build a member-role user and their auth headers
    non_admin = User(email="member@example.com", name="Member", role="member")
    db_session.add(non_admin)
    await db_session.flush()
    db_session.add(TeamMember(team_id=sample_team.id, user_id=non_admin.id, role="member"))
    await db_session.commit()

    from tests.conftest import _make_jwt

    headers = {"Authorization": f"Bearer {_make_jwt(non_admin.email, non_admin.name)}"}

    r = await client.post(
        f"/api/teams/{sample_team.id}/slack-channels",
        headers=headers,
        json={"slack_channel_id": "C1", "event_types": ["card_failed"]},
    )
    assert r.status_code == 403
