"""Tests for PATCH /api/teams/{team_id}/last-viewed."""

import pytest
from sqlalchemy import select

from src.app.models.organization import Organization, Team, TeamMember
from src.app.models.session import Session
from src.app.models.user import User


@pytest.fixture
async def auth_user_as_team_member(db_session, sample_team, auth_headers):
    """
    Ensure test@example.com exists in the DB and is a TeamMember of sample_team.
    """
    email = "test@example.com"
    user = (await db_session.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user is None:
        user = User(email=email, name="Test User", role="admin")
        db_session.add(user)
        await db_session.flush()

    existing = (
        await db_session.execute(
            select(TeamMember).where(
                TeamMember.team_id == sample_team.id, TeamMember.user_id == user.id
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        db_session.add(TeamMember(team_id=sample_team.id, user_id=user.id, role="member"))
    await db_session.commit()
    return user


@pytest.mark.asyncio
async def test_patch_last_viewed_stamps_project(
    client, auth_headers, sample_team, sample_user, db_session, auth_user_as_team_member
):
    project = Session(org_id=sample_team.org_id, team_id=sample_team.id, name="Acme Web", owner_id=sample_user.id)
    db_session.add(project)
    await db_session.commit()

    resp = await client.patch(
        f"/api/teams/{sample_team.id}/last-viewed",
        headers=auth_headers,
        json={"session_id": project.id},
    )
    assert resp.status_code == 204
    await db_session.refresh(sample_team)
    assert sample_team.last_viewed_session_id == project.id


@pytest.mark.asyncio
async def test_patch_last_viewed_not_member_rejects(
    client, auth_headers, db_session
):
    other_org = Organization(name="Other Org", slug="other-org")
    db_session.add(other_org)
    await db_session.flush()
    other_team = Team(org_id=other_org.id, name="Other", slug="other")
    db_session.add(other_team)
    await db_session.commit()

    resp = await client.patch(
        f"/api/teams/{other_team.id}/last-viewed",
        headers=auth_headers,
        json={"session_id": "00000000-0000-0000-0000-000000000000"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_patch_last_viewed_cross_org_project_rejects(
    client, auth_headers, sample_team, sample_user, db_session, auth_user_as_team_member
):
    other_org = Organization(name="Other", slug="other")
    db_session.add(other_org)
    await db_session.flush()
    # cross-org project — needs a valid team_id/owner_id but they belong to other_org scope;
    # we reuse sample_team and sample_user for convenience (FK just needs to exist)
    project = Session(org_id=other_org.id, team_id=sample_team.id, name="Cross-org", owner_id=sample_user.id)
    db_session.add(project)
    await db_session.commit()

    resp = await client.patch(
        f"/api/teams/{sample_team.id}/last-viewed",
        headers=auth_headers,
        json={"session_id": project.id},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_patch_last_viewed_missing_project(
    client, auth_headers, sample_team, auth_user_as_team_member
):
    resp = await client.patch(
        f"/api/teams/{sample_team.id}/last-viewed",
        headers=auth_headers,
        json={"session_id": "00000000-0000-0000-0000-000000000000"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_patch_last_viewed_idempotent(
    client, auth_headers, sample_team, sample_user, db_session, auth_user_as_team_member
):
    project = Session(org_id=sample_team.org_id, team_id=sample_team.id, name="Idem", owner_id=sample_user.id)
    db_session.add(project)
    await db_session.commit()

    for _ in range(2):
        resp = await client.patch(
            f"/api/teams/{sample_team.id}/last-viewed",
            headers=auth_headers,
            json={"session_id": project.id},
        )
        assert resp.status_code == 204


@pytest.mark.asyncio
async def test_patch_last_viewed_malformed_project_id(
    client, auth_headers, sample_team, auth_user_as_team_member
):
    resp = await client.patch(
        f"/api/teams/{sample_team.id}/last-viewed",
        headers=auth_headers,
        json={"session_id": "not-a-uuid"},
    )
    assert resp.status_code == 422
