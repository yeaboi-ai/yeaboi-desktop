"""Tests for the Slack event handler's tool-loop integration."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.app.models.project import Project
from src.app.services.slack_event_handler import _dispatch_ask, handle


class _FakeAI:
    """Minimal fake that implements chat_with_tools for the tool loop."""

    def __init__(self, *, script: list[dict]):
        """script: list of responses to return on successive calls."""
        self.script = list(script)
        self.calls = 0

    async def chat_with_tools(self, *, system, messages, tools):
        self.calls += 1
        if self.script:
            return self.script.pop(0)
        # Default: plain text "done"
        return {
            "role": "assistant",
            "content": [{"type": "text", "text": "done"}],
            "stop_reason": "end_turn",
        }


@pytest.mark.asyncio
async def test_mention_triggers_tool_loop_and_creates_session_with_link(
    db_session, sample_team, sample_user
):
    project = Project(
        org_id=sample_team.org_id,
        team_id=sample_team.id,
        owner_id=sample_user.id,
        name="Preferred",
    )
    db_session.add(project)
    await db_session.flush()
    sample_team.last_viewed_project_id = project.id
    await db_session.commit()

    envelope = {
        "type": "event_callback",
        "event_id": "Ev_MENTION_CREATE",
        "team_id": "T_WS",
        "event": {
            "type": "app_mention",
            "text": "<@UBOT> create a session about onboarding",
            "user": "U_USER",
            "channel": "C_CHAN",
        },
    }

    # Script: round 1 → tool_use create_session; round 2 → text
    fake_ai = _FakeAI(
        script=[
            {
                "role": "assistant",
                "content": [
                    {
                        "type": "tool_use",
                        "id": "tu_1",
                        "name": "create_session",
                        "input": {"title": "Onboarding"},
                    }
                ],
                "stop_reason": "tool_use",
            },
            {
                "role": "assistant",
                "content": [{"type": "text", "text": "Created."}],
                "stop_reason": "end_turn",
            },
        ]
    )

    posted = AsyncMock(return_value=True)
    with patch(
        "src.app.services.slack_event_handler.resolve_team_from_channel",
        new=AsyncMock(return_value=sample_team.id),
    ), patch(
        "src.app.services.slack_event_handler.resolve_user_id",
        new=AsyncMock(return_value=sample_user.id),
    ), patch(
        "src.app.services.slack_event_handler._load_slack_token",
        new=AsyncMock(return_value="xoxb-test"),
    ), patch(
        "src.app.services.slack_event_handler._post_to_channel",
        new=posted,
    ), patch(
        "src.app.services.slack_event_handler.get_ai_client",
        new=AsyncMock(return_value=fake_ai),
    ):
        bg = MagicMock()
        result = await handle(db_session, envelope, background_tasks=bg)
        assert result == {"ok": True}
        # Background task was scheduled
        bg.add_task.assert_called_once()

        # Simulate FastAPI invoking the background task using db_session directly
        await _dispatch_ask(
            db_session,
            "T_WS",
            "U_USER",
            "C_CHAN",
            "create a session about onboarding",
        )

    posted.assert_awaited_once()
    blocks = posted.await_args.kwargs.get("blocks")
    assert blocks, "expected Block Kit blocks on the session-created reply"
    action = next(b for b in blocks if b["type"] == "actions")
    assert "/projects/" in action["elements"][0]["url"]
    assert "/sessions/" in action["elements"][0]["url"]


@pytest.mark.asyncio
async def test_dm_triggers_tool_loop_and_posts_in_dm(
    db_session, sample_team, sample_user
):
    project = Project(
        org_id=sample_team.org_id,
        team_id=sample_team.id,
        owner_id=sample_user.id,
        name="DM Project",
    )
    db_session.add(project)
    await db_session.flush()
    sample_team.last_viewed_project_id = project.id
    await db_session.commit()

    envelope = {
        "type": "event_callback",
        "event_id": "Ev_DM_CREATE",
        "team_id": "T_WS",
        "event": {
            "type": "message",
            "channel_type": "im",
            "text": "create session",
            "user": "U_USER",
            "channel": "D_CHAN",
        },
    }

    fake_ai = _FakeAI(
        script=[
            {
                "role": "assistant",
                "content": [
                    {
                        "type": "tool_use",
                        "id": "tu_1",
                        "name": "create_session",
                        "input": {"title": "DM session"},
                    }
                ],
                "stop_reason": "tool_use",
            },
            {
                "role": "assistant",
                "content": [{"type": "text", "text": "Posted."}],
                "stop_reason": "end_turn",
            },
        ]
    )

    posted = AsyncMock(return_value=True)
    with patch(
        "src.app.services.slack_event_handler.resolve_team_from_channel",
        new=AsyncMock(return_value=sample_team.id),
    ), patch(
        "src.app.services.slack_event_handler.resolve_user_id",
        new=AsyncMock(return_value=sample_user.id),
    ), patch(
        "src.app.services.slack_event_handler._load_slack_token",
        new=AsyncMock(return_value="xoxb-test"),
    ), patch(
        "src.app.services.slack_event_handler._post_to_channel",
        new=posted,
    ), patch(
        "src.app.services.slack_event_handler.get_ai_client",
        new=AsyncMock(return_value=fake_ai),
    ):
        bg = MagicMock()
        result = await handle(db_session, envelope, background_tasks=bg)
        assert result == {"ok": True}
        bg.add_task.assert_called_once()

        # Simulate FastAPI invoking the background task using db_session directly
        await _dispatch_ask(db_session, "T_WS", "U_USER", "D_CHAN", "create session")

    posted.assert_awaited_once()
    channel_arg = posted.await_args.kwargs.get("channel_id") or posted.await_args.args[1]
    assert channel_arg == "D_CHAN"


@pytest.mark.asyncio
async def test_tool_loop_exception_is_swallowed_and_user_sees_apology(
    db_session, sample_team, sample_user
):
    """AI exceptions in run_tool_loop must be caught, an apology posted, and
    the handler must return cleanly so Slack doesn't retry."""
    envelope = {
        "type": "event_callback",
        "event_id": "Ev_EXPLODE",
        "team_id": "T_WS",
        "event": {
            "type": "app_mention",
            "text": "<@UBOT> hi",
            "user": "U_USER",
            "channel": "C_CHAN",
        },
    }

    class _ExplodingAI:
        async def chat_with_tools(self, **_):
            raise RuntimeError("anthropic 429")

    posted = AsyncMock(return_value=True)
    with (
        patch(
            "src.app.services.slack_event_handler.resolve_team_from_channel",
            new=AsyncMock(return_value=sample_team.id),
        ),
        patch(
            "src.app.services.slack_event_handler.resolve_user_id",
            new=AsyncMock(return_value=sample_user.id),
        ),
        patch(
            "src.app.services.slack_event_handler._load_slack_token",
            new=AsyncMock(return_value="xoxb-test"),
        ),
        patch(
            "src.app.services.slack_event_handler._post_to_channel",
            new=posted,
        ),
        patch(
            "src.app.services.slack_event_handler.get_ai_client",
            new=AsyncMock(return_value=_ExplodingAI()),
        ),
    ):
        bg = MagicMock()
        # handle() itself must not raise
        result = await handle(db_session, envelope, background_tasks=bg)
        assert result == {"ok": True}
        bg.add_task.assert_called_once()

        # Simulate FastAPI invoking the background task using db_session directly
        await _dispatch_ask(db_session, "T_WS", "U_USER", "C_CHAN", "hi")

    # Handler returned cleanly and apology was posted
    posted.assert_awaited_once()
    text = posted.await_args.kwargs.get("text") or ""
    assert "snag" in text.lower() or "try again" in text.lower()


