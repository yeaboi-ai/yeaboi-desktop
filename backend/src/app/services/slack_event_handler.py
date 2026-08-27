"""Slack Events API callback handler.

Handles ``event_callback`` envelopes. Routes ``app_mention`` and
``message`` (DM) event types through the chat tool loop so @planr
mentions and DMs can create sessions and answer questions.

The handler acks Slack immediately (within the 3-second window) and
dispatches the heavy tool-loop work as a FastAPI BackgroundTask.
A ``slack_event_dedup`` table provides belt-and-suspenders protection
so Slack retries that slip past the ack window still no-op.
"""

from __future__ import annotations

import logging
import re

from fastapi import BackgroundTasks
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..models.organization import Organization, Team
from ..models.slack_event_dedup import SlackEventDedup
from .ai_provider import get_ai_client
from .chat_tools import run_tool_loop
from .connectors.slack_notifier import _load_slack_token, _post_to_channel, _set_thinking_status
from .slack_team_resolver import resolve_team_from_channel
from .slack_templates import project_picker_block, session_created_block
from .slack_user_resolver import resolve_user_id

logger = logging.getLogger(__name__)

# Pattern to strip leading <@BOT_ID> mentions from text
_MENTION_RE = re.compile(r"^<@[A-Z0-9]+>\s*", re.IGNORECASE)


async def handle(db: AsyncSession, envelope: dict, background_tasks: BackgroundTasks) -> dict:
    """Handle a Slack Events API envelope.

    ``envelope`` is the full JSON body from Slack.
    Returns ``{"ok": True}`` as the immediate acknowledgement.
    The actual tool-loop work is dispatched as a BackgroundTask so
    Slack's 3-second ack deadline is never breached.
    """
    if envelope.get("type") != "event_callback":
        return {"ok": True}

    event_id = envelope.get("event_id") or ""
    event = envelope.get("event") or {}
    event_type = event.get("type", "")

    # Ignore bot messages (prevent self-loops)
    if event.get("bot_id") or event.get("subtype") == "bot_message":
        logger.debug("Ignoring bot message (type=%s)", event_type)
        return {"ok": True}

    # Dedup: Slack retries events whose handler takes > 3s. Suppress duplicates.
    if event_id:
        try:
            db.add(
                SlackEventDedup(
                    event_id=event_id,
                    slack_team_id=envelope.get("team_id") or None,
                    event_type=event_type or None,
                )
            )
            await db.commit()
        except IntegrityError:
            await db.rollback()
            logger.info(
                "Slack event dedup hit — ignoring retry",
                extra={"event_id": event_id, "event_type": event_type},
            )
            return {"ok": True}

    # Build fields for dispatch
    slack_team_id = envelope.get("team_id", "")
    slack_user_id = event.get("user", "")
    channel_id = event.get("channel", "")
    raw_text = event.get("text", "") or ""
    # thread_ts lets us render the "is thinking..." indicator + post the reply
    # into the same thread so setStatus auto-clears. Use the existing thread if
    # the message is already in one, else the message's own ts as the root.
    thread_ts = event.get("thread_ts") or event.get("ts") or ""

    if event_type == "app_mention":
        question = _MENTION_RE.sub("", raw_text).strip()
        background_tasks.add_task(
            _dispatch_ask_bg, slack_team_id, slack_user_id, channel_id, question, thread_ts
        )

    elif event_type == "message" and event.get("channel_type") == "im":
        question = raw_text.strip()
        background_tasks.add_task(
            _dispatch_ask_bg, slack_team_id, slack_user_id, channel_id, question, thread_ts
        )

    elif (
        event_type == "message"
        and event.get("thread_ts")
        and event.get("channel_type") in {"channel", "group"}
    ):
        # Thread reply in a public/private channel. Only process if Planr has
        # already posted in the thread — that's our signal the user's reply
        # is a follow-up to us rather than an unrelated channel conversation.
        # The filter check runs inside the background task so we don't block
        # Slack's 3-second ack on an API round-trip.
        question = raw_text.strip()
        background_tasks.add_task(
            _dispatch_thread_reply_bg,
            slack_team_id,
            slack_user_id,
            channel_id,
            question,
            event["thread_ts"],
        )

    else:
        logger.debug("Unhandled Slack event type: %s", event_type)

    return {"ok": True}


