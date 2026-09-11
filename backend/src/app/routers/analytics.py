"""Session analytics — computed from existing data for marketing and product insights.

The session/aggregate/highlights/engineering endpoints are computed live from
sessions, chat_messages, blueprint_snapshots, boards, and cards. The cost
slice queries the `usage_events` ledger (see services.usage_recorder) for
per-provider spend; cost data may be partially `is_estimated=true` for older
sessions back-filled from existing data.
"""

import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import String, case, cast, distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_org, get_current_user
from ..models.blueprint import BlueprintIteration, BlueprintSnapshot
from ..models.board import Board, BoardColumn, Card
from ..models.organization import Organization
from ..models.session import ChatMessage, Participant, Session, TranscriptEntry
from ..models.usage_event import UsageEvent
from ..models.user import User
from ..schemas.blueprint import BLUEPRINT_SECTIONS

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/analytics", tags=["analytics"])


# ── Response schemas ─────────────────────────────────────────────────────────


class CostBreakdown(BaseModel):
    """Total cost in USD plus per-provider split. `is_partially_estimated`
    flips true when *any* contributing usage_event has `is_estimated=true`
    so the UI can mark the value with the dotted-underline treatment."""

    total_usd: float
    by_provider: dict[str, float]
    is_partially_estimated: bool
    estimated_share: float  # 0.0–1.0


class ScopeInfo(BaseModel):
    """Self-describing breadcrumb so every analytics response is unambiguous
    about what data it covers — addresses the 'is this org or session?'
    question users had with the old page."""

    kind: str  # "org" | "project" | "session"
    id: str | None
    session_count: int
    date_range: dict[str, str | None]  # {"start": iso8601, "end": iso8601}


class SessionMetrics(BaseModel):
    session_id: str
    project_name: str | None
    status: str
    persona: str
    assertiveness: str
    created_at: str
    duration_minutes: float | None
    total_messages: int
    ai_messages: int
    user_messages: int
    ai_to_user_ratio: float | None
    participant_count: int
    blueprint_versions: int
    blueprint_completion_pct: float
    blueprint_sections_filled: int
    blueprint_sections_total: int
    board_generated: bool
    cards_generated: int
    total_story_points: int
    voice_entries: int
    initial_idea: str | None
    cost: CostBreakdown | None = None


class AggregateMetrics(BaseModel):
    total_sessions: int
    completed_sessions: int
    completion_rate: float
    avg_duration_minutes: float | None
    avg_messages_per_session: float
    avg_ai_messages: float
    avg_user_messages: float
    avg_blueprint_completion_pct: float
    sessions_with_board: int
    board_generation_rate: float
    avg_cards_per_board: float
    avg_story_points_per_board: float
    total_messages: int
    total_ai_messages: int
    total_cards_generated: int
    total_story_points: int
    persona_distribution: dict[str, int]
    assertiveness_distribution: dict[str, int]
    sessions_with_voice: int
    voice_usage_rate: float
    avg_participants: float
    busiest_day: str | None
    sessions_timeline: list[dict]
    cost: CostBreakdown | None = None
    scope: ScopeInfo | None = None


class CostBucket(BaseModel):
    """One bucket in a cost breakdown — `key` is a provider/day/model/operation
    depending on `group_by`. `units_summary` lets the UI show totals like
    '4.2M tokens · 18k characters' alongside the dollar amount."""

    key: str
    cost_usd: float
    units_summary: dict
    is_estimated: bool


class CostsResponse(BaseModel):
    scope: ScopeInfo
    range: dict[str, str]  # {"start": iso8601, "end": iso8601}
    total_usd: float
    currency: str = "USD"
    is_partially_estimated: bool
    estimated_share: float
    group_by: str
    buckets: list[CostBucket]
    series: list[dict] | None = None  # [{date, cost_usd, by_provider}] when group_by=day
    meta: dict | None = None  # last_ingested_at etc.


class AnalyticsHealth(BaseModel):
    usage_event_count_24h: int
    last_event_at: str | None
    providers_seen_24h: list[str]
    backfill_completed_at: str | None  # latest source='backfill' row, if any


class CurrentMonthSpend(BaseModel):
    """Lightweight rollup for the app-shell badge — keep the response tiny so
    the badge can poll cheaply."""

    month: str  # "YYYY-MM"
    total_usd: float
    last_month_usd: float
    delta_pct: float | None  # None when last month was zero (avoid /0)
    is_partially_estimated: bool
    by_provider: dict[str, float]


class ContentHighlight(BaseModel):
    """Pre-packaged stats ready to drop into marketing content."""

    avg_session_to_board_minutes: str
    blueprint_completion_rate: str
    most_popular_persona: str
    total_planning_sessions: str
    total_tasks_generated: str
    ai_challenges_per_session: str  # proxy: AI messages that are responses
    voice_adoption: str


class CommittedVsDone(BaseModel):
    """Cards committed (total) vs cards done, per release or project."""

    label: str  # release label or project name
    committed: int
    done: int


class PriorityBreakdown(BaseModel):
    """Open cards grouped by priority."""

    priority: str
    count: int


class DeployFrequencyPoint(BaseModel):
    """PR merges per day."""

    date: str
    count: int


