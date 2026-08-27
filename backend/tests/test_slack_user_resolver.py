"""Tests for the Slack user resolver service."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from src.app.models.slack_user_link import SlackUserLink
from src.app.models.user import User
from src.app.services.slack_user_resolver import link_user, resolve_user_id

SLACK_TEAM_ID = "T01234567"
SLACK_USER_ID = "U0ABCDEF"
BOT_TOKEN = "xoxb-test"


@pytest.fixture
async def platform_user(db_session):
    user = User(email="alice@example.com", name="Alice")
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


# ---------------------------------------------------------------------------
# test_existing_link_returns_user
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_existing_link_returns_user(db_session, platform_user):
    """When a SlackUserLink already exists, return its user_id without calling Slack."""
    link = SlackUserLink(
        slack_team_id=SLACK_TEAM_ID,
        slack_user_id=SLACK_USER_ID,
        user_id=platform_user.id,
        verified_via="admin",
    )
    db_session.add(link)
    await db_session.commit()

    with patch(
        "src.app.services.slack_user_resolver._fetch_slack_profile",
        new=AsyncMock(),
    ) as mock_fetch:
        result = await resolve_user_id(db_session, SLACK_TEAM_ID, SLACK_USER_ID, BOT_TOKEN)

    assert result == platform_user.id
    mock_fetch.assert_not_awaited()


# ---------------------------------------------------------------------------
# test_auto_match_creates_link
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_auto_match_creates_link(db_session, sample_org, platform_user):
    """A verified Slack email that matches a platform user creates a link and returns the user_id."""
    from src.app.models.organization import OrgMember

    db_session.add(OrgMember(org_id=sample_org.id, user_id=platform_user.id, role="member"))
    await db_session.commit()

    fake_profile = {"email": "alice@example.com", "email_verified": True}

    with (
        patch(
            "src.app.services.slack_user_resolver._fetch_slack_profile",
            new=AsyncMock(return_value=fake_profile),
        ),
        patch(
            "src.app.services.slack_user_resolver._resolve_org_from_slack_team",
            new=AsyncMock(return_value=sample_org.id),
        ),
    ):
        result = await resolve_user_id(db_session, SLACK_TEAM_ID, SLACK_USER_ID, BOT_TOKEN)

    assert result == platform_user.id

    # Link persisted in DB
    from sqlalchemy import select

    rows = (
        (
            await db_session.execute(
                select(SlackUserLink).where(
                    SlackUserLink.slack_team_id == SLACK_TEAM_ID,
                    SlackUserLink.slack_user_id == SLACK_USER_ID,
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) == 1
    assert rows[0].verified_via == "email_match"


# ---------------------------------------------------------------------------
# test_unverified_email_does_not_match
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unverified_email_does_not_match(db_session):
    """When the Slack profile has email_verified=False, resolution returns None."""
    fake_profile = {"email": "bob@example.com", "email_verified": False}

    with patch(
        "src.app.services.slack_user_resolver._fetch_slack_profile",
        new=AsyncMock(return_value=fake_profile),
    ):
        result = await resolve_user_id(db_session, SLACK_TEAM_ID, SLACK_USER_ID, BOT_TOKEN)

    assert result is None


# ---------------------------------------------------------------------------
# test_explicit_link
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_explicit_link(db_session, platform_user):
    """link_user persists a SlackUserLink with the given via value and returns it."""
    link = await link_user(db_session, SLACK_TEAM_ID, SLACK_USER_ID, platform_user, via="admin")

    assert link.slack_team_id == SLACK_TEAM_ID
    assert link.slack_user_id == SLACK_USER_ID
    assert link.user_id == platform_user.id
    assert link.verified_via == "admin"
    assert link.id is not None
