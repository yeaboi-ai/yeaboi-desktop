from unittest.mock import AsyncMock, patch

import pytest

from src.app.models.integration import OrgIntegration
from src.app.models.team_slack_channel import TeamSlackChannel
from src.app.services.crypto import encrypt_api_key
from src.app.services.slack_dispatcher import dispatch_event


@pytest.fixture
async def slack_integration(db_session, sample_org, sample_user):
    i = OrgIntegration(
        org_id=sample_org.id,
        provider="slack",
        category="communication",
        auth_type="oauth",
        status="active",
        access_token=encrypt_api_key("xoxb-test-token"),
        scopes="[]",
        connected_by=sample_user.id,
    )
    db_session.add(i)
    await db_session.commit()
    return i


@pytest.mark.asyncio
async def test_dispatch_event_noop_when_team_missing(db_session):
    with patch("src.app.services.slack_dispatcher._post_to_channel", new=AsyncMock()) as post:
        await dispatch_event(db_session, "card_failed", "nonexistent-team", {"card_title": "x"})
    post.assert_not_awaited()


@pytest.mark.asyncio
async def test_dispatch_event_noop_when_no_integration(db_session, sample_team):
    with patch("src.app.services.slack_dispatcher._post_to_channel", new=AsyncMock()) as post:
        await dispatch_event(db_session, "card_failed", sample_team.id, {"card_title": "x"})
    post.assert_not_awaited()


@pytest.mark.asyncio
async def test_dispatch_event_noop_when_no_subscriptions(db_session, slack_integration, sample_team):
    with patch("src.app.services.slack_dispatcher._post_to_channel", new=AsyncMock()) as post:
        await dispatch_event(db_session, "card_failed", sample_team.id, {"card_title": "x"})
    post.assert_not_awaited()


@pytest.mark.asyncio
async def test_dispatch_event_posts_to_subscribed_channels(
    db_session, slack_integration, sample_team, sample_user
):
    db_session.add(TeamSlackChannel(
        team_id=sample_team.id, slack_channel_id="C1",
        event_types=["card_failed"], created_by=sample_user.id,
    ))
    db_session.add(TeamSlackChannel(
        team_id=sample_team.id, slack_channel_id="C2",
        event_types=["pr_ready"], created_by=sample_user.id,
    ))
    await db_session.commit()

    with patch("src.app.services.slack_dispatcher._post_to_channel", new=AsyncMock(return_value=True)) as post:
        await dispatch_event(db_session, "card_failed", sample_team.id, {"card_title": "x"})

    assert post.await_count == 1
    args = post.await_args_list[0].args
    # (token, channel_id, text, blocks)
    assert args[1] == "C1"


@pytest.mark.asyncio
async def test_dispatch_event_isolates_channel_failures(
    db_session, slack_integration, sample_team, sample_user
):
    db_session.add(TeamSlackChannel(
        team_id=sample_team.id, slack_channel_id="C1",
        event_types=["card_failed"], created_by=sample_user.id,
    ))
    db_session.add(TeamSlackChannel(
        team_id=sample_team.id, slack_channel_id="C2",
        event_types=["card_failed"], created_by=sample_user.id,
    ))
    await db_session.commit()

    async def fake_post(token, channel_id, text, blocks):
        if channel_id == "C1":
            raise RuntimeError("boom")
        return True

    with patch("src.app.services.slack_dispatcher._post_to_channel", side_effect=fake_post) as post:
        # Must NOT raise
        await dispatch_event(db_session, "card_failed", sample_team.id, {"card_title": "x"})
    assert post.await_count == 2
