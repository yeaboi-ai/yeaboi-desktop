"""Slack /planr query sub-command handlers.

Handles ask, summarise, and session subcommands. Each one:
  - Resolves context (team, org, user) via _resolve_context
  - For ask/summarise: returns an ephemeral ack and schedules a background task
  - For session: synchronously creates the session and responds in-channel
"""

from __future__ import annotations

import logging

import httpx
from fastapi import BackgroundTasks
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session_factory
from ..models.organization import Team
from ..models.project import Project
from ..models.session import Session
from .connectors.slack_notifier import _load_slack_token, _post_to_channel
from .slack_team_resolver import resolve_team_from_channel
from .slack_user_resolver import resolve_user_id

logger = logging.getLogger(__name__)


def _ephemeral(text: str) -> dict:
    return {"response_type": "ephemeral", "text": text}


def _in_channel(text: str, blocks: list | None = None) -> dict:
    resp: dict = {"response_type": "in_channel", "text": text}
    if blocks:
        resp["blocks"] = blocks
    return resp


# ---------------------------------------------------------------------------
# Shared context resolver
# ---------------------------------------------------------------------------


async def _resolve_context(
    db: AsyncSession,
    fields: dict,
) -> tuple[str | None, str | None, str | None]:
    """Resolve user_id, team_id, error_text from Slack fields.

    Returns (user_id, team_id, error_text).
    On success error_text is None. On failure user_id/team_id may be None.
    """
    channel_id = fields.get("channel_id", "")
    slack_team_id = fields.get("team_id", "")
    slack_user_id = fields.get("user_id", "")

    team_id = await resolve_team_from_channel(db, channel_id)
    if not team_id:
        return None, None, "This channel isn't mapped to a Planr team yet. Ask your admin to connect it."

    # Load team to get org_id
    team_result = await db.execute(select(Team).where(Team.id == team_id))
    team = team_result.scalar_one_or_none()
    if not team:
        return None, None, "Team not found."

    token = await _load_slack_token(db, team.org_id)
    if not token:
        return None, None, "Slack integration isn't active for this org."

    user_id = await resolve_user_id(db, slack_team_id, slack_user_id, slack_bot_token=token)
    if not user_id:
        return None, None, "I couldn't match your Slack account. Run `/planr link <your Planr email>` first."

    return user_id, team_id, None


# ---------------------------------------------------------------------------
# handle_ask
# ---------------------------------------------------------------------------


async def handle_ask(db: AsyncSession, fields: dict, background_tasks: BackgroundTasks) -> dict:
    """Handle `/planr ask <question>`."""
    question = (fields.get("rest") or "").strip()
    if not question:
        return _ephemeral("Usage: `/planr ask <your question>`")

    user_id, team_id, error = await _resolve_context(db, fields)
    if error:
        return _ephemeral(error)

    # Snapshot values for the background task (db session closes when request ends)
    channel_id = fields.get("channel_id", "")
    response_url = fields.get("response_url", "")

    # Load team/org now — we need org_id for the background task
    team_result = await db.execute(select(Team).where(Team.id == team_id))
    team = team_result.scalar_one_or_none()
    if not team:
        return _ephemeral("Team not found.")

    org_id: str = team.org_id

    async def _run_ask() -> None:
        try:
            async with get_session_factory()() as bg_db:
                token = await _load_slack_token(bg_db, org_id)

                from .ai_provider import get_ai_client

                client = await get_ai_client(org_id, bg_db, task="fast")
                system = (
                    "You are Planr, a planning assistant. "
                    "Answer the user's question concisely. "
                    "If you need data about projects, sessions, or cards, mention that you'd need to look them up "
                    "— do not fabricate."
                )
                answer = await client.chat(
                    system=system,
                    messages=[{"role": "user", "content": question}],
                    max_tokens=512,
                )

                if response_url:
                    try:
                        async with httpx.AsyncClient(timeout=10.0) as http:
                            await http.post(
                                response_url,
                                json={"response_type": "in_channel", "text": answer},
                            )
                        return
                    except Exception:
                        logger.warning("Failed to POST to response_url; falling back to chat.postMessage")

                if token:
                    await _post_to_channel(token, channel_id, answer, None)
        except Exception:
            logger.exception("Background /planr ask task failed for channel %s", channel_id)

    background_tasks.add_task(_run_ask)
    return _ephemeral(":thinking_face: Working on it…")


