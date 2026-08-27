"""Slack interactivity action payload handler.

Dispatches block_actions payloads to per-action handlers.
"""

from __future__ import annotations

import json
import logging

import httpx
from fastapi import BackgroundTasks
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..models.board import Board, BoardColumn, Card
from ..models.organization import Team
from ..models.project import Project
from ..models.session import Participant, Session
from .connectors.slack_notifier import _load_slack_token, _post_to_channel
from .slack_team_resolver import resolve_team_from_channel
from .slack_templates import session_created_block
from .slack_user_resolver import resolve_user_id

logger = logging.getLogger(__name__)

_TIMEOUT = 10.0


async def _post_error(response_url: str, text: str) -> None:
    """Post an ephemeral error message to the response_url."""
    if not response_url:
        return
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as http:
            await http.post(response_url, json={"response_type": "ephemeral", "text": text})
    except Exception:
        logger.exception("Failed to post error to response_url")


async def handle(db: AsyncSession, payload: dict, background_tasks: BackgroundTasks) -> None:
    """Handle a Slack interactivity payload (block actions, shortcuts, modals, etc.).

    ``payload`` is the JSON-decoded value of the ``payload`` form field sent by
    Slack to the interactivity endpoint.  Returns None — Slack expects a 200
    with an empty body for immediate acknowledgement.
    """
    action_type = payload.get("type", "")
    logger.info("Received Slack interactive action: %s", action_type)

    if action_type != "block_actions":
        return None

    # Extract context
    slack_team_id = (payload.get("team") or {}).get("id", "")
    slack_user_id = (payload.get("user") or {}).get("id", "")
    channel_id = (payload.get("channel") or {}).get("id", "")
    response_url = payload.get("response_url", "")
    # The ts of the message that contained the clicked button — needed when
    # we want to delete the original picker post after the user makes a choice.
    message_ts = (payload.get("message") or {}).get("ts", "")

    # Resolve team
    team_id = await resolve_team_from_channel(db, channel_id)
    if not team_id:
        await _post_error(response_url, "This channel isn't mapped to a Planr team yet.")
        return None

    team_result = await db.execute(select(Team).where(Team.id == team_id))
    team = team_result.scalar_one_or_none()
    if not team:
        await _post_error(response_url, "Team not found.")
        return None

    token = await _load_slack_token(db, team.org_id)
    if not token:
        await _post_error(response_url, "Slack integration isn't active for this org.")
        return None

    user_id = await resolve_user_id(db, slack_team_id, slack_user_id, slack_bot_token=token)
    if not user_id:
        await _post_error(
            response_url,
            "Please run `/planr link <your Planr email>` first so I know who you are.",
        )
        return None

    # Dispatch each action
    for action in payload.get("actions") or []:
        action_id = action.get("action_id", "")
        value = action.get("value", "")
        try:
            await _dispatch_action(
                db, action_id, value, user_id, team, response_url, token, channel_id, slack_user_id, message_ts
            )
        except Exception:
            logger.exception("Action handler failed for action_id=%s", action_id)
            await _post_error(response_url, f"Failed to handle action `{action_id}`. Check logs.")

    return None


async def _dispatch_action(
    db: AsyncSession,
    action_id: str,
    value: str,
    user_id: str,
    team: Team,
    response_url: str,
    token: str,
    channel_id: str,
    slack_user_id: str,
    message_ts: str = "",
) -> None:
    """Route a single action by action_id."""

    if action_id == "pr_ready:approve":
        await _handle_pr_approve(db, value, response_url)

    elif action_id == "pr_ready:comment":
        # A modal opener is a follow-up; for now, same as approve
        logger.info("pr_ready:comment action received — treating as approve (modal opener is a follow-up)")
        await _handle_pr_approve(db, value, response_url)

    elif action_id == "card_failed:retry":
        await _handle_card_retry(db, value, response_url)

    elif action_id == "card_failed:mark_done":
        await _handle_card_mark_done(db, value, team.org_id, response_url)

    elif action_id == "session_completed:ack":
        # No-op
        logger.info("session_completed:ack received — no action needed")

    elif action_id.startswith("session_create_pick_project"):
        # Action IDs are suffixed per button (e.g. ":0", ":1") because Slack
        # requires uniqueness within a message. Match by prefix.
        await _handle_pick_project(
            db, value, user_id, team, response_url, token, channel_id, slack_user_id, message_ts
        )

    elif action_id.startswith("noop"):
        # Button with URL but no logic
        logger.debug("noop action received")

    else:
        logger.info("Unhandled Slack action_id: %s — not yet wired", action_id)


