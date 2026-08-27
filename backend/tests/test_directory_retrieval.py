"""Tests for services/directory_retrieval.py — ranked ILIKE search.

Uses the in-memory SQLite fixture from conftest.py so we don't need a real
Postgres. Everything is exercised against concrete entries so the ranking
logic is tested, not mocked.
"""

from __future__ import annotations

import pytest

from src.app.models.directory import DirectoryEntry
from src.app.services.directory_retrieval import (
    _score_entry,
    format_for_prompt,
    retrieve_for_query,
    tokenise,
)

# ---------------------------------------------------------------------------
# tokenise
# ---------------------------------------------------------------------------


def test_tokenise_strips_stopwords_and_punctuation():
    assert tokenise("The cat is on the mat") == ["cat", "mat"]


def test_tokenise_keeps_acronyms_below_min_length():
    # AWS, API are short but useful — should survive the length filter
    tokens = tokenise("Scale AWS API for the team")
    assert "aws" in tokens
    assert "api" in tokens
    assert "scale" in tokens
    assert "team" in tokens


def test_tokenise_deduplicates():
    assert tokenise("postgres postgres postgres") == ["postgres"]


def test_tokenise_empty_input():
    assert tokenise("") == []
    assert tokenise("the a an") == []


def test_tokenise_mixes_case():
    tokens = tokenise("ReDis cache for FAST queries")
    assert "redis" in tokens
    assert "cache" in tokens
    assert "fast" in tokens


# ---------------------------------------------------------------------------
# _score_entry
# ---------------------------------------------------------------------------


def _make_entry(title: str, content: str) -> DirectoryEntry:
    return DirectoryEntry(
        id="test-id",
        team_id="team-1",
        path="some/path",
        title=title,
        content=content,
        category="services",
        source="scan",
    )


def test_score_prefers_title_match_over_content_match():
    title_hit = _make_entry("Redis Cache", "unrelated content")
    content_hit = _make_entry("Something Else", "we use redis in here")
    tokens = ["redis"]
    # Title weight is 3x content weight, so title hit should score higher
    assert _score_entry(title_hit, tokens) > _score_entry(content_hit, tokens)


def test_score_zero_when_no_matches():
    entry = _make_entry("Unrelated", "nothing to see")
    assert _score_entry(entry, ["missing"]) == 0.0


def test_score_zero_when_no_tokens():
    entry = _make_entry("Redis Cache", "redis content")
    assert _score_entry(entry, []) == 0.0


def test_score_caps_content_repetition():
    # Content has "redis" 20 times; we cap at 5 to avoid bloated-entry bias
    content = " ".join(["redis"] * 20)
    entry = _make_entry("Unrelated title", content)
    # Score = 0 title hits * 3 + min(20, 5) content hits * 1 = 5
    assert _score_entry(entry, ["redis"]) == 5.0


def test_score_accumulates_across_tokens():
    entry = _make_entry("Redis Cache", "redis postgres queries")
    # title "redis" × 3 = 3, content "redis" × 1 + "postgres" × 1 = 2
    score = _score_entry(entry, ["redis", "postgres"])
    assert score == pytest.approx(5.0)


# ---------------------------------------------------------------------------
# retrieve_for_query (integration with DB)
# ---------------------------------------------------------------------------


async def _seed(db_session, entries: list[dict]) -> None:
    """Helper: bulk-create entries with minimum required fields."""
    for e in entries:
        db_session.add(
            DirectoryEntry(
                id=e["id"],
                team_id=e.get("team_id", "team-1"),
                parent_id=e.get("parent_id"),
                path=e["path"],
                title=e["title"],
                content=e.get("content", ""),
                category=e.get("category", "services"),
                source=e.get("source", "scan"),
            )
        )
    await db_session.commit()


@pytest.mark.asyncio
async def test_retrieve_returns_empty_list_for_empty_team(db_session):
    results = await retrieve_for_query("team-1", "anything", db_session)
    assert results == []


@pytest.mark.asyncio
async def test_retrieve_always_includes_overview_when_present(db_session):
    await _seed(
        db_session,
        [
            {"id": "ov", "path": "overview", "title": "Overview", "content": "**Team overview**"},
        ],
    )
    # Query doesn't match overview at all — but it's still included
    results = await retrieve_for_query("team-1", "cache", db_session)
    assert len(results) == 1
    assert results[0]["path"] == "overview"


