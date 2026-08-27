"""Public, unauthenticated status page API.

Three endpoints serve the marketing-grade `/status` page:

  GET /api/public/status                            — current state
  GET /api/public/status/components/{key}/history   — 90-day rollup
  GET /api/public/status/incidents                  — paginated past incidents

Rate-limited via slowapi (per-IP). 30-second cache so a high-traffic
incident page doesn't hammer the DB. **No auth dependency**: a status page
that requires login is useless during an outage.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import asc, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..middleware.rate_limit import limiter
from ..models.status import (
    PROBE_STATUS_LABELS,
    STATUS_OPERATIONAL,
    StatusComponent,
    StatusIncident,
    StatusIncidentComponent,
    StatusIncidentUpdate,
    StatusMaintenance,
    StatusMaintenanceComponent,
    StatusProbe,
    StatusProbeDaily,
)
from ..schemas.status import (
    HistoryBucketDTO,
    HistoryResponse,
    IncidentListResponse,
    PublicComponentDTO,
    PublicIncidentDTO,
    PublicIncidentUpdateDTO,
    PublicMaintenanceDTO,
    PublicStatusResponse,
    UpstreamIncidentRefDTO,
)
from ..services import status_state, status_third_party

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/public/status", tags=["public-status"])

_CACHE_HEADER = "public, max-age=30, s-maxage=30"


def _status_label(status_int: int) -> str:
    return PROBE_STATUS_LABELS.get(status_int, "operational")


def _worst(values: list[int]) -> int:
    return max(values) if values else STATUS_OPERATIONAL


async def _load_components(db: AsyncSession) -> list[StatusComponent]:
    result = await db.execute(
        select(StatusComponent)
        .where(StatusComponent.active.is_(True))
        .order_by(asc(StatusComponent.display_order), asc(StatusComponent.name))
    )
    return list(result.scalars().all())


async def _load_active_incidents(db: AsyncSession) -> list[StatusIncident]:
    result = await db.execute(
        select(StatusIncident).where(StatusIncident.status != "resolved").order_by(StatusIncident.started_at.desc())
    )
    return list(result.scalars().all())


async def _load_active_maintenance(db: AsyncSession) -> list[StatusMaintenance]:
    now = datetime.now(UTC)
    result = await db.execute(
        select(StatusMaintenance)
        .where(
            StatusMaintenance.status.in_(("scheduled", "in_progress")),
            StatusMaintenance.scheduled_end >= now,
        )
        .order_by(StatusMaintenance.scheduled_start.asc())
    )
    return list(result.scalars().all())


async def _component_keys_for_incident(db: AsyncSession, incident_id: str) -> list[str]:
    rows = await db.execute(
        select(StatusComponent.key)
        .join(StatusIncidentComponent, StatusIncidentComponent.component_id == StatusComponent.id)
        .where(StatusIncidentComponent.incident_id == incident_id)
    )
    return [r[0] for r in rows.all()]


async def _component_keys_for_maintenance(db: AsyncSession, maintenance_id: str) -> list[str]:
    rows = await db.execute(
        select(StatusComponent.key)
        .join(StatusMaintenanceComponent, StatusMaintenanceComponent.component_id == StatusComponent.id)
        .where(StatusMaintenanceComponent.maintenance_id == maintenance_id)
    )
    return [r[0] for r in rows.all()]


async def _load_incident_updates(db: AsyncSession, incident_id: str) -> list[StatusIncidentUpdate]:
    rows = await db.execute(
        select(StatusIncidentUpdate)
        .where(StatusIncidentUpdate.incident_id == incident_id)
        .order_by(StatusIncidentUpdate.posted_at.asc())
    )
    return list(rows.scalars().all())


async def _build_incident_dto(db: AsyncSession, incident: StatusIncident) -> PublicIncidentDTO:
    components = await _component_keys_for_incident(db, incident.id)
    updates = await _load_incident_updates(db, incident.id)
    return PublicIncidentDTO(
        id=incident.id,
        title=incident.title,
        body=incident.body,
        severity=incident.severity,  # type: ignore[arg-type]
        status=incident.status,  # type: ignore[arg-type]
        started_at=incident.started_at,
        resolved_at=incident.resolved_at,
        auto_detected=incident.auto_detected,
        affected_components=components,
        updates=[
            PublicIncidentUpdateDTO(
                body=u.body,
                status=u.status,  # type: ignore[arg-type]
                posted_at=u.posted_at,
                posted_by=None,
            )
            for u in updates
        ],
    )


@router.get("", response_model=PublicStatusResponse)
@limiter.limit("60/minute")
async def get_status(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> PublicStatusResponse:
    response.headers["Cache-Control"] = _CACHE_HEADER

    components = await _load_components(db)
    component_ids = [c.id for c in components]
    manual = await status_state._read_manual_overrides(db)
    manual_started = await status_state._read_manual_override_started(db)
    latest = await status_state._latest_probes(db, component_ids)

    component_states: list[tuple[StatusComponent, int]] = []
    for component in components:
        status_int = await status_state.compute_component_status(
            db, component, latest.get(component.id), manual.get(component.id, STATUS_OPERATIONAL)
        )
        component_states.append((component, status_int))

    components_out: list[PublicComponentDTO] = []
    for component, status_int in component_states:
        uptime = await status_state.uptime_30d(db, component.id)
        since: datetime | None = None
        upstream_incidents: list[UpstreamIncidentRefDTO] = []
        if status_int != STATUS_OPERATIONAL:
            since = await status_state.current_outage_since(
                db, component, manual_started.get(component.id), latest.get(component.id)
            )
            if component.upstream_status_url:
                raw_incidents = await status_third_party.fetch_upstream_incidents(
                    component.key, component.upstream_status_url
                )
                for inc in raw_incidents:
                    try:
                        upstream_incidents.append(
                            UpstreamIncidentRefDTO(
                                name=inc["name"],
                                status=inc["status"],
                                impact=inc["impact"],
                                shortlink=inc["shortlink"],
                                started_at=datetime.fromisoformat(inc["started_at"]),
                            )
                        )
                    except (KeyError, ValueError):
                        continue
        components_out.append(
            PublicComponentDTO(
                key=component.key,
                name=component.name,
                group=component.group,  # type: ignore[arg-type]
                description=component.description,
                status=_status_label(status_int),  # type: ignore[arg-type]
                uptime_30d=uptime,
                since=since,
                upstream_status_url=component.upstream_status_url,
                upstream_incidents=upstream_incidents,
            )
        )

    incidents_active = await _load_active_incidents(db)
    maintenance_active = await _load_active_maintenance(db)

    overall = _worst([s for _, s in component_states])

    return PublicStatusResponse(
        overall=_status_label(overall),  # type: ignore[arg-type]
        updated_at=datetime.now(UTC),
        components=components_out,
        active_incidents=[await _build_incident_dto(db, inc) for inc in incidents_active],
        active_maintenance=[
            PublicMaintenanceDTO(
                id=m.id,
                title=m.title,
                body=m.body,
                scheduled_start=m.scheduled_start,
                scheduled_end=m.scheduled_end,
                status=m.status,  # type: ignore[arg-type]
                affected_components=await _component_keys_for_maintenance(db, m.id),
            )
            for m in maintenance_active
        ],
    )


@router.get("/components/{component_key}/history", response_model=HistoryResponse)
@limiter.limit("60/minute")
async def get_component_history(
    request: Request,
    response: Response,
    component_key: str,
    days: int = Query(default=90, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
) -> HistoryResponse:
    response.headers["Cache-Control"] = _CACHE_HEADER

    component = (
        await db.execute(select(StatusComponent).where(StatusComponent.key == component_key))
    ).scalar_one_or_none()
    if component is None:
        raise HTTPException(status_code=404, detail="Component not found")

    today = datetime.now(UTC).date()
    start = today - timedelta(days=days - 1)
    rollups = (
        (
            await db.execute(
                select(StatusProbeDaily)
                .where(
                    StatusProbeDaily.component_id == component.id,
                    StatusProbeDaily.day >= start,
                )
                .order_by(StatusProbeDaily.day.asc())
            )
        )
        .scalars()
        .all()
    )
    by_day = {r.day: r for r in rollups}

    # The sweeper only writes a status_probe_daily row for *yesterday* and
    # earlier. Today's segment has to be computed live from status_probes so a
    # fresh outage tints the rightmost cell immediately — otherwise it stays
    # green until midnight UTC, which is the bug the user reported.
    today_start_dt = datetime.combine(today, time(0, 0), tzinfo=UTC)
    today_probes = (
        (
            await db.execute(
                select(StatusProbe.status).where(
                    StatusProbe.component_id == component.id,
                    StatusProbe.ts >= today_start_dt,
                )
            )
        )
        .scalars()
        .all()
    )
    if today_probes:
        worst_today_int = max(today_probes)
        ok_count = sum(1 for s in today_probes if s == STATUS_OPERATIONAL)
        uptime_today = round((ok_count / len(today_probes)) * 100.0, 2)
    else:
        # No probe rows today (cold start / AI provider with Redis-only state).
        # Fall back to compute_component_status so the segment matches the pill
        # above it on the same row.
        manual = await status_state._read_manual_overrides(db)
        latest = await status_state._latest_probes(db, [component.id])
        worst_today_int = await status_state.compute_component_status(
            db,
            component,
            latest.get(component.id),
            manual.get(component.id, STATUS_OPERATIONAL),
        )
        uptime_today = 100.0 if worst_today_int == STATUS_OPERATIONAL else 0.0

    buckets: list[HistoryBucketDTO] = []
    for i in range(days):
        day = start + timedelta(days=i)
        if day == today:
            buckets.append(
                HistoryBucketDTO(
                    day=day,
                    worst_status=_status_label(worst_today_int),  # type: ignore[arg-type]
                    uptime_pct=uptime_today,
                )
            )
            continue
        row = by_day.get(day)
        if row is None:
            buckets.append(HistoryBucketDTO(day=day, worst_status="operational", uptime_pct=100.0))
        else:
            buckets.append(
                HistoryBucketDTO(
                    day=row.day,
                    worst_status=_status_label(row.worst_status),  # type: ignore[arg-type]
                    uptime_pct=row.uptime_pct,
                )
            )

    return HistoryResponse(component_key=component.key, buckets=buckets)


@router.get("/incidents", response_model=IncidentListResponse)
@limiter.limit("60/minute")
async def list_incidents(
    request: Request,
    response: Response,
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> IncidentListResponse:
    response.headers["Cache-Control"] = _CACHE_HEADER

    stmt = select(StatusIncident).order_by(StatusIncident.started_at.desc()).limit(limit + 1)
    if cursor:
        try:
            cursor_dt = datetime.fromisoformat(cursor)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid cursor") from exc
        stmt = stmt.where(StatusIncident.started_at < cursor_dt)

    rows = (await db.execute(stmt)).scalars().all()
    has_more = len(rows) > limit
    incidents = list(rows[:limit])
    next_cursor = incidents[-1].started_at.isoformat() if has_more and incidents else None

    return IncidentListResponse(
        incidents=[await _build_incident_dto(db, inc) for inc in incidents],
        next_cursor=next_cursor,
    )


@router.get("/incidents/{incident_id}", response_model=PublicIncidentDTO)
@limiter.limit("60/minute")
async def get_incident(
    request: Request,
    response: Response,
    incident_id: str,
    db: AsyncSession = Depends(get_db),
) -> PublicIncidentDTO:
    response.headers["Cache-Control"] = _CACHE_HEADER
    incident = (await db.execute(select(StatusIncident).where(StatusIncident.id == incident_id))).scalar_one_or_none()
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return await _build_incident_dto(db, incident)
