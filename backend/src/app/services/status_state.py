"""Compute current component state for the public status page.

Three sources of truth get merged here:

1. **Manual overrides** — admin-authored active incidents that mark
   components as degraded/down. Higher precedence than probes; the admin
   message is always the source of truth.
2. **Recent probe rows** — the most recent `status_probes` entry per
   component (Phase B). Reflects auto-detected health.
3. **Live Redis snapshots** — for `ai_provider` components we fall back
   to `services.provider_health` even before probe rows exist, so the
   page shows useful data on day one (Phase A).

Returning value is a dict keyed by component_id → {status_int, source}.
The router maps to user-facing labels and computes the overall.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.status import (
    STATUS_DEGRADED,
    STATUS_MAJOR_OUTAGE,
    STATUS_OPERATIONAL,
    StatusIncident,
    StatusIncidentComponent,
    StatusProbe,
    StatusProbeDaily,
)
from . import provider_health

logger = logging.getLogger(__name__)


# How recent a probe row must be to override the "default operational"
# state. Older than this and we treat the probe as stale and trust Redis
# (or fall back to operational).
_PROBE_FRESHNESS = timedelta(minutes=10)

# Map our probe-status int → impact level used when an incident lists the
# component. Helpers used in two places, defined once.
_IMPACT_FOR_STATUS = {
    STATUS_DEGRADED: STATUS_DEGRADED,
    2: 2,  # partial_outage
    STATUS_MAJOR_OUTAGE: STATUS_MAJOR_OUTAGE,
}


def _impact_to_int(impact: str) -> int:
    """Map an incident-impact string to its numeric status equivalent."""
    return {"degraded": STATUS_DEGRADED, "partial_outage": 2, "major_outage": STATUS_MAJOR_OUTAGE}.get(
        impact, STATUS_DEGRADED
    )


async def _read_manual_overrides(db: AsyncSession) -> dict[str, int]:
    """Return component_id → worst manual-incident impact (open incidents only)."""
    stmt = (
        select(StatusIncidentComponent.component_id, StatusIncidentComponent.impact)
        .join(StatusIncident, StatusIncident.id == StatusIncidentComponent.incident_id)
        .where(StatusIncident.status != "resolved")
    )
    result = await db.execute(stmt)
    out: dict[str, int] = {}
    for component_id, impact in result.all():
        impact_int = _impact_to_int(impact)
        if impact_int > out.get(component_id, STATUS_OPERATIONAL):
            out[component_id] = impact_int
    return out


async def _read_manual_override_started(db: AsyncSession) -> dict[str, datetime]:
    """Return component_id → earliest open-incident started_at across active incidents."""
    stmt = (
        select(StatusIncidentComponent.component_id, StatusIncident.started_at)
        .join(StatusIncident, StatusIncident.id == StatusIncidentComponent.incident_id)
        .where(StatusIncident.status != "resolved")
    )
    out: dict[str, datetime] = {}
    for component_id, started_at in (await db.execute(stmt)).all():
        if started_at is None:
            continue
        if started_at.tzinfo is None:
            started_at = started_at.replace(tzinfo=UTC)
        existing = out.get(component_id)
        if existing is None or started_at < existing:
            out[component_id] = started_at
    return out


async def _latest_probes(db: AsyncSession, component_ids: list[str]) -> dict[str, tuple[int, datetime]]:
    """Return {component_id → (status_int, ts)} for the most recent probe per component."""
    if not component_ids:
        return {}
    # SQLite-friendly version: subquery picks max ts per component.
    rows = await db.execute(
        select(StatusProbe.component_id, StatusProbe.status, StatusProbe.ts)
        .where(StatusProbe.component_id.in_(component_ids))
        .order_by(StatusProbe.component_id, desc(StatusProbe.ts))
    )
    latest: dict[str, tuple[int, datetime]] = {}
    for component_id, status, ts in rows.all():
        if component_id in latest:
            continue
        latest[component_id] = (status, ts)
    return latest


async def _snapshot_ai_provider_status(provider_key: str) -> int:
    """Translate Redis provider snapshot → status int. Healthy/missing → operational."""
    snapshot = await provider_health.get("platform", provider_key)
    if snapshot is None or snapshot.get("status") == "ok":
        return STATUS_OPERATIONAL
    # Unhealthy snapshots cover several upstream conditions: credit
    # exhaustion, invalid keys, rate-limiting. We don't try to distinguish
    # them here — the page just says "having issues".
    return STATUS_MAJOR_OUTAGE


def _probe_key_lookup(component: Any) -> tuple[str, str] | None:
    """Parse `internal_probe_key` into ("provider"|"ready"|"http"|"feature", arg)."""
    key = getattr(component, "internal_probe_key", None)
    if not key or ":" not in key:
        return None
    kind, _, arg = key.partition(":")
    return (kind, arg)


async def compute_component_status(
    db: AsyncSession,
    component: Any,
    latest_probe: tuple[int, datetime] | None,
    manual_override: int,
) -> int:
    """Return the worst-of (manual override, recent probe, snapshot fallback).

    Order: manual > fresh probe > live AI snapshot > operational.
    """
    now = datetime.now(UTC)
    score = manual_override

    if latest_probe is not None:
        status_int, ts = latest_probe
        # Tolerate naive timestamps from sqlite.
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=UTC)
        if now - ts <= _PROBE_FRESHNESS:
            score = max(score, status_int)

    # AI provider live snapshot fallback — runs even if a probe row exists,
    # so the public page mirrors the same provider_health Redis state that
    # /api/system/health-summary uses internally.
    parsed = _probe_key_lookup(component)
    if parsed and parsed[0] == "provider":
        score = max(score, await _snapshot_ai_provider_status(parsed[1]))

    return score


async def current_outage_since(
    db: AsyncSession,
    component: Any,
    manual_started_at: datetime | None,
    latest_probe: tuple[int, datetime] | None,
) -> datetime | None:
    """Return when the current non-operational run started, or None if unknown.

    Precedence:
      1. Manual open incident → its started_at (caller passes ``manual_started_at``).
      2. Latest probe non-operational → walk back through ``status_probes`` to the
         first non-operational sample in the current run.
      3. AI-provider Redis snapshot unhealthy → use snapshot's own ``since`` field.

    Returns None when state is operational, or when no source carries a
    timestamp (e.g. a snapshot with a missing ``since`` field).
    """
    if manual_started_at is not None:
        return manual_started_at

    if latest_probe is not None and latest_probe[0] != STATUS_OPERATIONAL:
        rows = await db.execute(
            select(StatusProbe.ts, StatusProbe.status)
            .where(StatusProbe.component_id == component.id)
            .order_by(desc(StatusProbe.ts))
            .limit(200)
        )
        first_nonop_ts: datetime | None = None
        for ts, status in rows.all():
            if status == STATUS_OPERATIONAL:
                break
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=UTC)
            first_nonop_ts = ts
        if first_nonop_ts is not None:
            return first_nonop_ts

    parsed = _probe_key_lookup(component)
    if parsed and parsed[0] == "provider":
        snapshot = await provider_health.get("platform", parsed[1])
        if snapshot and snapshot.get("status") != "ok":
            raw = snapshot.get("since")
            if isinstance(raw, str):
                try:
                    parsed_dt = datetime.fromisoformat(raw)
                    if parsed_dt.tzinfo is None:
                        parsed_dt = parsed_dt.replace(tzinfo=UTC)
                    return parsed_dt
                except ValueError:
                    return None
    return None


async def uptime_30d(db: AsyncSession, component_id: str) -> float | None:
    """Read 30 days of daily-rollup rows and average uptime_pct. None if no data."""
    cutoff = (datetime.now(UTC) - timedelta(days=30)).date()
    rows = await db.execute(
        select(StatusProbeDaily.uptime_pct).where(
            StatusProbeDaily.component_id == component_id,
            StatusProbeDaily.day >= cutoff,
        )
    )
    values = [r[0] for r in rows.all()]
    if not values:
        return None
    return round(sum(values) / len(values), 2)
