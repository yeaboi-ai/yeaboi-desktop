"""Tests for integration database models."""

from datetime import UTC, datetime

import pytest
from sqlalchemy.exc import IntegrityError

from src.app.models.base import gen_uuid
from src.app.models.directory import DirectoryEntry
from src.app.models.integration import IntegrationScanItem, IntegrationScanLog, OrgIntegration
from src.app.models.organization import Organization, Team
from src.app.models.user import User


def _make_user(email: str = "user@example.com") -> User:
    return User(id=gen_uuid(), email=email, name="Test User")


def _make_org() -> Organization:
    slug = gen_uuid()[:8]
    return Organization(id=gen_uuid(), name="Test Org", slug=slug)


def _make_team(org_id: str) -> Team:
    slug = gen_uuid()[:8]
    return Team(id=gen_uuid(), org_id=org_id, name="Test Team", slug=slug)


def _make_integration(org_id: str, connected_by: str, provider: str = "github") -> OrgIntegration:
    return OrgIntegration(
        id=gen_uuid(),
        org_id=org_id,
        provider=provider,
        category="vcs",
        auth_type="oauth2",
        status="active",
        scopes='["repo", "read:org"]',
        connected_by=connected_by,
    )


@pytest.mark.anyio
async def test_create_org_integration(db_session):
    """Create an OrgIntegration and verify all fields persist correctly."""
    user = _make_user()
    org = _make_org()
    db_session.add_all([user, org])
    await db_session.flush()

    integration = OrgIntegration(
        id=gen_uuid(),
        org_id=org.id,
        provider="github",
        category="vcs",
        auth_type="oauth2",
        status="active",
        access_token="tok_abc123",
        refresh_token="ref_xyz789",
        token_expires_at=datetime(2026, 12, 31, tzinfo=UTC),
        scopes='["repo"]',
        metadata_json='{"install_id": 42}',
        connected_by=user.id,
        last_scan_at=datetime(2026, 4, 1, tzinfo=UTC),
    )
    db_session.add(integration)
    await db_session.commit()
    await db_session.refresh(integration)

    assert integration.provider == "github"
    assert integration.category == "vcs"
    assert integration.auth_type == "oauth2"
    assert integration.status == "active"
    assert integration.access_token == "tok_abc123"
    assert integration.refresh_token == "ref_xyz789"
    assert integration.scopes == '["repo"]'
    assert integration.metadata_json == '{"install_id": 42}'
    assert integration.connected_by == user.id
    assert integration.org_id == org.id
    assert integration.created_at is not None
    assert integration.updated_at is not None


@pytest.mark.anyio
async def test_org_integration_unique_constraint(db_session):
    """Two integrations with the same org_id + provider violate the unique constraint."""
    user = _make_user("u2@example.com")
    org = _make_org()
    db_session.add_all([user, org])
    await db_session.flush()

    first = _make_integration(org.id, user.id, provider="github")
    db_session.add(first)
    await db_session.flush()

    second = _make_integration(org.id, user.id, provider="github")
    db_session.add(second)

    with pytest.raises(IntegrityError):
        await db_session.flush()


@pytest.mark.anyio
async def test_scan_log_and_items(db_session):
    """Create an IntegrationScanLog with IntegrationScanItems and verify FK relationships."""
    user = _make_user("u3@example.com")
    org = _make_org()
    db_session.add_all([user, org])
    await db_session.flush()

    integration = _make_integration(org.id, user.id)
    db_session.add(integration)
    await db_session.flush()

    scan_log = IntegrationScanLog(
        id=gen_uuid(),
        integration_id=integration.id,
        scan_type="full",
        status="complete",
        started_at=datetime(2026, 4, 4, 10, 0, tzinfo=UTC),
        completed_at=datetime(2026, 4, 4, 10, 5, tzinfo=UTC),
        resources_scanned=10,
        entries_created=3,
        entries_updated=2,
        ai_calls_made=5,
        ai_tokens_used=1500,
        details_json='{"pages": 2}',
    )
    db_session.add(scan_log)
    await db_session.flush()

    item1 = IntegrationScanItem(
        id=gen_uuid(),
        scan_log_id=scan_log.id,
        resource_path="src/README.md",
        action="created",
        ai_model_used="claude-3-haiku",
        tokens_used=300,
    )
    item2 = IntegrationScanItem(
        id=gen_uuid(),
        scan_log_id=scan_log.id,
        resource_path="src/main.py",
        action="updated",
        reason="Content changed",
    )
    db_session.add_all([item1, item2])
    await db_session.commit()

    await db_session.refresh(scan_log)
    await db_session.refresh(integration)

    # Verify scan log fields
    assert scan_log.integration_id == integration.id
    assert scan_log.scan_type == "full"
    assert scan_log.status == "complete"
    assert scan_log.resources_scanned == 10
    assert scan_log.entries_created == 3
    assert scan_log.ai_tokens_used == 1500
    assert scan_log.details_json == '{"pages": 2}'

    # Verify items link back to scan log
    await db_session.refresh(item1)
    await db_session.refresh(item2)
    assert item1.scan_log_id == scan_log.id
    assert item1.ai_model_used == "claude-3-haiku"
    assert item1.tokens_used == 300
    assert item2.action == "updated"
    assert item2.reason == "Content changed"
    assert item2.created_at is not None


