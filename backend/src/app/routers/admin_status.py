"""Admin endpoints for posting incidents, scheduled maintenance, and
editing component metadata. All endpoints require admin role."""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import asc, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import require_admin
from ..models.status import (
    StatusComponent,
    StatusIncident,
    StatusIncidentComponent,
    StatusIncidentUpdate,
    StatusMaintenance,
    StatusMaintenanceComponent,
)
from ..models.user import User
from ..schemas.status import (
    AdminComponentDTO,
    CreateIncidentRequest,
    CreateIncidentUpdateRequest,
    CreateMaintenanceRequest,
    PublicIncidentDTO,
    PublicIncidentUpdateDTO,
    PublicMaintenanceDTO,
    UpdateComponentRequest,
    UpdateIncidentRequest,
    UpdateMaintenanceRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/status", tags=["admin-status"])


async def _resolve_component_ids(db: AsyncSession, keys: list[str]) -> list[str]:
    if not keys:
        return []
    rows = await db.execute(select(StatusComponent.id, StatusComponent.key).where(StatusComponent.key.in_(keys)))
    found = {key: cid for cid, key in rows.all()}
    missing = [k for k in keys if k not in found]
    if missing:
        raise HTTPException(status_code=400, detail=f"Unknown component keys: {missing}")
    return [found[k] for k in keys]


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


async def _incident_dto(db: AsyncSession, incident: StatusIncident) -> PublicIncidentDTO:
    components = await _component_keys_for_incident(db, incident.id)
    updates_rows = (
        await db.execute(
            select(StatusIncidentUpdate)
            .where(StatusIncidentUpdate.incident_id == incident.id)
            .order_by(StatusIncidentUpdate.posted_at.asc())
        )
    ).scalars().all()
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
            for u in updates_rows
        ],
    )


# ---- Incidents ------------------------------------------------------------


@router.get("/incidents", response_model=list[PublicIncidentDTO])
async def list_incidents_admin(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
) -> list[PublicIncidentDTO]:
    rows = (await db.execute(select(StatusIncident).order_by(StatusIncident.started_at.desc()))).scalars().all()
    return [await _incident_dto(db, inc) for inc in rows]


@router.post("/incidents", response_model=PublicIncidentDTO, status_code=201)
async def create_incident(
    payload: CreateIncidentRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
) -> PublicIncidentDTO:
    component_ids = await _resolve_component_ids(db, payload.affected_component_keys)
    incident = StatusIncident(
        title=payload.title,
        body=payload.body,
        severity=payload.severity,
        status=payload.status,
        started_at=payload.started_at or datetime.now(UTC),
        posted_by_user_id=user.id,
        auto_detected=False,
    )
    db.add(incident)
    await db.flush()
    for cid in component_ids:
        db.add(StatusIncidentComponent(incident_id=incident.id, component_id=cid, impact="degraded"))
    await db.commit()
    await db.refresh(incident)
    logger.info("Status incident created: %s (%s)", incident.id, incident.title)
    return await _incident_dto(db, incident)


@router.patch("/incidents/{incident_id}", response_model=PublicIncidentDTO)
async def update_incident(
    incident_id: str,
    payload: UpdateIncidentRequest,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
) -> PublicIncidentDTO:
    incident = (
        await db.execute(select(StatusIncident).where(StatusIncident.id == incident_id))
    ).scalar_one_or_none()
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")

    if payload.title is not None:
        incident.title = payload.title
    if payload.body is not None:
        incident.body = payload.body
    if payload.severity is not None:
        incident.severity = payload.severity
    if payload.status is not None:
        incident.status = payload.status
        if payload.status == "resolved" and incident.resolved_at is None:
            incident.resolved_at = datetime.now(UTC)
        if payload.status != "resolved":
            incident.resolved_at = None
    await db.commit()
    await db.refresh(incident)
    return await _incident_dto(db, incident)


@router.post("/incidents/{incident_id}/updates", response_model=PublicIncidentDTO, status_code=201)
async def post_incident_update(
    incident_id: str,
    payload: CreateIncidentUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
) -> PublicIncidentDTO:
    incident = (
        await db.execute(select(StatusIncident).where(StatusIncident.id == incident_id))
    ).scalar_one_or_none()
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")

    update = StatusIncidentUpdate(
        incident_id=incident.id,
        body=payload.body,
        status=payload.status,
        posted_at=datetime.now(UTC),
        posted_by_user_id=user.id,
    )
    db.add(update)
    # Reflect the latest update's status on the parent so the public page
    # shows a single coherent state without computing it client-side.
    incident.status = payload.status
    if payload.status == "resolved" and incident.resolved_at is None:
        incident.resolved_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(incident)
    return await _incident_dto(db, incident)


