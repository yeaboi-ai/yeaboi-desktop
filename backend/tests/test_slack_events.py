"""Tests for the Slack Events API handler."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from src.app.services.slack_event_handler import handle as event_handle


def _envelope(event_type: str, text: str, channel_type: str = "channel", bot_id: str | None = None) -> dict:
    event: dict = {
        "type": event_type,
        "user": "U_EVT_USER",
        "channel": "C_EVT_CHAN",
        "text": text,
        "channel_type": channel_type,
    }
    if bot_id:
        event["bot_id"] = bot_id
    return {
        "type": "event_callback",
        "team_id": "T_EVT_TEAM",
        "event": event,
    }


# ---------------------------------------------------------------------------
# app_mention routes to the tool loop (unmapped channel exits silently)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_app_mention_routes_to_ask(db_session):
    """app_mention events invoke the tool-loop path and return ok.

    When the channel is not mapped to a team, _dispatch_ask silently returns —
    the handler still acknowledges with {"ok": True}.
    """
    from fastapi import BackgroundTasks

    bt = BackgroundTasks()
    envelope = _envelope("app_mention", "<@UBOTID> what are the open tasks?")

    with patch(
        "src.app.services.slack_event_handler.resolve_team_from_channel",
        new=AsyncMock(return_value=None),
    ):
        result = await event_handle(db_session, envelope, bt)

    assert result == {"ok": True}


# ---------------------------------------------------------------------------
# message.im routes to the tool loop (unmapped channel exits silently)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_message_im_routes_to_ask(db_session):
    """message events in DM channels (channel_type=im) invoke the tool-loop path.

    When the channel is not mapped to a team, _dispatch_ask silently returns —
    the handler still acknowledges with {"ok": True}.
    """
    from fastapi import BackgroundTasks

    bt = BackgroundTasks()
    envelope = _envelope("message", "show me my projects", channel_type="im")

    with patch(
        "src.app.services.slack_event_handler.resolve_team_from_channel",
        new=AsyncMock(return_value=None),
    ):
        result = await event_handle(db_session, envelope, bt)

    assert result == {"ok": True}


# ---------------------------------------------------------------------------
# Bot-self message NOT routed
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bot_message_not_routed(db_session):
    """Messages from bots (bot_id set) are ignored and handle_ask is NOT called."""
    from fastapi import BackgroundTasks

    bt = BackgroundTasks()
    envelope = _envelope("message", "I am the bot", bot_id="B_BOT123")

    with patch(
        "src.app.services.slack_query_flow.handle_ask",
        new=AsyncMock(),
    ) as mock_ask:
        result = await event_handle(db_session, envelope, bt)

    assert result == {"ok": True}
    mock_ask.assert_not_awaited()


# ---------------------------------------------------------------------------
# bot_message subtype NOT routed
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bot_subtype_not_routed(db_session):
    """Messages with subtype=bot_message are ignored."""
    from fastapi import BackgroundTasks

    bt = BackgroundTasks()
    event: dict = {
        "type": "message",
        "subtype": "bot_message",
        "user": "U_BOT",
        "channel": "C_EVT_CHAN",
        "text": "hello",
        "channel_type": "channel",
    }
    envelope = {"type": "event_callback", "team_id": "T_EVT_TEAM", "event": event}

    with patch(
        "src.app.services.slack_query_flow.handle_ask",
        new=AsyncMock(),
    ) as mock_ask:
        result = await event_handle(db_session, envelope, bt)

    assert result == {"ok": True}
    mock_ask.assert_not_awaited()


# ---------------------------------------------------------------------------
# Non-event_callback envelopes pass through
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_non_event_callback_ignored(db_session):
    """Envelopes with type != event_callback are ignored."""
    from fastapi import BackgroundTasks

    bt = BackgroundTasks()
    envelope = {"type": "url_verification", "challenge": "abc"}

    with patch(
        "src.app.services.slack_query_flow.handle_ask",
        new=AsyncMock(),
    ) as mock_ask:
        result = await event_handle(db_session, envelope, bt)

    assert result == {"ok": True}
    mock_ask.assert_not_awaited()