@pytest.mark.anyio
async def test_directory_entry_integration_link(db_session):
    """DirectoryEntry can store integration_id and source_ref."""
    user = _make_user("u4@example.com")
    org = _make_org()
    db_session.add_all([user, org])
    await db_session.flush()

    team = _make_team(org.id)
    db_session.add(team)
    await db_session.flush()

    integration = _make_integration(org.id, user.id)
    db_session.add(integration)
    await db_session.flush()

    entry = DirectoryEntry(
        id=gen_uuid(),
        team_id=team.id,
        path="backend/overview",
        title="Backend Overview",
        content="# Backend\nFastAPI service.",
        category="backend",
        source="scan",
        integration_id=integration.id,
        source_ref="https://github.com/org/repo/blob/main/backend/README.md",
    )
    db_session.add(entry)
    await db_session.commit()
    await db_session.refresh(entry)

    assert entry.integration_id == integration.id
    assert entry.source_ref == "https://github.com/org/repo/blob/main/backend/README.md"
    assert entry.source == "scan"

    # Verify a directory entry without integration fields also works (nullable)
    plain_entry = DirectoryEntry(
        id=gen_uuid(),
        team_id=team.id,
        path="frontend/overview",
        title="Frontend Overview",
        content="# Frontend",
        category="frontend",
        source="manual",
    )
    db_session.add(plain_entry)
    await db_session.commit()
    await db_session.refresh(plain_entry)

    assert plain_entry.integration_id is None
    assert plain_entry.source_ref is None


# ---------------------------------------------------------------------------
# API tests
# ---------------------------------------------------------------------------

# Uses github_app auth_type: POST /integrations now rejects auth_type=oauth
# (OAuth integrations are created by the server-side /oauth/callback handler).
# github_app is a legitimate POST path and still carries an access_token, so
# tests that exercise the endpoint's happy path use it.
_CONNECT_BODY = {
    "provider": "github",
    "category": "vcs",
    "auth_type": "github_app",
    "access_token": "ghp_test_token_abc123",
    "scopes": ["repo", "read:org"],
}


