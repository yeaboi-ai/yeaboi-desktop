"""Admin-only operational endpoints for the usage_events ledger.

Right now this is just the back-fill trigger; spend-cap admin and pricing
override CRUD will land here too in follow-up PRs."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_org, require_admin
from ..models.organization import Organization
from ..models.user import User
from ..services.usage_backfill import backfill_org_usage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/usage", tags=["admin"])


class BackfillResponse(BaseModel):
    org_id: str
    dry_run: bool
    sessions_scanned: int
    rows_written: int
    rows_skipped_existing: int
    estimated_cost_usd: float


@router.post("/backfill")
async def trigger_backfill(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
    org: Organization = Depends(get_current_org),
    org_id: str | None = Query(None, description="Target org. Defaults to the caller's org."),
    dry_run: bool = Query(True, description="Compute counts without writing rows"),
) -> BackfillResponse:
    """Synthesise estimated usage_events for an org's historical sessions.

    Defaults to dry-run so an accidental click doesn't write thousands of
    estimate rows. Pass `dry_run=false` to actually persist."""
    target_org = org_id or org.id
    if target_org != org.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Cross-org backfill requires admin")

    counts = await backfill_org_usage(db, org_id=target_org, dry_run=dry_run)
    return BackfillResponse(
        org_id=target_org,
        dry_run=dry_run,
        **counts.to_dict(),
    )
