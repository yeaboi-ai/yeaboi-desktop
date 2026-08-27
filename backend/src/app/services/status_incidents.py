"""Auto-incident open/resolve loop driven by probe-row patterns.

3 consecutive non-operational probes for a component → ensure an open
auto-detected incident exists. 3 consecutive operational probes after that
→ resolve it. Manual incidents (created via /api/admin/status/incidents)
are never touched by this function — only ones with `auto_detected=True`.

Idempotency is enforced via `external_key=f"auto:<component_key>:<minute>"`
so concurrent probe loops can't open duplicates within the same minute.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from sqlalchemy import desc, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.status import (
    STATUS_OPERATIONAL,
    StatusComponent,
    StatusIncident,
    StatusIncidentComponent,
    StatusIncidentUpdate,
    StatusProbe,
)

logger = logging.getLogger(__name__)


THRESHOLD_OPEN = 3
THRESHOLD_CLOSE = 3


def _impact_for_status(status_int: int) -> str:
    return {1: "degraded", 2: "partial_outage", 3: "major_outage"}.get(status_int, "degraded")


async def _recent_statuses(db: AsyncSession, component_id: str, n: int) -> list[int]:
    rows = await db.execute(
        select(StatusProbe.status)
        .where(StatusProbe.component_id == component_id)
        .order_by(desc(StatusProbe.ts))
        .limit(n)
    )
    return [r[0] for r in rows.all()]


async def _open_auto_incident_for(db: AsyncSession, component_id: str) -> StatusIncident | None:
    """Return the currently-open auto-incident for this component, if any."""
    rows = await db.execute(
        select(StatusIncident)
        .join(StatusIncidentComponent, StatusIncidentComponent.incident_id == StatusIncident.id)
        .where(
            StatusIncidentComponent.component_id == component_id,
            StatusIncident.auto_detected.is_(True),
            StatusIncident.status != "resolved",
        )
        .limit(1)
    )
    return rows.scalar_one_or_none()


async def evaluate_auto_incident(db: AsyncSession, component: StatusComponent) -> None:
    """Open or resolve an auto-incident based on the latest probe rows.

    Caller commits.
    """
    recent = await _recent_statuses(db, component.id, max(THRESHOLD_OPEN, THRESHOLD_CLOSE))
    if not recent:
        return

    existing = await _open_auto_incident_for(db, component.id)

    if existing is None:
        # Open: latest N probes all non-operational
        non_op = [s for s in recent[:THRESHOLD_OPEN] if s != STATUS_OPERATIONAL]
        if len(non_op) >= THRESHOLD_OPEN and len(recent) >= THRESHOLD_OPEN:
            worst = max(non_op)
            now = datetime.now(UTC)
            external_key = f"auto:{component.key}:{now.strftime('%Y%m%d%H%M')}"
            incident = StatusIncident(
                title=f"{component.name}: automated detection",
                body="Auto-detected from health probes.",
                severity="major" if worst >= 2 else "minor",
                status="investigating",
                started_at=now,
                auto_detected=True,
                external_key=external_key,
            )
            db.add(incident)
            try:
                await db.flush()
            except IntegrityError:
                # Another worker created the same incident in this minute.
                await db.rollback()
                logger.info("Auto-incident creation raced for %s; skipping", component.key)
                return
            db.add(
                StatusIncidentComponent(
                    incident_id=incident.id,
                    component_id=component.id,
                    impact=_impact_for_status(worst),
                )
            )
            db.add(
                StatusIncidentUpdate(
                    incident_id=incident.id,
                    body=f"{component.name} appears to be unhealthy based on probe results.",
                    status="investigating",
                    posted_at=now,
                )
            )
            logger.warning("Auto-incident opened for component %s (worst=%d)", component.key, worst)
        return

    # Resolve: latest N probes all operational
    if len(recent) >= THRESHOLD_CLOSE and all(s == STATUS_OPERATIONAL for s in recent[:THRESHOLD_CLOSE]):
        now = datetime.now(UTC)
        existing.status = "resolved"
        existing.resolved_at = now
        db.add(
            StatusIncidentUpdate(
                incident_id=existing.id,
                body=f"{component.name} has recovered based on probe results.",
                status="resolved",
                posted_at=now,
            )
        )
        logger.info("Auto-incident resolved for component %s", component.key)
