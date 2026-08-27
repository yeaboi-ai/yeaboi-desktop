"""Tests for the /api/analytics/session-ai-calls/{session_id} endpoint that
drives the AI Inspector page. Covers the auth / scope rules (404 covers both
missing and cross-org access so existence isn't leaked) and the aggregation
math over a small seeded set of usage_events."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from src.app.models.base import gen_uuid
from src.app.models.organization import Organization, Team
from src.app.models.project import Project
from src.app.models.session import Session
from src.app.models.usage_event import UsageEvent


async def _bootstrap_auth_org(client, auth_headers, db_session) -> Organization:
    resp = await client.get("/api/projects", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    from sqlalchemy import select

    from src.app.models.organization import OrgMember as OM
    from src.app.models.user import User as U
    from tests.conftest import TEST_USER_EMAIL

    user = (await db_session.execute(select(U).where(U.email == TEST_USER_EMAIL))).scalar_one()
    membership = (await db_session.execute(select(OM).where(OM.user_id == user.id))).scalar_one()
    return (await db_session.execute(select(Organization).where(Organization.id == membership.org_id))).scalar_one()


@pytest.fixture
async def auth_for_org(client, auth_headers, db_session):
    return await _bootstrap_auth_org(client, auth_headers, db_session)


@pytest.fixture
async def session_in_org(db_session, auth_for_org):
    """A Session row in the auth'd org so the endpoint's 404 guard passes."""
    from sqlalchemy import select

    from src.app.models.user import User as U
    from tests.conftest import TEST_USER_EMAIL

    user = (await db_session.execute(select(U).where(U.email == TEST_USER_EMAIL))).scalar_one()

    team = Team(id=gen_uuid(), org_id=auth_for_org.id, name="AI Inspector Test Team", slug=gen_uuid()[:8])
    db_session.add(team)
    await db_session.flush()

    project = Project(
        id=gen_uuid(),
        name="AI Inspector Test Project",
        owner_id=user.id,
        org_id=auth_for_org.id,
        team_id=team.id,
    )
    db_session.add(project)
    await db_session.flush()

    session = Session(id=gen_uuid(), project_id=project.id, org_id=auth_for_org.id)
    db_session.add(session)
    await db_session.commit()
    return session


@pytest.fixture
async def seeded_calls(db_session, auth_for_org, session_in_org):
    """Three usage_events for the test session:
    - two Anthropic Opus chat calls (different cache shapes)
    - one OpenAI gpt-4o-mini chat call (no cache fields)
    The mix exercises by_model / by_provider / by_operation aggregation."""
    base = datetime.now(UTC) - timedelta(minutes=10)
    rows = [
        UsageEvent(
            org_id=auth_for_org.id,
            session_id=session_in_org.id,
            project_id=session_in_org.project_id,
            provider="anthropic",
            operation="chat",
            model="claude-opus-4-7",
            units={"tokens_in": 1000, "tokens_out": 500, "cache_read": 200},
            cost_usd=Decimal("0.0525"),
            is_estimated=False,
            source="api",
            occurred_at=base,
        ),
        UsageEvent(
            org_id=auth_for_org.id,
            session_id=session_in_org.id,
            project_id=session_in_org.project_id,
            provider="anthropic",
            operation="chat",
            model="claude-opus-4-7",
            units={"tokens_in": 2000, "tokens_out": 800, "cache_write": 1500},
            cost_usd=Decimal("0.0890"),
            is_estimated=False,
            source="api",
            occurred_at=base + timedelta(seconds=30),
        ),
        UsageEvent(
            org_id=auth_for_org.id,
            session_id=session_in_org.id,
            project_id=session_in_org.project_id,
            provider="openai",
            operation="chat",
            model="gpt-4o-mini",
            units={"tokens_in": 500, "tokens_out": 100},
            cost_usd=Decimal("0.0010"),
            is_estimated=True,
            source="api",
            occurred_at=base + timedelta(minutes=1),
        ),
    ]
    for r in rows:
        db_session.add(r)
    await db_session.commit()
    return rows


class TestSessionAiCallsEndpoint:
    async def test_happy_path_returns_calls_and_aggregations(
        self, client, auth_headers, session_in_org, seeded_calls
    ):
        resp = await client.get(
            f"/api/analytics/session-ai-calls/{session_in_org.id}", headers=auth_headers
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()

        # The three seeded calls come back, sorted newest-first.
        assert body["session_id"] == session_in_org.id
        assert len(body["calls"]) == 3
        # occurred_at is ISO; newest first per ORDER BY DESC
        assert body["calls"][0]["occurred_at"] >= body["calls"][1]["occurred_at"]

        # Token + cost aggregations: 3500 in, 1400 out, 200 cache_read, 1500 cache_write,
        # cost 0.1425 (= 0.0525 + 0.0890 + 0.0010).
        agg = body["aggregations"]
        assert agg["total_calls"] == 3
        assert agg["total_input_tokens"] == 3500
        assert agg["total_output_tokens"] == 1400
        assert agg["total_cache_read"] == 200
        assert agg["total_cache_write"] == 1500
        assert abs(agg["total_cost_usd"] - 0.1425) < 1e-6
        # OpenAI row is_estimated=True flips the partial flag.
        assert agg["is_partially_estimated"] is True

        # by_model: anthropic Opus aggregated into one bucket; gpt-4o-mini separate.
        by_model_keys = {b["key"] for b in agg["by_model"]}
        assert by_model_keys == {"claude-opus-4-7", "gpt-4o-mini"}
        opus_bucket = next(b for b in agg["by_model"] if b["key"] == "claude-opus-4-7")
        assert opus_bucket["calls"] == 2
        assert opus_bucket["input_tokens"] == 3000
        assert opus_bucket["output_tokens"] == 1300

        # by_provider buckets sorted by cost desc — Anthropic ($0.1415) > OpenAI ($0.001).
        assert [b["key"] for b in agg["by_provider"]] == ["anthropic", "openai"]

        # by_operation: only "chat" in this fixture.
        assert {b["key"] for b in agg["by_operation"]} == {"chat"}

    async def test_returns_empty_aggregations_for_session_with_no_calls(
        self, client, auth_headers, session_in_org
    ):
        # No seeded_calls — session exists but has zero usage_events.
        resp = await client.get(
            f"/api/analytics/session-ai-calls/{session_in_org.id}", headers=auth_headers
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["calls"] == []
        assert body["aggregations"]["total_calls"] == 0
        assert body["aggregations"]["total_cost_usd"] == 0.0
        assert body["aggregations"]["is_partially_estimated"] is False
        assert body["aggregations"]["by_model"] == []

    async def test_unauth_returns_401(self, client, session_in_org):
        resp = await client.get(f"/api/analytics/session-ai-calls/{session_in_org.id}")
        assert resp.status_code == 401

    async def test_unknown_session_returns_404(self, client, auth_headers, auth_for_org):
        resp = await client.get(
            "/api/analytics/session-ai-calls/00000000-0000-0000-0000-000000000000",
            headers=auth_headers,
        )
        assert resp.status_code == 404

    async def test_cross_org_session_returns_404(
        self, client, auth_headers, db_session, auth_for_org
    ):
        """A session that exists in a *different* org should return 404,
        not 403 — we don't want to leak the session id's existence."""
        other_org = Organization(id=gen_uuid(), name="Other Org", slug=gen_uuid()[:8])
        db_session.add(other_org)
        await db_session.flush()
        # Project + Session in the other org.
        from sqlalchemy import select

        from src.app.models.user import User as U
        from tests.conftest import TEST_USER_EMAIL

        user = (await db_session.execute(select(U).where(U.email == TEST_USER_EMAIL))).scalar_one()
        other_team = Team(id=gen_uuid(), org_id=other_org.id, name="Other Team", slug=gen_uuid()[:8])
        db_session.add(other_team)
        await db_session.flush()
        other_project = Project(
            id=gen_uuid(),
            name="Other proj",
            owner_id=user.id,
            org_id=other_org.id,
            team_id=other_team.id,
        )
        db_session.add(other_project)
        await db_session.flush()
        other_session = Session(id=gen_uuid(), project_id=other_project.id, org_id=other_org.id)
        db_session.add(other_session)
        await db_session.commit()

        resp = await client.get(
            f"/api/analytics/session-ai-calls/{other_session.id}", headers=auth_headers
        )
        assert resp.status_code == 404

    async def test_invalid_limit_returns_422(self, client, auth_headers, session_in_org):
        resp = await client.get(
            f"/api/analytics/session-ai-calls/{session_in_org.id}?limit=99999", headers=auth_headers
        )
        assert resp.status_code == 422
