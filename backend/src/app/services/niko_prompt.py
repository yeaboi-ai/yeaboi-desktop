"""Niko system prompt builder.

Constructs the identity prompt and dynamic context sections
for Niko's conversations.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from sqlalchemy import func, select

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from ..models.organization import Organization
    from ..models.user import User
    from ..schemas.niko import NikoContextPayload

logger = logging.getLogger(__name__)

NIKO_IDENTITY = """\
You are Niko, the AI assistant for the yeaboi planning platform. You help users \
manage their projects, planning sessions, boards, blueprints, and studio resources.

## Personality
- Knowledgeable and approachable — you know the platform deeply.
- Proactive: suggest next steps, don't just answer questions.
- Concise: 1-3 sentences for simple answers, more detail only when needed.
- You refer to yourself as "Niko" occasionally, or use "I".

## Capabilities
You can take actions on behalf of the user using your tools. Guidelines:
- For creation/update actions, execute immediately and report what you did.
- For DESTRUCTIVE actions (delete), always confirm with the user before executing.
- When listing data, present it in a readable format.
- When the user describes a new idea, ask whether they want a new project or a new session within an existing project.

## Advisory Role
- You can advise on whether to start a new project vs. a new session.
- You can discuss the platform's features and help users get the most out of it.
- You can explain blueprint coverage, board status, and project progress.
- You can suggest what to work on next based on project state.

## Feedback
- Every 5-8 exchanges, briefly check in: ask if the user needs anything else or how the experience is going.
- Keep check-ins natural and brief — one sentence, not a survey.
"""

FEEDBACK_HINT = (
    "\n\n[Internal note: You haven't checked in with the user recently. "
    "Consider briefly asking how things are going or if they need anything else.]\n"
)


async def build_system_prompt(
    context: NikoContextPayload,
    user: User,
    org: Organization,
    db: AsyncSession,
    message_count: int = 0,
) -> str:
    """Build the full system prompt with dynamic context."""
    parts = [NIKO_IDENTITY]

    # User context
    parts.append(f"\n## Current User\n- Name: {user.name or user.email}\n- Role: {user.role}")

    # Page context
    parts.append(f"\n## Current Context\n- Page: {context.page}")

    # Enrich with project data if applicable
    if context.project_id:
        project_ctx = await _build_project_context(context.project_id, db)
        if project_ctx:
            parts.append(project_ctx)

    # Enrich with board data if on a board page
    if context.board_id or (context.project_id and "/board" in context.page):
        board_ctx = await _build_board_context(context.project_id, db)
        if board_ctx:
            parts.append(board_ctx)

    # Enrich with blueprint coverage
    if context.project_id:
        blueprint_ctx = await _build_blueprint_context(context.project_id, db)
        if blueprint_ctx:
            parts.append(blueprint_ctx)

    # Studio context
    if "/studio" in context.page:
        studio_ctx = await _build_studio_context(org.id, db)
        if studio_ctx:
            parts.append(studio_ctx)

    # Feedback hint based on message count
    if message_count > 0 and message_count % 7 == 0:
        parts.append(FEEDBACK_HINT)

    return "\n".join(parts)


async def _build_project_context(project_id: str, db: AsyncSession) -> str | None:
    """Build context about the current project."""
    from ..models.project import Project
    from ..models.session import Session

    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        return None

    session_count = await db.execute(
        select(func.count()).select_from(Session).where(Session.project_id == project_id)
    )
    num_sessions = session_count.scalar_one()

    lines = [
        f"\n### Active Project: {project.name}",
        f"- ID: {project.id}",
    ]
    if project.description:
        lines.append(f"- Description: {project.description[:200]}")
    lines.append(f"- Sessions: {num_sessions}")
    return "\n".join(lines)


async def _build_board_context(project_id: str | None, db: AsyncSession) -> str | None:
    """Build context about the project's board."""
    if not project_id:
        return None

    from ..models.board import Board, BoardColumn, Card

    result = await db.execute(select(Board).where(Board.project_id == project_id))
    board = result.scalar_one_or_none()
    if not board:
        return None

    cols_result = await db.execute(
        select(BoardColumn).where(BoardColumn.board_id == board.id).order_by(BoardColumn.position)
    )
    columns = cols_result.scalars().all()

    lines = ["\n### Board Summary"]
    for col in columns:
        card_count = await db.execute(
            select(func.count()).select_from(Card).where(Card.column_id == col.id)
        )
        count = card_count.scalar_one()
        lines.append(f"- {col.name}: {count} cards")

    return "\n".join(lines)


async def _build_blueprint_context(project_id: str, db: AsyncSession) -> str | None:
    """Build context about blueprint coverage."""
    from ..services.blueprint_service import get_or_create_blueprint
    from ..services.facilitator import assess_coverage

    try:
        snapshot = await get_or_create_blueprint(project_id, db)
        if not snapshot or not snapshot.content:
            return None
        coverage = assess_coverage(snapshot.content)
        lines = [
            f"\n### Blueprint Coverage: {coverage['overall']}% (Grade: {coverage['grade']})",
        ]
        if coverage.get("gaps"):
            lines.append(f"- Gaps: {', '.join(coverage['gaps'][:5])}")
        return "\n".join(lines)
    except Exception:
        logger.debug("Failed to build blueprint context for project %s", project_id)
        return None


async def _build_studio_context(org_id: str, db: AsyncSession) -> str | None:
    """Build context about studio resources."""
    from ..services.blueprint_template_service import get_org_personas, get_org_templates

    try:
        templates = await get_org_templates(org_id, db)
        personas = await get_org_personas(org_id, db)
        lines = [
            "\n### Studio",
            f"- Templates: {len(templates)}",
            f"- Personas: {len(personas)}",
        ]
        if personas:
            lines.append(f"- Available personas: {', '.join(p.name for p in personas[:5])}")
        return "\n".join(lines)
    except Exception:
        logger.debug("Failed to build studio context for org %s", org_id)
        return None
