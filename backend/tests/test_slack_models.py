import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from src.app.models.slack_user_link import SlackUserLink
from src.app.models.team_slack_channel import TeamSlackChannel


@pytest.mark.asyncio
async def test_team_slack_channel_persists(db_session, sample_team, sample_user):
    row = TeamSlackChannel(
        team_id=sample_team.id,
        slack_channel_id="C12345",
        slack_channel_name="#backend-builds",
        event_types=["card_failed", "pr_ready"],
        created_by=sample_user.id,
    )
    db_session.add(row)
    await db_session.commit()

    found = (await db_session.execute(select(TeamSlackChannel))).scalar_one()
    assert found.event_types == ["card_failed", "pr_ready"]
    assert found.slack_channel_name == "#backend-builds"


@pytest.mark.asyncio
async def test_team_slack_channel_unique_per_team_channel(db_session, sample_team, sample_user):
    db_session.add(TeamSlackChannel(
        team_id=sample_team.id, slack_channel_id="C1", event_types=[], created_by=sample_user.id,
    ))
    await db_session.commit()
    db_session.add(TeamSlackChannel(
        team_id=sample_team.id, slack_channel_id="C1", event_types=[], created_by=sample_user.id,
    ))
    with pytest.raises(IntegrityError):
        await db_session.commit()


@pytest.mark.asyncio
async def test_slack_user_link_unique_per_workspace_user(db_session, sample_user):
    db_session.add(SlackUserLink(
        slack_team_id="T1", slack_user_id="U1", user_id=sample_user.id, verified_via="email_match",
    ))
    await db_session.commit()
    db_session.add(SlackUserLink(
        slack_team_id="T1", slack_user_id="U1", user_id=sample_user.id, verified_via="explicit",
    ))
    with pytest.raises(IntegrityError):
        await db_session.commit()
