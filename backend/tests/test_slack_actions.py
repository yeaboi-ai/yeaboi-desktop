"""Tests for slack_actions.handle — specifically the session_create_pick_project action."""

import json
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select

from src.app.models.project import Project
from src.app.models.session import Session
from src.app.services.slack_actions import handle


@pytest.mark.asyncio
async def test_picker_click_creates_session_and_posts_public_message(
    db_session, sample_team, sample_user
):
    project = Project(
        org_id=sample_team.org_id,
        team_id=sample_team.id,
        owner_id=sample_user.id,
        name="Picked",
    )
    db_session.add(project)
    await db_session.commit()

    payload = {
        "type": "block_actions",
        "user": {"id": "U_SLACK"},
        "channel": {"id": "C_CHAN"},
        "team": {"id": "T_WS"},
        "response_url": "https://hooks.slack.example/abc",
        "actions": [
            {
                "action_id": "session_create_pick_project",
                "value": json.dumps({"project_id": project.id, "title": "Chosen"}),
            }
        ],
    }

    post_to_channel = AsyncMock(return_value=True)
    with patch(
        "src.app.services.slack_actions.resolve_team_from_channel",
        new=AsyncMock(return_value=sample_team.id),
    ), patch(
        "src.app.services.slack_actions.resolve_user_id",
        new=AsyncMock(return_value=sample_user.id),
    ), patch(
        "src.app.services.slack_actions._load_slack_token",
        new=AsyncMock(return_value="xoxb-test"),
    ), patch(
        "src.app.services.slack_actions._post_to_channel",
        new=post_to_channel,
    ):
        result = await handle(db_session, payload, background_tasks=AsyncMock())

    assert result is None  # handle returns None; posts via side effect
    post_to_channel.assert_awaited_once()
    call = post_to_channel.await_args
    # Signature: _post_to_channel(token, channel_id, text, blocks) — positional or kw
    channel_id_arg = call.kwargs.get("channel_id") or (call.args[1] if len(call.args) > 1 else None)
    blocks_arg = call.kwargs.get("blocks") or (call.args[3] if len(call.args) > 3 else None)
    assert channel_id_arg == "C_CHAN"
    assert blocks_arg, "expected Block Kit blocks to be posted"

    # Verify a session was actually created with the right project
    result_db = await db_session.execute(select(Session).where(Session.project_id == project.id))
    session = result_db.scalar_one()
    assert session.title == "Chosen"


@pytest.mark.asyncio
async def test_picker_click_rejects_stale_project(
    db_session, sample_team, sample_user
):
    payload = {
        "type": "block_actions",
        "user": {"id": "U"},
        "channel": {"id": "C"},
        "team": {"id": "T"},
        "response_url": "https://hooks.slack.example/r",
        "actions": [
            {
                "action_id": "session_create_pick_project",
                "value": json.dumps({"project_id": "00000000-0000-0000-0000-000000000000", "title": "X"}),
            }
        ],
    }

    post_to_channel = AsyncMock()
    post_error = AsyncMock()
    with patch(
        "src.app.services.slack_actions.resolve_team_from_channel",
        new=AsyncMock(return_value=sample_team.id),
    ), patch(
        "src.app.services.slack_actions.resolve_user_id",
        new=AsyncMock(return_value=sample_user.id),
    ), patch(
        "src.app.services.slack_actions._load_slack_token",
        new=AsyncMock(return_value="xoxb-test"),
    ), patch(
        "src.app.services.slack_actions._post_to_channel",
        new=post_to_channel,
    ), patch(
        "src.app.services.slack_actions._post_error",
        new=post_error,
    ):
        await handle(db_session, payload, background_tasks=AsyncMock())

    # No public channel post
    post_to_channel.assert_not_awaited()
    # Did report the error via response_url
    post_error.assert_awaited()