# ---------------------------------------------------------------------------
# handle_summarise
# ---------------------------------------------------------------------------


async def handle_summarise(db: AsyncSession, fields: dict, background_tasks: BackgroundTasks) -> dict:
    """Handle `/planr summarise <session title or id>`."""
    rest = (fields.get("rest") or "").strip()
    if not rest:
        return _ephemeral("Usage: `/planr summarise <session title or id>`")

    user_id, team_id, error = await _resolve_context(db, fields)
    if error:
        return _ephemeral(error)

    channel_id = fields.get("channel_id", "")
    response_url = fields.get("response_url", "")

    team_result = await db.execute(select(Team).where(Team.id == team_id))
    team = team_result.scalar_one_or_none()
    if not team:
        return _ephemeral("Team not found.")

    org_id: str = team.org_id
    query_str = rest

    async def _run_summarise() -> None:
        try:
            async with get_session_factory()() as bg_db:
                token = await _load_slack_token(bg_db, org_id)

                # Find session by id or title prefix scoped to the org
                session_result = await bg_db.execute(
                    select(Session).where(
                        Session.org_id == org_id,
                        (Session.id == query_str) | Session.title.ilike(f"{query_str}%"),
                    ).limit(1)
                )
                session = session_result.scalar_one_or_none()
                if not session:
                    msg = f"No session found matching `{query_str}`."
                else:
                    from ..models.session import ChatMessage

                    count_result = await bg_db.execute(
                        select(func.count()).where(ChatMessage.session_id == session.id)
                    )
                    message_count = count_result.scalar() or 0

                    # Try to AI-summarise if we have messages
                    summary_text: str
                    if message_count > 0:
                        messages_result = await bg_db.execute(
                            select(ChatMessage)
                            .where(ChatMessage.session_id == session.id)
                            .order_by(ChatMessage.created_at)
                            .limit(50)
                        )
                        messages = messages_result.scalars().all()
                        transcript = "\n".join(
                            f"[{m.speaker_name or 'User'}]: {m.content}" for m in messages
                        )

                        from .ai_provider import get_ai_client

                        client = await get_ai_client(org_id, bg_db, task="fast")
                        summary_text = await client.chat(
                            system="Summarise this planning session in 3-5 bullet points.",
                            messages=[{"role": "user", "content": transcript}],
                            max_tokens=512,
                        )
                    else:
                        summary_text = (
                            f"*{session.title or 'Untitled'}* — "
                            f"{message_count} messages (no content to summarise yet)."
                        )

                    msg = f":memo: *Session: {session.title or 'Untitled'}*\n{summary_text}"

                if response_url:
                    try:
                        async with httpx.AsyncClient(timeout=10.0) as http:
                            await http.post(
                                response_url,
                                json={"response_type": "in_channel", "text": msg},
                            )
                        return
                    except Exception:
                        logger.warning("Failed to POST summarise result to response_url")

                if token:
                    await _post_to_channel(token, channel_id, msg, None)
        except Exception:
            logger.exception("Background /planr summarise task failed for channel %s", channel_id)

    background_tasks.add_task(_run_summarise)
    return _ephemeral(":thinking_face: Summarising…")


# ---------------------------------------------------------------------------
# handle_session_create
# ---------------------------------------------------------------------------


