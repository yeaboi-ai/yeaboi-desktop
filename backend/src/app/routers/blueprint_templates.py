import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_org, get_current_user
from ..models.blueprint_template import BlueprintPersona, BlueprintSection, BlueprintTemplate
from ..models.organization import Organization
from ..models.user import User
from ..models.video_avatar import VideoAvatar
from ..schemas.blueprint_template import (
    BlueprintPersonaCreate,
    BlueprintPersonaResponse,
    BlueprintPersonaUpdate,
    BlueprintSectionCreate,
    BlueprintSectionResponse,
    BlueprintSectionUpdate,
    BlueprintTemplateCreate,
    BlueprintTemplateResponse,
    BlueprintTemplateUpdate,
)
from ..services.blueprint_template_service import ensure_org_blueprints

logger = logging.getLogger(__name__)

router = APIRouter(tags=["planning-studio"])


async def _verify_video_avatar_visible(avatar_id: str, org_id: str, db: AsyncSession) -> None:
    """Confirm the video_avatar_id is either a system avatar or owned by the caller's org."""
    result = await db.execute(
        select(VideoAvatar).where(
            VideoAvatar.id == avatar_id,
            VideoAvatar.deleted_at.is_(None),
        )
    )
    avatar = result.scalar_one_or_none()
    if not avatar or (not avatar.is_system and avatar.org_id != org_id):
        raise HTTPException(status_code=400, detail="Invalid video_avatar_id")


# ─── Templates ────────────────────────────────────────────────────────────────


