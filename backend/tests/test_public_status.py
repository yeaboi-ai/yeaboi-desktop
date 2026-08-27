"""Public status endpoints — unauthenticated, sanitized."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from src.app.models.status import (
    STATUS_DEGRADED,
    STATUS_MAJOR_OUTAGE,
    STATUS_OPERATIONAL,
    StatusComponent,
    StatusIncident,
    StatusIncidentComponent,
    StatusProbe,
    StatusProbeDaily,
)

pytestmark = pytest.mark.anyio


async def _seed_components(db_session):
    """Seed a tiny set of components — Alembic migrations don't run on the
    in-memory SQLite test DB, only Base.metadata.create_all does."""
    components = [
        StatusComponent(key="chat", name="Chat", group="feature", display_order=10),
        StatusComponent(key="redis", name="Redis", group="infra", display_order=20),
        StatusComponent(
            key="anthropic",
            name="Anthropic",
            group="ai_provider",
            display_order=30,
            internal_probe_key="provider:anthropic",
        ),
    ]
    for c in components:
        db_session.add(c)
    await db_session.commit()
    return components


async def test_public_status_requires_no_auth(client, db_session):
    await _seed_components(db_session)
    resp = await client.get("/api/public/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["overall"] == "operational"
    assert {c["key"] for c in data["components"]} == {"chat", "redis", "anthropic"}
    assert data["active_incidents"] == []
    assert data["active_maintenance"] == []
    assert resp.headers.get("cache-control", "").startswith("public")


async def test_public_status_reflects_open_incident(client, db_session):
    components = await _seed_components(db_session)
    chat = next(c for c in components if c.key == "chat")

    incident = StatusIncident(
        title="Chat is down",
        body="Investigating",
        severity="major",
        status="investigating",
        started_at=datetime.now(UTC),
    )
    db_session.add(incident)
    await db_session.flush()
    db_session.add(
        StatusIncidentComponent(incident_id=incident.id, component_id=chat.id, impact="major_outage")
    )
    await db_session.commit()

    resp = await client.get("/api/public/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["overall"] == "major_outage"
    component_status = {c["key"]: c["status"] for c in data["components"]}
    assert component_status["chat"] == "major_outage"
    assert component_status["redis"] == "operational"
    assert len(data["active_incidents"]) == 1
    assert data["active_incidents"][0]["title"] == "Chat is down"
    assert "chat" in data["active_incidents"][0]["affected_components"]


async def test_public_history_returns_n_buckets(client, db_session):
    components = await _seed_components(db_session)
    chat = next(c for c in components if c.key == "chat")

    today = datetime.now(UTC).date()
    now = datetime.now(UTC)

    # Today's segment must come from live status_probes — the sweeper never
    # writes a rollup for *today*, so reading the rollup table for today
    # would always show green. Seed three live samples: 2 ok, 1 down →
    # worst=major_outage, uptime=66.67%.
    for ts_offset, status in [(0, STATUS_MAJOR_OUTAGE), (5, STATUS_OPERATIONAL), (10, STATUS_OPERATIONAL)]:
        db_session.add(
            StatusProbe(
                component_id=chat.id,
                ts=now - timedelta(minutes=ts_offset),
                status=status,
                latency_ms=None,
                error=None,
            )
        )
    # Historical days continue to come from the daily rollup.
    db_session.add(
        StatusProbeDaily(
            component_id=chat.id,
            day=today - timedelta(days=3),
            worst_status=STATUS_DEGRADED,
            uptime_pct=98.0,
            sample_count=1440,
        )
    )
    await db_session.commit()

    resp = await client.get("/api/public/status/components/chat/history?days=90")
    assert resp.status_code == 200
    data = resp.json()
    assert data["component_key"] == "chat"
    assert len(data["buckets"]) == 90

    # Today's bucket reflects the live probe samples, not a rollup.
    today_bucket = next(b for b in data["buckets"] if b["day"] == today.isoformat())
    assert today_bucket["worst_status"] == "major_outage"
    assert today_bucket["uptime_pct"] == pytest.approx(66.67, abs=0.02)

    # Historical rollup is honored.
    seeded = next(b for b in data["buckets"] if b["day"] == (today - timedelta(days=3)).isoformat())
    assert seeded["worst_status"] == "degraded"
    assert seeded["uptime_pct"] == 98.0

    # Days with no rollup default to operational/100%.
    gap = next(b for b in data["buckets"] if b["day"] == (today - timedelta(days=1)).isoformat())
    assert gap["worst_status"] == "operational"
    assert gap["uptime_pct"] == 100.0


async def test_public_history_today_falls_back_when_no_probes(client, db_session):
    """When there are zero probe rows for today, today's bucket should still
    reflect current state via compute_component_status — not silently default
    to operational/100%. This is the exact scenario that broke for the
    Anthropic row: snapshot says down, no probe rows yet, bar was green."""
    components = await _seed_components(db_session)
    chat = next(c for c in components if c.key == "chat")

    today = datetime.now(UTC).date()
    incident = StatusIncident(
        title="Chat down",
        body=None,
        severity="major",
        status="investigating",
        started_at=datetime.now(UTC),
    )
    db_session.add(incident)
    await db_session.flush()
    db_session.add(StatusIncidentComponent(incident_id=incident.id, component_id=chat.id, impact="major_outage"))
    await db_session.commit()

    resp = await client.get("/api/public/status/components/chat/history?days=7")
    assert resp.status_code == 200
    data = resp.json()
    today_bucket = next(b for b in data["buckets"] if b["day"] == today.isoformat())
    assert today_bucket["worst_status"] == "major_outage"
    assert today_bucket["uptime_pct"] == 0.0


async def test_public_history_404_for_unknown_component(client, db_session):
    await _seed_components(db_session)
    resp = await client.get("/api/public/status/components/does-not-exist/history?days=30")
    assert resp.status_code == 404


async def test_public_incidents_pagination(client, db_session):
    components = await _seed_components(db_session)
    chat = next(c for c in components if c.key == "chat")
    base = datetime.now(UTC)
    for i in range(5):
        inc = StatusIncident(
            title=f"Past incident {i}",
            body=None,
            severity="minor",
            status="resolved",
            started_at=base - timedelta(days=i + 1),
            resolved_at=base - timedelta(days=i + 1) + timedelta(minutes=30),
        )
        db_session.add(inc)
        await db_session.flush()
        db_session.add(StatusIncidentComponent(incident_id=inc.id, component_id=chat.id, impact="degraded"))
    await db_session.commit()

    resp = await client.get("/api/public/status/incidents?limit=2")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["incidents"]) == 2
    assert data["next_cursor"] is not None


async def test_status_endpoint_uses_redis_snapshot_for_ai_provider(client, db_session):
    """When no probe rows exist and the AI provider snapshot is unhealthy,
    the public page falls back to the snapshot to mark the component down."""
    await _seed_components(db_session)

    from src.app.services import provider_health
    from src.app.services.provider_errors import CreditExhaustedError

    err = CreditExhaustedError(
        provider="anthropic",
        scope="platform",
        message="No credits remaining",
    )
    await provider_health.mark_unhealthy("platform", "anthropic", err)
    try:
        resp = await client.get("/api/public/status")
        assert resp.status_code == 200
        data = resp.json()
        anthropic = next(c for c in data["components"] if c["key"] == "anthropic")
        assert anthropic["status"] == "major_outage"
        assert data["overall"] == "major_outage"
        # `since` is populated from the snapshot's own `since` field — not None.
        assert anthropic["since"] is not None
    finally:
        await provider_health.mark_healthy("platform", "anthropic")


async def test_status_endpoint_populates_since_from_manual_incident(client, db_session):
    """A manually-opened incident sets `since` to its started_at on each
    affected component."""
    components = await _seed_components(db_session)
    chat = next(c for c in components if c.key == "chat")

    started = datetime.now(UTC) - timedelta(hours=2)
    incident = StatusIncident(
        title="Chat outage",
        severity="major",
        status="investigating",
        started_at=started,
    )
    db_session.add(incident)
    await db_session.flush()
    db_session.add(StatusIncidentComponent(incident_id=incident.id, component_id=chat.id, impact="major_outage"))
    await db_session.commit()

    resp = await client.get("/api/public/status")
    data = resp.json()
    chat_dto = next(c for c in data["components"] if c["key"] == "chat")
    assert chat_dto["status"] == "major_outage"
    assert chat_dto["since"] is not None
    # Allow a few seconds of drift between recorded started_at and the parsed
    # ISO timestamp coming back.
    parsed = datetime.fromisoformat(chat_dto["since"])
    assert abs((parsed - started).total_seconds()) < 5


async def test_status_endpoint_passes_through_upstream_url(client, db_session):
    """When a component is non-operational AND has an upstream_status_url,
    that URL is surfaced on the DTO. Inline incident fetching is best-effort —
    the test only asserts the URL passthrough, not the network call."""
    components = await _seed_components(db_session)
    chat = next(c for c in components if c.key == "chat")
    chat.upstream_status_url = "https://status.example.com"
    incident = StatusIncident(title="x", severity="major", status="investigating", started_at=datetime.now(UTC))
    db_session.add(incident)
    await db_session.flush()
    db_session.add(StatusIncidentComponent(incident_id=incident.id, component_id=chat.id, impact="major_outage"))
    await db_session.commit()

    resp = await client.get("/api/public/status")
    data = resp.json()
    chat_dto = next(c for c in data["components"] if c["key"] == "chat")
    assert chat_dto["upstream_status_url"] == "https://status.example.com"
    # Field is always present (possibly empty list).
    assert isinstance(chat_dto["upstream_incidents"], list)