class ReleaseTrend(BaseModel):
    """Per-release trend data point."""

    label: str
    committed: int
    done: int
    story_points: int
    avg_cycle_hours: float | None


class EngineeringMetrics(BaseModel):
    """Engineering-focused metrics derived from board and orchestrator data."""

    committed_vs_done: list[CommittedVsDone]
    open_by_priority: list[PriorityBreakdown]
    deploy_frequency: list[DeployFrequencyPoint]
    release_trends: list[ReleaseTrend]
    total_committed: int
    total_done: int
    total_open: int
    total_prs: int
    delivery_rate: float


# ── Helpers ──────────────────────────────────────────────────────────────────


def _blueprint_completion(content: dict | None) -> tuple[int, int, float]:
    """Return (filled_count, total_count, pct) for a blueprint."""
    if not content:
        return 0, len(BLUEPRINT_SECTIONS), 0.0
    filled = sum(1 for s in BLUEPRINT_SECTIONS if (content.get(s) or "").strip())
    total = len(BLUEPRINT_SECTIONS)
    return filled, total, round(filled / total * 100, 1) if total else 0.0


def _to_float(value: Decimal | float | None) -> float:
    """Decimal → float for JSON serialization. Used for cost numbers — we
    accept the floating-point precision loss at the API boundary because the
    DB stores the canonical Decimal."""
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


async def _compute_cost_breakdown(
    db: AsyncSession,
    *,
    org_id: str,
    session_id: str | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
) -> CostBreakdown:
    """Sum usage_events for a scope into total + per-provider buckets.

    Returns a zeroed CostBreakdown when no events match — callers should not
    treat that as an error, since not every session has cost data yet."""
    stmt = select(
        UsageEvent.provider,
        func.coalesce(func.sum(UsageEvent.cost_usd), 0).label("cost"),
        func.coalesce(func.sum(case((UsageEvent.is_estimated, UsageEvent.cost_usd), else_=0)), 0).label("est_cost"),
    ).where(UsageEvent.org_id == org_id)
    if session_id:
        stmt = stmt.where(UsageEvent.session_id == session_id)
    if start:
        stmt = stmt.where(UsageEvent.occurred_at >= start)
    if end:
        stmt = stmt.where(UsageEvent.occurred_at < end)
    stmt = stmt.group_by(UsageEvent.provider)
    rows = (await db.execute(stmt)).all()

    by_provider: dict[str, float] = {}
    total = Decimal("0")
    estimated = Decimal("0")
    for row in rows:
        cost = Decimal(str(row.cost or 0))
        est = Decimal(str(row.est_cost or 0))
        by_provider[row.provider] = float(cost)
        total += cost
        estimated += est

    share = float(estimated / total) if total > 0 else 0.0
    return CostBreakdown(
        total_usd=float(total),
        by_provider=by_provider,
        is_partially_estimated=estimated > 0,
        estimated_share=round(share, 4),
    )


def _build_scope(
    *,
    org_id: str,
    session_id: str | None,
    session_count: int,
    start: datetime | None,
    end: datetime | None,
) -> ScopeInfo:
    if session_id:
        kind, scope_id = "session", session_id
    else:
        kind, scope_id = "org", org_id
    return ScopeInfo(
        kind=kind,
        id=scope_id,
        session_count=session_count,
        date_range={
            "start": start.isoformat() if start else None,
            "end": end.isoformat() if end else None,
        },
    )


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get("/sessions")
async def list_session_metrics(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    limit: int = Query(50, ge=1, le=200),
    session_id: str | None = Query(None),
) -> list[SessionMetrics]:
    """Per-session metrics for all sessions in the org."""

    # Fetch the sessions
    stmt = select(Session, Session.name.label("project_name")).where(Session.org_id == org.id)
    if session_id:
        stmt = stmt.where(Session.id == session_id)
    result = await db.execute(stmt.order_by(Session.created_at.desc()).limit(limit))
    rows = result.all()

    metrics = []
    for session, project_name in rows:
        sid = session.id

        # Message counts
        msg_result = await db.execute(
            select(
                func.count().label("total"),
                func.count(case((ChatMessage.message_type == "ai", 1))).label("ai_count"),
                func.count(case((ChatMessage.message_type == "chat", 1))).label("user_count"),
            ).where(ChatMessage.session_id == sid)
        )
        msg_row = msg_result.one()

        # Participants
        part_result = await db.execute(
            select(func.count(distinct(Participant.user_id))).where(Participant.session_id == sid)
        )
        participant_count = part_result.scalar() or 0

        # Blueprint
        bp_result = await db.execute(
            select(BlueprintSnapshot)
            .where(BlueprintSnapshot.session_id == session.id)
            .order_by(BlueprintSnapshot.version_number.desc())
            .limit(1)
        )
        latest_bp = bp_result.scalar_one_or_none()
        bp_versions_result = await db.execute(
            select(func.count()).where(BlueprintSnapshot.session_id == session.id)
        )
        bp_versions = bp_versions_result.scalar() or 0
        filled, total, pct = _blueprint_completion(latest_bp.content if latest_bp else None)

        # Board + cards
        board_result = await db.execute(select(Board).where(Board.session_id == session.id))
        board = board_result.scalar_one_or_none()
        cards_count = 0
        story_points = 0
        if board:
            card_result = await db.execute(
                select(
                    func.count().label("count"),
                    func.coalesce(func.sum(Card.story_points), 0).label("points"),
                )
                .join(BoardColumn, Card.column_id == BoardColumn.id)
                .where(BoardColumn.board_id == board.id)
            )
            card_row = card_result.one()
            cards_count = card_row.count
            story_points = card_row.points

        # Voice entries
        voice_result = await db.execute(select(func.count()).where(TranscriptEntry.session_id == sid))
        voice_entries = voice_result.scalar() or 0

        # Duration
        duration = None
        if session.updated_at and session.created_at:
            delta = session.updated_at - session.created_at
            duration = round(delta.total_seconds() / 60, 1)

        ai_config = session.ai_config or {}
        ai_count = msg_row.ai_count or 0
        user_count = msg_row.user_count or 0

        cost = await _compute_cost_breakdown(db, org_id=org.id, session_id=sid)

        metrics.append(
            SessionMetrics(
                session_id=sid,
                project_name=project_name,
                status=session.status,
                persona=ai_config.get("persona", "default"),
                assertiveness=ai_config.get("assertiveness", "balanced"),
                created_at=str(session.created_at),
                duration_minutes=duration,
                total_messages=msg_row.total or 0,
                ai_messages=ai_count,
                user_messages=user_count,
                ai_to_user_ratio=round(ai_count / user_count, 2) if user_count > 0 else None,
                participant_count=participant_count,
                blueprint_versions=bp_versions,
                blueprint_completion_pct=pct,
                blueprint_sections_filled=filled,
                blueprint_sections_total=total,
                board_generated=board is not None,
                cards_generated=cards_count,
                total_story_points=story_points,
                voice_entries=voice_entries,
                initial_idea=session.initial_idea,
                cost=cost,
            )
        )

    return metrics