async def _dispatch_thread_reply_bg(
    slack_team_id: str,
    slack_user_id: str,
    channel_id: str,
    question: str,
    thread_ts: str,
    db: AsyncSession | None = None,
) -> None:
    """Process a thread reply in a channel — only if Planr has posted in the thread.

    Filters out the firehose of ``message.channels`` events by checking the
    thread for a prior bot message. Bails silently if Planr isn't in the thread.
    """
    if not question:
        return

    # Need the token to make the conversations.replies call. Open a short-lived
    # DB session for the lookup.
    if db is None:
        from ..db import get_session_factory

        try:
            async with get_session_factory()() as bg_db:
                await _dispatch_thread_reply_bg(
                    slack_team_id, slack_user_id, channel_id, question, thread_ts, bg_db
                )
        except Exception:
            logger.exception(
                "Slack thread-reply dispatch failed",
                extra={"channel_id": channel_id, "thread_ts": thread_ts},
            )
        return

    team_id = await resolve_team_from_channel(db, channel_id)
    if not team_id:
        return
    team = (await db.execute(select(Team).where(Team.id == team_id))).scalar_one_or_none()
    if not team:
        return
    token = await _load_slack_token(db, team.org_id)
    if not token:
        return

    # Filter: only process if Planr has already posted in the thread. This
    # removes the noise of every channel message without needing to remember
    # which threads we've participated in.
    if not await _planr_posted_in_thread(token, channel_id, thread_ts):
        return

    await _dispatch_ask(db, slack_team_id, slack_user_id, channel_id, question, thread_ts)


async def _planr_posted_in_thread(token: str, channel_id: str, thread_ts: str) -> bool:
    """Return True if any message in the thread was posted by a bot.

    We check for any bot message (via ``bot_id`` / ``subtype == "bot_message"``)
    rather than checking for our specific bot id — simpler, and the only bots
    we'd expect in a Planr-mapped channel's threads are ours.
    """
    import httpx

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://slack.com/api/conversations.replies",
                headers={"Authorization": f"Bearer {token}"},
                params={"channel": channel_id, "ts": thread_ts, "limit": 20},
            )
            if resp.status_code != 200:
                return False
            data = resp.json()
            if not data.get("ok"):
                return False
    except Exception:
        logger.debug("conversations.replies (filter) failed", exc_info=True)
        return False

    for m in data.get("messages") or []:
        if m.get("bot_id") or m.get("subtype") == "bot_message":
            return True
    return False


async def _dispatch_ask_bg(
    slack_team_id: str,
    slack_user_id: str,
    channel_id: str,
    question: str,
    thread_ts: str = "",
    db: AsyncSession | None = None,
) -> None:
    """Run the chat tool loop for an @mention or DM event.

    Opens its own DB session so it can safely run after the HTTP response
    has been sent. An explicit ``db`` parameter can be passed for tests to
    avoid needing the global session factory.
    """
    if db is not None:
        await _dispatch_ask(db, slack_team_id, slack_user_id, channel_id, question, thread_ts)
        return

    from ..db import get_session_factory

    try:
        async with get_session_factory()() as bg_db:
            await _dispatch_ask(bg_db, slack_team_id, slack_user_id, channel_id, question, thread_ts)
    except Exception:
        logger.exception(
            "Slack event background dispatch failed",
            extra={"channel_id": channel_id, "slack_user_id": slack_user_id},
        )


