"""Tests for /planr slash command router, help, link, ask, summarise, and session sub-commands."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from src.app.models.slack_user_link import SlackUserLink
from src.app.models.user import User
from src.app.services.slack_command_handler import handle as command_handle

SLACK_TEAM_ID = "T99TEST"
SLACK_USER_ID = "U99TEST"
SLACK_CHANNEL_ID = "C99TEST"


def _fields(**kwargs) -> dict:
    defaults = {
        "command": "/planr",
        "text": "",
        "team_id": SLACK_TEAM_ID,
        "user_id": SLACK_USER_ID,
        "channel_id": SLACK_CHANNEL_ID,
        "response_url": "https://hooks.slack.com/commands/test",
    }
    defaults.update(kwargs)
    return defaults


# ---------------------------------------------------------------------------
# Task 20 — help
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_help_subcommand(db_session):
    """`/planr help` returns text containing 'planr' or 'commands'."""
    from fastapi import BackgroundTasks

    bt = BackgroundTasks()
    resp = await command_handle(db_session, _fields(text="help"), bt)
    text = resp.get("text", "")
    assert "/planr" in text.lower() or "commands" in text.lower()


@pytest.mark.asyncio
async def test_empty_text_returns_help(db_session):
    """Empty text returns help (same as `help` subcommand)."""
    from fastapi import BackgroundTasks

    bt = BackgroundTasks()
    resp = await command_handle(db_session, _fields(text=""), bt)
    text = resp.get("text", "")
    assert "/planr" in text.lower() or "commands" in text.lower()


@pytest.mark.asyncio
async def test_unknown_subcommand_falls_through_to_help(db_session):
    """An unrecognised subcommand falls through to the help message."""
    from fastapi import BackgroundTasks

    bt = BackgroundTasks()
    resp = await command_handle(db_session, _fields(text="foobar"), bt)
    text = resp.get("text", "")
    assert "/planr" in text.lower() or "commands" in text.lower()


# ---------------------------------------------------------------------------
# Task 20 — link
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_link_without_email_prompts(db_session):
    """`/planr link` without email returns a prompt asking for the email."""
    from fastapi import BackgroundTasks

    bt = BackgroundTasks()
    resp = await command_handle(db_session, _fields(text="link"), bt)
    text = resp.get("text", "")
    assert "email" in text.lower() or "link" in text.lower()


@pytest.mark.asyncio
async def test_link_unknown_email_returns_error(db_session):
    """`/planr link unknown@example.com` returns error when user doesn't exist."""
    from fastapi import BackgroundTasks

    bt = BackgroundTasks()
    resp = await command_handle(db_session, _fields(text="link unknown@example.com"), bt)
    text = resp.get("text", "")
    assert "no yeaboi user" in text.lower() or "not found" in text.lower() or "unknown@example.com" in text.lower()


@pytest.mark.asyncio
async def test_link_known_email_creates_link(db_session):
    """`/planr link user@example.com` creates a SlackUserLink and confirms."""
    from fastapi import BackgroundTasks
    from sqlalchemy import select

    user = User(email="link_test@example.com", name="Link Test")
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    bt = BackgroundTasks()

    with patch("src.app.services.email_service.send_invite_email", new=AsyncMock(return_value=True)):
        resp = await command_handle(db_session, _fields(text="link link_test@example.com"), bt)

    text = resp.get("text", "")
    assert "linked" in text.lower() or "link_test@example.com" in text.lower()

    # Verify link was persisted
    rows = (
        await db_session.execute(
            select(SlackUserLink).where(
                SlackUserLink.slack_team_id == SLACK_TEAM_ID,
                SlackUserLink.slack_user_id == SLACK_USER_ID,
            )
        )
    ).scalars().all()
    assert len(rows) == 1
    assert rows[0].user_id == user.id


# ---------------------------------------------------------------------------
# Helpers for Task 21 — set up linked user + mapped channel
# ---------------------------------------------------------------------------


