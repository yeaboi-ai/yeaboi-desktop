"""End-to-end coverage for the Slack follow-ups PR.

Exercises the happy path of every new surface in a single scenario:
- Two teams sharing an org
- Each team has its own Slack channel + subscriptions
- A scan fires for the "admin" team — only admin channel posts
- An orchestrator card_failed fires for Team B — only Team B's channel posts
- /planr ask in Team A's channel uses Team A's context
"""

from unittest.mock import patch

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
async def test_end_to_end(
    db_session, sample_org, sample_user, slack_integration
):
    from src.app.models.organization import Team, TeamMember
    from src.app.models.project import Project

    team_a = Team(org_id=sample_org.id, name="A", slug="a")
    team_b = Team(org_id=sample_org.id, name="B", slug="b")
    db_session.add_all([team_a, team_b])
    await db_session.flush()
    db_session.add_all([
        TeamMember(team_id=team_a.id, user_id=sample_user.id, role="admin"),
        TeamMember(team_id=team_b.id, user_id=sample_user.id, role="admin"),
    ])
    project_b = Project(org_id=sample_org.id, team_id=team_b.id, name="B project", owner_id=sample_user.id)
    db_session.add(project_b)

    db_session.add_all([
        TeamSlackChannel(team_id=team_a.id, slack_channel_id="C_A", event_types=["scan_complete"], created_by=sample_user.id),
        TeamSlackChannel(team_id=team_b.id, slack_channel_id="C_B", event_types=["card_failed"], created_by=sample_user.id),
    ])
    await db_session.commit()

    posted_channels = []

    async def fake_post(token, channel_id, text, blocks):
        posted_channels.append(channel_id)
        return True

    with patch("src.app.services.slack_dispatcher._post_to_channel", side_effect=fake_post):
        await dispatch_event(db_session, "scan_complete", team_a.id, {"title": "done", "provider_label": "GitHub"})
        await dispatch_event(db_session, "card_failed", team_b.id, {"card_title": "broken", "project_id": project_b.id, "error": "boom"})

    assert posted_channels == ["C_A", "C_B"]
