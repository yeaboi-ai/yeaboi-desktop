"""Vocabulary management API — CRUD for custom vocabulary entries."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db import get_db
from ..deps import get_current_user
from ..models.organization import OrgMember
from ..models.vocabulary import VocabularyEntry, VocabularyVariant
from ..schemas.vocabulary import (
    VocabularyEntryCreate,
    VocabularyEntryResponse,
    VocabularyEntryUpdate,
)

router = APIRouter(prefix="/api/orgs/{org_id}/vocabulary", tags=["vocabulary"])
logger = logging.getLogger(__name__)


async def _verify_org_member(org_id: str, user_id: str, db: AsyncSession) -> None:
    """Verify the user is a member of the org."""
    result = await db.execute(select(OrgMember).where(and_(OrgMember.org_id == org_id, OrgMember.user_id == user_id)))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member of this organization")


@router.get("", response_model=list[VocabularyEntryResponse])
async def list_vocabulary(
    org_id: str,
    category: str | None = Query(None),
    search: str | None = Query(None),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[VocabularyEntry]:
    """List vocabulary entries for the org (org-wide + current user's personal)."""
    await _verify_org_member(org_id, user.id, db)

    conditions = [
        VocabularyEntry.org_id == org_id,
        VocabularyEntry.deleted_at.is_(None),
        (VocabularyEntry.user_id.is_(None)) | (VocabularyEntry.user_id == user.id),
    ]
    if category:
        conditions.append(VocabularyEntry.category == category)
    if search:
        conditions.append(VocabularyEntry.canonical_form.ilike(f"%{search}%"))

    result = await db.execute(
        select(VocabularyEntry)
        .where(and_(*conditions))
        .options(selectinload(VocabularyEntry.variants))
        .order_by(VocabularyEntry.usage_count.desc(), VocabularyEntry.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("", status_code=201, response_model=VocabularyEntryResponse)
async def create_vocabulary_entry(
    org_id: str,
    body: VocabularyEntryCreate,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VocabularyEntry:
    """Add a vocabulary entry manually."""
    await _verify_org_member(org_id, user.id, db)

    entry = VocabularyEntry(
        org_id=org_id,
        user_id=None if body.scope == "org" else user.id,
        canonical_form=body.canonical_form,
        category=body.category,
        phonetic_hint=body.phonetic_hint,
        boost_weight=body.boost_weight,
        source="manual",
    )
    db.add(entry)
    await db.flush()

    # Add variants
    for variant_text in body.variants:
        variant = VocabularyVariant(
            entry_id=entry.id,
            variant_text=variant_text,
            variant_lower=variant_text.lower(),
        )
        db.add(variant)

    await db.commit()
    await db.refresh(entry)

    # Eagerly load variants for response
    result = await db.execute(
        select(VocabularyEntry).where(VocabularyEntry.id == entry.id).options(selectinload(VocabularyEntry.variants))
    )
    return result.scalar_one()


@router.patch("/{entry_id}", response_model=VocabularyEntryResponse)
async def update_vocabulary_entry(
    org_id: str,
    entry_id: str,
    body: VocabularyEntryUpdate,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VocabularyEntry:
    """Update a vocabulary entry."""
    await _verify_org_member(org_id, user.id, db)

    result = await db.execute(
        select(VocabularyEntry).where(
            and_(
                VocabularyEntry.id == entry_id,
                VocabularyEntry.org_id == org_id,
                VocabularyEntry.deleted_at.is_(None),
            )
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Vocabulary entry not found")

    if body.canonical_form is not None:
        entry.canonical_form = body.canonical_form
    if body.category is not None:
        entry.category = body.category
    if body.phonetic_hint is not None:
        entry.phonetic_hint = body.phonetic_hint
    if body.boost_weight is not None:
        entry.boost_weight = body.boost_weight

    await db.commit()
    result = await db.execute(
        select(VocabularyEntry).where(VocabularyEntry.id == entry_id).options(selectinload(VocabularyEntry.variants))
    )
    return result.scalar_one()


@router.delete("/{entry_id}", status_code=204)
async def delete_vocabulary_entry(
    org_id: str,
    entry_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Soft-delete a vocabulary entry."""
    await _verify_org_member(org_id, user.id, db)

    result = await db.execute(
        select(VocabularyEntry).where(
            and_(
                VocabularyEntry.id == entry_id,
                VocabularyEntry.org_id == org_id,
                VocabularyEntry.deleted_at.is_(None),
            )
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Vocabulary entry not found")

    entry.deleted_at = func.now()
    await db.commit()