async def handle_session_create(
    db: AsyncSession,
    fields: dict,
    background_tasks: BackgroundTasks,
) -> dict:
    """Handle `/planr session <title>` — create a session or render picker."""
    from ..config import get_settings
    from ..models.session import Participant
    from .slack_templates import over_project_limit_block, project_picker_block, session_created_block

    title = (fields.get("rest") or "").strip()
    if not title:
        return _ephemeral("Usage: `/planr session <session title>`")

    user_id, team_id, error = await _resolve_context(db, fields)
    if error:
        return _ephemeral(error)

    team = (await db.execute(select(Team).where(Team.id == team_id))).scalar_one_or_none()
    if team is None:
        return _ephemeral("Team not found.")

    project = await resolve_project(team_id, db)

    if project is None:
        candidates = await list_candidate_projects(team_id, db, limit=11)  # 11 to detect ">10"
        if not candidates:
            return _ephemeral(
                "No projects in your org yet. Create one in the web app first."
            )
        if len(candidates) > 10:
            app_url = get_settings().app_url.rstrip("/")
            return {
                "response_type": "ephemeral",
                "blocks": over_project_limit_block(projects_url=f"{app_url}/projects"),
            }
        return {
            "response_type": "ephemeral",
            "blocks": project_picker_block(
                title=title,
                projects=[{"id": p.id, "name": p.name} for p in candidates],
            ),
        }

    # Happy path: create the session
    session = Session(
        project_id=project.id,
        org_id=team.org_id,
        title=title,
    )
    db.add(session)
    await db.flush()
    if user_id:
        db.add(Participant(session_id=session.id, user_id=user_id, role="facilitator"))
    await db.commit()
    await db.refresh(session)

    app_url = get_settings().app_url.rstrip("/")
    session_url = f"{app_url}/projects/{project.id}/sessions/{session.id}"
    logger.info(
        "Slack session created",
        extra={
            "team_id": team.id,
            "project_id": project.id,
            "session_id": session.id,
            "channel_id": fields.get("channel_id"),
            "surface": "slash",
        },
    )
    return {
        "response_type": "in_channel",
        "blocks": session_created_block(
            slack_user_id=fields.get("user_id", ""),
            title=title,
            project_name=project.name,
            session_url=session_url,
        ),
    }


async def resolve_project(team_id: str, db: AsyncSession) -> Project | None:
    """Return the team's current project, or None if ambiguous/empty.

    None means the caller should show a picker (slash command) or ask the LLM
    to clarify (conversational path).

    Returns None when:
      - team not found (defensive; resolver upstream should catch this)
      - no active projects in the org
      - multiple active projects and no valid stamp to disambiguate

    Returns a Project when:
      - team has a valid stamped project (exists, not soft-deleted, same org)
      - org has exactly one active project

    Side effect: clears a stale stamp (deleted or cross-org project) silently
    and logs a warning.
    """
    team = (await db.execute(select(Team).where(Team.id == team_id))).scalar_one_or_none()
    if team is None:
        logger.warning(
            "Slack session project fallback",
            extra={"team_id": team_id, "reason": "team_not_found"},
        )
        return None

    if team.last_viewed_project_id:
        project = (
            await db.execute(select(Project).where(Project.id == team.last_viewed_project_id))
        ).scalar_one_or_none()
        if project and project.deleted_at is None and project.org_id == team.org_id:
            return project
        # stale stamp — clear it
        team.last_viewed_project_id = None
        await db.flush()
        logger.warning(
            "Slack session project fallback",
            extra={"team_id": team.id, "reason": "stale_stamp"},
        )

    projects = (
        await db.execute(
            select(Project)
            .where(Project.org_id == team.org_id, Project.deleted_at.is_(None))
            .order_by(Project.updated_at.desc())
            .limit(2)  # only need to distinguish 0 / 1 / many; picker uses list_candidate_projects
        )
    ).scalars().all()

    if len(projects) == 0:
        logger.warning(
            "Slack session project fallback",
            extra={"team_id": team.id, "reason": "no_projects"},
        )
        return None
    if len(projects) == 1:
        return projects[0]
    logger.warning(
        "Slack session project fallback",
        extra={"team_id": team.id, "reason": "ambiguous"},
    )
    return None


async def list_candidate_projects(team_id: str, db: AsyncSession, limit: int = 10) -> list[Project]:
    """Return top-N candidate projects for the picker (most recently updated)."""
    team = (await db.execute(select(Team).where(Team.id == team_id))).scalar_one_or_none()
    if team is None:
        return []
    result = await db.execute(
        select(Project)
        .where(Project.org_id == team.org_id, Project.deleted_at.is_(None))
        .order_by(Project.updated_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())
