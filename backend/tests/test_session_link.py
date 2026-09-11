"""A room row remembers the engine plan it serves.

The planning conversation lives in the sidecar; the row here carries the call,
the recordings and the board. The room makes the row lazily and finds it again
by the engine id, so the list filter must return exactly that row and the
create route must keep the id it was given.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from tests.test_migrations import upgraded  # noqa: F401 — the fixture


async def _create(client, headers, **body):
    resp = await client.post("/api/sessions", json=body, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_create_keeps_the_engine_id(client, auth_headers):
    row = await _create(client, auth_headers, name="Barber booking", yeaboi_session_id="new-abc12345-2026-09-11")
    assert row["yeaboi_session_id"] == "new-abc12345-2026-09-11"

    detail = await client.get(f"/api/sessions/{row['id']}", headers=auth_headers)
    assert detail.status_code == 200, detail.text
    assert detail.json()["yeaboi_session_id"] == "new-abc12345-2026-09-11"


@pytest.mark.asyncio
async def test_create_without_a_plan_has_no_link(client, auth_headers):
    row = await _create(client, auth_headers, name="Loose room")
    assert row["yeaboi_session_id"] is None

    blank = await _create(client, auth_headers, name="Blank", yeaboi_session_id="   ")
    assert blank["yeaboi_session_id"] is None


@pytest.mark.asyncio
async def test_list_filter_returns_only_the_linked_row(client, auth_headers):
    linked = await _create(client, auth_headers, name="Linked", yeaboi_session_id="s1")
    await _create(client, auth_headers, name="Other", yeaboi_session_id="s2")
    await _create(client, auth_headers, name="Unlinked")

    resp = await client.get("/api/sessions?yeaboi_session_id=s1", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    assert [row["id"] for row in resp.json()] == [linked["id"]]

    none = await client.get("/api/sessions?yeaboi_session_id=nope", headers=auth_headers)
    assert none.status_code == 200
    assert none.json() == []

    everything = await client.get("/api/sessions", headers=auth_headers)
    assert len(everything.json()) == 3


@pytest.mark.asyncio
async def test_create_rejects_an_overlong_engine_id(client, auth_headers):
    resp = await client.post("/api/sessions", json={"name": "x", "yeaboi_session_id": "a" * 65}, headers=auth_headers)
    assert resp.status_code == 422


def test_the_upgrade_adds_the_indexed_link_column(upgraded: Path):  # noqa: F811
    con = sqlite3.connect(upgraded)
    try:
        columns = {row[1] for row in con.execute("PRAGMA table_info(sessions)")}
        indexes = {row[1] for row in con.execute("PRAGMA index_list(sessions)")}
    finally:
        con.close()
    assert "yeaboi_session_id" in columns
    assert "ix_sessions_yeaboi_session_id" in indexes