@router.get("/aggregate")
async def get_aggregate_metrics(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    session_id: str | None = Query(None),
) -> AggregateMetrics:
    """Org-wide or project/session-scoped aggregate metrics."""

    # All sessions, optionally filtered.
    stmt = select(Session).where(Session.org_id == org.id)
    if session_id:
        stmt = stmt.where(Session.id == session_id)
    sessions_result = await db.execute(stmt.order_by(Session.created_at))
    sessions = sessions_result.scalars().all()

    if not sessions:
        empty_scope = _build_scope(
            org_id=org.id,
            session_id=session_id,
            session_count=0,
            start=None,
            end=None,
        )
        return AggregateMetrics(
            total_sessions=0,
            completed_sessions=0,
            completion_rate=0,
            avg_duration_minutes=None,
            avg_messages_per_session=0,
            avg_ai_messages=0,
            avg_user_messages=0,
            avg_blueprint_completion_pct=0,
            sessions_with_board=0,
            board_generation_rate=0,
            avg_cards_per_board=0,
            avg_story_points_per_board=0,
            total_messages=0,
            total_ai_messages=0,
            total_cards_generated=0,
            total_story_points=0,
            persona_distribution={},
            assertiveness_distribution={},
            sessions_with_voice=0,
            voice_usage_rate=0,
            avg_participants=0,
            busiest_day=None,
            sessions_timeline=[],
            cost=CostBreakdown(total_usd=0.0, by_provider={}, is_partially_estimated=False, estimated_share=0.0),
            scope=empty_scope,
        )

    total = len(sessions)
    completed = sum(1 for s in sessions if s.status in ("completed", "reviewing"))

    # Per-session data collection
    durations = []
    msg_counts = []
    ai_msg_counts = []
    user_msg_counts = []
    bp_pcts = []
    boards_count = 0
    cards_list = []
    points_list = []
    persona_dist: dict[str, int] = {}
    assert_dist: dict[str, int] = {}
    voice_sessions = 0
    participant_counts = []
    day_counts: dict[str, int] = {}

    for session in sessions:
        sid = session.id
        ai_config = session.ai_config or {}

        # Duration
        if session.updated_at and session.created_at:
            delta = session.updated_at - session.created_at
            mins = delta.total_seconds() / 60
            if mins > 0.5:  # filter out instant creates
                durations.append(mins)

        # Messages
        msg_result = await db.execute(
            select(
                func.count().label("total"),
                func.count(case((ChatMessage.message_type == "ai", 1))).label("ai"),
                func.count(case((ChatMessage.message_type == "chat", 1))).label("user"),
            ).where(ChatMessage.session_id == sid)
        )
        mr = msg_result.one()
        msg_counts.append(mr.total or 0)
        ai_msg_counts.append(mr.ai or 0)
        user_msg_counts.append(mr.user or 0)

        # Blueprint
        bp_result = await db.execute(
            select(BlueprintSnapshot)
            .where(BlueprintSnapshot.session_id == session.id)
            .order_by(BlueprintSnapshot.version_number.desc())
            .limit(1)
        )
        bp = bp_result.scalar_one_or_none()
        _, _, pct = _blueprint_completion(bp.content if bp else None)
        bp_pcts.append(pct)

        # Board
        board_result = await db.execute(select(Board).where(Board.session_id == session.id))
        board = board_result.scalar_one_or_none()
        if board:
            boards_count += 1
            card_result = await db.execute(
                select(
                    func.count().label("c"),
                    func.coalesce(func.sum(Card.story_points), 0).label("p"),
                )
                .join(BoardColumn, Card.column_id == BoardColumn.id)
                .where(BoardColumn.board_id == board.id)
            )
            cr = card_result.one()
            cards_list.append(cr.c)
            points_list.append(cr.p)

        # Persona / assertiveness
        persona = ai_config.get("persona", "default")
        assertiveness = ai_config.get("assertiveness", "balanced")
        persona_dist[persona] = persona_dist.get(persona, 0) + 1
        assert_dist[assertiveness] = assert_dist.get(assertiveness, 0) + 1

        # Voice
        voice_result = await db.execute(select(func.count()).where(TranscriptEntry.session_id == sid))
        if (voice_result.scalar() or 0) > 0:
            voice_sessions += 1

        # Participants
        part_result = await db.execute(
            select(func.count(distinct(Participant.user_id))).where(Participant.session_id == sid)
        )
        participant_counts.append(part_result.scalar() or 0)

        # Day distribution
        if session.created_at:
            day_key = session.created_at.strftime("%A")
            day_counts[day_key] = day_counts.get(day_key, 0) + 1

    # Timeline (sessions per day)
    timeline: list[dict] = []
    if sessions:
        timeline_stmt = (
            select(
                cast(Session.created_at, String).label("day"),
                func.count().label("count"),
            )
            .where(Session.org_id == org.id)
        )
        if session_id:
            timeline_stmt = timeline_stmt.where(Session.id == session_id)
        if session_id:
            timeline_stmt = timeline_stmt.where(Session.id == session_id)
        timeline_result = await db.execute(timeline_stmt.group_by("day").order_by("day"))
        for row in timeline_result.all():
            day_str = row.day[:10] if row.day else ""
            timeline.append({"date": day_str, "sessions": row.count})

    def avg(lst: list) -> float:
        return round(sum(lst) / len(lst), 1) if lst else 0

    busiest = max(day_counts, key=day_counts.get) if day_counts else None

    earliest = min((s.created_at for s in sessions if s.created_at), default=None)
    latest = max((s.updated_at or s.created_at for s in sessions if s.created_at), default=None)
    cost = await _compute_cost_breakdown(
        db,
        org_id=org.id,
        session_id=session_id,
    )
    scope = _build_scope(
        org_id=org.id,
        session_id=session_id,
        session_count=total,
        start=earliest,
        end=latest,
    )

    return AggregateMetrics(
        total_sessions=total,
        completed_sessions=completed,
        completion_rate=round(completed / total * 100, 1) if total else 0,
        avg_duration_minutes=round(sum(durations) / len(durations), 1) if durations else None,
        avg_messages_per_session=avg(msg_counts),
        avg_ai_messages=avg(ai_msg_counts),
        avg_user_messages=avg(user_msg_counts),
        avg_blueprint_completion_pct=avg(bp_pcts),
        sessions_with_board=boards_count,
        board_generation_rate=round(boards_count / total * 100, 1) if total else 0,
        avg_cards_per_board=avg(cards_list),
        avg_story_points_per_board=avg(points_list),
        total_messages=sum(msg_counts),
        total_ai_messages=sum(ai_msg_counts),
        total_cards_generated=sum(cards_list),
        total_story_points=sum(points_list),
        persona_distribution=persona_dist,
        assertiveness_distribution=assert_dist,
        sessions_with_voice=voice_sessions,
        voice_usage_rate=round(voice_sessions / total * 100, 1) if total else 0,
        avg_participants=avg(participant_counts),
        busiest_day=busiest,
        sessions_timeline=timeline,
        cost=cost,
        scope=scope,
    )