async def _dispatch_ask(
    db: AsyncSession,
    slack_team_id: str,
    slack_user_id: str,
    channel_id: str,
    question: str,
    thread_ts: str = "",
) -> None:
    """Run the chat tool loop for an @mention or DM event."""
    if not question:
        logger.debug("Empty question in Slack event from user %s — skipping", slack_user_id)
        return

    team_id = await resolve_team_from_channel(db, channel_id)
    if not team_id:
        # Channel isn't mapped — silently ignore (matches existing behaviour for events)
        logger.debug("Unmapped channel %s — ignoring event from %s", channel_id, slack_user_id)
        return

    team = (await db.execute(select(Team).where(Team.id == team_id))).scalar_one_or_none()
    if not team:
        return
    org = (
        await db.execute(select(Organization).where(Organization.id == team.org_id))
    ).scalar_one_or_none()
    if not org:
        return

    token = await _load_slack_token(db, team.org_id)
    if not token:
        logger.debug("No Slack token for org %s — skipping", team.org_id)
        return

    user_id = await resolve_user_id(db, slack_team_id, slack_user_id, slack_bot_token=token)
    if not user_id:
        await _post_to_channel(
            token,
            channel_id,
            text="Please run `/planr link <your Planr email>` first so I know who you are.",
            blocks=None,
            thread_ts=thread_ts or None,
        )
        return

    # Show "is thinking..." status under the composer while the tool loop runs.
    # Fire-and-forget — Slack auto-clears when we post the reply in-thread.
    if thread_ts:
        await _set_thinking_status(token, channel_id, thread_ts)

    # Build message history — if this message is in an existing thread, pull
    # the prior messages so the LLM has the conversation context. Fixes the
    # "Planr just asked which project?" → user replies "Task Tracker Pro" →
    # bot treats it as a new isolated turn bug.
    messages = await _build_messages_from_thread(
        token=token,
        channel_id=channel_id,
        thread_ts=thread_ts,
        current_text=question,
    )

    ai = await get_ai_client(org.id, db, task="fast")
    system = (
        f"You are Planr, a helpful planning assistant for the team at {org.name}. "
        "You are talking to a team member inside Slack.\n\n"
        "TOOL USAGE — strict rules:\n"
        "- When the user wants to start/create/open a planning session, IMMEDIATELY "
        "call the create_session tool. Do NOT ask clarifying questions in text. "
        "The tool handles disambiguation for you.\n"
        "- Pass the user's topic/description as the `title` argument (e.g. 'session "
        "on infra' → title=\"infra\"). If a project name is explicitly mentioned, "
        "pass it as `project_name`; otherwise OMIT project_name — the tool will "
        "return needs_project_choice with options and a picker will be rendered "
        "for the user automatically.\n"
        "- If the tool returns status='no_projects', tell the user to create a "
        "project in the web app first.\n"
        "- If the tool returns status='needs_project_choice', say nothing — a "
        "picker has already been rendered; any text reply from you will be "
        "ignored on that path.\n"
        "- For other questions (list projects, get cards, etc.), call the "
        "relevant tool rather than guessing.\n\n"
        "FORMATTING: You are posting to Slack. Use Slack mrkdwn, not standard markdown. "
        "Bold is *single asterisks* not **double**. Italic is _underscores_. "
        "Links are <url|label>. Never use **double asterisks** — they render literally. "
        "Keep replies to 1–2 sentences."
    )

    try:
        final_text, tool_results = await run_tool_loop(
            ai=ai,
            system=system,
            messages=messages,
            org_id=org.id,
            team_id=team.id,
            db=db,
            user_id=user_id,
        )
    except Exception:
        logger.exception(
            "Slack tool loop failed",
            extra={"team_id": team.id, "channel_id": channel_id},
        )
        await _post_to_channel(
            token,
            channel_id,
            text="Hit a snag running that — please try again.",
            blocks=None,
            thread_ts=thread_ts or None,
        )
        return

    # If the tool returned needs_project_choice, skip the LLM's text ask and
    # post the Block Kit picker publicly in the channel. The action handler
    # will delete the picker message once a user clicks a button.
    picker_options = _find_project_choice_request(tool_results)
    if picker_options:
        title = question.strip() or "New session"
        if thread_ts:
            await _set_thinking_status(token, channel_id, thread_ts, status="")
        blocks = project_picker_block(title=title, projects=picker_options, source="mention")
        import json as _json
        logger.warning("Posting picker blocks: %s", _json.dumps(blocks))
        ok = await _post_to_channel(
            token,
            channel_id,
            text=f"Which project should go under: {title[:80]}?",
            blocks=blocks,
            thread_ts=None,
        )
        if not ok:
            # Picker post failed — fall back to a plain text message asking the user
            names = ", ".join(o.get("name", "?") for o in picker_options[:10])
            await _post_to_channel(
                token,
                channel_id,
                text=f"Which project should this session go under? Options: {names}",
                blocks=None,
                thread_ts=None,
            )
        return

    # If a session was successfully created during the loop, post the Block Kit
    # message (with the clickable URL) at channel top-level so the whole team
    # sees it — sessions are team-announcements, not thread chatter. Explicitly
    # clear the thread "is thinking..." status since we're not posting in-thread.
    session_result = _find_successful_session_create(tool_results)
    if session_result:
        app_url = get_settings().app_url.rstrip("/")
        session_url = (
            f"{app_url}/projects/{session_result['project_id']}/sessions/{session_result['id']}"
        )
        logger.info(
            "Slack session created",
            extra={
                "team_id": team.id,
                "project_id": session_result["project_id"],
                "session_id": session_result["id"],
                "channel_id": channel_id,
                "surface": "event",
            },
        )
        if thread_ts:
            # Clear the "is thinking..." indicator since we're posting outside the thread
            await _set_thinking_status(token, channel_id, thread_ts, status="")
        posted_ts = await _post_to_channel(
            token,
            channel_id,
            text=f"Session created: {session_result['title'] or 'New session'}",
            blocks=session_created_block(
                slack_user_id=slack_user_id,
                title=session_result["title"] or "New session",
                project_name=session_result["project"],
                session_url=session_url,
            ),
            thread_ts=None,  # top-level — broadcast to channel
        )
        if posted_ts:
            from .slack_session_announcements import record_announcement

            await record_announcement(
                db,
                session_id=session_result["id"],
                org_id=org.id,
                channel_id=channel_id,
                message_ts=posted_ts,
            )
        return

    # Text-only reply stays in-thread (conversational context)
    reply = _slackify_markdown(final_text or "…")
    await _post_to_channel(token, channel_id, text=reply, blocks=None, thread_ts=thread_ts or None)


