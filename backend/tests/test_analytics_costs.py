"""Tests for the new cost and health endpoints, and for the cost block now
attached to /aggregate and /sessions responses."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from src.app.models.organization import Organization
from src.app.models.usage_event import UsageEvent


async def _bootstrap_auth_org(client, auth_headers, db_session):
    """First-touch the API so the JWT-resolved user + org are auto-provisioned,
    then look up the resulting Organization row to get its id."""
    # Any authenticated GET that goes through `get_current_org` will create
    # the user + default org. /api/projects is the cheapest such endpoint.
    resp = await client.get("/api/projects", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    from sqlalchemy import select

    from src.app.models.organization import OrgMember as OM
    from src.app.models.user import User as U
    from tests.conftest import TEST_USER_EMAIL

    user = (await db_session.execute(select(U).where(U.email == TEST_USER_EMAIL))).scalar_one()
    membership = (await db_session.execute(select(OM).where(OM.user_id == user.id))).scalar_one()
    org = (await db_session.execute(select(Organization).where(Organization.id == membership.org_id))).scalar_one()
    return org


@pytest.fixture
async def auth_for_org(client, auth_headers, db_session):
    """The Organization the auth_headers JWT resolves to (auto-provisioned)."""
    return await _bootstrap_auth_org(client, auth_headers, db_session)


@pytest.fixture
async def usage_rows(db_session, auth_for_org):
    """Seed a small spread of usage events: two providers, with one
    is_estimated row for the partial-estimate flag."""
    # Seed within the last few hours so the 24h /health window picks them up.
    base_time = datetime.now(UTC) - timedelta(hours=4)
    rows = [
        UsageEvent(
            org_id=auth_for_org.id,
            provider="anthropic",
            operation="chat",
            model="claude-opus-4-7",
            units={"tokens_in": 1000, "tokens_out": 500},
            cost_usd=Decimal("0.0525"),
            is_estimated=False,
            source="api",
            occurred_at=base_time,
        ),
        UsageEvent(
            org_id=auth_for_org.id,
            provider="anthropic",
            operation="chat",
            model="claude-haiku-4-5",
            units={"tokens_in": 2000, "tokens_out": 1000},
            cost_usd=Decimal("0.0056"),
            is_estimated=False,
            source="api",
            occurred_at=base_time + timedelta(hours=1),
        ),
        UsageEvent(
            org_id=auth_for_org.id,
            provider="elevenlabs",
            operation="tts",
            units={"characters": 5000},
            cost_usd=Decimal("0.9"),
            is_estimated=True,  # back-filled estimate
            source="backfill",
            occurred_at=base_time + timedelta(hours=2),
        ),
    ]
    for r in rows:
        db_session.add(r)
    await db_session.commit()
    return rows


class TestCostsEndpoint:
    async def test_org_scope_groups_by_provider(self, client, auth_headers, usage_rows):
        resp = await client.get("/api/analytics/costs?scope=org", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["scope"]["kind"] == "org"
        assert body["currency"] == "USD"
        assert body["group_by"] == "provider"
        # 0.0525 + 0.0056 + 0.9 = 0.9581
        assert abs(body["total_usd"] - 0.9581) < 1e-6
        assert body["is_partially_estimated"] is True
        # estimated 0.9 / total 0.9581 ≈ 0.9393
        assert 0.93 < body["estimated_share"] < 0.95
        keys = {b["key"] for b in body["buckets"]}
        assert keys == {"anthropic", "elevenlabs"}
        # Buckets sorted by cost desc — elevenlabs ($0.9) outranks anthropic ($0.0581)
        assert body["buckets"][0]["key"] == "elevenlabs"

    async def test_group_by_day_returns_sorted_dates(self, client, auth_headers, usage_rows):
        resp = await client.get("/api/analytics/costs?scope=org&group_by=day", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        # All three events on the same day → one bucket.
        assert len(body["buckets"]) == 1

    async def test_group_by_model_buckets_by_model_name(self, client, auth_headers, usage_rows):
        resp = await client.get("/api/analytics/costs?scope=org&group_by=model", headers=auth_headers)
        body = resp.json()
        keys = {b["key"] for b in body["buckets"]}
        assert "claude-opus-4-7" in keys
        assert "claude-haiku-4-5" in keys
        assert "unknown" in keys  # elevenlabs row has no model

    async def test_group_by_operation(self, client, auth_headers, usage_rows):
        resp = await client.get("/api/analytics/costs?scope=org&group_by=operation", headers=auth_headers)
        body = resp.json()
        keys = {b["key"] for b in body["buckets"]}
        assert keys == {"chat", "tts"}

    async def test_invalid_group_by_returns_422(self, client, auth_headers):
        resp = await client.get("/api/analytics/costs?scope=org&group_by=garbage", headers=auth_headers)
        assert resp.status_code == 422

    async def test_project_scope_requires_id(self, client, auth_headers):
        resp = await client.get("/api/analytics/costs?scope=project", headers=auth_headers)
        assert resp.status_code == 422
        assert "id is required" in resp.json()["detail"]

    async def test_session_scope_requires_id(self, client, auth_headers):
        resp = await client.get("/api/analytics/costs?scope=session", headers=auth_headers)
        assert resp.status_code == 422

    async def test_end_before_start_rejected(self, client, auth_headers):
        resp = await client.get(
            "/api/analytics/costs?scope=org&start=2026-01-02&end=2026-01-01",
            headers=auth_headers,
        )
        assert resp.status_code == 422

    async def test_units_summary_aggregates_per_bucket(self, client, auth_headers, usage_rows):
        resp = await client.get("/api/analytics/costs?scope=org", headers=auth_headers)
        body = resp.json()
        eleven = next(b for b in body["buckets"] if b["key"] == "elevenlabs")
        assert eleven["units_summary"] == {"characters": 5000}
        anth = next(b for b in body["buckets"] if b["key"] == "anthropic")
        # Two anthropic rows summed: 1000+2000 in, 500+1000 out
        assert anth["units_summary"] == {"tokens_in": 3000, "tokens_out": 1500}

    async def test_series_includes_per_provider_breakdown(self, client, auth_headers, usage_rows):
        resp = await client.get("/api/analytics/costs?scope=org", headers=auth_headers)
        body = resp.json()
        assert body["series"]
        for point in body["series"]:
            assert "date" in point and "cost_usd" in point and "by_provider" in point
            assert isinstance(point["by_provider"], dict)

    async def test_other_org_data_invisible(self, client, auth_headers, usage_rows, db_session):
        # Add a row for a *different* org and confirm it doesn't leak in.
        other = Organization(name="Other", slug="other-org")
        db_session.add(other)
        await db_session.flush()
        db_session.add(
            UsageEvent(
                org_id=other.id,
                provider="anthropic",
                operation="chat",
                units={"tokens_in": 1_000_000},
                cost_usd=Decimal("99.999"),
                is_estimated=False,
                source="api",
            )
        )
        await db_session.commit()

        resp = await client.get("/api/analytics/costs?scope=org", headers=auth_headers)
        body = resp.json()
        assert body["total_usd"] < 1  # the seed data is < $1 total


class TestHealthEndpoint:
    async def test_returns_zeros_when_empty(self, client, auth_headers, auth_for_org):
        resp = await client.get("/api/analytics/health", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body == {
            "usage_event_count_24h": 0,
            "last_event_at": None,
            "providers_seen_24h": [],
            "backfill_completed_at": None,
        }

    async def test_counts_recent_events_and_lists_providers(self, client, auth_headers, usage_rows):
        resp = await client.get("/api/analytics/health", headers=auth_headers)
        body = resp.json()
        # All seeded rows are within the last 24h window
        assert body["usage_event_count_24h"] == 3
        assert set(body["providers_seen_24h"]) == {"anthropic", "elevenlabs"}
        assert body["last_event_at"] is not None
        # The elevenlabs row has source='backfill'
        assert body["backfill_completed_at"] is not None

    async def test_old_events_excluded_from_24h_window(self, client, auth_headers, auth_for_org, db_session):
        old = datetime.now(UTC) - timedelta(days=10)
        db_session.add(
            UsageEvent(
                org_id=auth_for_org.id,
                provider="anthropic",
                operation="chat",
                units={"tokens_in": 100},
                cost_usd=Decimal("0.001"),
                is_estimated=False,
                source="api",
                occurred_at=old,
            )
        )
        await db_session.commit()

        resp = await client.get("/api/analytics/health", headers=auth_headers)
        body = resp.json()
        assert body["usage_event_count_24h"] == 0
        # last_event_at still reflects all-time max (the old row)
        assert body["last_event_at"] is not None


class TestCurrentMonthSpend:
    async def test_returns_zero_when_no_events(self, client, auth_headers, auth_for_org):
        resp = await client.get("/api/analytics/spend/current-month", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["total_usd"] == 0
        assert body["last_month_usd"] == 0
        assert body["delta_pct"] is None
        assert body["is_partially_estimated"] is False
        assert body["by_provider"] == {}
        # Month string is YYYY-MM.
        assert len(body["month"]) == 7 and body["month"][4] == "-"

    async def test_includes_current_month_events(self, client, auth_headers, usage_rows):
        resp = await client.get("/api/analytics/spend/current-month", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        # The seeded events live in the current month (4 hours ago).
        assert body["total_usd"] > 0
        assert "anthropic" in body["by_provider"]
        assert body["is_partially_estimated"] is True

    async def test_excludes_prior_month_events_from_total(self, client, auth_headers, auth_for_org, db_session):
        # Drop a row firmly in last month so it lands in `last_month_usd`
        # but not `total_usd`.
        last_month = datetime.now(UTC).replace(day=1) - timedelta(days=15)
        db_session.add(
            UsageEvent(
                org_id=auth_for_org.id,
                provider="anthropic",
                operation="chat",
                units={"tokens_in": 1000},
                cost_usd=Decimal("1.234"),
                is_estimated=False,
                source="api",
                occurred_at=last_month,
            )
        )
        await db_session.commit()
        resp = await client.get("/api/analytics/spend/current-month", headers=auth_headers)
        body = resp.json()
        assert body["total_usd"] == 0  # nothing this month
        assert abs(body["last_month_usd"] - 1.234) < 1e-6

    async def test_delta_pct_when_both_months_have_spend(
        self, client, auth_headers, auth_for_org, db_session
    ):
        now = datetime.now(UTC)
        last_month = now.replace(day=1) - timedelta(days=15)
        db_session.add_all(
            [
                UsageEvent(
                    org_id=auth_for_org.id,
                    provider="anthropic",
                    operation="chat",
                    units={"tokens_in": 1000},
                    cost_usd=Decimal("1.0"),
                    is_estimated=False,
                    source="api",
                    occurred_at=last_month,
                ),
                UsageEvent(
                    org_id=auth_for_org.id,
                    provider="anthropic",
                    operation="chat",
                    units={"tokens_in": 1500},
                    cost_usd=Decimal("1.5"),
                    is_estimated=False,
                    source="api",
                    occurred_at=now - timedelta(hours=2),
                ),
            ]
        )
        await db_session.commit()
        resp = await client.get("/api/analytics/spend/current-month", headers=auth_headers)
        body = resp.json()
        # 1.5 vs 1.0 = +50%
        assert abs(body["delta_pct"] - 50.0) < 0.1


class TestAggregateIncludesCostAndScope:
    async def test_aggregate_returns_cost_and_scope_blocks(self, client, auth_headers, usage_rows, db_session):
        # Need at least one Session row in the org for /aggregate to populate
        # the cost block (it short-circuits with an empty CostBreakdown when
        # the org has no sessions). Create one via the API so the FK is happy.
        proj = await client.post("/api/projects", json={"name": "Agg Test"}, headers=auth_headers)
        await client.post(
            f"/api/projects/{proj.json()['id']}/sessions",
            json={"initial_idea": "test"},
            headers=auth_headers,
        )

        resp = await client.get("/api/analytics/aggregate", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert "cost" in body and "scope" in body
        assert body["scope"]["kind"] == "org"
        assert body["scope"]["session_count"] == 1
        # Cost block sums to the seeded usage_events total.
        assert body["cost"]["is_partially_estimated"] is True
        assert body["cost"]["total_usd"] > 0