@router.get("/highlights")
async def get_content_highlights(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    session_id: str | None = Query(None),
) -> ContentHighlight:
    """Pre-packaged marketing-ready stats. Drop these into content directly."""

    # Reuse aggregate logic
    agg = await get_aggregate_metrics(db=db, user=user, org=org, session_id=session_id)

    # Format for marketing
    duration_str = f"{agg.avg_duration_minutes:.0f} minutes" if agg.avg_duration_minutes else "N/A"
    bp_str = f"{agg.avg_blueprint_completion_pct:.0f}%"
    persona_str = max(agg.persona_distribution, key=agg.persona_distribution.get) if agg.persona_distribution else "N/A"
    voice_str = f"{agg.voice_usage_rate:.0f}%"

    return ContentHighlight(
        avg_session_to_board_minutes=duration_str,
        blueprint_completion_rate=bp_str,
        most_popular_persona=persona_str,
        total_planning_sessions=str(agg.total_sessions),
        total_tasks_generated=str(agg.total_cards_generated),
        ai_challenges_per_session=f"{agg.avg_ai_messages:.1f}",
        voice_adoption=voice_str,
    )


@router.get("/engineering")
async def get_engineering_metrics(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    session_id: str | None = Query(None),
) -> EngineeringMetrics:
    """Engineering metrics: committed vs done, priority breakdown, deploy frequency, release trends."""

    # ── Fetch boards (optionally filtered by project) ────────────────
    board_stmt = select(Board).where(Board.org_id == org.id)
    if session_id:
        board_stmt = board_stmt.where(Board.session_id == session_id)
    boards = (await db.execute(board_stmt)).scalars().all()

    if not boards:
        return EngineeringMetrics(
            committed_vs_done=[],
            open_by_priority=[],
            deploy_frequency=[],
            release_trends=[],
            total_committed=0,
            total_done=0,
            total_open=0,
            total_prs=0,
            delivery_rate=0,
        )

    board_ids = [b.id for b in boards]

    # ── Load all columns and cards across matching boards ────────────
    cols_result = await db.execute(
        select(BoardColumn).where(BoardColumn.board_id.in_(board_ids)).order_by(BoardColumn.position)
    )
    all_columns = cols_result.scalars().all()
    col_ids = [c.id for c in all_columns]

    cards_result = await db.execute(select(Card).where(Card.column_id.in_(col_ids)))
    all_cards = cards_result.scalars().all()

    # Map column_id → column name for classification
    col_name_map = {c.id: c.name for c in all_columns}
    # Map board_id → project for labeling
    board_project_map: dict[str, str] = {}
    for b in boards:
        board_project_map[b.id] = b.session_id
    # Map column_id → board_id
    col_board_map = {c.id: c.board_id for c in all_columns}

    # ── 1) Committed vs Done — per project ───────────────────────────
    # "Committed" = all cards on the board. "Done" = cards in "Done" column.
    project_stats: dict[str, dict] = {}  # session_id → {committed, done, name}

    # Fetch project names
    proj_ids = list({b.session_id for b in boards})
    proj_result = await db.execute(select(Session.id, Session.name).where(Session.id.in_(proj_ids)))
    proj_name_map = {row.id: row.name for row in proj_result.all()}

    for card in all_cards:
        board_id = col_board_map.get(card.column_id)
        pid = board_project_map.get(board_id, "unknown") if board_id else "unknown"
        col_name = col_name_map.get(card.column_id, "")
        if pid not in project_stats:
            project_stats[pid] = {"committed": 0, "done": 0}
        project_stats[pid]["committed"] += 1
        if col_name == "Done":
            project_stats[pid]["done"] += 1

    committed_vs_done = [
        CommittedVsDone(
            label=proj_name_map.get(pid, pid[:8]),
            committed=stats["committed"],
            done=stats["done"],
        )
        for pid, stats in project_stats.items()
    ]

    # ── 2) Open cards by priority ────────────────────────────────────
    priority_counts: dict[str, int] = {}
    for card in all_cards:
        col_name = col_name_map.get(card.column_id, "")
        if col_name != "Done":
            prio = card.priority or "none"
            priority_counts[prio] = priority_counts.get(prio, 0) + 1

    # Sort by severity
    prio_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "none": 4}
    open_by_priority = sorted(
        [PriorityBreakdown(priority=p, count=c) for p, c in priority_counts.items()],
        key=lambda x: prio_order.get(x.priority, 5),
    )

    # ── 3) Deploy frequency — PRs completed per day ─────────────────
    deploy_dates: dict[str, int] = {}
    total_prs = 0
    for card in all_cards:
        if card.agent_status == "done" and card.agent_pr_url:
            total_prs += 1
            if card.updated_at:
                day_key = card.updated_at.strftime("%Y-%m-%d")
                deploy_dates[day_key] = deploy_dates.get(day_key, 0) + 1

    deploy_frequency = [DeployFrequencyPoint(date=d, count=c) for d, c in sorted(deploy_dates.items())]

    # ── 4) Release trends — per iteration ────────────────────────────
    # Group boards by iteration_id, compute metrics per release
    release_trends: list[ReleaseTrend] = []

    # Fetch iterations for labeling
    iter_ids = [b.iteration_id for b in boards if b.iteration_id]
    iter_label_map: dict[str, str] = {}
    if iter_ids:
        iter_result = await db.execute(
            select(BlueprintIteration.id, BlueprintIteration.label, BlueprintIteration.display_name)
            .where(BlueprintIteration.id.in_(iter_ids))
            .order_by(BlueprintIteration.iteration_number)
        )
        for row in iter_result.all():
            iter_label_map[row.id] = row.display_name or row.label

    # Map board_id → iteration_id
    board_iter_map = {b.id: b.iteration_id for b in boards}

    # Group cards by iteration
    iter_cards: dict[str | None, list] = {}
    for card in all_cards:
        board_id = col_board_map.get(card.column_id)
        it_id = board_iter_map.get(board_id) if board_id else None
        iter_cards.setdefault(it_id, []).append(card)

    for it_id, cards in iter_cards.items():
        label = iter_label_map.get(it_id, "Unassigned") if it_id else "Unassigned"
        committed = len(cards)
        done = sum(1 for c in cards if col_name_map.get(c.column_id) == "Done")
        points = sum(c.story_points or 0 for c in cards)

        # Approximate cycle time: for done cards, updated_at - created_at
        cycle_hours = []
        for c in cards:
            if col_name_map.get(c.column_id) == "Done" and c.updated_at and c.created_at:
                delta = c.updated_at - c.created_at
                hours = delta.total_seconds() / 3600
                if hours > 0:
                    cycle_hours.append(hours)

        avg_cycle = round(sum(cycle_hours) / len(cycle_hours), 1) if cycle_hours else None

        release_trends.append(
            ReleaseTrend(
                label=label,
                committed=committed,
                done=done,
                story_points=points,
                avg_cycle_hours=avg_cycle,
            )
        )

    # ── Totals ───────────────────────────────────────────────────────
    total_committed = len(all_cards)
    total_done = sum(1 for c in all_cards if col_name_map.get(c.column_id) == "Done")
    total_open = total_committed - total_done

    return EngineeringMetrics(
        committed_vs_done=committed_vs_done,
        open_by_priority=open_by_priority,
        deploy_frequency=deploy_frequency,
        release_trends=release_trends,
        total_committed=total_committed,
        total_done=total_done,
        total_open=total_open,
        total_prs=total_prs,
        delivery_rate=round(total_done / total_committed * 100, 1) if total_committed else 0,
    )


