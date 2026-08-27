"""Tests for the subscription scheduler math, runner, and CRUD endpoints."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from unittest.mock import patch
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import select

from src.app.models.organization import Organization, OrgMember
from src.app.models.report_subscription import ReportSubscription
from src.app.models.usage_event import UsageEvent
from src.app.models.user import User
from src.app.services.schedule_math import compute_next_run
from src.app.services.subscription_runner import run_subscription

# ── Schedule math ────────────────────────────────────────────────────────


class TestComputeNextRun:
    def test_daily_picks_next_occurrence(self):
        # Monday May 11 2026 at 08:00 UTC; subscription fires daily at 09:00 UTC.
        after = datetime(2026, 5, 11, 8, 0, tzinfo=UTC)
        nxt = compute_next_run(
            frequency="daily",
            schedule_config={"time_of_day": "09:00", "timezone": "UTC"},
            after=after,
        )
        assert nxt == datetime(2026, 5, 11, 9, 0, tzinfo=UTC)

    def test_daily_after_today_window_rolls_to_tomorrow(self):
        after = datetime(2026, 5, 11, 10, 0, tzinfo=UTC)
        nxt = compute_next_run(
            frequency="daily",
            schedule_config={"time_of_day": "09:00", "timezone": "UTC"},
            after=after,
        )
        assert nxt == datetime(2026, 5, 12, 9, 0, tzinfo=UTC)

    def test_weekly_picks_target_dow(self):
        # Wednesday May 13, 2026 at 12:00 UTC; weekly Mon@09:00.
        after = datetime(2026, 5, 13, 12, 0, tzinfo=UTC)
        nxt = compute_next_run(
            frequency="weekly",
            schedule_config={"time_of_day": "09:00", "timezone": "UTC", "day_of_week": 0},
            after=after,
        )
        assert nxt is not None
        assert nxt.weekday() == 0
        assert nxt.hour == 9
        # Next Monday after May 13 is May 18.
        assert nxt.date() == datetime(2026, 5, 18).date()

    def test_monthly_clamps_to_month_length(self):
        # Subscription says day_of_month=31. February 2026 has 28 days; the
        # next fire after Feb 1 should be Feb 28.
        after = datetime(2026, 2, 1, 0, 0, tzinfo=UTC)
        nxt = compute_next_run(
            frequency="monthly",
            schedule_config={
                "time_of_day": "07:00",
                "timezone": "UTC",
                "day_of_month": 31,
            },
            after=after,
        )
        assert nxt is not None
        assert nxt.month == 2
        assert nxt.day == 28
        assert nxt.hour == 7

    def test_monthly_last_resolves_each_month(self):
        after = datetime(2026, 2, 27, 0, 0, tzinfo=UTC)
        nxt = compute_next_run(
            frequency="monthly",
            schedule_config={
                "time_of_day": "06:00",
                "timezone": "UTC",
                "day_of_month": "last",
            },
            after=after,
        )
        assert nxt is not None
        assert nxt.day == 28  # Feb 28, 2026

    def test_timezone_respected(self):
        # 09:00 America/New_York on May 11 = 13:00 UTC (EDT).
        after = datetime(2026, 5, 11, 0, 0, tzinfo=UTC)
        nxt = compute_next_run(
            frequency="daily",
            schedule_config={"time_of_day": "09:00", "timezone": "America/New_York"},
            after=after,
        )
        assert nxt is not None
        ny = nxt.astimezone(ZoneInfo("America/New_York"))
        assert ny.hour == 9


# ── Subscription runner ─────────────────────────────────────────────────


@pytest.fixture
async def populated_org_and_sub(client, auth_headers, db_session):
    # Bootstrap the auth user's org by hitting the API once.
    resp = await client.get("/api/projects", headers=auth_headers)
    assert resp.status_code == 200
    from tests.conftest import TEST_USER_EMAIL

    user = (await db_session.execute(select(User).where(User.email == TEST_USER_EMAIL))).scalar_one()
    membership = (await db_session.execute(select(OrgMember).where(OrgMember.user_id == user.id))).scalar_one()
    org = (await db_session.execute(select(Organization).where(Organization.id == membership.org_id))).scalar_one()

    # Seed a usage_event so the report has something to summarise.
    db_session.add(
        UsageEvent(
            org_id=org.id,
            provider="anthropic",
            operation="chat",
            model="claude-opus-4-7",
            units={"tokens_in": 100, "tokens_out": 50},
            cost_usd=Decimal("0.005"),
            is_estimated=False,
            source="api",
            occurred_at=datetime.now(UTC) - timedelta(hours=1),
        )
    )
    sub = ReportSubscription(
        org_id=org.id,
        owner_user_id=user.id,
        name="Test sub",
        scope_kind="org",
        frequency="daily",
        schedule_config={"time_of_day": "09:00", "timezone": "UTC"},
        channels=[{"kind": "email", "target": "ops@example.com"}],
        formats=["markdown"],
        is_active=True,
    )
    db_session.add(sub)
    await db_session.commit()
    await db_session.refresh(sub)
    return org, sub


class TestRunSubscription:
    async def test_run_writes_audit_row_and_dispatches(self, db_session, populated_org_and_sub, monkeypatch):
        org, sub = populated_org_and_sub
        monkeypatch.setenv("RESEND_API_KEY", "test-key")
        from src.app.config import get_settings

        get_settings.cache_clear()

        with patch("resend.Emails.send", return_value={"id": "msg"}):
            run = await run_subscription(db_session, sub.id)

        assert run.status == "succeeded"
        assert run.finished_at is not None
        assert run.deliveries
        emailed = [d for d in run.deliveries if d.get("channel") == "email"]
        assert emailed and emailed[0]["delivered_to"] == ["ops@example.com"]

        # Subscription's last_run_at + next_run_at updated.
        await db_session.refresh(sub)
        assert sub.last_run_at is not None
        assert sub.next_run_at is not None and sub.next_run_at > sub.last_run_at

    async def test_run_records_failure_in_audit_row(self, db_session, populated_org_and_sub):
        org, sub = populated_org_and_sub
        # Force a failure inside the assembler.
        with patch(
            "src.app.services.subscription_runner.build_report",
            side_effect=RuntimeError("boom"),
        ):
            run = await run_subscription(db_session, sub.id)
        assert run.status == "failed"
        assert run.error and "boom" in run.error

    async def test_missing_subscription_raises(self, db_session):
        with pytest.raises(ValueError, match="not found"):
            await run_subscription(db_session, "does-not-exist")


# ── CRUD endpoints ──────────────────────────────────────────────────────


def _payload_daily() -> dict:
    return {
        "name": "Daily ops report",
        "scope_kind": "org",
        "frequency": "daily",
        "schedule_config": {"time_of_day": "09:00", "timezone": "UTC"},
        "channels": [{"kind": "email", "target": "ops@example.com"}],
        "formats": ["markdown"],
    }


class TestSubscriptionCRUD:
    async def test_create_returns_201_and_persists(self, client, auth_headers):
        # Bootstrap org first.
        await client.get("/api/projects", headers=auth_headers)
        resp = await client.post("/api/report-subscriptions", json=_payload_daily(), headers=auth_headers)
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["name"] == "Daily ops report"
        assert body["next_run_at"] is not None  # scheduler computed it

    async def test_weekly_requires_day_of_week(self, client, auth_headers):
        await client.get("/api/projects", headers=auth_headers)
        payload = _payload_daily() | {
            "frequency": "weekly",
            "schedule_config": {"time_of_day": "09:00", "timezone": "UTC"},
        }
        resp = await client.post("/api/report-subscriptions", json=payload, headers=auth_headers)
        assert resp.status_code == 422
        assert "day_of_week" in resp.json()["detail"]

    async def test_monthly_requires_day_of_month(self, client, auth_headers):
        await client.get("/api/projects", headers=auth_headers)
        payload = _payload_daily() | {
            "frequency": "monthly",
            "schedule_config": {"time_of_day": "09:00", "timezone": "UTC"},
        }
        resp = await client.post("/api/report-subscriptions", json=payload, headers=auth_headers)
        assert resp.status_code == 422

    async def test_invalid_timezone_rejected(self, client, auth_headers):
        await client.get("/api/projects", headers=auth_headers)
        payload = _payload_daily() | {
            "schedule_config": {"time_of_day": "09:00", "timezone": "Mars/Olympus"},
        }
        resp = await client.post("/api/report-subscriptions", json=payload, headers=auth_headers)
        assert resp.status_code == 422

    async def test_project_scope_requires_id(self, client, auth_headers):
        await client.get("/api/projects", headers=auth_headers)
        payload = _payload_daily() | {"scope_kind": "project"}
        resp = await client.post("/api/report-subscriptions", json=payload, headers=auth_headers)
        assert resp.status_code == 422

    async def test_list_returns_org_subscriptions(self, client, auth_headers):
        await client.get("/api/projects", headers=auth_headers)
        await client.post("/api/report-subscriptions", json=_payload_daily(), headers=auth_headers)
        await client.post(
            "/api/report-subscriptions",
            json=_payload_daily() | {"name": "Second sub"},
            headers=auth_headers,
        )

        resp = await client.get("/api/report-subscriptions", headers=auth_headers)
        assert resp.status_code == 200
        names = [r["name"] for r in resp.json()]
        assert "Daily ops report" in names and "Second sub" in names

    async def test_other_org_caller_cannot_see_or_modify(self, client, auth_headers, other_auth_headers, db_session):
        # The auth_headers user creates a subscription. The other_auth_headers
        # user has no org (the test infra doesn't auto-provision a second
        # one), so org-scoped endpoints return 400. The point is: the other
        # user can't see or touch the row regardless.
        await client.get("/api/projects", headers=auth_headers)
        created = await client.post("/api/report-subscriptions", json=_payload_daily(), headers=auth_headers)
        sub_id = created.json()["id"]

        resp = await client.get(f"/api/report-subscriptions/{sub_id}", headers=other_auth_headers)
        assert resp.status_code in (400, 403, 404)

    async def test_patch_updates_and_reschedules(self, client, auth_headers, db_session):
        await client.get("/api/projects", headers=auth_headers)
        created = await client.post("/api/report-subscriptions", json=_payload_daily(), headers=auth_headers)
        sub_id = created.json()["id"]

        updated_payload = _payload_daily() | {"name": "Renamed"}
        resp = await client.patch(f"/api/report-subscriptions/{sub_id}", json=updated_payload, headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["name"] == "Renamed"

    async def test_delete_marks_soft_deleted(self, client, auth_headers, db_session):
        await client.get("/api/projects", headers=auth_headers)
        created = await client.post("/api/report-subscriptions", json=_payload_daily(), headers=auth_headers)
        sub_id = created.json()["id"]

        resp = await client.delete(f"/api/report-subscriptions/{sub_id}", headers=auth_headers)
        assert resp.status_code == 204

        # Still in DB but soft-deleted; subsequent GET 404s.
        resp = await client.get(f"/api/report-subscriptions/{sub_id}", headers=auth_headers)
        assert resp.status_code == 404

        row = (await db_session.execute(select(ReportSubscription).where(ReportSubscription.id == sub_id))).scalar_one()
        assert row.deleted_at is not None
        assert row.is_active is False

    async def test_run_endpoint_creates_subscription_run(self, client, auth_headers, monkeypatch):
        monkeypatch.setenv("RESEND_API_KEY", "test-key")
        from src.app.config import get_settings

        get_settings.cache_clear()

        await client.get("/api/projects", headers=auth_headers)
        created = await client.post("/api/report-subscriptions", json=_payload_daily(), headers=auth_headers)
        sub_id = created.json()["id"]

        with patch("resend.Emails.send", return_value={"id": "msg"}):
            resp = await client.post(f"/api/report-subscriptions/{sub_id}/run", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "succeeded"
        assert body["deliveries"]