@pytest.mark.asyncio
async def test_mention_without_create_intent_falls_through_to_text_reply(
    db_session, sample_team, sample_user
):
    """LLM returns plain text → posted as text, no Block Kit, no session created."""
    envelope = {
        "type": "event_callback",
        "event_id": "Ev_TEXT_ONLY",
        "team_id": "T_WS",
        "event": {
            "type": "app_mention",
            "text": "<@UBOT> hi",
            "user": "U_USER",
            "channel": "C_CHAN",
        },
    }

    fake_ai = _FakeAI(
        script=[
            {
                "role": "assistant",
                "content": [{"type": "text", "text": "Hello there."}],
                "stop_reason": "end_turn",
            }
        ]
    )
    posted = AsyncMock(return_value=True)
    with patch(
        "src.app.services.slack_event_handler.resolve_team_from_channel",
        new=AsyncMock(return_value=sample_team.id),
    ), patch(
        "src.app.services.slack_event_handler.resolve_user_id",
        new=AsyncMock(return_value=sample_user.id),
    ), patch(
        "src.app.services.slack_event_handler._load_slack_token",
        new=AsyncMock(return_value="xoxb-test"),
    ), patch(
        "src.app.services.slack_event_handler._post_to_channel",
        new=posted,
    ), patch(
        "src.app.services.slack_event_handler.get_ai_client",
        new=AsyncMock(return_value=fake_ai),
    ):
        bg = MagicMock()
        result = await handle(db_session, envelope, background_tasks=bg)
        assert result == {"ok": True}
        bg.add_task.assert_called_once()

        # Simulate FastAPI invoking the background task using db_session directly
        await _dispatch_ask(db_session, "T_WS", "U_USER", "C_CHAN", "hi")

    posted.assert_awaited_once()
    # Text-only reply — no blocks
    assert posted.await_args.kwargs.get("blocks") is None or posted.await_args.kwargs.get("blocks") is None
    text_arg = posted.await_args.kwargs.get("text")
    if text_arg is None and len(posted.await_args.args) > 2:
        text_arg = posted.await_args.args[2]
    assert text_arg == "Hello there."