@pytest.mark.asyncio
async def test_retrieve_overview_plus_ranked_hits(db_session):
    await _seed(
        db_session,
        [
            {"id": "ov", "path": "overview", "title": "Overview", "content": "**Team overview**"},
            {"id": "r1", "path": "infra/redis", "title": "Redis Cache", "content": "**Uses Redis for caching**"},
            {"id": "r2", "path": "infra/postgres", "title": "Postgres", "content": "**PostgreSQL primary DB**"},
            {"id": "r3", "path": "infra/network", "title": "Network", "content": "Load balancer config"},
        ],
    )
    results = await retrieve_for_query("team-1", "redis caching", db_session, limit=3)
    assert len(results) >= 2
    # Overview must be first
    assert results[0]["path"] == "overview"
    # Next should be the Redis one (highest relevance)
    assert results[1]["path"] == "infra/redis"


@pytest.mark.asyncio
async def test_retrieve_respects_limit(db_session):
    entries = [
        {
            "id": f"e{i}",
            "path": f"p/{i}",
            "title": f"Redis Service {i}",
            "content": "uses redis",
        }
        for i in range(10)
    ]
    entries.append({"id": "ov", "path": "overview", "title": "Overview", "content": "**ov**"})
    await _seed(db_session, entries)

    results = await retrieve_for_query("team-1", "redis", db_session, limit=3)
    assert len(results) == 3


@pytest.mark.asyncio
async def test_retrieve_deduplicates_overview_when_it_matches_query(db_session):
    # Overview content mentions the query — should still only appear once
    await _seed(
        db_session,
        [
            {"id": "ov", "path": "overview", "title": "Redis Overview", "content": "**We use Redis**"},
            {"id": "r1", "path": "infra/redis", "title": "Redis Infrastructure", "content": "redis docs"},
        ],
    )
    results = await retrieve_for_query("team-1", "redis", db_session)
    ids = [r["id"] for r in results]
    assert len(ids) == len(set(ids))


@pytest.mark.asyncio
async def test_retrieve_filters_zero_score_hits(db_session):
    # Only overview matches loosely; an unrelated entry shouldn't appear just
    # because it exists.
    await _seed(
        db_session,
        [
            {"id": "ov", "path": "overview", "title": "Overview", "content": "**about the team**"},
            {"id": "unrelated", "path": "misc", "title": "Misc", "content": "random stuff"},
        ],
    )
    results = await retrieve_for_query("team-1", "kubernetes clusters", db_session)
    # Should only return the overview (always-include); no zero-score hits
    assert len(results) == 1
    assert results[0]["path"] == "overview"


@pytest.mark.asyncio
async def test_retrieve_skips_overview_when_flag_off(db_session):
    await _seed(
        db_session,
        [
            {"id": "ov", "path": "overview", "title": "Overview", "content": "**ov**"},
            {"id": "r1", "path": "infra/redis", "title": "Redis", "content": "uses redis"},
        ],
    )
    results = await retrieve_for_query("team-1", "redis", db_session, include_overview=False)
    ids = [r["id"] for r in results]
    assert "ov" not in ids
    assert "r1" in ids


@pytest.mark.asyncio
async def test_retrieve_returns_empty_for_empty_query_without_overview(db_session):
    # Empty query + no overview → nothing to return
    await _seed(
        db_session,
        [{"id": "r1", "path": "infra/redis", "title": "Redis", "content": "uses redis"}],
    )
    results = await retrieve_for_query("team-1", "", db_session)
    assert results == []


@pytest.mark.asyncio
async def test_retrieve_handles_tokens_below_min_length(db_session):
    # "a" and "is" are stopwords/too short — shouldn't match anything
    await _seed(
        db_session,
        [
            {"id": "r1", "path": "infra/redis", "title": "Redis", "content": "uses redis"},
        ],
    )
    results = await retrieve_for_query("team-1", "a is of", db_session)
    assert results == []


# ---------------------------------------------------------------------------
# format_for_prompt
# ---------------------------------------------------------------------------


def test_format_for_prompt_empty_returns_empty_string():
    assert format_for_prompt([]) == ""


