"""Auto-incident detection + daily sweeper rollup."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from src.app.models.status import (
    STATUS_MAJOR_OUTAGE,
    STATUS_OPERATIONAL,
    StatusComponent,
    StatusIncident,
    StatusIncidentComponent,
    StatusProbe,
    StatusProbeDaily,
)
from src.app.services.status_incidents import evaluate_auto_incident
from src.app.services.status_sweeper import _rollup_yesterday, _sweep_old_probes

pytestmark = pytest.mark.anyio


async def _make_component(db_session, key: str = "redis") -> StatusComponent:
    component = StatusComponent(key=key, name=f"{key.title()} component", group="infra", display_order=1)
    db_session.add(component)
    await db_session.commit()
    await db_session.refresh(component)
    return component


async def _push_probe(db_session, component_id: str, status: int, *, minutes_ago: int = 0) -> None:
    db_session.add(
        StatusProbe(
            component_id=component_id,
            ts=datetime.now(UTC) - timedelta(minutes=minutes_ago),
            status=status,
        )
    )
    await db_session.commit()


async def test_three_outage_probes_open_auto_incident(db_session):
    component = await _make_component(db_session, "redis")
    for i in range(3):
        await _push_probe(db_session, component.id, STATUS_MAJOR_OUTAGE, minutes_ago=2 - i)

    await evaluate_auto_incident(db_session, component)
    await db_session.commit()

    from sqlalchemy import select

    incidents = (
        await db_session.execute(
            select(StatusIncident).where(StatusIncident.auto_detected.is_(True))
        )
    ).scalars().all()
    assert len(incidents) == 1
    assert incidents[0].status == "investigating"


async def test_auto_incident_is_idempotent_within_minute(db_session):
    component = await _make_component(db_session, "redis")
    for i in range(3):
        await _push_probe(db_session, component.id, STATUS_MAJOR_OUTAGE, minutes_ago=2 - i)

    await evaluate_auto_incident(db_session, component)
    await db_session.commit()
    await evaluate_auto_incident(db_session, component)
    await db_session.commit()

    from sqlalchemy import select

    incidents = (
        await db_session.execute(
            select(StatusIncident).where(StatusIncident.auto_detected.is_(True))
        )
    ).scalars().all()
    assert len(incidents) == 1, "duplicate auto-incident created"


async def test_three_operational_probes_resolve_auto_incident(db_session):
    component = await _make_component(db_session, "redis")
    # Open the incident.
    for i in range(3):
        await _push_probe(db_session, component.id, STATUS_MAJOR_OUTAGE, minutes_ago=10 - i)
    await evaluate_auto_incident(db_session, component)
    await db_session.commit()

    # Recovery probes.
    for i in range(3):
        await _push_probe(db_session, component.id, STATUS_OPERATIONAL, minutes_ago=2 - i)
    await evaluate_auto_incident(db_session, component)
    await db_session.commit()

    from sqlalchemy import select

    incident = (
        await db_session.execute(
            select(StatusIncident).where(StatusIncident.auto_detected.is_(True))
        )
    ).scalar_one()
    assert incident.status == "resolved"
    assert incident.resolved_at is not None


async def test_manual_incident_not_auto_resolved(db_session):
    component = await _make_component(db_session, "redis")
    # Pre-existing manual incident — never auto-resolved by the loop.
    manual = StatusIncident(
        title="Manual incident",
        body="hand-authored",
        severity="major",
        status="investigating",
        started_at=datetime.now(UTC),
        auto_detected=False,
    )
    db_session.add(manual)
    await db_session.flush()
    db_session.add(StatusIncidentComponent(incident_id=manual.id, component_id=component.id, impact="major_outage"))
    await db_session.commit()

    for i in range(3):
        await _push_probe(db_session, component.id, STATUS_OPERATIONAL, minutes_ago=2 - i)
    await evaluate_auto_incident(db_session, component)
    await db_session.commit()

    await db_session.refresh(manual)
    assert manual.status == "investigating"
    assert manual.resolved_at is None


async def test_sweeper_deletes_old_probes(db_session):
    component = await _make_component(db_session, "redis")
    very_old = datetime.now(UTC) - timedelta(days=120)
    db_session.add(StatusProbe(component_id=component.id, ts=very_old, status=STATUS_OPERATIONAL))
    recent = datetime.now(UTC) - timedelta(days=1)
    db_session.add(StatusProbe(component_id=component.id, ts=recent, status=STATUS_OPERATIONAL))
    await db_session.commit()

    deleted = await _sweep_old_probes(db_session)
    await db_session.commit()
    assert deleted == 1

    from sqlalchemy import func, select

    remaining = (await db_session.execute(select(func.count()).select_from(StatusProbe))).scalar()
    assert remaining == 1


async def test_rollup_creates_daily_row(db_session):
    component = await _make_component(db_session, "chat")
    yesterday = datetime.now(UTC) - timedelta(days=1)
    base = datetime(yesterday.year, yesterday.month, yesterday.day, 12, 0, tzinfo=UTC)
    db_session.add(StatusProbe(component_id=component.id, ts=base, status=STATUS_OPERATIONAL))
    db_session.add(StatusProbe(component_id=component.id, ts=base + timedelta(minutes=1), status=STATUS_OPERATIONAL))
    db_session.add(StatusProbe(component_id=component.id, ts=base + timedelta(minutes=2), status=STATUS_MAJOR_OUTAGE))
    await db_session.commit()

    rolled = await _rollup_yesterday(db_session)
    assert rolled == 1

    from sqlalchemy import select

    row = (
        await db_session.execute(
            select(StatusProbeDaily).where(StatusProbeDaily.component_id == component.id)
        )
    ).scalar_one()
    assert row.sample_count == 3
    assert row.worst_status == STATUS_MAJOR_OUTAGE
    # 2/3 operational → ~66.67%
    assert round(row.uptime_pct, 1) == 66.7


async def test_rollup_is_idempotent(db_session):
    component = await _make_component(db_session, "chat")
    yesterday = datetime.now(UTC) - timedelta(days=1)
    base = datetime(yesterday.year, yesterday.month, yesterday.day, 12, 0, tzinfo=UTC)
    db_session.add(StatusProbe(component_id=component.id, ts=base, status=STATUS_OPERATIONAL))
    await db_session.commit()

    await _rollup_yesterday(db_session)
    await _rollup_yesterday(db_session)  # second call should upsert, not duplicate

    from sqlalchemy import func, select

    count = (
        await db_session.execute(
            select(func.count()).select_from(StatusProbeDaily).where(StatusProbeDaily.component_id == component.id)
        )
    ).scalar()
    assert count == 1
