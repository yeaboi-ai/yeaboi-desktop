"""End-to-end test for POST /api/sync/cards/{id}/push (Jira).

Mocks the JiraWriter to avoid real HTTP. Covers happy-path create, idempotent
update on second push, and the no-mapping 400 case.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.app.models.integration import OrgIntegration
from src.app.models.sync import CardExternalLink, IntegrationProjectMapping
from src.app.services.crypto import encrypt_api_key


@dataclass
class FakeWriterResult:
    issue_id: str
    issue_key: str
    self_url: str
    browse_url: str


class FakeWriter:
    def __init__(self, *_args: Any, **_kw: Any):
        FakeWriter.calls.append({})

    calls: list[dict[str, Any]] = []
    create_payload: dict[str, Any] | None = None
    update_payload: dict[str, Any] | None = None

    async def create_issue(self, payload: dict[str, Any]) -> FakeWriterResult:
        FakeWriter.create_payload = payload
        return FakeWriterResult(
            issue_id="100001",
            issue_key="PROJ-42",
            self_url="https://example.atlassian.net/rest/api/3/issue/100001",
            browse_url="https://example.atlassian.net/browse/PROJ-42",
        )

    async def update_issue(self, issue_id: str, payload: dict[str, Any]) -> None:
        FakeWriter.update_payload = {"issue_id": issue_id, **payload}


@pytest.fixture(autouse=True)
def _patch_writer(monkeypatch):
    FakeWriter.calls.clear()
    FakeWriter.create_payload = None
    FakeWriter.update_payload = None
    from src.app.routers import sync_actions

    monkeypatch.setattr(sync_actions, "JiraWriter", FakeWriter)
    yield


async def _make_card_with_mapping(
    client, auth_headers, db_session: AsyncSession
) -> dict:
    """Set up: project + board + card + Jira OrgIntegration + project mapping."""
    proj = (await client.post("/api/projects", json={"name": "Sync me"}, headers=auth_headers)).json()
    board = (
        await client.get(f"/api/projects/{proj['id']}/board", headers=auth_headers)
    ).json()
    backlog = board["columns"][0]["id"]
    card = (
        await client.post(
            f"/api/boards/{board['id']}/cards",
            json={
                "column_id": backlog,
                "title": "Implement SSO",
                "description": "First-pass.",
                "priority": "high",
                "story_points": 3,
                "labels": ["auth"],
                "acceptance_criteria": ["Login works"],
            },
            headers=auth_headers,
        )
    ).json()

    # OrgIntegration row + mapping. Encrypt the fake token so the route's
    # decrypt_api_key call resolves it back to "fake-token".
    project_org_id = (
        await db_session.execute(
            select(__import__("src.app.models.project", fromlist=["Project"]).Project.org_id).where(
                __import__("src.app.models.project", fromlist=["Project"]).Project.id == proj["id"]
            )
        )
    ).scalar_one()

    integration = OrgIntegration(
        org_id=project_org_id,
        provider="jira",
        category="issue_tracking",
        auth_type="oauth",
        status="active",
        access_token=encrypt_api_key("fake-token"),
        scopes='["write:jira-work"]',
        connected_by="00000000-0000-0000-0000-000000000000",
    )
    db_session.add(integration)
    await db_session.flush()

    mapping = IntegrationProjectMapping(
        integration_id=integration.id,
        internal_project_id=proj["id"],
        external_project_key="PROJ",
        external_project_id="10000",
        default_issue_type="Story",
        field_mappings={},
        sync_direction="push_only",
        enabled=True,
    )
    db_session.add(mapping)
    await db_session.commit()

    return {"project": proj, "card": card, "integration": integration, "mapping": mapping}


@pytest.mark.anyio
async def test_push_card_creates_jira_issue(client, auth_headers, db_session):
    ctx = await _make_card_with_mapping(client, auth_headers, db_session)
    card = ctx["card"]

    resp = await client.post(
        f"/api/sync/cards/{card['id']}/push",
        json={"provider": "jira"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["sync_status"]["external_key"] == "PROJ-42"
    assert body["sync_status"]["state"] == "synced"
    assert body["sync_status"]["external_url"].endswith("/browse/PROJ-42")

    # Translator was invoked with the card fields we set up.
    assert FakeWriter.create_payload is not None
    fields = FakeWriter.create_payload["fields"]
    assert fields["summary"] == "Implement SSO"
    assert fields["issuetype"] == {"name": "Story"}
    assert fields["project"] == {"id": "10000"}
    assert fields["priority"] == {"name": "High"}

    # CardExternalLink row exists with the expected state.
    link = (
        await db_session.execute(
            select(CardExternalLink).where(CardExternalLink.card_id == card["id"])
        )
    ).scalar_one()
    assert link.external_id == "100001"
    assert link.external_key == "PROJ-42"


@pytest.mark.anyio
async def test_push_card_second_time_updates(client, auth_headers, db_session):
    ctx = await _make_card_with_mapping(client, auth_headers, db_session)
    card = ctx["card"]

    await client.post(
        f"/api/sync/cards/{card['id']}/push",
        json={"provider": "jira"},
        headers=auth_headers,
    )
    # Second push should call update_issue, not create_issue.
    FakeWriter.create_payload = None
    resp = await client.post(
        f"/api/sync/cards/{card['id']}/push",
        json={"provider": "jira"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert FakeWriter.create_payload is None
    assert FakeWriter.update_payload is not None
    assert FakeWriter.update_payload["issue_id"] == "100001"


@pytest.mark.anyio
async def test_push_without_mapping_returns_400(client, auth_headers):
    proj = (await client.post("/api/projects", json={"name": "No mapping"}, headers=auth_headers)).json()
    board = (
        await client.get(f"/api/projects/{proj['id']}/board", headers=auth_headers)
    ).json()
    backlog = board["columns"][0]["id"]
    card = (
        await client.post(
            f"/api/boards/{board['id']}/cards",
            json={"column_id": backlog, "title": "Dangling"},
            headers=auth_headers,
        )
    ).json()

    resp = await client.post(
        f"/api/sync/cards/{card['id']}/push",
        json={"provider": "jira"},
        headers=auth_headers,
    )
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_push_unsupported_provider(client, auth_headers):
    resp = await client.post(
        "/api/sync/cards/00000000-0000-0000-0000-000000000000/push",
        json={"provider": "linear"},
        headers=auth_headers,
    )
    assert resp.status_code == 400
