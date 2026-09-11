"""CRUD for per-project mappings between an internal Session and an external
issue-tracker project (Jira project key, ADO project/team).

Every mapping is org-scoped through the ``OrgIntegration``; cross-org access
returns 404 so we don't leak the existence of integrations the caller has no
right to see.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_org, get_current_user
from ..models.integration import OrgIntegration
from ..models.organization import Organization
from ..models.session import Session
from ..models.sync import IntegrationProjectMapping
from ..models.user import User
from ..schemas.integration_mapping import (
    IntegrationProjectMappingCreate,
    IntegrationProjectMappingResponse,
    IntegrationProjectMappingUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["integrations"])


async def _verify_integration_in_org(integration_id: str, org_id: str, db: AsyncSession) -> OrgIntegration:
    integration = (
        await db.execute(select(OrgIntegration).where(OrgIntegration.id == integration_id))
    ).scalar_one_or_none()
    if not integration or integration.org_id != org_id:
        raise HTTPException(status_code=404, detail="Integration not found")
    return integration


async def _verify_project_in_org(session_id: str, org_id: str, db: AsyncSession) -> Session:
    project = (
        await db.execute(select(Session).where(Session.id == session_id))
    ).scalar_one_or_none()
    if not project or project.org_id != org_id:
        raise HTTPException(status_code=404, detail="Session not found")
    return project


@router.get(
    "/api/integrations/{integration_id}/project-mappings",
    response_model=list[IntegrationProjectMappingResponse],
)
async def list_mappings(
    integration_id: str,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> list[IntegrationProjectMapping]:
    await _verify_integration_in_org(integration_id, org.id, db)
    rows = (
        await db.execute(
            select(IntegrationProjectMapping).where(
                IntegrationProjectMapping.integration_id == integration_id
            )
        )
    ).scalars().all()
    return list(rows)


@router.post(
    "/api/integration-project-mappings",
    status_code=201,
    response_model=IntegrationProjectMappingResponse,
)
async def create_mapping(
    body: IntegrationProjectMappingCreate,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> IntegrationProjectMapping:
    await _verify_integration_in_org(body.integration_id, org.id, db)
    await _verify_project_in_org(body.internal_session_id, org.id, db)

    existing = (
        await db.execute(
            select(IntegrationProjectMapping).where(
                IntegrationProjectMapping.integration_id == body.integration_id,
                IntegrationProjectMapping.internal_session_id == body.internal_session_id,
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Mapping already exists for this project + integration",
        )

    row = IntegrationProjectMapping(
        integration_id=body.integration_id,
        internal_session_id=body.internal_session_id,
        external_project_key=body.external_project_key,
        external_project_id=body.external_project_id,
        default_issue_type=body.default_issue_type,
        field_mappings=body.field_mappings,
        sync_direction=body.sync_direction,
        enabled=body.enabled,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.patch(
    "/api/integration-project-mappings/{mapping_id}",
    response_model=IntegrationProjectMappingResponse,
)
async def update_mapping(
    mapping_id: str,
    body: IntegrationProjectMappingUpdate,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> IntegrationProjectMapping:
    row = (
        await db.execute(
            select(IntegrationProjectMapping).where(IntegrationProjectMapping.id == mapping_id)
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Mapping not found")
    await _verify_integration_in_org(row.integration_id, org.id, db)

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(row, field, value)
    await db.commit()
    await db.refresh(row)
    return row


@router.delete(
    "/api/integration-project-mappings/{mapping_id}", status_code=204
)
async def delete_mapping(
    mapping_id: str,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> None:
    row = (
        await db.execute(
            select(IntegrationProjectMapping).where(IntegrationProjectMapping.id == mapping_id)
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Mapping not found")
    await _verify_integration_in_org(row.integration_id, org.id, db)
    await db.delete(row)
    await db.commit()