@pytest.mark.asyncio
async def test_duplicate_event_id_is_silently_ignored(db_session, sample_team, sample_user):
    """Slack retries events whose handler took > 3s. Second arrival with same
    event_id must short-circuit without re-processing."""
    envelope = {
        "type": "event_callback",
        "event_id": "Ev_DUPE_TEST",
        "team_id": "T_WS",
        "event": {
            "type": "app_mention",
            "text": "<@UBOT> hi",
            "user": "U_USER",
            "channel": "C_CHAN",
        },
    }

    # First call: records the event_id. Patch resolvers so nothing heavy runs.
    with patch(
        "src.app.services.slack_event_handler.resolve_team_from_channel",
        new=AsyncMock(return_value=sample_team.id),
    ), patch(
        "src.app.services.slack_event_handler.resolve_user_id",
        new=AsyncMock(return_value=sample_user.id),
    ), patch(
        "src.app.services.slack_event_handler._load_slack_token",
        new=AsyncMock(return_value="xoxb"),
    ), patch(
        "src.app.services.slack_event_handler._post_to_channel",
        new=AsyncMock(return_value=True),
    ), patch(
        "src.app.services.slack_event_handler.get_ai_client",
        new=AsyncMock(
            return_value=_FakeAI(
                script=[
                    {
                        "role": "assistant",
                        "content": [{"type": "text", "text": "ok"}],
                        "stop_reason": "end_turn",
                    }
                ]
            )
        ),
    ):
        bg1 = MagicMock()
        result1 = await handle(db_session, envelope, background_tasks=bg1)
        assert result1 == {"ok": True}
        # First call must have dispatched a background task
        bg1.add_task.assert_called()

        bg2 = MagicMock()
        result2 = await handle(db_session, envelope, background_tasks=bg2)
        assert result2 == {"ok": True}
        # Second call (same event_id) must NOT dispatch again
        bg2.add_task.assert_not_called()
