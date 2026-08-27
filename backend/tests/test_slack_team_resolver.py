"""Tests for the channel → team resolver service."""

from __future__ import annotations

import pytest

from src.app.models.organization import Team
from src.app.models.team_slack_channel import TeamSlackChannel
from src.app.services.slack_team_resolver import resolve_team_from_channel

CHANNEL_ID = "C0TEST001"


# ---------------------------------------------------------------------------
# test_returns_team_for_mapped_channel
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_returns_team_for_mapped_channel(db_session, sample_team, sample_user):
    """When a TeamSlackChannel row exists, return its team_id."""
    db_session.add(
        TeamSlackChannel(
            team_id=sample_team.id,
            slack_channel_id=CHANNEL_ID,
            event_types=[],
            created_by=sample_user.id,
        )
    )
    await db_session.commit()

    result = await resolve_team_from_channel(db_session, CHANNEL_ID)
    assert result == sample_team.id


# ---------------------------------------------------------------------------
# test_returns_none_for_unmapped_channel
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_returns_none_for_unmapped_channel(db_session):
    """When no TeamSlackChannel row exists for the channel, return None."""
    result = await resolve_team_from_channel(db_session, "C_DOES_NOT_EXIST")
    assert result is None


# ---------------------------------------------------------------------------
# test_returns_one_when_channel_on_multiple_teams
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_returns_one_when_channel_on_multiple_teams(db_session, sample_org, sample_user):
    """When a channel is mapped to multiple teams, exactly one team_id is returned (lowest id wins)."""
    # Create two extra teams in the same org
    team_a = Team(org_id=sample_org.id, name="Team A", slug="team-a")
    team_b = Team(org_id=sample_org.id, name="Team B", slug="team-b")
    db_session.add(team_a)
    db_session.add(team_b)
    await db_session.flush()

    # Both teams map to the same channel
    row_a = TeamSlackChannel(
        team_id=team_a.id,
        slack_channel_id=CHANNEL_ID,
        event_types=[],
        created_by=sample_user.id,
    )
    row_b = TeamSlackChannel(
        team_id=team_b.id,
        slack_channel_id=CHANNEL_ID,
        event_types=[],
        created_by=sample_user.id,
    )
    db_session.add(row_a)
    db_session.add(row_b)
    await db_session.commit()

    # Determine which row has the lower id — that team should win
    expected_team_id = team_a.id if row_a.id < row_b.id else team_b.id

    result = await resolve_team_from_channel(db_session, CHANNEL_ID)
    # Must return exactly one result and it must be the lowest-id row's team
    assert result in (team_a.id, team_b.id)
    assert result == expected_team_id
