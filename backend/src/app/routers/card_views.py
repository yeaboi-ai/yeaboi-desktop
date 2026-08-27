"""DB-backed saved board views, scoped per user + org.

The localStorage saved-views in Phase 2 stayed local; this is the cross-device
upgrade. Frontend writes through to the API and falls back to localStorage when
offline so existing users don't lose their views.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_org, get_current_user
from ..models.card_view import CardView
from ..models.organization import Organization
from ..models.user import User

router = APIRouter(tags=["board"])


class CardViewCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    query: str = ""


class CardViewUpdate(BaseModel):
    name: str | None = None
    query: str | None = None


class CardViewResponse(BaseModel):
    id: str
    name: str
    query: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


@router.get("/api/card-views", response_model=list[CardViewResponse])
async def list_card_views(
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> list[CardView]:
    rows = (
        await db.execute(
            select(CardView)
            .where(CardView.user_id == user.id, CardView.org_id == org.id)
            .order_by(CardView.created_at.asc())
        )
    ).scalars().all()
    return list(rows)


@router.post("/api/card-views", status_code=201, response_model=CardViewResponse)
async def create_card_view(
    body: CardViewCreate,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> CardView:
    row = CardView(user_id=user.id, org_id=org.id, name=body.name.strip(), query=body.query)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.patch("/api/card-views/{view_id}", response_model=CardViewResponse)
async def update_card_view(
    view_id: str,
    body: CardViewUpdate,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> CardView:
    row = (
        await db.execute(select(CardView).where(CardView.id == view_id))
    ).scalar_one_or_none()
    if not row or row.user_id != user.id or row.org_id != org.id:
        raise HTTPException(status_code=404, detail="View not found")
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(row, field, value)
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/api/card-views/{view_id}", status_code=204)
async def delete_card_view(
    view_id: str,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> None:
    row = (
        await db.execute(select(CardView).where(CardView.id == view_id))
    ).scalar_one_or_none()
    if not row or row.user_id != user.id or row.org_id != org.id:
        raise HTTPException(status_code=404, detail="View not found")
    await db.delete(row)
    await db.commit()