async def _build_messages_from_thread(
    *,
    token: str,
    channel_id: str,
    thread_ts: str,
    current_text: str,
) -> list[dict]:
    """Fetch thread history and build an Anthropic messages[] with it.

    Returns a list with the current user turn last. Prior bot/user turns
    (if the current message is already in a thread) are injected before
    the current turn so the LLM has context.

    Failures (bad scope, API error, no thread) degrade to a single-turn
    conversation with just ``current_text``.
    """
    if not thread_ts:
        return [{"role": "user", "content": current_text}]

    import httpx

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://slack.com/api/conversations.replies",
                headers={"Authorization": f"Bearer {token}"},
                params={"channel": channel_id, "ts": thread_ts, "limit": 20},
            )
            if resp.status_code != 200:
                return [{"role": "user", "content": current_text}]
            data = resp.json()
            if not data.get("ok"):
                return [{"role": "user", "content": current_text}]
    except Exception:
        logger.debug("conversations.replies fetch failed", exc_info=True)
        return [{"role": "user", "content": current_text}]

    prior = data.get("messages") or []
    # The CURRENT message is already in `prior` (it's the latest Slack event that
    # triggered us). Drop it — we'll re-add as the last user turn from `current_text`
    # which has had the <@BOT_ID> mention stripped.
    current_event_ts = (prior[-1] or {}).get("ts") if prior else None
    prior_without_current = prior[:-1] if current_event_ts else prior

    messages: list[dict] = []
    for m in prior_without_current:
        text = (m.get("text") or "").strip()
        if not text:
            continue
        # Strip leading <@BOT_ID> mentions from user messages
        text = _MENTION_RE.sub("", text)
        role = "assistant" if (m.get("bot_id") or m.get("subtype") == "bot_message") else "user"
        messages.append({"role": role, "content": text})

    messages.append({"role": "user", "content": current_text})

    # Ensure alternating roles (Anthropic requires it). Collapse consecutive
    # same-role turns by joining their text.
    coalesced: list[dict] = []
    for m in messages:
        if coalesced and coalesced[-1]["role"] == m["role"]:
            coalesced[-1]["content"] = f"{coalesced[-1]['content']}\n\n{m['content']}"
        else:
            coalesced.append(m)

    # Anthropic also requires the first message to be role=user. If the first
    # coalesced message is assistant (shouldn't happen in practice, but defensive),
    # drop it.
    while coalesced and coalesced[0]["role"] != "user":
        coalesced.pop(0)

    return coalesced or [{"role": "user", "content": current_text}]


_BOLD_RE = re.compile(r"\*\*([^*\n]+?)\*\*")
_HEADER_RE = re.compile(r"^\s{0,3}#{1,6}\s+(.*)$", re.MULTILINE)


def _slackify_markdown(text: str) -> str:
    """Post-process LLM output so it renders correctly in Slack mrkdwn.

    Haiku sometimes ignores the system prompt and emits ``**bold**`` or
    ``# headers`` despite instructions. Do the conversion ourselves rather
    than beg the model to comply.
    """
    if not text:
        return text
    # **bold** → *bold*  (don't touch single-asterisk italics / lists)
    text = _BOLD_RE.sub(r"*\1*", text)
    # # Heading → *Heading* (Slack has no heading syntax; bold approximates)
    text = _HEADER_RE.sub(r"*\1*", text)
    return text


def _find_successful_session_create(tool_results: list[dict]) -> dict | None:
    """Return the result dict of a successful `create_session` tool call, if any."""
    for entry in tool_results:
        if entry.get("name") == "create_session":
            result = entry.get("result")
            if isinstance(result, dict) and "id" in result and "project_id" in result:
                return result
    return None


def _find_project_choice_request(tool_results: list[dict]) -> list[dict] | None:
    """Return the options list from a `needs_project_choice` response, if any.

    When ``create_session`` can't auto-resolve a project, it returns
    ``{"status": "needs_project_choice", "options": [{"id", "name"}, ...]}``.
    Callers use this to render a picker instead of asking the user in text.
    """
    for entry in tool_results:
        if entry.get("name") != "create_session":
            continue
        result = entry.get("result")
        if (
            isinstance(result, dict)
            and result.get("status") == "needs_project_choice"
            and isinstance(result.get("options"), list)
        ):
            return result["options"]
    return None