async def _create_org(client, headers, name="Test Org", slug=None) -> dict:
    """Helper: create an org and return the response JSON."""
    import uuid

    if slug is None:
        slug = "org-" + str(uuid.uuid4())[:8]
    resp = await client.post("/api/orgs", json={"name": name, "slug": slug}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_list_integrations_empty(client, auth_headers):
    org = await _create_org(client, auth_headers)
    org_id = org["id"]

    resp = await client.get(f"/api/orgs/{org_id}/integrations", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []


async def test_connect_integration(client, auth_headers):
    org = await _create_org(client, auth_headers)
    org_id = org["id"]

    resp = await client.post(f"/api/orgs/{org_id}/integrations", json=_CONNECT_BODY, headers=auth_headers)
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["provider"] == "github"
    assert data["category"] == "vcs"
    assert data["auth_type"] == "github_app"
    assert data["status"] == "active"
    assert data["has_token"] is True
    assert data["token_masked"] is not None
    assert "id" in data
    assert "created_at" in data


async def test_connect_duplicate_returns_409(client, auth_headers):
    org = await _create_org(client, auth_headers)
    org_id = org["id"]

    resp1 = await client.post(f"/api/orgs/{org_id}/integrations", json=_CONNECT_BODY, headers=auth_headers)
    assert resp1.status_code == 201

    resp2 = await client.post(f"/api/orgs/{org_id}/integrations", json=_CONNECT_BODY, headers=auth_headers)
    assert resp2.status_code == 409


async def test_get_integration_detail(client, auth_headers):
    org = await _create_org(client, auth_headers)
    org_id = org["id"]

    create_resp = await client.post(f"/api/orgs/{org_id}/integrations", json=_CONNECT_BODY, headers=auth_headers)
    assert create_resp.status_code == 201
    integration_id = create_resp.json()["id"]

    resp = await client.get(f"/api/orgs/{org_id}/integrations/{integration_id}", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == integration_id
    assert data["provider"] == "github"
    assert data["org_id"] == org_id


async def test_get_integration_not_found(client, auth_headers):
    org = await _create_org(client, auth_headers)
    org_id = org["id"]

    resp = await client.get(f"/api/orgs/{org_id}/integrations/nonexistent-id", headers=auth_headers)
    assert resp.status_code == 404


async def test_disconnect_integration(client, auth_headers):
    org = await _create_org(client, auth_headers)
    org_id = org["id"]

    create_resp = await client.post(f"/api/orgs/{org_id}/integrations", json=_CONNECT_BODY, headers=auth_headers)
    assert create_resp.status_code == 201
    integration_id = create_resp.json()["id"]

    del_resp = await client.delete(f"/api/orgs/{org_id}/integrations/{integration_id}", headers=auth_headers)
    assert del_resp.status_code == 204

    get_resp = await client.get(f"/api/orgs/{org_id}/integrations/{integration_id}", headers=auth_headers)
    assert get_resp.status_code == 404


async def test_get_scan_logs(client, auth_headers):
    org = await _create_org(client, auth_headers)
    org_id = org["id"]

    create_resp = await client.post(f"/api/orgs/{org_id}/integrations", json=_CONNECT_BODY, headers=auth_headers)
    assert create_resp.status_code == 201
    integration_id = create_resp.json()["id"]

    resp = await client.get(f"/api/orgs/{org_id}/integrations/{integration_id}/scans", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []


async def test_get_processing_summary(client, auth_headers):
    org = await _create_org(client, auth_headers)
    org_id = org["id"]

    # Connect two integrations
    await client.post(f"/api/orgs/{org_id}/integrations", json=_CONNECT_BODY, headers=auth_headers)
    slack_body = {**_CONNECT_BODY, "provider": "slack", "category": "messaging"}
    await client.post(f"/api/orgs/{org_id}/integrations", json=slack_body, headers=auth_headers)

    resp = await client.get(f"/api/orgs/{org_id}/integrations/summary", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_integrations"] == 2
    assert data["total_scans_this_month"] == 0
    assert data["total_tokens_this_month"] == 0
    assert isinstance(data["by_integration"], list)
    assert len(data["by_integration"]) == 2


async def test_list_integrations_category_filter(client, auth_headers):
    org = await _create_org(client, auth_headers)
    org_id = org["id"]

    await client.post(f"/api/orgs/{org_id}/integrations", json=_CONNECT_BODY, headers=auth_headers)
    slack_body = {**_CONNECT_BODY, "provider": "slack", "category": "messaging"}
    await client.post(f"/api/orgs/{org_id}/integrations", json=slack_body, headers=auth_headers)

    resp = await client.get(f"/api/orgs/{org_id}/integrations?category=vcs", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["provider"] == "github"


async def test_update_integration_status(client, auth_headers):
    org = await _create_org(client, auth_headers)
    org_id = org["id"]

    create_resp = await client.post(f"/api/orgs/{org_id}/integrations", json=_CONNECT_BODY, headers=auth_headers)
    integration_id = create_resp.json()["id"]

    patch_resp = await client.patch(
        f"/api/orgs/{org_id}/integrations/{integration_id}",
        json={"status": "paused"},
        headers=auth_headers,
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["status"] == "paused"


async def test_slack_patch_persists_admin_team_id(client, auth_headers):
    """PATCH on a Slack integration while it is active should persist admin_team_id."""
    # The first user auto-gets an org + team via deps.py — ensure user exists
    # by making a project call to trigger the auto-creation flow.
    org = await _create_org(client, auth_headers)
    org_id = org["id"]

    slack_body = {
        "provider": "slack",
        "category": "messaging",
        "auth_type": "github_app",
        "access_token": "xoxb-test-token",
        "scopes": ["chat:write"],
    }
    create_resp = await client.post(f"/api/orgs/{org_id}/integrations", json=slack_body, headers=auth_headers)
    assert create_resp.status_code == 201
    integration_id = create_resp.json()["id"]

    # PATCH with some metadata — the handler should stash admin_team_id
    patch_resp = await client.patch(
        f"/api/orgs/{org_id}/integrations/{integration_id}",
        json={"metadata": {"notification_channels": ["C123"]}},
        headers=auth_headers,
    )
    assert patch_resp.status_code == 200

    # Verify the metadata now carries admin_team_id
    import json

    detail_resp = await client.get(f"/api/orgs/{org_id}/integrations/{integration_id}", headers=auth_headers)
    assert detail_resp.status_code == 200
    raw_meta_str = detail_resp.json().get("metadata_json") or "{}"
    raw_meta = json.loads(raw_meta_str)
    assert "admin_team_id" in raw_meta, "admin_team_id should be set after PATCH on active Slack integration"