# ── Cost & health endpoints ──────────────────────────────────────────────────


_VALID_GROUP_BY = {"provider", "day", "model", "operation"}


def _bucket_units_summary(units_list: list[dict]) -> dict:
    """Sum the numeric fields across a list of `units` JSON blobs so the UI
    can render a one-liner like '4.2M tokens · 18k characters' next to a
    bucket. Skips non-numeric values defensively."""
    summary: dict[str, float] = {}
    for u in units_list:
        if not isinstance(u, dict):
            continue
        for k, v in u.items():
            try:
                summary[k] = summary.get(k, 0) + float(v)
            except (TypeError, ValueError):
                continue
    return summary


@router.get("/costs")
async def get_costs(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    scope: str = Query("org", pattern="^(org|project|session)$"),
    id: str | None = Query(None, description="Required when scope=project|session"),
    group_by: str = Query("provider"),
    start: str | None = Query(None, description="ISO8601 lower bound (inclusive)"),
    end: str | None = Query(None, description="ISO8601 upper bound (exclusive)"),
) -> CostsResponse:
    """Per-scope cost breakdown grouped by provider, day, model, or operation.

    Defaults: group_by=provider, range=last 30 days. Always includes a daily
    `series` for time-series rendering on the dashboard. The response self-
    describes its scope and range — callers should never have to guess what
    bucket they're looking at."""
    if group_by not in _VALID_GROUP_BY:
        raise HTTPException(status_code=422, detail=f"group_by must be one of {sorted(_VALID_GROUP_BY)}")
    if scope in ("project", "session") and not id:
        raise HTTPException(status_code=422, detail=f"id is required when scope={scope}")

    now = datetime.now(UTC)
    start_dt = datetime.fromisoformat(start) if start else now - timedelta(days=30)
    end_dt = datetime.fromisoformat(end) if end else now
    if end_dt <= start_dt:
        raise HTTPException(status_code=422, detail="end must be after start")

    session_id = id if scope == "project" else None
    session_id = id if scope == "session" else None

    base = select(UsageEvent).where(UsageEvent.org_id == org.id)
    if session_id:
        base = base.where(UsageEvent.session_id == session_id)
    if session_id:
        base = base.where(UsageEvent.session_id == session_id)
    base = base.where(UsageEvent.occurred_at >= start_dt, UsageEvent.occurred_at < end_dt)

    rows = (await db.execute(base)).scalars().all()

    # Aggregate buckets in Python — small rowcounts in dev/test, and the SQL
    # variants for "group by provider | day | model | operation" need the
    # case-by-case JSON merge for `units_summary` anyway.
    bucket_data: dict[str, dict] = {}
    total = Decimal("0")
    estimated = Decimal("0")
    for row in rows:
        if group_by == "provider":
            key = row.provider
        elif group_by == "day":
            key = row.occurred_at.date().isoformat() if row.occurred_at else "unknown"
        elif group_by == "model":
            key = row.model or "unknown"
        else:  # operation
            key = row.operation
        b = bucket_data.setdefault(key, {"cost": Decimal("0"), "units": [], "is_estimated": False})
        cost = Decimal(str(row.cost_usd or 0))
        b["cost"] += cost
        b["units"].append(row.units)
        if row.is_estimated:
            b["is_estimated"] = True
            estimated += cost
        total += cost

    # Sort buckets: by date for `day`, by cost desc otherwise.
    if group_by == "day":
        sorted_keys = sorted(bucket_data.keys())
    else:
        sorted_keys = sorted(bucket_data.keys(), key=lambda k: bucket_data[k]["cost"], reverse=True)

    buckets = [
        CostBucket(
            key=k,
            cost_usd=float(bucket_data[k]["cost"]),
            units_summary=_bucket_units_summary(bucket_data[k]["units"]),
            is_estimated=bucket_data[k]["is_estimated"],
        )
        for k in sorted_keys
    ]

    # Daily series with by_provider breakdown — always included so the UI can
    # render a stacked bar regardless of group_by.
    series_data: dict[str, dict[str, Decimal]] = {}
    for row in rows:
        day = row.occurred_at.date().isoformat() if row.occurred_at else "unknown"
        per_day = series_data.setdefault(day, {"_total": Decimal("0")})
        cost = Decimal(str(row.cost_usd or 0))
        per_day["_total"] = per_day.get("_total", Decimal("0")) + cost
        per_day[row.provider] = per_day.get(row.provider, Decimal("0")) + cost
    series = [
        {
            "date": day,
            "cost_usd": float(per_day["_total"]),
            "by_provider": {k: float(v) for k, v in per_day.items() if k != "_total"},
        }
        for day, per_day in sorted(series_data.items())
    ]

    # Session count for ScopeInfo.
    sess_count_stmt = select(func.count(distinct(Session.id))).where(Session.org_id == org.id)
    if session_id:
        sess_count_stmt = sess_count_stmt.where(Session.id == session_id)
    if session_id:
        sess_count_stmt = sess_count_stmt.where(Session.id == session_id)
    sess_count_stmt = sess_count_stmt.where(Session.created_at >= start_dt, Session.created_at < end_dt)
    sess_count = (await db.execute(sess_count_stmt)).scalar() or 0

    last_event = (
        await db.execute(select(func.max(UsageEvent.occurred_at)).where(UsageEvent.org_id == org.id))
    ).scalar()

    share = float(estimated / total) if total > 0 else 0.0

    return CostsResponse(
        scope=_build_scope(
            org_id=org.id,
            session_id=session_id,
            session_count=sess_count,
            start=start_dt,
            end=end_dt,
        ),
        range={"start": start_dt.isoformat(), "end": end_dt.isoformat()},
        total_usd=float(total),
        is_partially_estimated=estimated > 0,
        estimated_share=round(share, 4),
        group_by=group_by,
        buckets=buckets,
        series=series,
        meta={"last_ingested_at": last_event.isoformat() if last_event else None},
    )


