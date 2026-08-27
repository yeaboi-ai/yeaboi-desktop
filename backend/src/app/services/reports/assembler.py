"""Build a `Report` for a scope+range. Reuses the same SQL as the
/api/analytics/costs endpoint so reports never diverge from the dashboard."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...models.organization import Organization
from ...models.project import Project
from ...models.session import ChatMessage, Session
from ...models.usage_event import UsageEvent
from .model import CostLine, DateRange, Report, ScopeRef, SessionRow


async def _resolve_scope(
    db: AsyncSession,
    *,
    org: Organization,
    project_id: str | None,
    session_id: str | None,
) -> tuple[ScopeRef, str | None]:
    """Return (ScopeRef, label-suffix-or-None). The suffix is used when we
    need a friendly name for templates (project name vs id)."""
    if session_id:
        return ScopeRef(kind="session", label=f"Session #{session_id[:8]}", session_count=1), None
    if project_id:
        proj = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
        name = proj.name if proj else f"Project {project_id[:8]}"
        return ScopeRef(kind="project", label=f"Project {name}", session_count=0), name
    return ScopeRef(kind="org", label=org.name, session_count=0), None


async def build_report(
    db: AsyncSession,
    *,
    org: Organization,
    project_id: str | None = None,
    session_id: str | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
    sessions_limit: int = 25,
) -> Report:
    """Assemble a Report for the given scope and date range.

    Defaults: range = last 30 days, sessions table capped at 25 rows so the
    PDF stays one page for typical orgs."""
    end_dt = end or datetime.now(UTC)
    start_dt = start or end_dt - timedelta(days=30)

    scope, _ = await _resolve_scope(db, org=org, project_id=project_id, session_id=session_id)

    # ── Cost rollup by provider ─────────────────────────────────────────
    cost_stmt = select(
        UsageEvent.provider,
        func.coalesce(func.sum(UsageEvent.cost_usd), 0).label("cost"),
        func.coalesce(func.sum(case((UsageEvent.is_estimated, UsageEvent.cost_usd), else_=0)), 0).label("est"),
    ).where(
        UsageEvent.org_id == org.id,
        UsageEvent.occurred_at >= start_dt,
        UsageEvent.occurred_at < end_dt,
    )
    if project_id:
        cost_stmt = cost_stmt.where(UsageEvent.project_id == project_id)
    if session_id:
        cost_stmt = cost_stmt.where(UsageEvent.session_id == session_id)
    cost_stmt = cost_stmt.group_by(UsageEvent.provider).order_by(func.sum(UsageEvent.cost_usd).desc())

    cost_lines: list[CostLine] = []
    total = Decimal("0")
    estimated = Decimal("0")
    for row in (await db.execute(cost_stmt)).all():
        cost = Decimal(str(row.cost or 0))
        est = Decimal(str(row.est or 0))
        cost_lines.append(CostLine(provider=row.provider, cost_usd=cost, is_estimated=est > 0))
        total += cost
        estimated += est

    # ── Sessions table (top N by created_at desc within range) ──────────
    sess_stmt = (
        select(Session, Project.name)
        .join(Project, Session.project_id == Project.id)
        .where(
            Session.org_id == org.id,
            Session.created_at >= start_dt,
            Session.created_at < end_dt,
        )
    )
    if project_id:
        sess_stmt = sess_stmt.where(Session.project_id == project_id)
    if session_id:
        sess_stmt = sess_stmt.where(Session.id == session_id)
    sess_stmt = sess_stmt.order_by(Session.created_at.desc()).limit(sessions_limit)

    session_rows: list[SessionRow] = []
    for sess, proj_name in (await db.execute(sess_stmt)).all():
        # Per-session cost — reuse usage_events lookup.
        per_cost = (
            await db.execute(
                select(
                    func.coalesce(func.sum(UsageEvent.cost_usd), 0),
                    func.coalesce(func.sum(case((UsageEvent.is_estimated, UsageEvent.cost_usd), else_=0)), 0),
                ).where(UsageEvent.session_id == sess.id)
            )
        ).one()
        per_total = Decimal(str(per_cost[0] or 0))
        per_est = Decimal(str(per_cost[1] or 0))

        msg_count = (await db.execute(select(func.count()).where(ChatMessage.session_id == sess.id))).scalar() or 0

        duration = None
        if sess.updated_at and sess.created_at:
            duration = round((sess.updated_at - sess.created_at).total_seconds() / 60, 1)

        session_rows.append(
            SessionRow(
                session_id=sess.id,
                project_name=proj_name,
                started_at=sess.created_at,
                duration_minutes=duration,
                messages=msg_count,
                cost_usd=per_total,
                is_estimated=per_est > 0,
            )
        )

    if scope.kind != "session":
        scope.session_count = len(session_rows)

    summary = {
        "total_sessions": len(session_rows),
        "providers": len(cost_lines),
        "estimated_share_pct": float(estimated / total * 100) if total > 0 else 0.0,
    }

    return Report(
        scope=scope,
        range=DateRange(start=start_dt, end=end_dt),
        generated_at=datetime.now(UTC),
        total_cost_usd=total,
        cost_lines=cost_lines,
        sessions=session_rows,
        summary=summary,
        is_partially_estimated=estimated > 0,
    )
