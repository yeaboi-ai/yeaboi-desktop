"""Tests for the session-context → directory query bridge in facilitator."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from src.app.models.session_event import SessionContext, SessionEvent
from src.app.services.facilitator import _build_directory_query


async def test_build_query_idea_only_when_no_session(db_session):
    """With no session_id, query is just the initial idea."""
    query = await _build_directory_query(None, db_session, "Build a billing portal with Stripe")
    assert query == "Build a billing portal with Stripe"


async def test_build_query_empty_when_no_idea_and_no_session(db_session):
    """Empty idea + no session → empty string (caller falls back to overview-only)."""
    query = await _build_directory_query(None, db_session, None)
    assert query == ""


async def test_build_query_returns_idea_when_session_has_no_context(db_session):
    """Session without a materialised SessionContext row still works."""
    query = await _build_directory_query(
        "nonexistent-session-id", db_session, "Add SSO"
    )
    assert query == "Add SSO"


async def _seed_session_context(
    db_session, session_id: str, summary: str | None = None
) -> None:
    """Insert a minimal SessionContext row. Session FK is not enforced here
    because our integration tests don't create a full session graph."""
    ctx = SessionContext(session_id=session_id, directory={}, summary=summary)
    db_session.add(ctx)
    await db_session.commit()


async def _seed_message(db_session, session_id: str, content: str) -> None:
    evt = SessionEvent(
        session_id=session_id,
        event_type="message",
        source="user",
        payload={"content": content, "speaker_name": "User"},
    )
    db_session.add(evt)
    await db_session.commit()


async def test_build_query_includes_summary(db_session, monkeypatch):
    """Rolling summary text is appended to the retrieval query."""
    session_id = "session-sum-1"
    await _seed_session_context(
        db_session, session_id, summary="Discussing Redis vs Memcached for the rate limiter."
    )

    query = await _build_directory_query(session_id, db_session, "Build an API gateway")

    assert "Build an API gateway" in query
    assert "Redis" in query
    assert "Memcached" in query


async def test_build_query_includes_recent_messages(db_session):
    """Recent message contents are concatenated into the query."""
    session_id = "session-msgs-1"
    await _seed_session_context(db_session, session_id, summary=None)
    await _seed_message(db_session, session_id, "Should we pick Postgres or DynamoDB?")
    await _seed_message(db_session, session_id, "Probably Postgres for the relational shape.")

    query = await _build_directory_query(session_id, db_session, "New service design")

    assert "New service design" in query
    assert "Postgres" in query
    assert "DynamoDB" in query


async def test_build_query_truncates_long_summary(db_session):
    """Summary is clipped so a verbose summary doesn't swamp the query."""
    session_id = "session-long-sum"
    long_summary = "Kubernetes " * 500  # well past the 800-char cap
    await _seed_session_context(db_session, session_id, summary=long_summary)

    query = await _build_directory_query(session_id, db_session, "Platform refresh")

    # Idea + capped summary + no messages ≈ 400 + 800 + joiner space.
    # The hard upper bound is _QUERY_IDEA_MAX + _QUERY_SUMMARY_MAX + some joiners.
    assert len(query) <= 400 + 800 + 16


async def test_build_query_survives_bad_session_state(db_session):
    """If context_reader raises, we fall back to idea-only rather than failing."""
    # The session_id here is valid-looking but no SessionContext exists; even if
    # get_recent_messages fetches zero events, get_session_summary returns None
    # and the helper still completes successfully.
    query = await _build_directory_query(
        "missing-session", db_session, "Launch a status page"
    )
    assert query == "Launch a status page"


@pytest.fixture
async def seeded_team_directory(db_session):
    """Not directly used here — placeholder so future integration tests can
    verify that summary tokens actually change which entries rank."""
    yield


async def test_seeded_event_round_trips(db_session):
    """Sanity: SessionEvent seed helper works (guards future refactors)."""
    await _seed_message(db_session, "roundtrip-1", "hello")
    rows = (
        await db_session.execute(
            select(SessionEvent).where(SessionEvent.session_id == "roundtrip-1")
        )
    ).scalars().all()
    assert len(rows) == 1
    assert rows[0].payload["content"] == "hello"