@router.get("/health")
async def get_analytics_health(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
) -> AnalyticsHealth:
    """Data-freshness probe for the analytics dashboard.

    Powers the small 'updated 4m ago · last event 2m ago' indicator in the
    page header — answers 'is the data flowing?' at a glance."""
    cutoff = datetime.now(UTC) - timedelta(hours=24)
    count_stmt = (
        select(func.count())
        .select_from(UsageEvent)
        .where(UsageEvent.org_id == org.id, UsageEvent.occurred_at >= cutoff)
    )
    last_stmt = select(func.max(UsageEvent.occurred_at)).where(UsageEvent.org_id == org.id)
    providers_stmt = select(distinct(UsageEvent.provider)).where(
        UsageEvent.org_id == org.id, UsageEvent.occurred_at >= cutoff
    )
    backfill_stmt = select(func.max(UsageEvent.occurred_at)).where(
        UsageEvent.org_id == org.id, UsageEvent.source == "backfill"
    )
    count = (await db.execute(count_stmt)).scalar() or 0
    last = (await db.execute(last_stmt)).scalar()
    providers = sorted([p for p in (await db.execute(providers_stmt)).scalars().all() if p])
    backfill_at = (await db.execute(backfill_stmt)).scalar()

    return AnalyticsHealth(
        usage_event_count_24h=count,
        last_event_at=last.isoformat() if last else None,
        providers_seen_24h=providers,
        backfill_completed_at=backfill_at.isoformat() if backfill_at else None,
    )


