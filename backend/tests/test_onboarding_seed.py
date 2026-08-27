"""Tests for the onboarding demo-workspace seed service."""

import pytest
from sqlalchemy import func, select

from src.app.models.blueprint import BlueprintIteration, BlueprintSnapshot
from src.app.models.board import Board, BoardColumn, Card
from src.app.models.project import Project
from src.app.models.session import Session
from src.app.services.onboarding_seed import DEMO_CARDS, seed_demo_workspace


@pytest.mark.anyio
async def test_seed_demo_workspace_creates_project_marked_demo(
    db_session, sample_user, sample_org, sample_team
):
    project = await seed_demo_workspace(
        db_session, org_id=sample_org.id, team_id=sample_team.id, user_id=sample_user.id
    )
    await db_session.commit()

    assert project.is_demo is True
    assert project.team_id == sample_team.id
    assert project.org_id == sample_org.id
    assert project.owner_id == sample_user.id


@pytest.mark.anyio
async def test_seed_demo_workspace_creates_expected_artifacts(
    db_session, sample_user, sample_org, sample_team
):
    project = await seed_demo_workspace(
        db_session, org_id=sample_org.id, team_id=sample_team.id, user_id=sample_user.id
    )
    await db_session.commit()

    # One completed session under the demo project
    sessions = (
        await db_session.execute(select(Session).where(Session.project_id == project.id))
    ).scalars().all()
    assert len(sessions) == 1
    assert sessions[0].status == "completed"

    # One blueprint iteration + one snapshot
    iterations = (
        await db_session.execute(
            select(BlueprintIteration).where(BlueprintIteration.project_id == project.id)
        )
    ).scalars().all()
    assert len(iterations) == 1
    snapshots = (
        await db_session.execute(
            select(BlueprintSnapshot).where(BlueprintSnapshot.project_id == project.id)
        )
    ).scalars().all()
    assert len(snapshots) == 1
    # All 13 blueprint sections populated (non-empty)
    assert all(snapshots[0].content[section] for section in snapshots[0].content)

    # One board with three columns
    boards = (
        await db_session.execute(select(Board).where(Board.project_id == project.id))
    ).scalars().all()
    assert len(boards) == 1
    columns = (
        await db_session.execute(
            select(BoardColumn).where(BoardColumn.board_id == boards[0].id).order_by(BoardColumn.position)
        )
    ).scalars().all()
    assert [c.name for c in columns] == ["Backlog", "In Progress", "Done"]

    # Cards match the seed list and depend_on is wired
    card_count = (
        await db_session.execute(
            select(func.count(Card.id)).where(Card.project_id == project.id)
        )
    ).scalar_one()
    assert card_count == len(DEMO_CARDS)

    cards = (
        await db_session.execute(select(Card).where(Card.project_id == project.id))
    ).scalars().all()
    assert any(card.depends_on for card in cards), "expected at least one card with a depends_on link"
    assert any(card.priority == "critical" for card in cards)


@pytest.mark.anyio
async def test_seed_demo_workspace_is_idempotent(
    db_session, sample_user, sample_org, sample_team
):
    first = await seed_demo_workspace(
        db_session, org_id=sample_org.id, team_id=sample_team.id, user_id=sample_user.id
    )
    await db_session.commit()
    second = await seed_demo_workspace(
        db_session, org_id=sample_org.id, team_id=sample_team.id, user_id=sample_user.id
    )
    await db_session.commit()

    assert first.id == second.id

    # Still exactly one demo project for the team
    demo_projects = (
        await db_session.execute(
            select(Project).where(
                Project.team_id == sample_team.id, Project.is_demo.is_(True)
            )
        )
    ).scalars().all()
    assert len(demo_projects) == 1


@pytest.mark.anyio
async def test_seed_demo_workspace_runs_for_two_different_teams(db_session, sample_user):
    """Regression: a second demo seed (in a different team) used to fail with
    `duplicate key value violates unique constraint "uq_cards_friendly_id"`
    because seeded cards had hard-coded friendly_ids like DEMO-1..DEMO-8 that
    are globally unique. Two teams' demo projects must coexist."""
    from src.app.models.organization import Organization, OrgMember, Team, TeamMember

    # Two orgs + two teams + one user in both
    orgs = []
    teams = []
    for slug in ("alpha", "beta"):
        org = Organization(name=slug.capitalize(), slug=slug)
        db_session.add(org)
        await db_session.flush()
        db_session.add(OrgMember(org_id=org.id, user_id=sample_user.id, role="admin"))
        team = Team(org_id=org.id, name="General", slug=f"{slug}-general")
        db_session.add(team)
        await db_session.flush()
        db_session.add(TeamMember(team_id=team.id, user_id=sample_user.id, role="admin"))
        orgs.append(org)
        teams.append(team)
    await db_session.commit()

    a = await seed_demo_workspace(
        db_session, org_id=orgs[0].id, team_id=teams[0].id, user_id=sample_user.id
    )
    await db_session.commit()
    b = await seed_demo_workspace(
        db_session, org_id=orgs[1].id, team_id=teams[1].id, user_id=sample_user.id
    )
    await db_session.commit()

    assert a.id != b.id
    assert a.is_demo and b.is_demo
