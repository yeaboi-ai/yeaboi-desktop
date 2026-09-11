"""Tests for the Jira + ADO inbound webhook receivers and conflict detection."""

from __future__ import annotations

import base64
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from src.app.models.board import Card
from src.app.models.integration import OrgIntegration
from src.app.models.sync import CardExternalLink, IntegrationProjectMapping
from src.app.services.crypto import encrypt_api_key

WEBHOOK_TOKEN = "shh-this-is-a-secret"


async def _seed_link(client, auth_headers, db_session, *, provider: str) -> dict:
    proj = (await client.post("/api/sessions", json={"name": "Hooked"}, headers=auth_headers)).json()
    board = (await client.get(f"/api/sessions/{proj['id']}/board", headers=auth_headers)).json()
    backlog = board["columns"][0]["id"]
    card = (
        await client.post(
            f"/api/boards/{board['id']}/cards",
            json={"column_id": backlog, "title": "Original local title"},
            headers=auth_headers,
        )
    ).json()

    project_org_id = (
        await db_session.execute(
            select(__import__("src.app.models.session", fromlist=["Session"]).Session.org_id).where(
                __import__("src.app.models.session", fromlist=["Session"]).Session.id == proj["id"]
            )
        )
    ).scalar_one()

    integration = OrgIntegration(
        org_id=project_org_id,
        provider=provider,
        category="issue_tracking",
        auth_type="oauth" if provider == "jira" else "credential",
        status="active",
        access_token=encrypt_api_key("fake-token") if provider == "jira" else None,
        credentials=encrypt_api_key('{"organization":"acme","personal_access_token":"x"}')
        if provider == "azure_devops"
        else None,
        scopes="[]",
        connected_by="00000000-0000-0000-0000-000000000000",
    )
    db_session.add(integration)
    await db_session.flush()

    mapping = IntegrationProjectMapping(
        integration_id=integration.id,
        internal_session_id=proj["id"],
        external_project_key="EXT" if provider == "jira" else "AcmeProject",
        external_project_id="10000",
        default_issue_type="Story" if provider == "jira" else "User Story",
        field_mappings={},
        sync_direction="bidirectional",
        enabled=True,
        webhook_secret_encrypted=encrypt_api_key(WEBHOOK_TOKEN),
    )
    db_session.add(mapping)
    await db_session.flush()

    # last_synced_at must be AFTER the card was created (the create above
    # bumps Card.updated_at to "now"). Add a small forward delta so the test
    # baseline is "the card was just successfully pushed".
    last_sync = datetime.now(UTC) + timedelta(seconds=1)
    link = CardExternalLink(
        card_id=card["id"],
        org_id=project_org_id,
        integration_id=integration.id,
        provider=provider,
        external_id="WI-1" if provider == "azure_devops" else "10001",
        external_key="EXT-1" if provider == "jira" else "WI-1",
        external_url="https://example.test",
        last_synced_at=last_sync,
        last_local_change_at=last_sync,
        sync_state="synced",
    )
    db_session.add(link)
    await db_session.commit()
    await db_session.refresh(link)
    return {"card": card, "link": link, "mapping": mapping, "integration": integration}