async def _setup_linked_context(db_session, *, slack_team_id=SLACK_TEAM_ID, slack_user_id=SLACK_USER_ID):
    """Create org, team, channel mapping, user, and link. Returns (user, team, org)."""
    import json

    from src.app.models.integration import OrgIntegration
    from src.app.models.organization import Organization, OrgMember, Team
    from src.app.models.slack_user_link import SlackUserLink
    from src.app.models.team_slack_channel import TeamSlackChannel

    user = User(email="ask_user@example.com", name="Ask User")
    db_session.add(user)
    await db_session.flush()

    org = Organization(name="Ask Org", slug="ask-org")
    db_session.add(org)
    await db_session.flush()

    db_session.add(OrgMember(org_id=org.id, user_id=user.id, role="member"))
    team = Team(org_id=org.id, name="Ask Team", slug="ask-team")
    db_session.add(team)
    await db_session.flush()

    # Map the channel to the team
    db_session.add(
        TeamSlackChannel(
            team_id=team.id,
            slack_channel_id=SLACK_CHANNEL_ID,
            slack_channel_name="planr-test",
            event_types=[],
            created_by=user.id,
        )
    )

    # Create active Slack integration with token
    integration = OrgIntegration(
        org_id=org.id,
        provider="slack",
        category="communication",
        auth_type="oauth2",
        status="active",
        access_token="xoxb-enc-token",
        metadata_json=json.dumps({"team": {"id": slack_team_id}}),
        connected_by=user.id,
    )
    db_session.add(integration)

    # Link Slack user to platform user
    db_session.add(
        SlackUserLink(
            slack_team_id=slack_team_id,
            slack_user_id=slack_user_id,
            user_id=user.id,
            verified_via="explicit",
        )
    )

    await db_session.commit()
    await db_session.refresh(user)
    await db_session.refresh(team)
    await db_session.refresh(org)
    return user, team, org


# ---------------------------------------------------------------------------
# Task 21 — ask
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ask_returns_ephemeral_ack_and_adds_background_task(db_session):
    """`/planr ask <question>` returns ephemeral ack and adds 1 background task."""
    from unittest.mock import patch

    from fastapi import BackgroundTasks


    await _setup_linked_context(db_session)

    bt = BackgroundTasks()

    with (
        patch(
            "src.app.services.connectors.slack_notifier.decrypt_api_key",
            return_value="xoxb-real-token",
        ),
    ):
        resp = await command_handle(db_session, _fields(text="ask what are my projects?"), bt)

    assert ":thinking_face:" in resp.get("text", "") or "working" in resp.get("text", "").lower()
    assert resp.get("response_type") == "ephemeral"
    # Background task was added
    assert len(bt.tasks) == 1


@pytest.mark.asyncio
async def test_ask_without_linked_user_returns_error(db_session):
    """`/planr ask` without a linked user returns an error message."""
    from fastapi import BackgroundTasks

    bt = BackgroundTasks()
    # No setup → channel not mapped, no user link
    resp = await command_handle(db_session, _fields(text="ask what is my project?"), bt)
    text = resp.get("text", "")
    # Should be some kind of error, not the ack
    assert ":thinking_face:" not in text
    assert len(bt.tasks) == 0


# ---------------------------------------------------------------------------
# Task 21 — session create
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_session_create_returns_in_channel_response(db_session):
    """`/planr session <title>` returns an in-channel response with a clickable URL."""
    from fastapi import BackgroundTasks
    from sqlalchemy import select

    from src.app.models.session import Session

    user, team, org = await _setup_linked_context(db_session)

    # Create a project so resolve_project returns it (single active project = unambiguous)
    project = Session(
        org_id=org.id,
        team_id=team.id,
        owner_id=user.id,
        name="Slack Test Session",
    )
    db_session.add(project)
    await db_session.commit()

    with (
        patch(
            "src.app.services.connectors.slack_notifier.decrypt_api_key",
            return_value="xoxb-real-token",
        ),
    ):
        bt = BackgroundTasks()
        resp = await command_handle(db_session, _fields(text="session My Slack Session"), bt)

    assert resp["response_type"] == "in_channel"
    action = next(b for b in resp["blocks"] if b["type"] == "actions")
    button_url = action["elements"][0]["url"]
    assert "/sessions/" in button_url

    # Verify session was created in DB
    sessions = (
        await db_session.execute(select(Session).where(Session.org_id == org.id))
    ).scalars().all()
    assert any("Slack Session" in (s.title or "") for s in sessions)


@pytest.mark.asyncio
async def test_session_create_without_title_returns_usage(db_session):
    """`/planr session` without a title returns a usage message."""
    from fastapi import BackgroundTasks

    await _setup_linked_context(db_session)

    with patch(
        "src.app.services.connectors.slack_notifier.decrypt_api_key",
        return_value="xoxb-real-token",
    ):
        bt = BackgroundTasks()
        resp = await command_handle(db_session, _fields(text="session"), bt)

    text = resp.get("text", "")
    assert "usage" in text.lower() or "title" in text.lower() or "/planr session" in text.lower()
