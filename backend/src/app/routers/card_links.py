"""CRUD for typed relationships between cards (blocks/relates_to/...).

Resolves the target card by friendly id (``PROJ-123``) or uuid before persisting
so the frontend typeahead can pass either. Cycle prevention runs on every
``blocks`` insert via ``card_link_service.would_create_cycle``.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_org, get_current_user
from ..models.board import Board, BoardColumn, Card
from ..models.card_link import CardLink
from ..models.organization import Organization
from ..models.session import Session
from ..models.user import User
from ..schemas.board import TicketLinkOther, TicketLinkResponse
from ..services.card_link_service import (
    ACCEPTED_TYPES,
    get_links_for_card,
    normalize_link,
    would_create_cycle,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["cards"])


class CreateLinkBody(BaseModel):
    target: str  # friendly id or uuid
    link_type: str


async def _load_card_in_org(card_id: str, org_id: str, db: AsyncSession) -> Card:
    row = (
        await db.execute(
            select(Card, Session.org_id)
            .join(BoardColumn, BoardColumn.id == Card.column_id)
            .join(Board, Board.id == BoardColumn.board_id)
            .join(Session, Session.id == Board.session_id)
            .where(Card.id == card_id)
        )
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Card not found")
    card, card_org_id = row
    if card_org_id != org_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return card


async def _resolve_card(id_or_key: str, org_id: str, db: AsyncSession) -> Card:
    """Resolve a card by friendly id or uuid, scoped to the org."""
    raw = (id_or_key or "").strip()
    if not raw:
        raise HTTPException(status_code=404, detail="Target ticket not found")
    upper = raw.upper()

    row = (
        await db.execute(
            select(Card, Session.org_id)
            .join(BoardColumn, BoardColumn.id == Card.column_id)
            .join(Board, Board.id == BoardColumn.board_id)
            .join(Session, Session.id == Board.session_id)
            .where((Card.friendly_id == upper) | (Card.id == raw) | (Card.id == raw.lower()))
        )
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail=f"Target ticket not found: {id_or_key}")
    card, card_org_id = row
    if card_org_id != org_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return card


@router.post("/api/cards/{card_id}/links", status_code=201, response_model=TicketLinkResponse)
async def create_card_link(
    card_id: str,
    body: CreateLinkBody,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> TicketLinkResponse:
    if body.link_type not in ACCEPTED_TYPES:
        raise HTTPException(status_code=422, detail=f"Unsupported link_type: {body.link_type}")

    card = await _load_card_in_org(card_id, org.id, db)
    other = await _resolve_card(body.target, org.id, db)

    canonical_src, canonical_tgt, canonical_type = normalize_link(card.id, other.id, body.link_type)

    if canonical_src == canonical_tgt:
        raise HTTPException(status_code=400, detail="Cannot link a card to itself")

    if canonical_type == "blocks" and await would_create_cycle(canonical_src, canonical_tgt, db):
        raise HTTPException(status_code=400, detail="That link would create a blocking cycle")

    # Reject duplicate triple early for a friendlier error than the unique-constraint trap.
    existing = (
        await db.execute(
            select(CardLink).where(
                CardLink.source_card_id == canonical_src,
                CardLink.target_card_id == canonical_tgt,
                CardLink.link_type == canonical_type,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=400, detail="Link already exists")

    link = CardLink(
        source_card_id=canonical_src,
        target_card_id=canonical_tgt,
        link_type=canonical_type,
        created_by=user.id,
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)

    # Compute direction from this card's perspective for the response.
    direction = "outbound" if link.source_card_id == card.id else "inbound"
    other_card = other if direction == "outbound" else (
        await db.execute(select(Card).where(Card.id == link.source_card_id))
    ).scalar_one()

    return TicketLinkResponse(
        id=link.id,
        link_type=link.link_type,
        direction=direction,
        other_card=TicketLinkOther(
            id=other_card.id,
            friendly_id=other_card.friendly_id,
            title=other_card.title,
            status=other_card.agent_status,
        ),
    )


@router.get("/api/cards/{card_id}/links", response_model=list[TicketLinkResponse])
async def list_card_links(
    card_id: str,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> list[TicketLinkResponse]:
    card = await _load_card_in_org(card_id, org.id, db)
    pairs = await get_links_for_card(card.id, db)

    # Hydrate other-card records in one round-trip.
    other_ids = {ln.target_card_id if dir_ == "outbound" else ln.source_card_id for ln, dir_ in pairs}
    other_cards: dict[str, Card] = {}
    if other_ids:
        rows = (await db.execute(select(Card).where(Card.id.in_(other_ids)))).scalars().all()
        other_cards = {c.id: c for c in rows}

    out: list[TicketLinkResponse] = []
    for link, direction in pairs:
        other_id = link.target_card_id if direction == "outbound" else link.source_card_id
        other = other_cards.get(other_id)
        out.append(
            TicketLinkResponse(
                id=link.id,
                link_type=link.link_type,
                direction=direction,
                other_card=TicketLinkOther(
                    id=other_id,
                    friendly_id=other.friendly_id if other else None,
                    title=other.title if other else "(unknown)",
                    status=other.agent_status if other else None,
                ),
            )
        )
    return out


@router.delete("/api/cards/{card_id}/links/{link_id}", status_code=204)
async def delete_card_link(
    card_id: str,
    link_id: str,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> None:
    card = await _load_card_in_org(card_id, org.id, db)
    link = (
        await db.execute(
            select(CardLink).where(
                CardLink.id == link_id,
                (CardLink.source_card_id == card.id) | (CardLink.target_card_id == card.id),
            )
        )
    ).scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    await db.delete(link)
    await db.commit()
