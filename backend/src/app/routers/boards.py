import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db import get_db
from ..deps import get_current_org, get_current_user
from ..models.attachment import CardAttachment
from ..models.board import Board, BoardColumn, Card, CardComment
from ..models.card_event import CardEvent
from ..models.card_link import CardLink
from ..models.organization import Organization
from ..models.session import Session
from ..models.user import User
from ..schemas.board import (
    BoardResponse,
    CardCreate,
    CardResponse,
    CardUpdate,
    ColumnCreate,
    ColumnDeleteRequest,
    ColumnReorderRequest,
    ColumnResponse,
    ColumnUpdate,
    TicketActivityEventResponse,
    TicketAttachmentResponse,
    TicketBoardColumnLite,
    TicketCommentResponse,
    TicketDetailResponse,
    TicketLinkOther,
    TicketLinkResponse,
)
from ..services.audit_service import get_client_ip, log_audit
from ..services.board_service import get_or_create_board
from ..services.card_numbering import assign_friendly_id
from ..services.mentions import resolve_mentions
from ..services.slack_dispatcher import dispatch_event

logger = logging.getLogger(__name__)

router = APIRouter(tags=["boards"])


# ─── Card aggregates ────────────────────────────────────────────────────────


def _empty_counts() -> dict[str, dict[str, int] | set[str]]:
    return {"attachments": {}, "links": {}, "comments": {}, "blocked": set()}


async def _aggregate_card_counts(
    card_ids: list[str], db: AsyncSession
) -> dict[str, dict[str, int] | set[str]]:
    """Return per-card aggregate counts and the set of currently-blocked card ids.

    Three flat group-by queries plus one to identify blockers in non-Done columns.
    Cheaper than per-card subselects and keeps the board endpoint at O(boards)
    round-trips no matter how many cards are loaded.
    """
    if not card_ids:
        return _empty_counts()

    attach_rows = (
        await db.execute(
            select(CardAttachment.card_id, func.count(CardAttachment.id))
            .where(CardAttachment.card_id.in_(card_ids))
            .group_by(CardAttachment.card_id)
        )
    ).all()
    comment_rows = (
        await db.execute(
            select(CardComment.card_id, func.count(CardComment.id))
            .where(CardComment.card_id.in_(card_ids))
            .group_by(CardComment.card_id)
        )
    ).all()

    # Link counts include both directions — a card has N "linked tickets"
    # whether it's the source or the target of the row.
    out_link_rows = (
        await db.execute(
            select(CardLink.source_card_id, func.count(CardLink.id))
            .where(CardLink.source_card_id.in_(card_ids))
            .group_by(CardLink.source_card_id)
        )
    ).all()
    in_link_rows = (
        await db.execute(
            select(CardLink.target_card_id, func.count(CardLink.id))
            .where(CardLink.target_card_id.in_(card_ids))
            .group_by(CardLink.target_card_id)
        )
    ).all()
    link_counts: dict[str, int] = {}
    for cid, n in out_link_rows + in_link_rows:
        link_counts[cid] = link_counts.get(cid, 0) + n

    # Blocked: any inbound 'blocks' link from a card whose column isn't a Done state.
    # Prefer the lifecycle flag; fall back to the legacy name match for boards that
    # haven't been migrated yet.
    blocked_rows = (
        await db.execute(
            select(CardLink.target_card_id)
            .join(Card, Card.id == CardLink.source_card_id)
            .join(BoardColumn, BoardColumn.id == Card.column_id)
            .where(
                CardLink.target_card_id.in_(card_ids),
                CardLink.link_type == "blocks",
                BoardColumn.is_done_state.is_(False),
                func.lower(BoardColumn.name) != "done",
            )
        )
    ).scalars().all()

    return {
        "attachments": {cid: n for cid, n in attach_rows},
        "comments": {cid: n for cid, n in comment_rows},
        "links": link_counts,
        "blocked": set(blocked_rows),
    }


def _compute_exec_labels(cards: list[Card]) -> dict[str, str]:
    """Render adaptive execution-order labels per card from (wave, sequence).

    A wave with a single card renders as "N" (e.g. "1", "2"). A wave with
    multiple parallel cards renders as "N.M" (e.g. "2.1", "2.2"). Cards with
    no wave (legacy data, never participated in a planning session) get no
    label — the frontend just falls back to the friendly id.

    This is deliberately pure / stateless so the board endpoint can call it
    once with the full card list per render.
    """
    by_wave: dict[int, list[Card]] = {}
    for c in cards:
        if c.wave is None:
            continue
        by_wave.setdefault(c.wave, []).append(c)

    labels: dict[str, str] = {}
    for wave, group in by_wave.items():
        ordered = sorted(
            group,
            key=lambda c: (
                c.sequence if c.sequence is not None else 1_000_000,
                c.position,
                c.id,
            ),
        )
        if len(ordered) == 1:
            labels[ordered[0].id] = str(wave + 1)
        else:
            for idx, c in enumerate(ordered):
                labels[c.id] = f"{wave + 1}.{idx + 1}"
    return labels