@pytest.mark.asyncio
async def test_picker_click_rejects_cross_org_project(
    db_session, sample_team, sample_user
):
    from src.app.models.organization import Organization

    other_org = Organization(name="Other", slug="other-picker")
    db_session.add(other_org)
    await db_session.flush()
    foreign = Project(
        org_id=other_org.id,
        team_id=sample_team.id,
        owner_id=sample_user.id,
        name="Foreign",
    )
    db_session.add(foreign)
    await db_session.commit()

    payload = {
        "type": "block_actions",
        "user": {"id": "U"},
        "channel": {"id": "C"},
        "team": {"id": "T"},
        "response_url": "https://hooks.slack.example/r",
        "actions": [
            {
                "action_id": "session_create_pick_project",
                "value": json.dumps({"project_id": foreign.id, "title": "Y"}),
            }
        ],
    }

    post_to_channel = AsyncMock()
    post_error = AsyncMock()
    with patch(
        "src.app.services.slack_actions.resolve_team_from_channel",
        new=AsyncMock(return_value=sample_team.id),
    ), patch(
        "src.app.services.slack_actions.resolve_user_id",
        new=AsyncMock(return_value=sample_user.id),
    ), patch(
        "src.app.services.slack_actions._load_slack_token",
        new=AsyncMock(return_value="xoxb-test"),
    ), patch(
        "src.app.services.slack_actions._post_to_channel",
        new=post_to_channel,
    ), patch(
        "src.app.services.slack_actions._post_error",
        new=post_error,
    ):
        await handle(db_session, payload, background_tasks=AsyncMock())

    post_to_channel.assert_not_awaited()
    post_error.assert_awaited()


@pytest.mark.asyncio
async def test_picker_click_invalid_value_errors_gracefully(db_session, sample_team, sample_user):
    payload = {
        "type": "block_actions",
        "user": {"id": "U"},
        "channel": {"id": "C"},
        "team": {"id": "T"},
        "response_url": "https://hooks.slack.example/r",
        "actions": [{"action_id": "session_create_pick_project", "value": "not-json"}],
    }

    post_error = AsyncMock()
    with patch(
        "src.app.services.slack_actions.resolve_team_from_channel",
        new=AsyncMock(return_value=sample_team.id),
    ), patch(
        "src.app.services.slack_actions.resolve_user_id",
        new=AsyncMock(return_value=sample_user.id),
    ), patch(
        "src.app.services.slack_actions._load_slack_token",
        new=AsyncMock(return_value="xoxb-test"),
    ), patch(
        "src.app.services.slack_actions._post_error",
        new=post_error,
    ):
        await handle(db_session, payload, background_tasks=AsyncMock())

    post_error.assert_awaited()


@pytest.mark.asyncio
async def test_picker_click_falls_back_to_ephemeral_when_channel_post_fails(
    db_session, sample_team, sample_user
):
    project = Project(
        org_id=sample_team.org_id,
        team_id=sample_team.id,
        owner_id=sample_user.id,
        name="Fallback",
    )
    db_session.add(project)
    await db_session.commit()

    payload = {
        "type": "block_actions",
        "user": {"id": "U_SLACK"},
        "channel": {"id": "C_CHAN"},
        "team": {"id": "T_WS"},
        "response_url": "https://hooks.slack.example/abc",
        "actions": [
            {
                "action_id": "session_create_pick_project",
                "value": json.dumps({"project_id": project.id, "title": "Fallback"}),
            }
        ],
    }

    post_to_channel = AsyncMock(return_value=False)  # simulate Slack post failure
    post_error = AsyncMock()

    with patch(
        "src.app.services.slack_actions.resolve_team_from_channel",
        new=AsyncMock(return_value=sample_team.id),
    ), patch(
        "src.app.services.slack_actions.resolve_user_id",
        new=AsyncMock(return_value=sample_user.id),
    ), patch(
        "src.app.services.slack_actions._load_slack_token",
        new=AsyncMock(return_value="xoxb-test"),
    ), patch(
        "src.app.services.slack_actions._post_to_channel",
        new=post_to_channel,
    ), patch(
        "src.app.services.slack_actions._post_error",
        new=post_error,
    ):
        await handle(db_session, payload, background_tasks=AsyncMock())

    # Both were called: channel post attempted, error fallback fired
    post_to_channel.assert_awaited_once()
    post_error.assert_awaited()
    # The fallback message must include the session URL so the user can still reach it
    if post_error.await_args.args:
        fallback_text = post_error.await_args.args[1]
    else:
        fallback_text = post_error.await_args.kwargs.get("text", "")
    assert "/projects/" in fallback_text
    assert "/sessions/" in fallback_text
