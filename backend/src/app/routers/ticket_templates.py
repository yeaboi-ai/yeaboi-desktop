"""CRUD for org-level ticket templates surfaced in the Planning Studio.

Mirrors blueprint_templates.py. PATCH on prompt_fragment or field_schema bumps
``version`` so cards generated from the old template keep their snapshot via
``Card.template_version``.
"""

from __future__ import annotations

import logging
import re
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_org, get_current_user
from ..models.organization import Organization
from ..models.ticket_template import TicketTemplate
from ..models.user import User
from ..schemas.ticket_template import (
    TicketTemplateCreate,
    TicketTemplateResponse,
    TicketTemplateUpdate,
)
from ..services.ticket_template_service import (
    BUILTIN_KEYS,
    BUILTIN_TYPE_BY_KEY,
    default_field_layout,
    ensure_org_ticket_templates,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["planning-studio"])


_VERSION_BUMPING_FIELDS = {"prompt_fragment", "field_schema", "field_layout"}


def _validate_field_layout(layout: list[dict]) -> None:
    """Validate the user-supplied unified layout. Raises 422 on the first violation.

    Built-in keys must keep their canonical type (e.g. priority can't be
    redefined as number). Custom keys must be prefixed with ``custom:``. Keys
    must be unique across the layout.
    """
    seen: set[str] = set()
    for entry in layout:
        if not isinstance(entry, dict):
            raise HTTPException(status_code=422, detail="Each field_layout entry must be an object")
        key = entry.get("key")
        if not isinstance(key, str) or not key:
            raise HTTPException(status_code=422, detail="field_layout entry missing 'key'")
        if key in seen:
            raise HTTPException(status_code=422, detail=f"Duplicate key in field_layout: {key}")
        seen.add(key)
        source = entry.get("source")
        ftype = entry.get("type")
        if source == "builtin":
            if key not in BUILTIN_KEYS:
                raise HTTPException(status_code=422, detail=f"Unknown built-in key: {key}")
            expected = BUILTIN_TYPE_BY_KEY[key]
            if ftype != expected:
                raise HTTPException(
                    status_code=422,
                    detail=f"Built-in field '{key}' must keep type '{expected}', got '{ftype}'",
                )
        elif source == "custom":
            if not key.startswith("custom:"):
                raise HTTPException(
                    status_code=422,
                    detail=f"Custom field '{key}' must use 'custom:' prefix",
                )
        else:
            raise HTTPException(status_code=422, detail=f"Invalid source on '{key}': {source}")


def _slugify(name: str) -> str:
    base = re.sub(r"[^a-z0-9_]", "", name.lower().replace(" ", "_").replace("-", "_"))
    return base


@router.get("/api/ticket-templates", response_model=list[TicketTemplateResponse])
async def list_ticket_templates(
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> list[TicketTemplate]:
    await ensure_org_ticket_templates(org.id, db)
    result = await db.execute(
        select(TicketTemplate)
        .where(TicketTemplate.org_id == org.id, TicketTemplate.deleted_at.is_(None))
        .order_by(TicketTemplate.sort_order, TicketTemplate.name)
    )
    return list(result.scalars().all())


@router.post("/api/ticket-templates", status_code=201, response_model=TicketTemplateResponse)
async def create_ticket_template(
    body: TicketTemplateCreate,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> TicketTemplate:
    slug = _slugify(body.name)
    if not slug:
        raise HTTPException(status_code=400, detail="Template name produces an invalid slug")

    existing = await db.execute(
        select(TicketTemplate).where(
            TicketTemplate.org_id == org.id,
            TicketTemplate.project_id.is_(body.project_id),
            TicketTemplate.slug == slug,
            TicketTemplate.deleted_at.is_(None),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"A template named '{body.name}' already exists")

    template = TicketTemplate(
        org_id=org.id,
        project_id=body.project_id,
        slug=slug,
        name=body.name.strip(),
        description=body.description,
        icon=body.icon,
        default_priority=body.default_priority,
        default_story_points=body.default_story_points,
        default_labels=body.default_labels,
        prompt_fragment=body.prompt_fragment,
        field_schema=[f.model_dump() for f in body.field_schema],
        field_layout=(
            [entry.model_dump() for entry in body.field_layout]
            if body.field_layout is not None
            else default_field_layout([f.model_dump() for f in body.field_schema])
        ),
        acceptance_criteria_template=body.acceptance_criteria_template,
        applicability=body.applicability,
        is_system=False,
        sort_order=body.sort_order,
    )
    if body.field_layout is not None:
        _validate_field_layout([e.model_dump() for e in body.field_layout])
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


@router.patch("/api/ticket-templates/{template_id}", response_model=TicketTemplateResponse)
async def update_ticket_template(
    template_id: str,
    body: TicketTemplateUpdate,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> TicketTemplate:
    result = await db.execute(
        select(TicketTemplate).where(
            TicketTemplate.id == template_id,
            TicketTemplate.org_id == org.id,
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    if template.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Template not found")

    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        return template

    # Only bump version when the value actually changed — a PATCH that re-sends
    # the existing layout shouldn't increment.
    bump_version = False
    for field in update_data.keys():
        if field not in _VERSION_BUMPING_FIELDS:
            continue
        if update_data[field] != getattr(template, field, None):
            bump_version = True
            break

    if "field_layout" in update_data and update_data["field_layout"] is not None:
        layout = [
            f if isinstance(f, dict) else f.model_dump() for f in update_data["field_layout"]
        ]
        _validate_field_layout(layout)
        update_data["field_layout"] = layout

    for field, value in update_data.items():
        if field == "field_schema" and value is not None:
            value = [f if isinstance(f, dict) else f.model_dump() for f in value]
        setattr(template, field, value)

    if bump_version:
        template.version = (template.version or 1) + 1

    await db.commit()
    await db.refresh(template)
    return template


@router.delete("/api/ticket-templates/{template_id}", status_code=204)
async def delete_ticket_template(
    template_id: str,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        select(TicketTemplate).where(
            TicketTemplate.id == template_id,
            TicketTemplate.org_id == org.id,
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    if template.is_system:
        raise HTTPException(status_code=400, detail="Cannot delete system templates")
    if template.deleted_at is not None:
        return  # already deleted — idempotent

    template.deleted_at = datetime.now(UTC)
    await db.commit()
