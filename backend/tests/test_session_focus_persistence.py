"""End-to-end: facilitator emits a session_focus block → sessions.focus_sections
is updated → WS clients receive a session_focus_update event.

The facilitator call is mocked so the test is deterministic.
"""

import asyncio
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.app.models.session import Session


@pytest.fixture
def _patched_factory(db_engine):
    """The facilitator background task uses `get_session_factory()` (a
    module-level memoized factory in `src.app.db`) which binds to the
    production engine instead of the test's in-memory engine. Override that
    factory for the duration of the test so the background task uses the
    same SQLite DB as the test client.
    """
    test_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    with patch("src.app.routers.sessions.get_session_factory", return_value=test_factory):
        yield


async def _wait_for_background() -> None:
    """Wait for all pending background tasks (those scheduled via create_task
    inside the endpoint handler) to complete. The facilitator path spawns
    nested awaits so a handful of event-loop turns is not enough; we
    explicitly await each pending task so the mocks stay active for their
    lifetime.
    """
    current = asyncio.current_task()
    for _ in range(50):
        pending = [
            t for t in asyncio.all_tasks()
            if t is not current and not t.done()
        ]
        if not pending:
            return
        # Wait for at least one task to make progress; swallow errors so a
        # failing background task doesn't mask the test's real assertion.
        await asyncio.wait(pending, timeout=2.0, return_when=asyncio.ALL_COMPLETED)


async def test_session_focus_persisted_on_facilitator_emission(
    client, auth_headers, db_session, _patched_factory
):
    # 1. Create a project + session
    proj = await client.post("/api/projects", json={"name": "Focus Test"}, headers=auth_headers)
    project_id = proj.json()["id"]
    sess = await client.post(
        f"/api/projects/{project_id}/sessions",
        json={"initial_idea": "I want to plan the UI"},
        headers=auth_headers,
    )
    session_id = sess.json()["id"]
    await _wait_for_background()

    # 2. Mock process_message to return a session_focus
    fake_result = {
        "response": "Got it — narrowing to UI.",
        "blueprint_updates": [],
        "session_focus": ["ui_ux"],
    }
    with patch(
        "src.app.routers.sessions.process_message",
        new_callable=AsyncMock,
        return_value=fake_result,
    ):
        # Post a user message (triggers the facilitator path)
        resp = await client.post(
            f"/api/sessions/{session_id}/messages",
            json={"content": "start with UI please"},
            headers=auth_headers,
        )
        assert resp.status_code in (200, 201)
        await _wait_for_background()

    # 3. Assert focus_sections was persisted
    refreshed = (
        await db_session.execute(select(Session).where(Session.id == session_id))
    ).scalar_one()
    assert refreshed.focus_sections == ["ui_ux"]


async def test_empty_session_focus_resets_scope(
    client, auth_headers, db_session, _patched_factory
):
    proj = await client.post("/api/projects", json={"name": "Reset Test"}, headers=auth_headers)
    project_id = proj.json()["id"]
    sess = await client.post(
        f"/api/projects/{project_id}/sessions",
        json={"initial_idea": "ui focused"},
        headers=auth_headers,
    )
    session_id = sess.json()["id"]
    await _wait_for_background()

    # Pre-seed a focus_sections value directly
    refreshed = (
        await db_session.execute(select(Session).where(Session.id == session_id))
    ).scalar_one()
    refreshed.focus_sections = ["ui_ux"]
    await db_session.commit()

    # Now emit an empty list — should reset to empty list (full scope)
    fake_result = {
        "response": "Widening scope.",
        "blueprint_updates": [],
        "session_focus": [],
    }
    with patch(
        "src.app.routers.sessions.process_message",
        new_callable=AsyncMock,
        return_value=fake_result,
    ):
        await client.post(
            f"/api/sessions/{session_id}/messages",
            json={"content": "let's also cover everything else"},
            headers=auth_headers,
        )
        await _wait_for_background()

    refreshed = (
        await db_session.execute(select(Session).where(Session.id == session_id))
    ).scalar_one()
    # Expire so we re-read from the DB rather than using a cached instance.
    await db_session.refresh(refreshed)
    assert refreshed.focus_sections == []


async def test_none_session_focus_leaves_scope_unchanged(
    client, auth_headers, db_session, _patched_factory
):
    """When process_message returns session_focus=None, do not touch the column."""
    proj = await client.post("/api/projects", json={"name": "Untouched Test"}, headers=auth_headers)
    project_id = proj.json()["id"]
    sess = await client.post(
        f"/api/projects/{project_id}/sessions",
        json={"initial_idea": "something"},
        headers=auth_headers,
    )
    session_id = sess.json()["id"]
    await _wait_for_background()

    # Pre-seed focus_sections
    refreshed = (
        await db_session.execute(select(Session).where(Session.id == session_id))
    ).scalar_one()
    refreshed.focus_sections = ["ui_ux"]
    await db_session.commit()

    fake_result = {
        "response": "Normal chat.",
        "blueprint_updates": [],
        "session_focus": None,
    }
    with patch(
        "src.app.routers.sessions.process_message",
        new_callable=AsyncMock,
        return_value=fake_result,
    ):
        await client.post(
            f"/api/sessions/{session_id}/messages",
            json={"content": "hi"},
            headers=auth_headers,
        )
        await _wait_for_background()

    refreshed = (
        await db_session.execute(select(Session).where(Session.id == session_id))
    ).scalar_one()
    await db_session.refresh(refreshed)
    # Unchanged
    assert refreshed.focus_sections == ["ui_ux"]


async def test_focus_sections_passed_to_facilitator_as_override(
    client, auth_headers, db_session, _patched_factory
):
    """When session.focus_sections is set, process_message receives it as
    sections_override (takes precedence over iteration-type templates)."""
    proj = await client.post("/api/projects", json={"name": "Override Test"}, headers=auth_headers)
    project_id = proj.json()["id"]
    sess = await client.post(
        f"/api/projects/{project_id}/sessions",
        json={"initial_idea": "ui"},
        headers=auth_headers,
    )
    session_id = sess.json()["id"]
    await _wait_for_background()

    # Seed focus_sections
    refreshed = (
        await db_session.execute(select(Session).where(Session.id == session_id))
    ).scalar_one()
    refreshed.focus_sections = ["ui_ux"]
    await db_session.commit()

    captured: dict = {}

    async def fake_process_message(*args, **kwargs):
        captured["sections_override"] = kwargs.get("sections_override")
        return {"response": "ok", "blueprint_updates": [], "session_focus": None}

    with patch(
        "src.app.routers.sessions.process_message",
        side_effect=fake_process_message,
    ):
        await client.post(
            f"/api/sessions/{session_id}/messages",
            json={"content": "continue"},
            headers=auth_headers,
        )
        await _wait_for_background()

    assert captured["sections_override"] == ["ui_ux"]