def _month_bounds(reference: datetime) -> tuple[datetime, datetime]:
    """Return (start_of_month, start_of_next_month) in UTC for *reference*.

    Centralising this keeps the badge endpoint trivially correct around
    month boundaries — including December → January year roll."""
    start = reference.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start.month == 12:
        next_start = start.replace(year=start.year + 1, month=1)
    else:
        next_start = start.replace(month=start.month + 1)
    return start, next_start


@router.get("/spend/current-month")
async def get_current_month_spend(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
) -> CurrentMonthSpend:
    """Current-month USD spend with delta vs prior month — designed for a
    small always-visible badge in the app shell so users notice cost
    regressions without opening the analytics page."""
    now = datetime.now(UTC)
    this_start, this_end = _month_bounds(now)
    # Prior month bounds: walk back one day from `this_start` and use that
    # date's month bounds.
    prev_ref = this_start - timedelta(days=1)
    prev_start, prev_end = _month_bounds(prev_ref)

    base = (
        select(
            UsageEvent.provider,
            func.coalesce(func.sum(UsageEvent.cost_usd), 0).label("cost"),
            func.coalesce(func.sum(case((UsageEvent.is_estimated, UsageEvent.cost_usd), else_=0)), 0).label("est"),
        )
        .where(UsageEvent.org_id == org.id)
        .group_by(UsageEvent.provider)
    )

    this_rows = (
        await db.execute(base.where(UsageEvent.occurred_at >= this_start, UsageEvent.occurred_at < this_end))
    ).all()
    by_provider: dict[str, float] = {}
    this_total = Decimal("0")
    this_est = Decimal("0")
    for row in this_rows:
        c = Decimal(str(row.cost or 0))
        by_provider[row.provider] = float(c)
        this_total += c
        this_est += Decimal(str(row.est or 0))

    prev_total_q = await db.execute(
        select(func.coalesce(func.sum(UsageEvent.cost_usd), 0)).where(
            UsageEvent.org_id == org.id,
            UsageEvent.occurred_at >= prev_start,
            UsageEvent.occurred_at < prev_end,
        )
    )
    prev_total = Decimal(str(prev_total_q.scalar() or 0))

    delta_pct = None
    if prev_total > 0:
        delta_pct = float((this_total - prev_total) / prev_total * 100)

    return CurrentMonthSpend(
        month=this_start.strftime("%Y-%m"),
        total_usd=float(this_total),
        last_month_usd=float(prev_total),
        delta_pct=round(delta_pct, 1) if delta_pct is not None else None,
        is_partially_estimated=this_est > 0,
        by_provider=by_provider,
    )