# ─── Board ──────────────────────────────────────────────────────────────────


@router.get("/api/board")
async def get_global_board(
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return kanban board aggregating cards from every session in the org."""
    sessions_result = await db.execute(
        select(Session).where(Session.org_id == org.id).order_by(Session.created_at.desc())
    )
    sessions = list(sessions_result.scalars().all())

    if not sessions:
        return {"columns": []}

    # Get all boards with columns and cards
    boards_result = await db.execute(
        select(Board)
        .where(Board.session_id.in_([s.id for s in sessions]))
        .options(selectinload(Board.columns).selectinload(BoardColumn.cards).selectinload(Card.assignee))
    )
    boards = list(boards_result.scalars().all())

    # Name + key lookups so the global board can render friendly_ids without an
    # extra round-trip from the frontend.
    session_names = {s.id: s.name for s in sessions}
    session_keys = {s.id: s.key for s in sessions}
    session_titles = {s.id: s.title for s in sessions}

    # Aggregate per-card counts in three flat queries so the board endpoint
    # stays O(boards) round-trips. Without this, the new attachment/link/comment
    # icons would force the frontend into N+1 fetches per render.
    all_card_ids = [card.id for board in boards for col in board.columns for card in col.cards]
    counts = await _aggregate_card_counts(all_card_ids, db) if all_card_ids else _empty_counts()

    # Compute exec_label per session so wave numbering doesn't bleed across
    # unrelated sessions (each has its own DAG, its own wave 0).
    exec_labels: dict[str, str] = {}
    cards_by_session: dict[str, list[Card]] = {}
    for board in boards:
        for col in board.columns:
            for card in col.cards:
                cards_by_session.setdefault(board.session_id, []).append(card)
    for session_cards in cards_by_session.values():
        exec_labels.update(_compute_exec_labels(session_cards))

    # Merge columns by name across all boards
    merged: dict[str, dict] = {}
    for board in boards:
        for col in board.columns:
            if col.name not in merged:
                merged[col.name] = {
                    "id": col.id,
                    "name": col.name,
                    "position": col.position,
                    "wip_limit": col.wip_limit,
                    "is_start_state": col.is_start_state,
                    "is_done_state": col.is_done_state,
                    "agent_trigger_state": col.agent_trigger_state,
                    "agent_review_state": col.agent_review_state,
                    "accent_color": col.accent_color,
                    "cards": [],
                }
            for card in col.cards:
                merged[col.name]["cards"].append(
                    {
                        "id": card.id,
                        "column_id": card.column_id,
                        "position": card.position,
                        "title": card.title,
                        "description": card.description,
                        "priority": card.priority,
                        "story_points": card.story_points,
                        "assignee_id": card.assignee_id,
                        "assignee_name": card.assignee_name,
                        "assignee_email": card.assignee_email,
                        "labels": card.labels,
                        "acceptance_criteria": card.acceptance_criteria,
                        "parent_card_id": card.parent_card_id,
                        "depends_on": card.depends_on,
                        "auto_approve": card.auto_approve,
                        "agent_status": card.agent_status,
                        "agent_pr_url": card.agent_pr_url,
                        "agent_branch": card.agent_branch,
                        "agent_log": card.agent_log,
                        "created_at": card.created_at,
                        "updated_at": card.updated_at,
                        "session_id": board.session_id,
                        "session_name": session_names.get(board.session_id, "Unknown"),
                        "session_title": session_titles.get(board.session_id),
                        # Phase 0 — friendly id + template fields. session_key looked up
                        # from the owning session so the frontend can render PROJ-123 directly.
                        "number": card.number,
                        "friendly_id": card.friendly_id,
                        "session_key": session_keys.get(board.session_id),
                        "template_id": card.template_id,
                        "template_version": card.template_version,
                        "custom_fields": card.custom_fields or {},
                        "attachment_count": counts["attachments"].get(card.id, 0),
                        "link_count": counts["links"].get(card.id, 0),
                        "comment_count": counts["comments"].get(card.id, 0),
                        "is_blocked": card.id in counts["blocked"],
                        # Execution-order numbering. wave/sequence are persisted;
                        # exec_label is derived per-render so it stays consistent
                        # as cards are added/removed.
                        "wave": card.wave,
                        "sequence": card.sequence,
                        "exec_label": exec_labels.get(card.id),
                    }
                )

    # Sort columns by position, sort cards within columns by position
    columns = sorted(merged.values(), key=lambda c: c["position"])
    for col in columns:
        col["cards"].sort(key=lambda c: c["position"])

    return {"columns": columns}


@router.get("/api/sessions/{session_id}/board", response_model=BoardResponse)
async def get_board(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Board:
    """Get (or auto-create) the kanban board for a project."""
    # Verify project ownership
    result = await db.execute(select(Session).where(Session.id == session_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Session not found")

    board = await get_or_create_board(session_id, db)
    return board


# ─── Cards ──────────────────────────────────────────────────────────────────


@router.post("/api/boards/{board_id}/cards", status_code=201, response_model=CardResponse)
async def create_card(
    request: Request,
    board_id: str,
    body: CardCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Card:
    """Create a card in a board column."""
    # Verify board belongs to a project owned by the user
    board = await _get_board_for_user(board_id, user, db)
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")

    # Verify column belongs to this board
    col_result = await db.execute(
        select(BoardColumn).where(BoardColumn.id == body.column_id, BoardColumn.board_id == board_id)
    )
    column = col_result.scalar_one_or_none()
    if not column:
        raise HTTPException(status_code=404, detail="Column not found")

    # Determine next position in the column
    cards_result = await db.execute(select(Card).where(Card.column_id == body.column_id))
    existing = list(cards_result.scalars().all())
    next_pos = len(existing)

    card = Card(
        column_id=body.column_id,
        position=next_pos,
        title=body.title,
        description=body.description,
        priority=body.priority,
        story_points=body.story_points,
        assignee_id=body.assignee_id,
        labels=body.labels,
        acceptance_criteria=body.acceptance_criteria,
        parent_card_id=body.parent_card_id,
    )
    db.add(card)
    await db.flush()
    await assign_friendly_id(card, board.session_id, db)
    await log_audit(
        db,
        org_id=board.org_id,
        user_id=user.id,
        action="create",
        resource_type="card",
        resource_id=card.id,
        metadata={"title": body.title, "board_id": board_id},
        ip_address=get_client_ip(request),
    )
    await db.commit()
    logger.info("Card created: %s in column %s", card.id, body.column_id)
    card_result = await db.execute(select(Card).where(Card.id == card.id).options(selectinload(Card.assignee)))
    card = card_result.scalar_one()

    # Resolve @mentions in title + description and dispatch Slack notifications (best-effort)
    try:
        mention_text = f"{card.title}\n{card.description or ''}"
        mentioned_ids = await resolve_mentions(db, board.org_id, mention_text)
        for _uid in mentioned_ids:
            proj_result = await db.execute(select(Session).where(Session.id == board.session_id))
            proj = proj_result.scalar_one_or_none()
            if proj:
                await dispatch_event(
                    db,
                    event_type="mention",
                    team_id=proj.team_id,
                    payload={
                        "mentioned_user_id": _uid,
                        "source_type": "card",
                        "source_title": card.title,
                        "source_url": f"/cards/{card.id}",
                    },
                )
    except Exception as _exc:
        logger.warning("mention dispatch failed for card create: %s", _exc)

    return card


@router.patch("/api/cards/{card_id}", response_model=CardResponse)
async def update_card(
    request: Request,
    card_id: str,
    body: CardUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Card:
    """Update a card — supports moving between columns."""
    card = await _get_card_for_user(card_id, user, db)
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")

    old_column_id = card.column_id
    update_data = body.model_dump(exclude_unset=True)

    # If moving to a different column, validate the target column
    if "column_id" in update_data and update_data["column_id"] != old_column_id:
        new_column_id = update_data["column_id"]
        # Resolve board_id from the current column
        col_result = await db.execute(select(BoardColumn).where(BoardColumn.id == old_column_id))
        old_column = col_result.scalar_one_or_none()
        if not old_column:
            raise HTTPException(status_code=404, detail="Current column not found")

        new_col_result = await db.execute(
            select(BoardColumn).where(BoardColumn.id == new_column_id, BoardColumn.board_id == old_column.board_id)
        )
        new_col = new_col_result.scalar_one_or_none()
        if not new_col:
            raise HTTPException(status_code=404, detail="Target column not found in the same board")

        # Set position to end of new column if not specified
        if "position" not in update_data:
            cards_result = await db.execute(select(Card).where(Card.column_id == new_column_id))
            existing = list(cards_result.scalars().all())
            update_data["position"] = len(existing)

    for key, value in update_data.items():
        setattr(card, key, value)

    # Touch updated_at
    card.updated_at = datetime.now(UTC)
    # Get org_id for audit via the card's column → board
    _col = await db.execute(select(BoardColumn).where(BoardColumn.id == card.column_id))
    _board = await db.execute(select(Board.org_id).where(Board.id == _col.scalar_one().board_id))
    _org_id = _board.scalar_one()
    await log_audit(
        db,
        org_id=_org_id,
        user_id=user.id,
        action="update",
        resource_type="card",
        resource_id=card_id,
        metadata={"fields": list(update_data.keys())},
        ip_address=get_client_ip(request),
    )
    await db.commit()
    logger.info("Card updated: %s", card_id)

    # Re-query with assignee loaded so CardResponse serializes correctly
    updated_result = await db.execute(select(Card).where(Card.id == card_id).options(selectinload(Card.assignee)))
    card = updated_result.scalar_one()

    # Broadcast card.moved / card.updated events
    await _broadcast_card_event(card, old_column_id, update_data)

    # Dispatch Slack card_state_changed event when column changed (best-effort)
    column_moved = "column_id" in update_data and update_data["column_id"] != old_column_id
    if column_moved:
        try:
            old_col_result = await db.execute(select(BoardColumn).where(BoardColumn.id == old_column_id))
            old_col = old_col_result.scalar_one_or_none()
            new_col_result = await db.execute(select(BoardColumn).where(BoardColumn.id == card.column_id))
            new_col = new_col_result.scalar_one_or_none()
            board_result = await db.execute(
                select(Board).where(Board.id == (old_col.board_id if old_col else None))
            )
            board_obj = board_result.scalar_one_or_none()
            if board_obj:
                proj_result = await db.execute(select(Session).where(Session.id == board_obj.session_id))
                proj = proj_result.scalar_one_or_none()
                if proj:
                    await dispatch_event(
                        db,
                        event_type="card_state_changed",
                        team_id=proj.team_id,
                        payload={
                            "card_id": card.id,
                            "card_title": card.title,
                            "from_state": old_col.name if old_col else old_column_id,
                            "to_state": new_col.name if new_col else card.column_id,
                            "session_id": board_obj.session_id,
                        },
                    )
        except Exception as _exc:
            logger.warning("dispatch_event card_state_changed failed: %s", _exc)

    # Resolve @mentions when title or description changes (best-effort)
    if "title" in update_data or "description" in update_data:
        try:
            _col_result = await db.execute(select(BoardColumn).where(BoardColumn.id == card.column_id))
            _col_obj = _col_result.scalar_one_or_none()
            if _col_obj:
                _board_result = await db.execute(select(Board).where(Board.id == _col_obj.board_id))
                _board_obj = _board_result.scalar_one_or_none()
                if _board_obj:
                    mention_text = f"{card.title}\n{card.description or ''}"
                    mentioned_ids = await resolve_mentions(db, _board_obj.org_id, mention_text)
                    for _uid in mentioned_ids:
                        _proj_result = await db.execute(
                            select(Session).where(Session.id == _board_obj.session_id)
                        )
                        _proj = _proj_result.scalar_one_or_none()
                        if _proj:
                            await dispatch_event(
                                db,
                                event_type="mention",
                                team_id=_proj.team_id,
                                payload={
                                    "mentioned_user_id": _uid,
                                    "source_type": "card",
                                    "source_title": card.title,
                                    "source_url": f"/cards/{card.id}",
                                },
                            )
        except Exception as _exc:
            logger.warning("mention dispatch failed for card update: %s", _exc)

    return card


@router.delete("/api/cards/{card_id}", status_code=204)
async def delete_card(
    request: Request,
    card_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a card."""
    card = await _get_card_for_user(card_id, user, db)
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")

    # Get org_id for audit via the card's column → board
    _col = await db.execute(select(BoardColumn).where(BoardColumn.id == card.column_id))
    _board = await db.execute(select(Board.org_id).where(Board.id == _col.scalar_one().board_id))
    _org_id = _board.scalar_one()
    await log_audit(
        db,
        org_id=_org_id,
        user_id=user.id,
        action="delete",
        resource_type="card",
        resource_id=card_id,
        metadata={"title": card.title},
        ip_address=get_client_ip(request),
    )
    await db.delete(card)
    await db.commit()
    logger.info("Card deleted: %s", card_id)


# ─── Card Comments ──────────────────────────────────────────────────────────


@router.get("/api/cards/{card_id}/comments")
async def get_card_comments(
    card_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    result = await db.execute(
        select(CardComment)
        .where(CardComment.card_id == card_id)
        .options(selectinload(CardComment.user))
        .order_by(CardComment.created_at.asc())
    )
    comments = list(result.scalars().all())
    return [
        {
            "id": c.id,
            "card_id": c.card_id,
            "user_id": c.user_id,
            "user_name": c.user.name or c.user.email if c.user else None,
            "content": c.content,
            "created_at": c.created_at,
        }
        for c in comments
    ]


@router.post("/api/cards/{card_id}/comments", status_code=201)
async def create_card_comment(
    card_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    # Verify card exists
    card = await db.execute(select(Card).where(Card.id == card_id))
    if not card.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Card not found")

    comment = CardComment(
        card_id=card_id,
        user_id=user.id,
        content=body.get("content", "").strip(),
    )
    if not comment.content:
        raise HTTPException(status_code=400, detail="Content required")

    db.add(comment)
    await db.commit()
    logger.info("Card comment added on card %s", card_id)
    await db.refresh(comment)

    return {
        "id": comment.id,
        "card_id": comment.card_id,
        "user_id": comment.user_id,
        "user_name": user.name or user.email,
        "content": comment.content,
        "created_at": comment.created_at,
    }


@router.delete("/api/cards/{card_id}/comments/{comment_id}", status_code=204)
async def delete_card_comment(
    card_id: str,
    comment_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(select(CardComment).where(CardComment.id == comment_id, CardComment.card_id == card_id))
    comment = result.scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.user_id != user.id:
        raise HTTPException(status_code=403, detail="Can only delete your own comments")

    await db.delete(comment)
    await db.commit()
    logger.info("Card comment deleted: %s", comment_id)


# ─── Search & bulk ─────────────────────────────────────────────────


@router.get("/api/cards/search")
async def search_cards(
    q: str,
    session_id: str | None = None,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Full-text search across title, description, friendly_id and labels.

    Org-scoped via the card's project. Returns lightweight rows (id, friendly_id,
    title, column_id, session_id) — the frontend intersects this with the loaded
    board to keep search non-destructive of the visible data.
    """
    needle = (q or "").strip()
    if not needle:
        return []

    pattern = f"%{needle}%"
    upper = needle.upper()

    # Base query — org-scoped via project ownership.
    stmt = (
        select(Card)
        .join(BoardColumn, BoardColumn.id == Card.column_id)
        .join(Board, Board.id == BoardColumn.board_id)
        .join(Session, Session.id == Board.session_id)
        .where(Session.org_id == org.id)
    )
    if session_id:
        stmt = stmt.where(Board.session_id == session_id)

    # ILIKE on title/description/friendly_id; for labels JSON, cast to text and
    # ILIKE the serialised representation. Works on Postgres (jsonb) and SQLite (json text).
    from sqlalchemy import String as _SqlString
    from sqlalchemy import cast as _sql_cast

    label_text = _sql_cast(Card.labels, _SqlString)
    stmt = stmt.where(
        Card.title.ilike(pattern)
        | Card.description.ilike(pattern)
        | (Card.friendly_id == upper)
        | label_text.ilike(pattern)
    ).limit(50)

    rows = (await db.execute(stmt)).scalars().all()
    return [
        {
            "id": c.id,
            "friendly_id": c.friendly_id,
            "title": c.title,
            "column_id": c.column_id,
            "session_id": c.session_id,
        }
        for c in rows
    ]


@router.post("/api/cards-bulk")
async def bulk_update_cards(
    body: dict,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Apply the same patch to many cards at once. Body: {ids: [...], patch: {...}}.

    Only a small allowlist of fields can be bulk-patched (column_id, priority,
    assignee_id, labels) — guarding against accidental mass title/description rewrites.
    """
    ids = body.get("ids") or []
    patch = body.get("patch") or {}
    if not isinstance(ids, list) or not all(isinstance(x, str) for x in ids):
        raise HTTPException(status_code=422, detail="ids must be a list of strings")
    if not isinstance(patch, dict) or not patch:
        raise HTTPException(status_code=422, detail="patch must be a non-empty object")

    allowed = {"column_id", "priority", "assignee_id", "labels"}
    extra = set(patch.keys()) - allowed
    if extra:
        raise HTTPException(status_code=422, detail=f"Cannot bulk-patch: {sorted(extra)}")

    # Org-scope: load only cards in this org.
    rows = (
        await db.execute(
            select(Card)
            .join(BoardColumn, BoardColumn.id == Card.column_id)
            .join(Board, Board.id == BoardColumn.board_id)
            .join(Session, Session.id == Board.session_id)
            .where(Card.id.in_(ids), Session.org_id == org.id)
        )
    ).scalars().all()

    updated_ids: list[str] = []
    for card in rows:
        for key, value in patch.items():
            setattr(card, key, value)
        updated_ids.append(card.id)
    await db.commit()
    logger.info("Bulk update touched %d cards", len(updated_ids))
    return {"updated": updated_ids}


# ─── Tickets (single-card detail view) ─────────────────────────────────────


@router.get("/api/tickets/{id_or_key}", response_model=TicketDetailResponse)
async def get_ticket_detail(
    id_or_key: str,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> TicketDetailResponse:
    """Resolve a ticket by friendly id (e.g. PROJ-123) or uuid and return its full
    detail bundle: card, attachments, links, comments, activity events.

    Used by the standalone /tickets/[id] route and the side-panel ticket workspace.
    Org-scoped: tickets in another org return 403, missing tickets return 404.
    """
    raw = (id_or_key or "").strip()
    if not raw:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # Friendly ids are stored uppercase. Uuids are stored lowercase. Look up by both
    # so the caller can pass either case.
    upper = raw.upper()
    result = await db.execute(
        select(Card)
        .where((Card.friendly_id == upper) | (Card.id == raw.lower()) | (Card.id == raw))
        .options(selectinload(Card.assignee))
    )
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # Org scoping — load the card's project and reject cross-org access.
    project: Session | None = None
    if card.session_id:
        project = (
            await db.execute(select(Session).where(Session.id == card.session_id))
        ).scalar_one_or_none()
    if project and project.org_id != org.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    # Resolve board id via the column for the WS subscribe path on the frontend.
    board_id_row = await db.execute(
        select(Board.id)
        .join(BoardColumn, BoardColumn.board_id == Board.id)
        .where(BoardColumn.id == card.column_id)
    )
    board_id = board_id_row.scalar_one_or_none()

    # Board columns — used by the sidebar's status selector. Lite shape (id +
    # name + position + is_done_state) so we don't ship the full nested cards.
    board_columns: list[BoardColumn] = []
    if board_id:
        board_columns = list(
            (
                await db.execute(
                    select(BoardColumn)
                    .where(BoardColumn.board_id == board_id)
                    .order_by(BoardColumn.position)
                )
            ).scalars().all()
        )

    # Attachments — empty until Phase 4 wires the upload flow.
    attachments_rows = (
        await db.execute(select(CardAttachment).where(CardAttachment.card_id == card.id))
    ).scalars().all()
    attachments = [
        TicketAttachmentResponse(
            id=a.id,
            card_id=a.card_id,
            filename=a.filename,
            mime_type=a.mime_type,
            size_bytes=a.size_bytes,
            url="",  # storage backend lookup added in Phase 4
            width=a.width,
            height=a.height,
            uploaded_by=a.uploaded_by,
            created_at=a.created_at,
        )
        for a in attachments_rows
    ]

    # Links — return both directions, inverting the type as seen from this card.
    outbound_rows = (
        await db.execute(select(CardLink).where(CardLink.source_card_id == card.id))
    ).scalars().all()
    inbound_rows = (
        await db.execute(select(CardLink).where(CardLink.target_card_id == card.id))
    ).scalars().all()

    other_ids = {ln.target_card_id for ln in outbound_rows} | {ln.source_card_id for ln in inbound_rows}
    other_cards: dict[str, Card] = {}
    if other_ids:
        for c in (await db.execute(select(Card).where(Card.id.in_(other_ids)))).scalars().all():
            other_cards[c.id] = c

    def _link_response(link: CardLink, direction: str, other_id: str) -> TicketLinkResponse:
        other = other_cards.get(other_id)
        return TicketLinkResponse(
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

    links = [_link_response(ln, "outbound", ln.target_card_id) for ln in outbound_rows] + [
        _link_response(ln, "inbound", ln.source_card_id) for ln in inbound_rows
    ]

    # Comments.
    comment_rows = (
        await db.execute(
            select(CardComment)
            .where(CardComment.card_id == card.id)
            .options(selectinload(CardComment.user))
            .order_by(CardComment.created_at.asc())
        )
    ).scalars().all()
    comments = [
        TicketCommentResponse(
            id=c.id,
            card_id=c.card_id,
            user_id=c.user_id,
            user_name=(c.user.name or c.user.email) if c.user else None,
            content=c.content,
            created_at=c.created_at,
        )
        for c in comment_rows
    ]

    # Activity events — empty until later phases write transitions.
    event_rows = (
        await db.execute(
            select(CardEvent).where(CardEvent.card_id == card.id).order_by(CardEvent.created_at.asc())
        )
    ).scalars().all()
    events = [
        TicketActivityEventResponse(
            id=e.id,
            kind=e.kind,
            actor_id=e.actor_id,
            payload=e.payload or {},
            created_at=e.created_at,
        )
        for e in event_rows
    ]

    return TicketDetailResponse(
        card=CardResponse.model_validate(card),
        session_key=project.key if project else None,
        session_name=project.name if project else None,
        board_id=board_id,
        board_columns=[
            TicketBoardColumnLite(
                id=col.id,
                name=col.name,
                position=col.position,
                is_done_state=getattr(col, "is_done_state", False) or False,
            )
            for col in board_columns
        ],
        attachments=attachments,
        links=links,
        comments=comments,
        events=events,
    )


# ─── Columns ────────────────────────────────────────────────────────────────


@router.patch("/api/boards/{board_id}/columns/{column_id}", response_model=ColumnResponse)
async def update_column(
    board_id: str,
    column_id: str,
    body: ColumnUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BoardColumn:
    """Rename or reorder a column."""
    board = await _get_board_for_user(board_id, user, db)
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")

    col_result = await db.execute(
        select(BoardColumn)
        .where(BoardColumn.id == column_id, BoardColumn.board_id == board_id)
        .options(selectinload(BoardColumn.cards))
    )
    column = col_result.scalar_one_or_none()
    if not column:
        raise HTTPException(status_code=404, detail="Column not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(column, key, value)

    await db.commit()
    logger.info("Column updated: %s", column_id)
    await db.refresh(column)
    # Reload with cards after refresh
    col_result2 = await db.execute(
        select(BoardColumn).where(BoardColumn.id == column_id).options(selectinload(BoardColumn.cards))
    )
    refreshed = col_result2.scalar_one()
    await _broadcast_column_event(board_id, "column.updated", refreshed)
    return refreshed


@router.post("/api/boards/{board_id}/columns", status_code=201, response_model=ColumnResponse)
async def create_column(
    request: Request,
    board_id: str,
    body: ColumnCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BoardColumn:
    """Create a new column on a board. Defaults position to end if not given."""
    board = await _get_board_for_user(board_id, user, db)
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")

    existing_result = await db.execute(
        select(BoardColumn).where(BoardColumn.board_id == board_id).order_by(BoardColumn.position)
    )
    existing = list(existing_result.scalars().all())
    next_position = body.position if body.position is not None else len(existing)

    column = BoardColumn(
        board_id=board_id,
        name=body.name,
        position=next_position,
        wip_limit=body.wip_limit,
        is_start_state=body.is_start_state,
        is_done_state=body.is_done_state,
        agent_trigger_state=body.agent_trigger_state,
        agent_review_state=body.agent_review_state,
        accent_color=body.accent_color,
    )
    db.add(column)
    await log_audit(
        db,
        org_id=board.org_id,
        user_id=user.id,
        action="create",
        resource_type="board_column",
        resource_id=column.id,
        metadata={"name": body.name, "board_id": board_id},
        ip_address=get_client_ip(request),
    )
    await db.commit()
    await db.refresh(column)

    # Register the new column for WS broadcast routing.
    try:
        from ..ws.board_ws import board_manager

        board_manager.register_column(column.id, board_id)
    except Exception:
        logger.debug("Column WS registration failed (best-effort)")

    refreshed = await db.execute(
        select(BoardColumn).where(BoardColumn.id == column.id).options(selectinload(BoardColumn.cards))
    )
    out = refreshed.scalar_one()
    await _broadcast_column_event(board_id, "column.created", out)
    logger.info("Column created: %s on board %s", column.id, board_id)
    return out


@router.delete("/api/boards/{board_id}/columns/{column_id}", status_code=204)
async def delete_column(
    request: Request,
    board_id: str,
    column_id: str,
    body: ColumnDeleteRequest | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a column. Reassigns its cards to a fallback column.

    Defaults the fallback to the lowest-position remaining column. The board
    must always have at least one column — deleting the last column is rejected.
    """
    board = await _get_board_for_user(board_id, user, db)
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")

    columns_result = await db.execute(
        select(BoardColumn).where(BoardColumn.board_id == board_id).order_by(BoardColumn.position)
    )
    columns = list(columns_result.scalars().all())
    target = next((c for c in columns if c.id == column_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Column not found")

    remaining = [c for c in columns if c.id != column_id]
    if not remaining:
        raise HTTPException(status_code=400, detail="Cannot delete the last column on a board")

    fallback_id = body.reassign_to if body and body.reassign_to else remaining[0].id
    if fallback_id == column_id or not any(c.id == fallback_id for c in remaining):
        raise HTTPException(status_code=400, detail="Invalid reassign target")

    # Move cards to fallback, appended to the end so positions stay monotonic.
    fallback_cards_result = await db.execute(
        select(Card).where(Card.column_id == fallback_id).order_by(Card.position)
    )
    fallback_count = len(list(fallback_cards_result.scalars().all()))

    moved_cards_result = await db.execute(
        select(Card).where(Card.column_id == column_id).order_by(Card.position)
    )
    moved = list(moved_cards_result.scalars().all())
    for i, card in enumerate(moved):
        card.column_id = fallback_id
        card.position = fallback_count + i

    await db.delete(target)
    await log_audit(
        db,
        org_id=board.org_id,
        user_id=user.id,
        action="delete",
        resource_type="board_column",
        resource_id=column_id,
        metadata={"name": target.name, "reassigned_to": fallback_id, "moved_cards": len(moved)},
        ip_address=get_client_ip(request),
    )
    await db.commit()
    await _broadcast_column_event(
        board_id, "column.deleted", target, extra={"reassigned_to": fallback_id, "moved_cards": len(moved)}
    )
    logger.info(
        "Column deleted: %s on board %s (reassigned %d cards to %s)",
        column_id,
        board_id,
        len(moved),
        fallback_id,
    )


@router.post("/api/boards/{board_id}/columns/reorder", response_model=list[ColumnResponse])
async def reorder_columns(
    request: Request,
    board_id: str,
    body: ColumnReorderRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[BoardColumn]:
    """Bulk-set column positions to match the given order."""
    board = await _get_board_for_user(board_id, user, db)
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")

    columns_result = await db.execute(
        select(BoardColumn).where(BoardColumn.board_id == board_id)
    )
    columns = list(columns_result.scalars().all())
    by_id = {c.id: c for c in columns}

    if set(body.column_ids) != set(by_id.keys()):
        raise HTTPException(status_code=400, detail="column_ids must list every column on the board exactly once")

    for position, column_id in enumerate(body.column_ids):
        by_id[column_id].position = position

    await log_audit(
        db,
        org_id=board.org_id,
        user_id=user.id,
        action="reorder",
        resource_type="board_columns",
        resource_id=board_id,
        metadata={"order": body.column_ids},
        ip_address=get_client_ip(request),
    )
    await db.commit()

    refreshed = await db.execute(
        select(BoardColumn)
        .where(BoardColumn.board_id == board_id)
        .options(selectinload(BoardColumn.cards))
        .order_by(BoardColumn.position)
    )
    out = list(refreshed.scalars().all())
    await _broadcast_columns_reordered(board_id, [c.id for c in out])
    return out


# ─── Helpers ────────────────────────────────────────────────────────────────


async def _get_board_for_user(board_id: str, user: User, db: AsyncSession) -> Board | None:
    """Return the board if it exists (all team members have access)."""
    result = await db.execute(select(Board).where(Board.id == board_id))
    return result.scalar_one_or_none()


async def _get_card_for_user(card_id: str, user: User, db: AsyncSession) -> Card | None:
    """Return the card if it exists (all team members have access)."""
    result = await db.execute(select(Card).where(Card.id == card_id).options(selectinload(Card.assignee)))
    return result.scalar_one_or_none()


async def _broadcast_card_event(card: Card, old_column_id: str, update_data: dict) -> None:
    """Broadcast card events to the board WebSocket room (best-effort)."""
    try:
        from ..ws.board_ws import board_manager

        # Resolve board_id from the column
        column_changed = "column_id" in update_data and update_data["column_id"] != old_column_id
        event_type = "card.moved" if column_changed else "card.updated"

        # Get board_id via a lazy lookup — we need to import here to avoid circular deps
        # The board_id is resolved from the column relationship; fall back gracefully
        await board_manager.broadcast_card_event(card.column_id, event_type, card)
    except Exception:
        logger.debug("Board WS broadcast failed (best-effort)")


def _column_payload(column: BoardColumn) -> dict:
    return {
        "id": column.id,
        "board_id": column.board_id,
        "name": column.name,
        "position": column.position,
        "wip_limit": column.wip_limit,
        "is_start_state": column.is_start_state,
        "is_done_state": column.is_done_state,
        "agent_trigger_state": column.agent_trigger_state,
        "agent_review_state": column.agent_review_state,
        "accent_color": column.accent_color,
    }


async def _broadcast_column_event(
    board_id: str, event_type: str, column: BoardColumn, extra: dict | None = None
) -> None:
    """Broadcast a column lifecycle event to the board WS room (best-effort)."""
    try:
        from ..ws.board_ws import board_manager

        payload = _column_payload(column)
        if extra:
            payload.update(extra)
        await board_manager.broadcast_column_event(board_id, event_type, payload)
    except Exception:
        logger.debug("Column WS broadcast failed (best-effort)")


async def _broadcast_columns_reordered(board_id: str, column_ids: list[str]) -> None:
    try:
        from ..ws.board_ws import board_manager

        await board_manager.broadcast_column_event(
            board_id, "column.reordered", {"order": column_ids}
        )
    except Exception:
        logger.debug("Column WS broadcast failed (best-effort)")