@router.post("/incidents/{incident_id}/resolve", response_model=PublicIncidentDTO)
async def resolve_incident(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
) -> PublicIncidentDTO:
    incident = (
        await db.execute(select(StatusIncident).where(StatusIncident.id == incident_id))
    ).scalar_one_or_none()
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    if incident.status == "resolved":
        return await _incident_dto(db, incident)
    incident.status = "resolved"
    incident.resolved_at = datetime.now(UTC)
    db.add(
        StatusIncidentUpdate(
            incident_id=incident.id,
            body="Incident resolved.",
            status="resolved",
            posted_at=datetime.now(UTC),
            posted_by_user_id=user.id,
        )
    )
    await db.commit()
    await db.refresh(incident)
    return await _incident_dto(db, incident)


# ---- Maintenance ----------------------------------------------------------


async def _maintenance_dto(db: AsyncSession, m: StatusMaintenance) -> PublicMaintenanceDTO:
    return PublicMaintenanceDTO(
        id=m.id,
        title=m.title,
        body=m.body,
        scheduled_start=m.scheduled_start,
        scheduled_end=m.scheduled_end,
        status=m.status,  # type: ignore[arg-type]
        affected_components=await _component_keys_for_maintenance(db, m.id),
    )


@router.get("/maintenance", response_model=list[PublicMaintenanceDTO])
async def list_maintenance(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
) -> list[PublicMaintenanceDTO]:
    rows = (
        await db.execute(select(StatusMaintenance).order_by(StatusMaintenance.scheduled_start.desc()))
    ).scalars().all()
    return [await _maintenance_dto(db, m) for m in rows]


@router.post("/maintenance", response_model=PublicMaintenanceDTO, status_code=201)
async def create_maintenance(
    payload: CreateMaintenanceRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
) -> PublicMaintenanceDTO:
    if payload.scheduled_end <= payload.scheduled_start:
        raise HTTPException(status_code=400, detail="scheduled_end must be after scheduled_start")
    component_ids = await _resolve_component_ids(db, payload.affected_component_keys)
    m = StatusMaintenance(
        title=payload.title,
        body=payload.body,
        scheduled_start=payload.scheduled_start,
        scheduled_end=payload.scheduled_end,
        status="scheduled",
        posted_by_user_id=user.id,
    )
    db.add(m)
    await db.flush()
    for cid in component_ids:
        db.add(StatusMaintenanceComponent(maintenance_id=m.id, component_id=cid))
    await db.commit()
    await db.refresh(m)
    return await _maintenance_dto(db, m)


@router.patch("/maintenance/{maintenance_id}", response_model=PublicMaintenanceDTO)
async def update_maintenance(
    maintenance_id: str,
    payload: UpdateMaintenanceRequest,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
) -> PublicMaintenanceDTO:
    m = (
        await db.execute(select(StatusMaintenance).where(StatusMaintenance.id == maintenance_id))
    ).scalar_one_or_none()
    if m is None:
        raise HTTPException(status_code=404, detail="Maintenance not found")

    if payload.title is not None:
        m.title = payload.title
    if payload.body is not None:
        m.body = payload.body
    if payload.scheduled_start is not None:
        m.scheduled_start = payload.scheduled_start
    if payload.scheduled_end is not None:
        m.scheduled_end = payload.scheduled_end
    if payload.status is not None:
        m.status = payload.status
    if m.scheduled_end <= m.scheduled_start:
        raise HTTPException(status_code=400, detail="scheduled_end must be after scheduled_start")
    await db.commit()
    await db.refresh(m)
    return await _maintenance_dto(db, m)


@router.delete("/maintenance/{maintenance_id}", status_code=204)
async def delete_maintenance(
    maintenance_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
) -> None:
    m = (
        await db.execute(select(StatusMaintenance).where(StatusMaintenance.id == maintenance_id))
    ).scalar_one_or_none()
    if m is None:
        raise HTTPException(status_code=404, detail="Maintenance not found")
    await db.delete(m)
    await db.commit()


# ---- Components -----------------------------------------------------------


@router.get("/components", response_model=list[AdminComponentDTO])
async def list_components(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
) -> list[AdminComponentDTO]:
    rows = (
        await db.execute(
            select(StatusComponent).order_by(asc(StatusComponent.display_order), asc(StatusComponent.name))
        )
    ).scalars().all()
    return [AdminComponentDTO.model_validate(c) for c in rows]


@router.patch("/components/{component_id}", response_model=AdminComponentDTO)
async def update_component(
    component_id: str,
    payload: UpdateComponentRequest,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
) -> AdminComponentDTO:
    component = (
        await db.execute(select(StatusComponent).where(StatusComponent.id == component_id))
    ).scalar_one_or_none()
    if component is None:
        raise HTTPException(status_code=404, detail="Component not found")
    if payload.name is not None:
        component.name = payload.name
    if payload.description is not None:
        component.description = payload.description
    if payload.display_order is not None:
        component.display_order = payload.display_order
    if payload.active is not None:
        component.active = payload.active
    if payload.third_party_status_url is not None:
        component.third_party_status_url = payload.third_party_status_url
    await db.commit()
    await db.refresh(component)
    return AdminComponentDTO.model_validate(component)