@router.get("/api/blueprint-templates", response_model=list[BlueprintTemplateResponse])
async def list_templates(
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> list[BlueprintTemplate]:
    """List all blueprint templates for the current org."""
    await ensure_org_blueprints(org.id, db)
    result = await db.execute(
        select(BlueprintTemplate)
        .where(
            BlueprintTemplate.org_id == org.id,
            BlueprintTemplate.deleted_at.is_(None),
        )
        .order_by(BlueprintTemplate.sort_order)
    )
    return list(result.scalars().all())


@router.post("/api/blueprint-templates", status_code=201, response_model=BlueprintTemplateResponse)
async def create_template(
    body: BlueprintTemplateCreate,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> BlueprintTemplate:
    """Create a custom blueprint template."""
    import re

    slug = re.sub(r"[^a-z0-9_]", "", body.name.lower().replace(" ", "_").replace("-", "_"))
    if not slug:
        raise HTTPException(status_code=400, detail="Template name produces an invalid slug")

    # Check for duplicate slug
    existing = await db.execute(
        select(BlueprintTemplate).where(
            BlueprintTemplate.org_id == org.id,
            BlueprintTemplate.slug == slug,
            BlueprintTemplate.deleted_at.is_(None),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"A template named '{body.name}' already exists")

    template = BlueprintTemplate(
        org_id=org.id,
        slug=slug,
        name=body.name.strip(),
        description=body.description,
        icon=body.icon,
        sections=body.sections,
        default_persona_id=body.default_persona_id,
        is_system=False,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


@router.patch("/api/blueprint-templates/{template_id}", response_model=BlueprintTemplateResponse)
async def update_template(
    template_id: str,
    body: BlueprintTemplateUpdate,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> BlueprintTemplate:
    """Update a blueprint template."""
    result = await db.execute(
        select(BlueprintTemplate).where(
            BlueprintTemplate.id == template_id,
            BlueprintTemplate.org_id == org.id,
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(template, field, value)

    await db.commit()
    await db.refresh(template)
    return template


@router.delete("/api/blueprint-templates/{template_id}", status_code=204)
async def delete_template(
    template_id: str,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Soft-delete a blueprint template."""
    result = await db.execute(
        select(BlueprintTemplate).where(
            BlueprintTemplate.id == template_id,
            BlueprintTemplate.org_id == org.id,
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    if template.is_system:
        raise HTTPException(status_code=400, detail="Cannot delete system templates")

    template.deleted_at = datetime.now(UTC)
    await db.commit()


# ─── Personas ─────────────────────────────────────────────────────────────────


@router.get("/api/blueprint-personas", response_model=list[BlueprintPersonaResponse])
async def list_personas(
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> list[BlueprintPersona]:
    """List all blueprint personas for the current org."""
    await ensure_org_blueprints(org.id, db)
    result = await db.execute(
        select(BlueprintPersona)
        .where(
            BlueprintPersona.org_id == org.id,
            BlueprintPersona.deleted_at.is_(None),
        )
        .order_by(BlueprintPersona.sort_order)
    )
    return list(result.scalars().all())


@router.post("/api/blueprint-personas", status_code=201, response_model=BlueprintPersonaResponse)
async def create_persona(
    body: BlueprintPersonaCreate,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> BlueprintPersona:
    """Create a custom blueprint persona."""
    import re

    slug = re.sub(r"[^a-z0-9_]", "", body.name.lower().replace(" ", "_").replace("-", "_"))
    if not slug:
        raise HTTPException(status_code=400, detail="Persona name produces an invalid slug")

    # Check for duplicate slug
    existing = await db.execute(
        select(BlueprintPersona).where(
            BlueprintPersona.org_id == org.id,
            BlueprintPersona.slug == slug,
            BlueprintPersona.deleted_at.is_(None),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"A persona named '{body.name}' already exists")

    if body.video_avatar_id is not None:
        await _verify_video_avatar_visible(body.video_avatar_id, org.id, db)

    persona = BlueprintPersona(
        org_id=org.id,
        slug=slug,
        name=body.name.strip(),
        description=body.description,
        system_prompt=body.system_prompt,
        focus_sections=body.focus_sections,
        video_avatar_id=body.video_avatar_id,
        is_system=False,
    )
    db.add(persona)
    await db.commit()
    await db.refresh(persona)
    return persona


@router.patch("/api/blueprint-personas/{persona_id}", response_model=BlueprintPersonaResponse)
async def update_persona(
    persona_id: str,
    body: BlueprintPersonaUpdate,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> BlueprintPersona:
    """Update a blueprint persona."""
    result = await db.execute(
        select(BlueprintPersona).where(
            BlueprintPersona.id == persona_id,
            BlueprintPersona.org_id == org.id,
        )
    )
    persona = result.scalar_one_or_none()
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")

    update_data = body.model_dump(exclude_unset=True)
    if update_data.get("video_avatar_id"):
        await _verify_video_avatar_visible(update_data["video_avatar_id"], org.id, db)
    for field, value in update_data.items():
        setattr(persona, field, value)

    await db.commit()
    await db.refresh(persona)
    return persona


@router.delete("/api/blueprint-personas/{persona_id}", status_code=204)
async def delete_persona(
    persona_id: str,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Soft-delete a blueprint persona."""
    result = await db.execute(
        select(BlueprintPersona).where(
            BlueprintPersona.id == persona_id,
            BlueprintPersona.org_id == org.id,
        )
    )
    persona = result.scalar_one_or_none()
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    if persona.is_system:
        raise HTTPException(status_code=400, detail="Cannot delete system personas")

    persona.deleted_at = datetime.now(UTC)
    await db.commit()


# ─── Sections ────────────────────────────────────────────────────────────────


@router.get("/api/blueprint-sections", response_model=list[BlueprintSectionResponse])
async def list_sections(
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> list[BlueprintSection]:
    """List all blueprint sections for the current org."""
    await ensure_org_blueprints(org.id, db)
    result = await db.execute(
        select(BlueprintSection)
        .where(
            BlueprintSection.org_id == org.id,
            BlueprintSection.deleted_at.is_(None),
        )
        .order_by(BlueprintSection.sort_order)
    )
    return list(result.scalars().all())


@router.post("/api/blueprint-sections", status_code=201, response_model=BlueprintSectionResponse)
async def create_section(
    body: BlueprintSectionCreate,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> BlueprintSection:
    """Create a custom blueprint section."""
    import re

    slug = re.sub(r"[^a-z0-9_]", "", body.label.lower().replace(" ", "_").replace("-", "_"))
    if not slug:
        raise HTTPException(status_code=400, detail="Section name produces an invalid slug")

    # Check for duplicate slug
    existing = await db.execute(
        select(BlueprintSection).where(
            BlueprintSection.org_id == org.id,
            BlueprintSection.slug == slug,
            BlueprintSection.deleted_at.is_(None),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"A section named '{body.label}' already exists")

    section = BlueprintSection(
        org_id=org.id,
        slug=slug,
        label=body.label.strip(),
        description=body.description,
        is_system=False,
    )
    db.add(section)
    await db.commit()
    await db.refresh(section)
    return section


@router.patch("/api/blueprint-sections/{section_id}", response_model=BlueprintSectionResponse)
async def update_section(
    section_id: str,
    body: BlueprintSectionUpdate,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> BlueprintSection:
    """Update a blueprint section."""
    result = await db.execute(
        select(BlueprintSection).where(
            BlueprintSection.id == section_id,
            BlueprintSection.org_id == org.id,
        )
    )
    section = result.scalar_one_or_none()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(section, field, value)

    await db.commit()
    await db.refresh(section)
    return section


@router.delete("/api/blueprint-sections/{section_id}", status_code=204)
async def delete_section(
    section_id: str,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Soft-delete a blueprint section."""
    result = await db.execute(
        select(BlueprintSection).where(
            BlueprintSection.id == section_id,
            BlueprintSection.org_id == org.id,
        )
    )
    section = result.scalar_one_or_none()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    if section.is_system:
        raise HTTPException(status_code=400, detail="Cannot delete system sections")

    section.deleted_at = datetime.now(UTC)
    await db.commit()