@pytest.mark.anyio
async def test_jira_webhook_applies_remote_change(client, auth_headers, db_session):
    ctx = await _seed_link(client, auth_headers, db_session, provider="jira")

    payload = {
        "webhookEvent": "jira:issue_updated",
        "issue": {
            "id": "10001",
            "key": "EXT-1",
            "fields": {
                "summary": "Updated upstream",
                "updated": (datetime.now(UTC) + timedelta(minutes=1)).isoformat(),
            },
        },
    }
    resp = await client.post(
        f"/api/integrations/jira/webhook/{ctx['mapping'].id}?token={WEBHOOK_TOKEN}",
        json=payload,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["accepted"] is True
    assert body["state"] == "synced"

    card_after = (
        await db_session.execute(select(Card).where(Card.id == ctx["card"]["id"]))
    ).scalar_one()
    assert card_after.title == "Updated upstream"


@pytest.mark.anyio
async def test_jira_webhook_rejects_invalid_token(client, auth_headers, db_session):
    ctx = await _seed_link(client, auth_headers, db_session, provider="jira")
    resp = await client.post(
        f"/api/integrations/jira/webhook/{ctx['mapping'].id}?token=wrong",
        json={"issue": {"id": "10001", "fields": {"summary": "x"}}},
    )
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_jira_webhook_silently_accepts_unknown_issue(client, auth_headers, db_session):
    ctx = await _seed_link(client, auth_headers, db_session, provider="jira")
    resp = await client.post(
        f"/api/integrations/jira/webhook/{ctx['mapping'].id}?token={WEBHOOK_TOKEN}",
        json={"issue": {"id": "99999", "fields": {"summary": "alien"}}},
    )
    # Atlassian retries on non-2xx; we silently accept unknown ids.
    assert resp.status_code == 200
    assert resp.json()["accepted"] is True


@pytest.mark.anyio
async def test_jira_webhook_detects_conflict(client, auth_headers, db_session):
    ctx = await _seed_link(client, auth_headers, db_session, provider="jira")
    card_id = ctx["card"]["id"]

    # Bump the local card's updated_at to AFTER last_synced_at to simulate a
    # local edit that hasn't been pushed yet. SQLite's onupdate trigger fires
    # on flush, but the test runs fast enough that the bump might land in the
    # same second — set updated_at explicitly to remove that flake.
    card_row = (await db_session.execute(select(Card).where(Card.id == card_id))).scalar_one()
    card_row.title = "Local edit"
    card_row.updated_at = datetime.now(UTC) + timedelta(seconds=30)
    await db_session.commit()

    payload = {
        "issue": {
            "id": "10001",
            "fields": {
                "summary": "Remote edit",
                "updated": (datetime.now(UTC) + timedelta(minutes=2)).isoformat(),
            },
        },
    }
    resp = await client.post(
        f"/api/integrations/jira/webhook/{ctx['mapping'].id}?token={WEBHOOK_TOKEN}",
        json=payload,
    )
    assert resp.status_code == 200
    assert resp.json()["state"] == "conflict"

    # Local title is unchanged (we didn't overwrite).
    card_after = (await db_session.execute(select(Card).where(Card.id == card_id))).scalar_one()
    assert card_after.title == "Local edit"

    state_after = (
        await db_session.execute(
            select(CardExternalLink.sync_state).where(CardExternalLink.id == ctx["link"].id)
        )
    ).scalar_one()
    assert state_after == "conflict"


@pytest.mark.anyio
async def test_ado_webhook_applies_remote_change(client, auth_headers, db_session):
    ctx = await _seed_link(client, auth_headers, db_session, provider="azure_devops")

    payload = {
        "eventType": "workitem.updated",
        "resource": {
            "id": "WI-1",
            "rev": 7,
            "fields": {
                "System.Title": "ADO upstream",
                "System.ChangedDate": (datetime.now(UTC) + timedelta(minutes=1)).isoformat(),
            },
        },
    }
    basic = base64.b64encode(f":{WEBHOOK_TOKEN}".encode()).decode()
    resp = await client.post(
        f"/api/integrations/azure-devops/webhook/{ctx['mapping'].id}",
        json=payload,
        headers={"Authorization": f"Basic {basic}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["state"] == "synced"

    card_after = (
        await db_session.execute(select(Card).where(Card.id == ctx["card"]["id"]))
    ).scalar_one()
    assert card_after.title == "ADO upstream"

    # Use a column-only select so we bypass the test session's identity-map
    # cache (which still holds the pre-webhook link instance with version_token=None).
    rev_after = (
        await db_session.execute(
            select(CardExternalLink.version_token).where(CardExternalLink.id == ctx["link"].id)
        )
    ).scalar_one()
    assert rev_after == "7"


@pytest.mark.anyio
async def test_ado_webhook_rejects_invalid_basic(client, auth_headers, db_session):
    ctx = await _seed_link(client, auth_headers, db_session, provider="azure_devops")
    basic = base64.b64encode(b":bad-token").decode()
    resp = await client.post(
        f"/api/integrations/azure-devops/webhook/{ctx['mapping'].id}",
        json={"resource": {"id": "WI-1"}},
        headers={"Authorization": f"Basic {basic}"},
    )
    assert resp.status_code == 401