def test_format_for_prompt_includes_title_category_path_and_description():
    entries = [
        {
            "id": "r1",
            "title": "Redis Cache",
            "path": "infra/redis",
            "category": "infrastructure",
            "description": "Redis is our primary cache layer",
        }
    ]
    out = format_for_prompt(entries)
    assert "Redis Cache" in out
    assert "infrastructure" in out
    assert "infra/redis" in out
    assert "Redis is our primary cache layer" in out


def test_format_for_prompt_header_present():
    entries = [{"title": "X", "path": "p", "category": "services", "description": "d"}]
    assert format_for_prompt(entries).startswith("TEAM CONTEXT")


# ---------------------------------------------------------------------------
# Postgres FTS dispatch — mocked dialect (tests run on SQLite)
# ---------------------------------------------------------------------------


class _FakeDialect:
    def __init__(self, name: str) -> None:
        self.name = name


class _FakeBind:
    def __init__(self, dialect_name: str) -> None:
        self.dialect = _FakeDialect(dialect_name)


async def test_dispatches_to_fts_when_dialect_is_postgres(db_session, team_id, monkeypatch):
    """When bind.dialect.name is 'postgresql', _search_fts is called — not
    the ILIKE fallback. We mock the dialect and intercept _search_fts."""
    from src.app.services import directory_retrieval as dr

    # Seed one entry so the ILIKE path would return something if taken
    entry = DirectoryEntry(
        team_id=team_id,
        path="backend/jobs",
        title="Jobs",
        content="Background job runner",
        category="backend",
        description="Background job runner",
    )
    db_session.add(entry)
    await db_session.commit()

    called = {"fts": False, "ilike": False}

    async def fake_fts(_team, _db, _query):
        called["fts"] = True
        return [(entry, 1.0)]

    async def fake_ilike(_team, _db, _tokens):
        called["ilike"] = True
        return []

    monkeypatch.setattr(dr, "_dialect_name", lambda _db: "postgresql")
    monkeypatch.setattr(dr, "_search_fts", fake_fts)
    monkeypatch.setattr(dr, "_search_ilike", fake_ilike)

    results = await dr.retrieve_for_query(
        team_id=team_id, query="jobs runner", db=db_session, limit=5, include_overview=False
    )

    assert called["fts"] is True
    assert called["ilike"] is False
    assert len(results) == 1
    assert results[0]["path"] == "backend/jobs"


async def test_fts_failure_falls_back_to_ilike(db_session, team_id, monkeypatch):
    """If the FTS query raises SQLAlchemyError (e.g. column missing in a
    stale deployment), retrieval falls back to the python scorer instead
    of returning nothing."""
    from sqlalchemy.exc import SQLAlchemyError

    from src.app.services import directory_retrieval as dr

    entry = DirectoryEntry(
        team_id=team_id,
        path="backend/queue",
        title="Queue",
        content="Redis queue with BullMQ",
        category="backend",
        description="Redis queue",
    )
    db_session.add(entry)
    await db_session.commit()

    async def broken_fts(_team, _db, _query):
        raise SQLAlchemyError("column search_tsv does not exist")

    monkeypatch.setattr(dr, "_dialect_name", lambda _db: "postgresql")
    monkeypatch.setattr(dr, "_search_fts", broken_fts)

    results = await dr.retrieve_for_query(
        team_id=team_id, query="redis queue", db=db_session, limit=5, include_overview=False
    )

    # ILIKE fallback picked up the entry
    assert any(r["path"] == "backend/queue" for r in results)


async def test_sqlite_uses_ilike_path(db_session, team_id, monkeypatch):
    """On SQLite (default), the ILIKE scorer is used — FTS path must not run."""
    from src.app.services import directory_retrieval as dr

    entry = DirectoryEntry(
        team_id=team_id,
        path="frontend/app",
        title="App",
        content="Next.js app router",
        category="frontend",
        description="Next.js app",
    )
    db_session.add(entry)
    await db_session.commit()

    async def panic_fts(_team, _db, _query):
        raise AssertionError("FTS path should not run on SQLite")

    monkeypatch.setattr(dr, "_search_fts", panic_fts)

    results = await dr.retrieve_for_query(
        team_id=team_id, query="next router", db=db_session, limit=5, include_overview=False
    )

    assert any(r["path"] == "frontend/app" for r in results)


@pytest.fixture
def team_id():
    """Most retrieval tests in this file use ad-hoc UUID strings. Centralise
    a single value for the new tests so assertions don't drift apart."""
    return "team-fts-fixture"