# ── AI Inspector ─────────────────────────────────────────────────────────────


class AiCallRow(BaseModel):
    """One usage_events row, flattened for the AI Inspector table."""

    id: str
    occurred_at: str  # iso8601
    provider: str
    operation: str
    model: str | None
    input_tokens: int
    output_tokens: int
    cache_read: int
    cache_write: int
    cost_usd: float
    is_estimated: bool
    units: dict


class AiCallBucket(BaseModel):
    """Aggregation row — same shape used for model/provider/operation buckets."""

    key: str
    calls: int
    input_tokens: int
    output_tokens: int
    cache_read: int
    cache_write: int
    cost_usd: float


class AiCallsAggregations(BaseModel):
    total_calls: int
    total_input_tokens: int
    total_output_tokens: int
    total_cache_read: int
    total_cache_write: int
    total_cost_usd: float
    is_partially_estimated: bool
    by_model: list[AiCallBucket]
    by_provider: list[AiCallBucket]
    by_operation: list[AiCallBucket]


class SessionAiCallsResponse(BaseModel):
    session_id: str
    calls: list[AiCallRow]
    aggregations: AiCallsAggregations


def _safe_int_from_units(units: dict, key: str) -> int:
    try:
        v = units.get(key)
        return int(v) if v else 0
    except (TypeError, ValueError, AttributeError):
        return 0


@router.get("/session-ai-calls/{session_id}")
async def get_session_ai_calls(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    limit: int = Query(500, ge=1, le=2000),
) -> SessionAiCallsResponse:
    """Per-call AI usage rows for a session, plus aggregations by model,
    provider, and operation. Drives the AI Inspector page.

    404 when the session is not in the requesting org — covers both "no
    such session" and cross-org access so we don't leak existence."""
    session_row = await db.execute(
        select(Session.id).where(Session.id == session_id, Session.org_id == org.id)
    )
    if not session_row.scalar():
        raise HTTPException(status_code=404, detail="session not found")

    stmt = (
        select(UsageEvent)
        .where(UsageEvent.org_id == org.id, UsageEvent.session_id == session_id)
        .order_by(UsageEvent.occurred_at.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()

    calls: list[AiCallRow] = []
    by_model: dict[str, dict] = {}
    by_provider: dict[str, dict] = {}
    by_operation: dict[str, dict] = {}

    total_in = total_out = total_cr = total_cw = 0
    total_cost = Decimal("0")
    estimated_cost = Decimal("0")

    for row in rows:
        units = row.units if isinstance(row.units, dict) else {}
        in_tok = _safe_int_from_units(units, "tokens_in")
        out_tok = _safe_int_from_units(units, "tokens_out")
        cache_r = _safe_int_from_units(units, "cache_read")
        cache_w = _safe_int_from_units(units, "cache_write")
        cost = Decimal(str(row.cost_usd or 0))

        calls.append(
            AiCallRow(
                id=row.id,
                occurred_at=row.occurred_at.isoformat() if row.occurred_at else "",
                provider=row.provider,
                operation=row.operation,
                model=row.model,
                input_tokens=in_tok,
                output_tokens=out_tok,
                cache_read=cache_r,
                cache_write=cache_w,
                cost_usd=float(cost),
                is_estimated=bool(row.is_estimated),
                units=units,
            )
        )

        total_in += in_tok
        total_out += out_tok
        total_cr += cache_r
        total_cw += cache_w
        total_cost += cost
        if row.is_estimated:
            estimated_cost += cost

        for bucket, key in (
            (by_model, row.model or "unknown"),
            (by_provider, row.provider),
            (by_operation, row.operation),
        ):
            b = bucket.setdefault(
                key,
                {"calls": 0, "input": 0, "output": 0, "cache_read": 0, "cache_write": 0, "cost": Decimal("0")},
            )
            b["calls"] += 1
            b["input"] += in_tok
            b["output"] += out_tok
            b["cache_read"] += cache_r
            b["cache_write"] += cache_w
            b["cost"] += cost

    def _to_buckets(d: dict[str, dict]) -> list[AiCallBucket]:
        return sorted(
            (
                AiCallBucket(
                    key=k,
                    calls=v["calls"],
                    input_tokens=v["input"],
                    output_tokens=v["output"],
                    cache_read=v["cache_read"],
                    cache_write=v["cache_write"],
                    cost_usd=float(v["cost"]),
                )
                for k, v in d.items()
            ),
            key=lambda b: b.cost_usd,
            reverse=True,
        )

    return SessionAiCallsResponse(
        session_id=session_id,
        calls=calls,
        aggregations=AiCallsAggregations(
            total_calls=len(rows),
            total_input_tokens=total_in,
            total_output_tokens=total_out,
            total_cache_read=total_cr,
            total_cache_write=total_cw,
            total_cost_usd=float(total_cost),
            is_partially_estimated=estimated_cost > 0,
            by_model=_to_buckets(by_model),
            by_provider=_to_buckets(by_provider),
            by_operation=_to_buckets(by_operation),
        ),
    )
