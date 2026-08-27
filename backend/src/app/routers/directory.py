"""Team directory API — CRUD for knowledge base entries.

Tree-structured markdown entries representing a team's technical ecosystem.
"""

import hashlib
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user
from ..models.base import gen_uuid
from ..models.directory import DirectoryEntry
from ..models.organization import TeamMember
from ..models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────────


class EntryResponse(BaseModel):
    id: str
    team_id: str
    parent_id: str | None
    path: str
    title: str
    content: str
    category: str
    source: str
    scan_status: str | None
    integration_id: str | None
    source_ref: str | None
    created_at: str
    updated_at: str
    children_count: int = 0


class EntrySummary(BaseModel):
    id: str
    path: str
    title: str
    summary: str  # first 100 chars
    category: str
    source: str
    integration_id: str | None = None
    source_ref: str | None = None
    children_count: int = 0


class EntryCreate(BaseModel):
    path: str
    title: str
    content: str = ""
    category: str
    parent_id: str | None = None
    source: str = "manual"


class EntryUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    category: str | None = None


# ── Helpers ──────────────────────────────────────────────────────────────────


VALID_CATEGORIES = {"overview", "frontend", "backend", "infra", "security", "services", "costs", "architecture"}


async def _require_team_member(team_id: str, user: User, db: AsyncSession) -> None:
    """Raise 403 if user is not a member of this team."""
    result = await db.execute(select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == user.id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member of this team")


def _content_hash(content: str) -> str:
    return hashlib.sha256(content.encode()).hexdigest()


async def _invalidate_directory_cache(team_id: str) -> None:
    """Drop the cached tree + insights for this team after any write.

    Called on create/update/delete. Scan completion calls the shared helper
    directly (see services/connectors/scan_runner.py).
    """
    from ..services.cache import cache_delete

    await cache_delete(
        f"directory:tree:{team_id}",
        f"directory:insights:{team_id}",
    )


# ── Routes ───────────────────────────────────────────────────────────────────


@router.get("/api/teams/{team_id}/directory")
async def list_entries(
    team_id: str,
    path: str | None = Query(None, description="Parent path to list children of. Omit for top-level."),
    category: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[EntrySummary]:
    """List directory entries. If path is given, list children of that path's entry."""
    await _require_team_member(team_id, user, db)

    query = select(DirectoryEntry).where(DirectoryEntry.team_id == team_id)

    if path:
        # Find parent entry and list its children
        parent = await db.execute(
            select(DirectoryEntry).where(DirectoryEntry.team_id == team_id, DirectoryEntry.path == path)
        )
        parent_entry = parent.scalar_one_or_none()
        if not parent_entry:
            raise HTTPException(status_code=404, detail=f"Path not found: {path}")
        query = query.where(DirectoryEntry.parent_id == parent_entry.id)
    else:
        # Top-level entries (no parent)
        query = query.where(DirectoryEntry.parent_id.is_(None))

    if category:
        query = query.where(DirectoryEntry.category == category)

    query = query.order_by(DirectoryEntry.path)
    result = await db.execute(query)
    entries = result.scalars().all()

    # Count children for each entry
    summaries = []
    for e in entries:
        child_count_result = await db.execute(select(func.count()).where(DirectoryEntry.parent_id == e.id))
        child_count = child_count_result.scalar() or 0
        summaries.append(
            EntrySummary(
                id=e.id,
                path=e.path,
                title=e.title,
                summary=e.content[:100] + ("..." if len(e.content) > 100 else ""),
                category=e.category,
                source=e.source,
                children_count=child_count,
            )
        )

    return summaries


@router.get("/api/teams/{team_id}/directory/tree")
async def get_tree(
    team_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict]:
    """Get the full directory tree structure (paths and titles only, no content)."""
    from ..services.cache import cache_get, cache_set

    await _require_team_member(team_id, user, db)

    cache_key = f"directory:tree:{team_id}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached

    from ..models.integration import OrgIntegration

    result = await db.execute(
        select(
            DirectoryEntry.id,
            DirectoryEntry.parent_id,
            DirectoryEntry.path,
            DirectoryEntry.title,
            DirectoryEntry.category,
            DirectoryEntry.source,
            DirectoryEntry.integration_id,
            DirectoryEntry.source_ref,
            DirectoryEntry.description,
            DirectoryEntry.created_at,
            DirectoryEntry.updated_at,
            OrgIntegration.provider,
        )
        .outerjoin(OrgIntegration, OrgIntegration.id == DirectoryEntry.integration_id)
        .where(DirectoryEntry.team_id == team_id)
        .order_by(DirectoryEntry.path)
    )
    rows = result.all()

    payload = [
        {
            "id": r.id,
            "parent_id": r.parent_id,
            "path": r.path,
            "title": r.title,
            "category": r.category,
            "source": r.source,
            "integration_id": r.integration_id,
            "integration_provider": r.provider,
            "source_ref": r.source_ref,
            "description": r.description or "",
            "created_at": str(r.created_at) if r.created_at else None,
            "updated_at": str(r.updated_at) if r.updated_at else None,
        }
        for r in rows
    ]
    await cache_set(cache_key, payload, ttl=60)
    return payload


@router.get("/api/teams/{team_id}/directory/insights")
async def get_insights(
    team_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Return aggregated insights — tech stack, recent activity, risks — across
    all entries in this team's directory. Drives the directory landing page.

    Cached for 90 seconds. The aggregator pattern-matches across every entry's
    full content; without the cache each landing-page visit re-scans the whole
    corpus.
    """
    from ..models.integration import OrgIntegration
    from ..services.cache import cache_get, cache_set
    from ..services.directory_insights import aggregate_insights

    await _require_team_member(team_id, user, db)

    cache_key = f"directory:insights:{team_id}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached

    result = await db.execute(
        select(
            DirectoryEntry.id,
            DirectoryEntry.title,
            DirectoryEntry.category,
            DirectoryEntry.source,
            DirectoryEntry.content,
            DirectoryEntry.updated_at,
            OrgIntegration.provider,
        )
        .outerjoin(OrgIntegration, OrgIntegration.id == DirectoryEntry.integration_id)
        .where(DirectoryEntry.team_id == team_id)
    )
    rows = result.all()

    entries = [
        {
            "id": r.id,
            "title": r.title,
            "category": r.category,
            "source": r.source,
            "content": r.content,
            "updated_at": str(r.updated_at) if r.updated_at else None,
            "integration_provider": r.provider,
        }
        for r in rows
    ]

    payload = aggregate_insights(entries)
    await cache_set(cache_key, payload, ttl=90)
    return payload


@router.get("/api/teams/{team_id}/directory/entry/{entry_id}")
async def get_entry(
    team_id: str,
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> EntryResponse:
    """Get a single directory entry with full content."""
    await _require_team_member(team_id, user, db)

    result = await db.execute(
        select(DirectoryEntry).where(DirectoryEntry.id == entry_id, DirectoryEntry.team_id == team_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    child_count_result = await db.execute(select(func.count()).where(DirectoryEntry.parent_id == entry.id))

    return EntryResponse(
        id=entry.id,
        team_id=entry.team_id,
        parent_id=entry.parent_id,
        path=entry.path,
        title=entry.title,
        content=entry.content,
        category=entry.category,
        source=entry.source,
        scan_status=entry.scan_status,
        integration_id=entry.integration_id,
        source_ref=entry.source_ref,
        created_at=str(entry.created_at),
        updated_at=str(entry.updated_at),
        children_count=child_count_result.scalar() or 0,
    )


@router.get("/api/teams/{team_id}/directory/by-path")
async def get_entry_by_path(
    team_id: str,
    path: str = Query(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> EntryResponse:
    """Get a directory entry by path."""
    await _require_team_member(team_id, user, db)

    result = await db.execute(
        select(DirectoryEntry).where(DirectoryEntry.team_id == team_id, DirectoryEntry.path == path)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail=f"Path not found: {path}")

    child_count_result = await db.execute(select(func.count()).where(DirectoryEntry.parent_id == entry.id))

    return EntryResponse(
        id=entry.id,
        team_id=entry.team_id,
        parent_id=entry.parent_id,
        path=entry.path,
        title=entry.title,
        content=entry.content,
        category=entry.category,
        source=entry.source,
        scan_status=entry.scan_status,
        integration_id=entry.integration_id,
        source_ref=entry.source_ref,
        created_at=str(entry.created_at),
        updated_at=str(entry.updated_at),
        children_count=child_count_result.scalar() or 0,
    )


@router.post("/api/teams/{team_id}/directory")
async def create_entry(
    team_id: str,
    body: EntryCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> EntryResponse:
    """Create a new directory entry."""
    await _require_team_member(team_id, user, db)

    if body.category not in VALID_CATEGORIES:
        raise HTTPException(
            status_code=400, detail=f"Invalid category: {body.category}. Must be one of: {', '.join(VALID_CATEGORIES)}"
        )

    # Check path uniqueness
    existing = await db.execute(
        select(DirectoryEntry).where(DirectoryEntry.team_id == team_id, DirectoryEntry.path == body.path)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Path already exists: {body.path}")

    # Validate parent exists if provided
    if body.parent_id:
        parent = await db.execute(
            select(DirectoryEntry).where(DirectoryEntry.id == body.parent_id, DirectoryEntry.team_id == team_id)
        )
        if not parent.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Parent entry not found")

    entry = DirectoryEntry(
        id=gen_uuid(),
        team_id=team_id,
        parent_id=body.parent_id,
        path=body.path,
        title=body.title,
        content=body.content,
        category=body.category,
        source=body.source,
        content_hash=_content_hash(body.content) if body.content else None,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    await _invalidate_directory_cache(team_id)

    return EntryResponse(
        id=entry.id,
        team_id=entry.team_id,
        parent_id=entry.parent_id,
        path=entry.path,
        title=entry.title,
        content=entry.content,
        category=entry.category,
        source=entry.source,
        scan_status=entry.scan_status,
        integration_id=entry.integration_id,
        source_ref=entry.source_ref,
        created_at=str(entry.created_at),
        updated_at=str(entry.updated_at),
    )


@router.patch("/api/teams/{team_id}/directory/entry/{entry_id}")
async def update_entry(
    team_id: str,
    entry_id: str,
    body: EntryUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> EntryResponse:
    """Update a directory entry."""
    await _require_team_member(team_id, user, db)

    result = await db.execute(
        select(DirectoryEntry).where(DirectoryEntry.id == entry_id, DirectoryEntry.team_id == team_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    if body.title is not None:
        entry.title = body.title
    if body.content is not None:
        entry.content = body.content
        entry.content_hash = _content_hash(body.content)
    if body.category is not None:
        if body.category not in VALID_CATEGORIES:
            raise HTTPException(status_code=400, detail=f"Invalid category: {body.category}")
        entry.category = body.category

    await db.commit()
    await db.refresh(entry)
    await _invalidate_directory_cache(team_id)

    return EntryResponse(
        id=entry.id,
        team_id=entry.team_id,
        parent_id=entry.parent_id,
        path=entry.path,
        title=entry.title,
        content=entry.content,
        category=entry.category,
        source=entry.source,
        scan_status=entry.scan_status,
        integration_id=entry.integration_id,
        source_ref=entry.source_ref,
        created_at=str(entry.created_at),
        updated_at=str(entry.updated_at),
    )


@router.delete("/api/teams/{team_id}/directory/entry/{entry_id}")
async def delete_entry(
    team_id: str,
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Delete a directory entry and its children."""
    await _require_team_member(team_id, user, db)

    result = await db.execute(
        select(DirectoryEntry).where(DirectoryEntry.id == entry_id, DirectoryEntry.team_id == team_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    await db.delete(entry)
    await db.commit()
    await _invalidate_directory_cache(team_id)

    return {"deleted": True, "id": entry_id}


@router.get("/api/teams/{team_id}/directory/search")
async def search_entries(
    team_id: str,
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[EntrySummary]:
    """Search directory entries by text match on title and content."""
    await _require_team_member(team_id, user, db)

    # Simple ILIKE search for now — pgvector semantic search in future
    pattern = f"%{q}%"
    result = await db.execute(
        select(DirectoryEntry)
        .where(
            DirectoryEntry.team_id == team_id,
            (DirectoryEntry.title.ilike(pattern)) | (DirectoryEntry.content.ilike(pattern)),
        )
        .order_by(DirectoryEntry.path)
        .limit(limit)
    )
    entries = result.scalars().all()

    return [
        EntrySummary(
            id=e.id,
            path=e.path,
            title=e.title,
            summary=e.content[:100] + ("..." if len(e.content) > 100 else ""),
            category=e.category,
            source=e.source,
            integration_id=e.integration_id,
            source_ref=e.source_ref,
        )
        for e in entries
    ]
