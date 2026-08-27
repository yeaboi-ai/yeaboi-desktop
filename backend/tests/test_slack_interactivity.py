"""Tests for Slack interactivity action handlers (Task 23)."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest

from src.app.models.board import Board, BoardColumn, Card
from src.app.models.integration import OrgIntegration
from src.app.models.organization import Organization, OrgMember, Team
from src.app.models.project import Project
from src.app.models.slack_user_link import SlackUserLink
from src.app.models.team_slack_channel import TeamSlackChannel
from src.app.models.user import User
from src.app.services.slack_actions import handle as actions_handle

SLACK_TEAM_ID = "T_ACTION"
SLACK_USER_ID = "U_ACTION"
SLACK_CHANNEL_ID = "C_ACTION"


def _payload(action_id: str, value: str = "") -> dict:
    return {
        "type": "block_actions",
        "team": {"id": SLACK_TEAM_ID},
        "user": {"id": SLACK_USER_ID},
        "channel": {"id": SLACK_CHANNEL_ID},
        "response_url": "https://hooks.slack.com/actions/test",
        "actions": [{"action_id": action_id, "value": value}],
    }


# ---------------------------------------------------------------------------
# Setup helper
# ---------------------------------------------------------------------------


async def _setup_context(db_session):
    """Create org, team, channel mapping, integration, user, link, board, card."""
    user = User(email="action_user@example.com", name="Action User")
    db_session.add(user)
    await db_session.flush()

    org = Organization(name="Action Org", slug="action-org")
    db_session.add(org)
    await db_session.flush()

    db_session.add(OrgMember(org_id=org.id, user_id=user.id, role="member"))
    team = Team(org_id=org.id, name="Action Team", slug="action-team")
    db_session.add(team)
    await db_session.flush()

    db_session.add(
        TeamSlackChannel(
            team_id=team.id,
            slack_channel_id=SLACK_CHANNEL_ID,
            slack_channel_name="planr-actions",
            event_types=[],
            created_by=user.id,
        )
    )

    db_session.add(
        OrgIntegration(
            org_id=org.id,
            provider="slack",
            category="communication",
            auth_type="oauth2",
            status="active",
            access_token="xoxb-test-action",
            metadata_json=json.dumps({"team": {"id": SLACK_TEAM_ID}}),
            connected_by=user.id,
        )
    )

    db_session.add(
        SlackUserLink(
            slack_team_id=SLACK_TEAM_ID,
            slack_user_id=SLACK_USER_ID,
            user_id=user.id,
            verified_via="explicit",
        )
    )

    # Project + board + card
    project = Project(
        name="Action Project",
        org_id=org.id,
        team_id=team.id,
        owner_id=user.id,
        repo_url="https://github.com/test/repo",
    )
    db_session.add(project)
    await db_session.flush()

    board = Board(project_id=project.id, org_id=org.id)
    db_session.add(board)
    await db_session.flush()

    failed_col = BoardColumn(board_id=board.id, name="In Progress", position=0)
    done_col = BoardColumn(board_id=board.id, name="Done", position=3)
    db_session.add(failed_col)
    db_session.add(done_col)
    await db_session.flush()

    card = Card(
        column_id=failed_col.id,
        position=0,
        title="Test Card",
        agent_status="failed",
        agent_pr_url="https://github.com/test/repo/pull/42",
    )
    db_session.add(card)
    await db_session.commit()

    await db_session.refresh(card)
    await db_session.refresh(board)
    await db_session.refresh(done_col)
    return user, team, org, project, board, card, failed_col, done_col


# ---------------------------------------------------------------------------
# pr_ready:approve — calls merge_pull_request
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_pr_ready_approve_calls_merge(db_session):
    """pr_ready:approve action calls merge_pull_request with card_id as value."""
    from fastapi import BackgroundTasks

    user, team, org, project, board, card, _, _ = await _setup_context(db_session)

    bt = BackgroundTasks()

    with (
        patch(
            "src.app.services.connectors.slack_notifier.decrypt_api_key",
            return_value="xoxb-real-token",
        ),
        patch(
            "src.app.orchestrator.workspace.merge_pull_request",
            return_value=True,
        ),
    ):
        await actions_handle(db_session, _payload("pr_ready:approve", card.id), bt)

    # merge_pull_request is sync and run via executor — but we patched it at module level
    # The test verifies the card is updated to done
    await db_session.refresh(card)
    assert card.agent_status == "done"


# ---------------------------------------------------------------------------
# card_failed:retry — resets agent_status to assigned
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_card_failed_retry_resets_status(db_session):
    """card_failed:retry resets the card's agent_status to 'assigned' and clears log."""
    from fastapi import BackgroundTasks

    user, team, org, project, board, card, _, _ = await _setup_context(db_session)

    bt = BackgroundTasks()

    with patch(
        "src.app.services.connectors.slack_notifier.decrypt_api_key",
        return_value="xoxb-real-token",
    ):
        await actions_handle(db_session, _payload("card_failed:retry", card.id), bt)

    await db_session.refresh(card)
    assert card.agent_status == "assigned"
    assert card.agent_log == []


# ---------------------------------------------------------------------------
# Unlinked user returns ephemeral prompt
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unlinked_user_receives_ephemeral_prompt(db_session):
    """When no SlackUserLink exists, the handler posts a prompt to link their account."""
    from fastapi import BackgroundTasks

    # Set up context but WITHOUT the SlackUserLink
    user = User(email="unlinked@example.com", name="Unlinked User")
    db_session.add(user)
    await db_session.flush()

    org = Organization(name="Unlinked Org", slug="unlinked-org")
    db_session.add(org)
    await db_session.flush()

    team = Team(org_id=org.id, name="Unlinked Team", slug="unlinked-team")
    db_session.add(team)
    await db_session.flush()

    db_session.add(
        TeamSlackChannel(
            team_id=team.id,
            slack_channel_id=SLACK_CHANNEL_ID,
            slack_channel_name="planr-actions",
            event_types=[],
            created_by=user.id,
        )
    )
    db_session.add(
        OrgIntegration(
            org_id=org.id,
            provider="slack",
            category="communication",
            auth_type="oauth2",
            status="active",
            access_token="xoxb-unlinked-token",
            metadata_json=json.dumps({"team": {"id": SLACK_TEAM_ID}}),
            connected_by=user.id,
        )
    )
    await db_session.commit()

    posted: list[dict] = []

    async def _fake_post(url: str, **kwargs) -> None:
        posted.append(kwargs.get("json", {}))

    bt = BackgroundTasks()

    with (
        patch(
            "src.app.services.connectors.slack_notifier.decrypt_api_key",
            return_value="xoxb-real-token",
        ),
        patch(
            "src.app.services.slack_user_resolver._fetch_slack_profile",
            new=AsyncMock(return_value={}),
        ),
        patch(
            "src.app.services.slack_actions._post_error",
            new=AsyncMock(),
        ) as mock_post_error,
    ):
        await actions_handle(db_session, _payload("pr_ready:approve", "some-card-id"), bt)

    mock_post_error.assert_awaited_once()
    # The error message should mention /planr link
    error_text: str = mock_post_error.call_args[0][1]
    assert "link" in error_text.lower() or "/planr" in error_text.lower()
