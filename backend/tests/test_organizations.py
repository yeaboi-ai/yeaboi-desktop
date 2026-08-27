"""Tests for POST /api/orgs — org create + demo seed."""

from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select

from src.app.models.project import Project

ORGS_URL = "/api/orgs"


@pytest.mark.anyio
async def test_create_org_seeds_demo_project_by_default(client, auth_headers, db_session):
    resp = await client.post(
        ORGS_URL,
        json={"name": "Acme", "slug": "acme"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["slug"] == "acme"
    assert body["demo_project_id"] is not None

    project = (
        await db_session.execute(
            select(Project).where(Project.id == body["demo_project_id"])
        )
    ).scalar_one()
    assert project.is_demo is True
    assert project.org_id == body["id"]


@pytest.mark.anyio
async def test_create_org_skips_seed_when_disabled(client, auth_headers, db_session):
    resp = await client.post(
        ORGS_URL,
        json={"name": "Beta", "slug": "beta", "seed_demo_project": False},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["demo_project_id"] is None

    projects = (
        await db_session.execute(
            select(Project).where(Project.org_id == resp.json()["id"])
        )
    ).scalars().all()
    assert projects == []


@pytest.mark.anyio
async def test_create_org_rejects_duplicate_slug(client, auth_headers):
    first = await client.post(
        ORGS_URL, json={"name": "Acme", "slug": "acme"}, headers=auth_headers
    )
    assert first.status_code == 201
    second = await client.post(
        ORGS_URL, json={"name": "Acme 2", "slug": "acme"}, headers=auth_headers
    )
    assert second.status_code == 409


@pytest.mark.anyio
async def test_create_org_requires_auth(client):
    resp = await client.post(ORGS_URL, json={"name": "Acme", "slug": "acme"})
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_invite_to_org_new_user_returns_email_sent_flag(client, auth_headers):
    """End-to-end invite: create an org, fetch the default team, invite a
    brand-new email. The handler must mint an invite_token, call
    send_invite_email (no-op in tests with no RESEND_API_KEY), and return
    `email_sent` in the response."""
    create = await client.post(
        ORGS_URL, json={"name": "Acme", "slug": "acme"}, headers=auth_headers
    )
    assert create.status_code == 201
    org_id = create.json()["id"]

    teams = await client.get(f"{ORGS_URL}/{org_id}/teams", headers=auth_headers)
    assert teams.status_code == 200
    team_id = teams.json()[0]["id"]

    invite = await client.post(
        f"{ORGS_URL}/{org_id}/invite",
        json={"email": "newhire@acme.com", "team_id": team_id, "role": "member"},
        headers=auth_headers,
    )
    assert invite.status_code == 201
    body = invite.json()
    assert body["email"] == "newhire@acme.com"
    assert body["role"] == "member"
    # No RESEND_API_KEY in tests → send_invite_email returns False but
    # doesn't raise. The endpoint reports it in the response so callers
    # can show a UI hint.
    assert body["email_sent"] is False


@pytest.mark.anyio
async def test_invite_to_org_requires_auth(client):
    """No JWT → 401, before any work happens."""
    # Doesn't matter that the org doesn't exist; auth runs first.
    resp = await client.post(
        f"{ORGS_URL}/fake-org-id/invite",
        json={"email": "x@y.com", "role": "member"},
    )
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_invite_to_org_requires_admin(client, auth_headers, other_auth_headers):
    """Non-admin member of an org can't invite — guards `_require_org_admin`."""
    create = await client.post(
        ORGS_URL, json={"name": "Acme", "slug": "acme"}, headers=auth_headers
    )
    org_id = create.json()["id"]

    # `other_auth_headers` belongs to a different user who isn't a member.
    resp = await client.post(
        f"{ORGS_URL}/{org_id}/invite",
        json={"email": "x@y.com", "role": "member"},
        headers=other_auth_headers,
    )
    assert resp.status_code == 403


@pytest.mark.anyio
async def test_invite_to_org_rejects_invalid_email(client, auth_headers):
    """EmailStr on the request schema rejects malformed addresses with 422
    instead of letting them hit the DB or Resend."""
    create = await client.post(
        ORGS_URL, json={"name": "Acme", "slug": "acme"}, headers=auth_headers
    )
    org_id = create.json()["id"]

    resp = await client.post(
        f"{ORGS_URL}/{org_id}/invite",
        json={"email": "not-an-email", "role": "member"},
        headers=auth_headers,
    )
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_invite_to_org_email_sent_true_when_resend_succeeds(client, auth_headers):
    """When send_invite_email returns True the endpoint surfaces it in the
    response — frontend uses this signal to decide whether to nag the user
    about telling teammates manually."""
    create = await client.post(
        ORGS_URL, json={"name": "Acme", "slug": "acme"}, headers=auth_headers
    )
    org_id = create.json()["id"]

    # send_invite_email is imported into the router module's namespace, so
    # patch the binding there (not in email_service).
    with patch(
        "src.app.routers.organizations.send_invite_email",
        new=AsyncMock(return_value=True),
    ):
        resp = await client.post(
            f"{ORGS_URL}/{org_id}/invite",
            json={"email": "newhire@acme.com", "role": "member"},
            headers=auth_headers,
        )
    assert resp.status_code == 201
    assert resp.json()["email_sent"] is True


@pytest.mark.anyio
async def test_invite_to_org_rejects_unknown_team(client, auth_headers):
    """team_id from a different org → 404 (not a silent membership leak)."""
    a = await client.post(
        ORGS_URL, json={"name": "Acme", "slug": "acme"}, headers=auth_headers
    )
    b = await client.post(
        ORGS_URL, json={"name": "Beta", "slug": "beta"}, headers=auth_headers
    )
    org_a = a.json()["id"]
    teams_b = await client.get(
        f"{ORGS_URL}/{b.json()['id']}/teams", headers=auth_headers
    )
    team_in_b = teams_b.json()[0]["id"]

    resp = await client.post(
        f"{ORGS_URL}/{org_a}/invite",
        json={"email": "x@y.com", "team_id": team_in_b, "role": "member"},
        headers=auth_headers,
    )
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_invite_to_org_existing_user_does_not_mint_token(
    client, auth_headers, db_session
):
    """Inviting an email that already has an account shouldn't reset their
    invite_token (they sign in normally; the token isn't needed)."""
    from src.app.models.user import User

    existing = User(email="already@here.com", invite_claimed=True)
    db_session.add(existing)
    await db_session.commit()

    create = await client.post(
        ORGS_URL, json={"name": "Acme", "slug": "acme"}, headers=auth_headers
    )
    assert create.status_code == 201
    org_id = create.json()["id"]

    invite = await client.post(
        f"{ORGS_URL}/{org_id}/invite",
        json={"email": "already@here.com", "role": "member"},
        headers=auth_headers,
    )
    assert invite.status_code == 201
    await db_session.refresh(existing)
    assert existing.invite_token is None
    assert existing.invite_claimed is True
