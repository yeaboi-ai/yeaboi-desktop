"""Tests for slack_query_flow.resolve_project + list_candidate_projects."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest

from src.app.models.project import Project
from src.app.services.slack_query_flow import handle_session_create, list_candidate_projects, resolve_project


@pytest.mark.asyncio
async def test_resolve_project_uses_stamp_when_valid(
    db_session, sample_team, sample_user
):
    project = Project(
        org_id=sample_team.org_id,
        team_id=sample_team.id,
        owner_id=sample_user.id,
        name="Stamped",
    )
    db_session.add(project)
    await db_session.flush()
    sample_team.last_viewed_project_id = project.id
    await db_session.commit()

    resolved = await resolve_project(sample_team.id, db_session)
    assert resolved is not None
    assert resolved.id == project.id


@pytest.mark.asyncio
async def test_resolve_project_clears_stale_stamp(
    db_session, sample_team, sample_user
):
    deleted = Project(
        org_id=sample_team.org_id,
        team_id=sample_team.id,
        owner_id=sample_user.id,
        name="Ghost",
    )
    db_session.add(deleted)
    await db_session.flush()
    sample_team.last_viewed_project_id = deleted.id
    deleted.deleted_at = datetime.now(UTC)
    await db_session.commit()

    resolved = await resolve_project(sample_team.id, db_session)
    assert resolved is None
    await db_session.refresh(sample_team)
    assert sample_team.last_viewed_project_id is None


@pytest.mark.asyncio
async def test_resolve_project_single_active(
    db_session, sample_team, sample_user
):
    only = Project(
        org_id=sample_team.org_id,
        team_id=sample_team.id,
        owner_id=sample_user.id,
        name="Only",
    )
    db_session.add(only)
    await db_session.commit()

    resolved = await resolve_project(sample_team.id, db_session)
    assert resolved is not None
    assert resolved.id == only.id


@pytest.mark.asyncio
async def test_resolve_project_returns_none_when_ambiguous(
    db_session, sample_team, sample_user
):
    for name in ("A", "B"):
        db_session.add(
            Project(
                org_id=sample_team.org_id,
                team_id=sample_team.id,
                owner_id=sample_user.id,
                name=name,
            )
        )
    await db_session.commit()

    resolved = await resolve_project(sample_team.id, db_session)
    assert resolved is None


@pytest.mark.asyncio
async def test_resolve_project_returns_none_when_empty(
    db_session, sample_team
):
    resolved = await resolve_project(sample_team.id, db_session)
    assert resolved is None


@pytest.mark.asyncio
async def test_list_candidate_projects_orders_by_updated_at_desc(
    db_session, sample_team, sample_user
):
    older = Project(
        org_id=sample_team.org_id,
        team_id=sample_team.id,
        owner_id=sample_user.id,
        name="Older",
    )
    newer = Project(
        org_id=sample_team.org_id,
        team_id=sample_team.id,
        owner_id=sample_user.id,
        name="Newer",
    )
    db_session.add_all([older, newer])
    await db_session.flush()
    # force a clear ordering
    newer.updated_at = datetime.now(UTC)
    older.updated_at = datetime.now(UTC).replace(year=2020)
    await db_session.commit()

    projects = await list_candidate_projects(sample_team.id, db_session)
    assert [p.name for p in projects[:2]] == ["Newer", "Older"]


@pytest.mark.asyncio
async def test_resolve_project_clears_stamp_when_cross_org(
    db_session, sample_team, sample_user
):
    from src.app.models.organization import Organization

    other_org = Organization(name="Other", slug="other")
    db_session.add(other_org)
    await db_session.flush()

    cross_org_project = Project(
        org_id=other_org.id,
        team_id=sample_team.id,   # FK-only; doesn't affect the resolver logic
        owner_id=sample_user.id,
        name="Cross-org stamp target",
    )
    db_session.add(cross_org_project)
    await db_session.flush()
    sample_team.last_viewed_project_id = cross_org_project.id
    await db_session.commit()

    resolved = await resolve_project(sample_team.id, db_session)
    assert resolved is None
    await db_session.refresh(sample_team)
    assert sample_team.last_viewed_project_id is None


@pytest.mark.asyncio
async def test_list_candidate_projects_excludes_soft_deleted(
    db_session, sample_team, sample_user
):
    kept = Project(
        org_id=sample_team.org_id, team_id=sample_team.id,
        owner_id=sample_user.id, name="Kept",
    )
    removed = Project(
        org_id=sample_team.org_id, team_id=sample_team.id,
        owner_id=sample_user.id, name="Removed",
    )
    db_session.add_all([kept, removed])
    await db_session.flush()
    removed.deleted_at = datetime.now(UTC)
    await db_session.commit()

    projects = await list_candidate_projects(sample_team.id, db_session)
    names = [p.name for p in projects]
    assert "Kept" in names
    assert "Removed" not in names


@pytest.mark.asyncio
async def test_list_candidate_projects_excludes_other_org(
    db_session, sample_team, sample_user
):
    from src.app.models.organization import Organization

    other_org = Organization(name="Other Org", slug="other-other")
    db_session.add(other_org)
    await db_session.flush()

    local = Project(
        org_id=sample_team.org_id, team_id=sample_team.id,
        owner_id=sample_user.id, name="Local",
    )
    foreign = Project(
        org_id=other_org.id, team_id=sample_team.id,
        owner_id=sample_user.id, name="Foreign",
    )
    db_session.add_all([local, foreign])
    await db_session.commit()

    projects = await list_candidate_projects(sample_team.id, db_session)
    names = [p.name for p in projects]
    assert names == ["Local"]


@pytest.mark.asyncio
async def test_list_candidate_projects_respects_limit(
    db_session, sample_team, sample_user
):
    for i in range(5):
        db_session.add(
            Project(
                org_id=sample_team.org_id, team_id=sample_team.id,
                owner_id=sample_user.id, name=f"P{i}",
            )
        )
    await db_session.commit()

    projects = await list_candidate_projects(sample_team.id, db_session, limit=2)
    assert len(projects) == 2


# ---------------------------------------------------------------------------
# handle_session_create tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_handle_session_create_posts_public_link_when_resolved(
    db_session, sample_team, sample_user
):
    project = Project(
        org_id=sample_team.org_id,
        team_id=sample_team.id,
        owner_id=sample_user.id,
        name="Resolved",
    )
    db_session.add(project)
    await db_session.flush()
    sample_team.last_viewed_project_id = project.id
    await db_session.commit()

    with patch(
        "src.app.services.slack_query_flow._resolve_context",
        new=AsyncMock(return_value=(sample_user.id, sample_team.id, None)),
    ):
        resp = await handle_session_create(
            db_session,
            {
                "rest": "My session",
                "user_id": "U1",
                "slack_team_id": "T1",
                "channel_id": "C1",
            },
            background_tasks=AsyncMock(),
        )

    assert resp["response_type"] == "in_channel"
    action = next(b for b in resp["blocks"] if b["type"] == "actions")
    button_url = action["elements"][0]["url"]
    assert f"/projects/{project.id}/sessions/" in button_url
    section = next(b for b in resp["blocks"] if b["type"] == "section")
    assert "<@U1>" in section["text"]["text"]


@pytest.mark.asyncio
async def test_handle_session_create_posts_ephemeral_picker_when_ambiguous(
    db_session, sample_team, sample_user
):
    for nm in ("Alpha", "Beta"):
        db_session.add(
            Project(
                org_id=sample_team.org_id,
                team_id=sample_team.id,
                owner_id=sample_user.id,
                name=nm,
            )
        )
    await db_session.commit()

    with patch(
        "src.app.services.slack_query_flow._resolve_context",
        new=AsyncMock(return_value=(sample_user.id, sample_team.id, None)),
    ):
        resp = await handle_session_create(
            db_session,
            {"rest": "Ambiguous", "user_id": "U", "slack_team_id": "T", "channel_id": "C"},
            background_tasks=AsyncMock(),
        )

    assert resp["response_type"] == "ephemeral"
    action = next(b for b in resp["blocks"] if b["type"] == "actions")
    assert len(action["elements"]) == 2
    # action_ids are suffixed per-button to satisfy Slack's uniqueness
    # requirement within a message; dispatcher matches via startswith.
    assert action["elements"][0]["action_id"].startswith("session_create_pick_project")


@pytest.mark.asyncio
async def test_handle_session_create_rejects_when_no_projects(
    db_session, sample_team, sample_user
):
    with patch(
        "src.app.services.slack_query_flow._resolve_context",
        new=AsyncMock(return_value=(sample_user.id, sample_team.id, None)),
    ):
        resp = await handle_session_create(
            db_session,
            {"rest": "Nothing", "user_id": "U", "slack_team_id": "T", "channel_id": "C"},
            background_tasks=AsyncMock(),
        )

    assert resp["response_type"] == "ephemeral"
    assert "No projects" in resp["text"]


@pytest.mark.asyncio
async def test_handle_session_create_shows_web_app_link_when_over_ten_projects(
    db_session, sample_team, sample_user
):
    for i in range(12):
        db_session.add(
            Project(
                org_id=sample_team.org_id,
                team_id=sample_team.id,
                owner_id=sample_user.id,
                name=f"P{i}",
            )
        )
    await db_session.commit()

    with patch(
        "src.app.services.slack_query_flow._resolve_context",
        new=AsyncMock(return_value=(sample_user.id, sample_team.id, None)),
    ):
        resp = await handle_session_create(
            db_session,
            {"rest": "Too many", "user_id": "U", "slack_team_id": "T", "channel_id": "C"},
            background_tasks=AsyncMock(),
        )

    assert resp["response_type"] == "ephemeral"
    action = next(b for b in resp["blocks"] if b["type"] == "actions")
    assert action["elements"][0]["action_id"] == "session_open_projects_list"
    assert action["elements"][0]["url"].endswith("/projects")


@pytest.mark.asyncio
async def test_handle_session_create_empty_title_usage_hint(db_session, sample_team, sample_user):
    with patch(
        "src.app.services.slack_query_flow._resolve_context",
        new=AsyncMock(return_value=(sample_user.id, sample_team.id, None)),
    ):
        resp = await handle_session_create(
            db_session,
            {"rest": "", "user_id": "U", "slack_team_id": "T", "channel_id": "C"},
            background_tasks=AsyncMock(),
        )
    assert resp["response_type"] == "ephemeral"
    assert "Usage" in resp["text"]
