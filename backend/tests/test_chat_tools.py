import asyncio
from unittest.mock import patch

import pytest

from src.app.models.project import Project
from src.app.services.chat_tools import _create_session, execute_tool


@pytest.mark.asyncio
async def test_create_session_uses_team_last_viewed_when_no_project_name(db_session, sample_team, sample_user):
    project = Project(
        org_id=sample_team.org_id,
        team_id=sample_team.id,
        owner_id=sample_user.id,
        name="Preferred",
    )
    db_session.add(project)
    await db_session.flush()
    sample_team.last_viewed_project_id = project.id
    await db_session.commit()

    result = await _create_session(
        {"title": "Session A"},
        org_id=sample_team.org_id,
        team_id=sample_team.id,
        db=db_session,
        user_id=sample_user.id,
    )

    assert "id" in result
    assert result["project"] == "Preferred"
    assert result["project_id"] == project.id


@pytest.mark.asyncio
async def test_create_session_needs_project_choice_when_ambiguous(db_session, sample_team, sample_user):
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

    result = await _create_session(
        {"title": "Ambiguous"},
        org_id=sample_team.org_id,
        team_id=sample_team.id,
        db=db_session,
        user_id=sample_user.id,
    )

    assert result["status"] == "needs_project_choice"
    assert {o["name"] for o in result["options"]} == {"Alpha", "Beta"}
    # Each option must carry an id for the LLM to disambiguate
    assert all("id" in o for o in result["options"])


@pytest.mark.asyncio
async def test_create_session_returns_no_projects_when_org_empty(db_session, sample_team, sample_user):
    result = await _create_session(
        {"title": "Nothing"},
        org_id=sample_team.org_id,
        team_id=sample_team.id,
        db=db_session,
        user_id=sample_user.id,
    )
    assert result == {"status": "no_projects"}


@pytest.mark.asyncio
async def test_create_session_explicit_project_name_unchanged(db_session, sample_team, sample_user):
    """Backwards-compat: explicit project_name still resolves by name."""
    db_session.add(
        Project(
            org_id=sample_team.org_id,
            team_id=sample_team.id,
            owner_id=sample_user.id,
            name="Explicit",
        )
    )
    await db_session.commit()

    result = await _create_session(
        {"project_name": "Explic", "title": "Named"},
        org_id=sample_team.org_id,
        team_id=sample_team.id,
        db=db_session,
        user_id=sample_user.id,
    )

    assert result["project"] == "Explicit"
    assert "id" in result
    assert "project_id" in result  # new field returned on success


@pytest.mark.asyncio
async def test_create_session_explicit_project_name_not_found_falls_through_to_picker(
    db_session, sample_team, sample_user
):
    """When an explicitly-named project doesn't match, fall through to the
    picker with the candidate list so the Slack handler can render options.

    This replaces the old behaviour (return `{"error": ...}`) — the error
    confused the LLM into asking clarifying questions in text instead of
    calling the tool and letting the picker UX handle the mismatch.
    """
    # Seed the org with two projects so the picker has something to show
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

    result = await _create_session(
        {"project_name": "Nothing", "title": "X"},
        org_id=sample_team.org_id,
        team_id=sample_team.id,
        db=db_session,
        user_id=sample_user.id,
    )
    assert result["status"] == "needs_project_choice"
    assert result["unmatched_name"] == "Nothing"
    assert {o["name"] for o in result["options"]} == {"Alpha", "Beta"}


@pytest.mark.asyncio
async def test_create_session_explicit_project_name_not_found_returns_no_projects_when_org_empty(
    db_session, sample_team, sample_user
):
    """If the named project doesn't match AND the org has no other projects,
    surface ``no_projects`` so the caller can tell the user to create one first."""
    result = await _create_session(
        {"project_name": "Nothing", "title": "X"},
        org_id=sample_team.org_id,
        team_id=sample_team.id,
        db=db_session,
        user_id=sample_user.id,
    )
    assert result == {"status": "no_projects"}


# ── Reliability: timeout + retry on tool execution ──────────────────────────


@pytest.mark.asyncio
async def test_execute_tool_unknown_name_returns_error(db_session, sample_team):
    result = await execute_tool(
        "not_a_real_tool",
        {},
        org_id=sample_team.org_id,
        team_id=sample_team.id,
        db=db_session,
    )
    assert "error" in result
    assert "Unknown tool" in result["error"]


@pytest.mark.asyncio
async def test_execute_tool_times_out_a_runaway_handler(db_session, sample_team):
    """A handler that hangs longer than the per-tool deadline must abort with
    a structured error instead of pinning the chat turn forever."""

    async def hang(*_a, **_kw):
        await asyncio.sleep(60)
        return {"unreachable": True}

    with (
        patch("src.app.services.chat_tools._TOOL_HANDLERS", {"slow": hang}),
        patch("src.app.services.chat_tools._TOOL_TIMEOUT_SECONDS", 0.05),
    ):
        result = await execute_tool(
            "slow",
            {},
            org_id=sample_team.org_id,
            team_id=sample_team.id,
            db=db_session,
        )

    assert "error" in result
    assert "timed out" in result["error"].lower()


@pytest.mark.asyncio
async def test_execute_tool_retries_idempotent_read_on_transient_error(db_session, sample_team):
    """Idempotent read tools recover from a transient ConnectionError."""
    calls = {"n": 0}

    async def flaky(*_a, **_kw):
        calls["n"] += 1
        if calls["n"] < 3:
            raise ConnectionError("transient")
        return {"ok": True}

    with patch(
        "src.app.services.chat_tools._TOOL_HANDLERS",
        {"list_projects": flaky},  # list_projects is in _IDEMPOTENT_TOOLS
    ):
        result = await execute_tool(
            "list_projects",
            {},
            org_id=sample_team.org_id,
            team_id=sample_team.id,
            db=db_session,
        )

    assert result == {"ok": True}
    assert calls["n"] == 3


@pytest.mark.asyncio
async def test_execute_tool_does_not_retry_writes(db_session, sample_team):
    """Write tools must NOT retry on transient failures — a second attempt
    could create duplicate rows. The error surfaces as a structured payload."""
    calls = {"n": 0}

    async def flaky_write(*_a, **_kw):
        calls["n"] += 1
        raise ConnectionError("transient")

    with patch(
        "src.app.services.chat_tools._TOOL_HANDLERS",
        {"create_card": flaky_write},  # create_card is NOT in _IDEMPOTENT_TOOLS
    ):
        result = await execute_tool(
            "create_card",
            {},
            org_id=sample_team.org_id,
            team_id=sample_team.id,
            db=db_session,
        )

    assert "error" in result
    assert calls["n"] == 1, "writes must run exactly once"
