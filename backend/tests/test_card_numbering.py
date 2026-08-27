"""Tests for the per-project monotonic ticket-numbering service."""

import asyncio

import pytest
from sqlalchemy import select

from src.app.models.board import Board, BoardColumn, Card
from src.app.models.project import Project
from src.app.services.card_numbering import (
    assign_friendly_id,
    derive_unique_key,
    is_valid_key,
)


@pytest.fixture
async def sample_project(db_session, sample_user, sample_org, sample_team):
    proj = Project(
        name="Acme Storefront",
        owner_id=sample_user.id,
        org_id=sample_org.id,
        team_id=sample_team.id,
        key="ACME",
        card_counter=0,
    )
    db_session.add(proj)
    await db_session.flush()
    board = Board(project_id=proj.id, org_id=sample_org.id)
    db_session.add(board)
    await db_session.flush()
    col = BoardColumn(board_id=board.id, name="Backlog", position=0)
    db_session.add(col)
    await db_session.commit()
    await db_session.refresh(proj)
    return proj, col


def _make_card(column_id: str, title: str = "Test") -> Card:
    return Card(column_id=column_id, position=0, title=title)


@pytest.mark.asyncio
async def test_assign_friendly_id_sequential(db_session, sample_project):
    proj, col = sample_project
    assigned_in_order: list[tuple[int, str]] = []
    for i in range(5):
        c = _make_card(col.id, f"T{i}")
        db_session.add(c)
        await db_session.flush()
        await assign_friendly_id(c, proj.id, db_session)
        assigned_in_order.append((c.number, c.friendly_id))
    await db_session.commit()
    assert [n for n, _ in assigned_in_order] == [1, 2, 3, 4, 5]
    assert [fid for _, fid in assigned_in_order] == [
        "ACME-1", "ACME-2", "ACME-3", "ACME-4", "ACME-5",
    ]
    proj_after = (await db_session.execute(select(Project).where(Project.id == proj.id))).scalar_one()
    assert proj_after.card_counter == 5


@pytest.mark.asyncio
async def test_assign_friendly_id_concurrent_no_gaps(db_engine, sample_project):
    """50 concurrent inserts each get a distinct number with no gaps or duplicates."""
    proj, col = sample_project
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    session_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    async def insert_one(idx: int) -> int:
        async with session_factory() as session:
            card = _make_card(col.id, f"Concurrent {idx}")
            session.add(card)
            await session.flush()
            await assign_friendly_id(card, proj.id, session)
            await session.commit()
            return card.number  # type: ignore[return-value]

    results = await asyncio.gather(*[insert_one(i) for i in range(50)])
    # SQLite serialises writes, but the contract is the same: distinct + dense.
    assert sorted(results) == list(range(1, 51))


@pytest.mark.asyncio
async def test_assign_friendly_id_falls_back_when_key_missing(db_session, sample_user, sample_org, sample_team):
    proj = Project(
        name="MyApp",
        owner_id=sample_user.id,
        org_id=sample_org.id,
        team_id=sample_team.id,
        key=None,
        card_counter=0,
    )
    db_session.add(proj)
    await db_session.flush()
    board = Board(project_id=proj.id, org_id=sample_org.id)
    db_session.add(board)
    await db_session.flush()
    col = BoardColumn(board_id=board.id, name="Backlog", position=0)
    db_session.add(col)
    await db_session.commit()

    card = _make_card(col.id)
    db_session.add(card)
    await db_session.flush()
    await assign_friendly_id(card, proj.id, db_session)
    await db_session.commit()

    refreshed = (await db_session.execute(select(Card).where(Card.id == card.id))).scalar_one()
    assert refreshed.friendly_id == "MYAP-1"
    refreshed_proj = (await db_session.execute(select(Project).where(Project.id == proj.id))).scalar_one()
    assert refreshed_proj.key == "MYAP"


@pytest.mark.asyncio
async def test_derive_unique_key_dedupes_within_org(db_session, sample_user, sample_org, sample_team):
    p1 = Project(
        name="Acme", owner_id=sample_user.id, org_id=sample_org.id, team_id=sample_team.id, key="ACME"
    )
    db_session.add(p1)
    await db_session.commit()
    candidate = await derive_unique_key("Acme Two", sample_org.id, db_session)
    assert candidate != "ACME"
    assert candidate.startswith("ACME") or candidate == "ACME2"


def test_is_valid_key_regex():
    assert is_valid_key("ACME")
    assert is_valid_key("PROJ123")
    assert is_valid_key("ABC")
    assert not is_valid_key("ab")  # too short
    assert not is_valid_key("123ABC")  # must start with letter
    assert not is_valid_key("acme")  # lowercase
    assert not is_valid_key("ACME-X")  # contains dash
