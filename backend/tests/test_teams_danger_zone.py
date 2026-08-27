"""Tests for the team danger zone — delete + leave (W3)."""

import pytest
from sqlalchemy import select

from src.app.models.organization import OrgMember, TeamMember
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


async def _add_team_member(db_session, team_id, email, role="member"):
    u = User(email=email, name=email.split("@")[0], role=role)
    db_session.add(u)
    await db_session.flush()
    db_session.add(TeamMember(team_id=team_id, user_id=u.id, role=role))
    await db_session.commit()
    return u


# ─── Delete team ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_delete_team_requires_admin(client, auth_headers, sample_team):
    # No OrgMember row for auth user → 403
    resp = await client.request(
        "DELETE",
        f"/api/teams/{sample_team.id}",
        json={"confirm_name": sample_team.name},
        headers=auth_headers,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_delete_team_requires_exact_name(
    client, auth_headers, sample_team, auth_user_as_org_admin
):
    resp = await client.request(
        "DELETE",
        f"/api/teams/{sample_team.id}",
        json={"confirm_name": "wrong name"},
        headers=auth_headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_delete_team_soft_deletes(
    client, auth_headers, sample_team, auth_user_as_org_admin
):
    resp = await client.request(
        "DELETE",
        f"/api/teams/{sample_team.id}",
        json={"confirm_name": sample_team.name},
        headers=auth_headers,
    )
    assert resp.status_code == 204

    # Subsequent GET 404s (verifying via API rather than session — in-memory SQLite
    # pool means request commit isn't visible to test session connection).
    follow_up = await client.get(f"/api/teams/{sample_team.id}", headers=auth_headers)
    assert follow_up.status_code == 404


@pytest.mark.asyncio
async def test_delete_team_returns_404_for_already_deleted(
    client, auth_headers, db_session, sample_team, auth_user_as_org_admin
):
    from datetime import UTC, datetime

    sample_team.deleted_at = datetime.now(UTC)
    await db_session.commit()
    resp = await client.request(
        "DELETE",
        f"/api/teams/{sample_team.id}",
        json={"confirm_name": sample_team.name},
        headers=auth_headers,
    )
    assert resp.status_code == 404


# ─── Leave team ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_leave_team_succeeds_for_member(
    client, auth_headers, other_auth_headers, db_session, sample_team, auth_user_as_org_admin
):
    # Caller (auth user) is the admin who stays. other@example.com is the leaver.
    db_session.add(TeamMember(team_id=sample_team.id, user_id=auth_user_as_org_admin.id, role="admin"))

    leaver = User(email="other@example.com", name="Other User", role="member")
    db_session.add(leaver)
    await db_session.flush()
    db_session.add(OrgMember(org_id=sample_team.org_id, user_id=leaver.id, role="member"))
    db_session.add(TeamMember(team_id=sample_team.id, user_id=leaver.id, role="member"))
    await db_session.commit()

    resp = await client.post(
        f"/api/teams/{sample_team.id}/leave",
        headers=other_auth_headers,
    )
    assert resp.status_code == 204

    list_resp = await client.get(
        f"/api/teams/{sample_team.id}/members", headers=auth_headers
    )
    assert list_resp.status_code == 200
    emails = [m["email"] for m in list_resp.json()]
    assert "other@example.com" not in emails


@pytest.mark.asyncio
async def test_leave_team_blocks_sole_admin(
    client, auth_headers, db_session, sample_team, sample_user, auth_user_as_org_admin
):
    # sample_team already has sample_user as admin. Remove that row so auth user
    # becomes the sole admin.
    existing = (
        await db_session.execute(
            select(TeamMember).where(
                TeamMember.team_id == sample_team.id,
                TeamMember.user_id == sample_user.id,
            )
        )
    ).scalar_one()
    await db_session.delete(existing)
    db_session.add(TeamMember(team_id=sample_team.id, user_id=auth_user_as_org_admin.id, role="admin"))
    await db_session.commit()

    resp = await client.post(
        f"/api/teams/{sample_team.id}/leave",
        headers=auth_headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_leave_team_404_for_non_member(client, auth_headers, sample_team, auth_user_as_org_admin):
    # auth_user_as_org_admin is an org admin but NOT on the team
    resp = await client.post(
        f"/api/teams/{sample_team.id}/leave",
        headers=auth_headers,
    )
    assert resp.status_code == 404