async def _handle_pr_approve(db: AsyncSession, card_id: str, response_url: str) -> None:
    """Merge the PR associated with the card (card.agent_pr_url)."""
    import asyncio

    if not card_id:
        await _post_error(response_url, "No card_id in action value.")
        return

    result = await db.execute(select(Card).where(Card.id == card_id))
    card = result.scalar_one_or_none()
    if not card:
        await _post_error(response_url, f"Card `{card_id}` not found.")
        return

    pr_url = card.agent_pr_url
    if not pr_url:
        await _post_error(response_url, "No PR URL found on this card.")
        return

    # Find the project to get the repo_url
    board_result = await db.execute(
        select(Board)
        .join(BoardColumn, BoardColumn.board_id == Board.id)
        .where(BoardColumn.id == card.column_id)
        .limit(1)
    )
    board = board_result.scalar_one_or_none()

    project = None
    if board:
        project_result = await db.execute(select(Project).where(Project.id == board.project_id))
        project = project_result.scalar_one_or_none()

    if not project or not project.repo_url:
        await _post_error(response_url, "No repository configured for this project.")
        return

    try:
        from ..orchestrator.workspace import merge_pull_request

        merged = await asyncio.get_event_loop().run_in_executor(
            None, merge_pull_request, project.repo_url, pr_url
        )
        if merged:
            card.agent_status = "done"
            await db.commit()
            logger.info("Merged PR %s for card %s", pr_url, card.id)
        else:
            await _post_error(response_url, "PR is not mergeable right now. Check GitHub.")
    except Exception:
        logger.exception("merge_pull_request failed for card %s", card_id)
        await _post_error(response_url, "Failed to merge PR. Check logs.")


async def _handle_card_retry(db: AsyncSession, card_id: str, response_url: str) -> None:
    """Reset card agent_status to 'assigned' so the orchestrator retries it."""
    if not card_id:
        await _post_error(response_url, "No card_id in action value.")
        return

    result = await db.execute(select(Card).where(Card.id == card_id))
    card = result.scalar_one_or_none()
    if not card:
        await _post_error(response_url, f"Card `{card_id}` not found.")
        return

    card.agent_status = "assigned"
    card.agent_log = []
    await db.commit()
    logger.info("Reset card %s to agent_status=assigned for retry", card.id)


async def _handle_card_mark_done(
    db: AsyncSession, card_id: str, org_id: str, response_url: str
) -> None:
    """Move card to the 'Done' column and clear agent state."""
    if not card_id:
        await _post_error(response_url, "No card_id in action value.")
        return

    result = await db.execute(select(Card).where(Card.id == card_id))
    card = result.scalar_one_or_none()
    if not card:
        await _post_error(response_url, f"Card `{card_id}` not found.")
        return

    # Find the "Done" column on the same board
    col_result = await db.execute(
        select(BoardColumn)
        .join(Board, BoardColumn.board_id == Board.id)
        .where(
            Board.org_id == org_id,
            BoardColumn.board_id == (
                select(BoardColumn.board_id).where(BoardColumn.id == card.column_id).scalar_subquery()
            ),
            BoardColumn.name.ilike("done"),
        )
        .limit(1)
    )
    done_col = col_result.scalar_one_or_none()
    if not done_col:
        await _post_error(response_url, "Couldn't find a 'Done' column on this board.")
        return

    card.column_id = done_col.id
    card.agent_status = "done"
    await db.commit()
    logger.info("Marked card %s as done (column=%s)", card.id, done_col.id)


async def _handle_pick_project(
    db: AsyncSession,
    value: str,
    user_id: str,
    team: Team,
    response_url: str,
    token: str,
    channel_id: str,
    slack_user_id: str,
    message_ts: str = "",
) -> None:
    """Picker button → create session in chosen project and post public message."""
    try:
        decoded = json.loads(value)
        project_id = decoded.get("project_id")
        title = decoded.get("title") or ""
        source = decoded.get("source", "slash")
    except (json.JSONDecodeError, AttributeError):
        await _post_error(response_url, "Invalid picker payload.")
        return

    if not project_id or not title:
        await _post_error(response_url, "Missing project_id or title.")
        return

    # Defensive: project must exist, not soft-deleted, and belong to the team's org.
    project = (
        await db.execute(select(Project).where(Project.id == project_id))
    ).scalar_one_or_none()
    if not project or project.deleted_at is not None or project.org_id != team.org_id:
        await _post_error(
            response_url, "That project is no longer available. Please try `/planr session` again."
        )
        return

    session = Session(project_id=project.id, org_id=team.org_id, title=title)
    db.add(session)
    await db.flush()
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
            "channel_id": channel_id,
            "surface": "picker",
        },
    )

    blocks = session_created_block(
        slack_user_id=slack_user_id,
        title=title,
        project_name=project.name,
        session_url=session_url,
    )
    posted_ts = await _post_to_channel(
        token, channel_id, text=f"Session created: {title}", blocks=blocks
    )
    if not posted_ts:
        await _post_error(
            response_url,
            f"Session created, but I couldn't post to this channel. Open it directly: {session_url}",
        )
    else:
        from .slack_session_announcements import record_announcement

        await record_announcement(
            db,
            session_id=session.id,
            org_id=team.org_id,
            channel_id=channel_id,
            message_ts=posted_ts,
        )

    # If the picker was posted publicly (from an @mention), delete it now that
    # the user has made a choice. Slash pickers are ephemeral — skip.
    if source == "mention" and message_ts:
        await _delete_message(token, channel_id, message_ts)


async def _delete_message(token: str, channel_id: str, message_ts: str) -> None:
    """Best-effort ``chat.delete``. Swallows failures — losing the delete is
    harmless (picker just lingers in the channel)."""
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            await client.post(
                "https://slack.com/api/chat.delete",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json; charset=utf-8",
                },
                json={"channel": channel_id, "ts": message_ts},
            )
    except Exception:
        logger.debug("chat.delete failed for %s %s", channel_id, message_ts, exc_info=True)
