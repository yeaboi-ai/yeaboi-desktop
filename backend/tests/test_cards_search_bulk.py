"""Tests for /api/cards/search and /api/cards-bulk."""

import pytest


async def _setup_board(client, auth_headers, name: str = "Search Session") -> dict:
    proj = (await client.post("/api/sessions", json={"name": name}, headers=auth_headers)).json()
    board = (await client.get(f"/api/sessions/{proj['id']}/board", headers=auth_headers)).json()
    return {"project": proj, "board": board}


async def _make_card(client, auth_headers, board: dict, **fields) -> dict:
    cols = board["columns"]
    backlog = cols[0]["id"]
    payload = {"column_id": backlog, **fields}
    return (
        await client.post(f"/api/boards/{board['id']}/cards", json=payload, headers=auth_headers)
    ).json()


@pytest.mark.anyio
async def test_search_matches_title(client, auth_headers):
    ctx = await _setup_board(client, auth_headers, "Title Search")
    await _make_card(client, auth_headers, ctx["board"], title="Refactor billing service")
    await _make_card(client, auth_headers, ctx["board"], title="Add metric exporter")

    resp = await client.get("/api/cards/search?q=billing", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["title"] == "Refactor billing service"


@pytest.mark.anyio
async def test_search_matches_description_and_friendly_id(client, auth_headers):
    ctx = await _setup_board(client, auth_headers, "Description Search")
    a = await _make_card(
        client, auth_headers, ctx["board"], title="Login bug", description="Crash when MFA enabled"
    )
    fid: str = a["friendly_id"]

    by_desc = (await client.get("/api/cards/search?q=MFA", headers=auth_headers)).json()
    assert len(by_desc) == 1
    assert by_desc[0]["id"] == a["id"]

    by_fid = (await client.get(f"/api/cards/search?q={fid.lower()}", headers=auth_headers)).json()
    assert len(by_fid) == 1
    assert by_fid[0]["id"] == a["id"]


@pytest.mark.anyio
async def test_search_matches_labels(client, auth_headers):
    ctx = await _setup_board(client, auth_headers, "Labels Search")
    a = await _make_card(
        client, auth_headers, ctx["board"], title="Card A", labels=["frontend", "ux"]
    )
    await _make_card(client, auth_headers, ctx["board"], title="Card B", labels=["backend"])
    resp = await client.get("/api/cards/search?q=frontend", headers=auth_headers)
    assert resp.status_code == 200
    ids = [r["id"] for r in resp.json()]
    assert a["id"] in ids


@pytest.mark.anyio
async def test_search_blank_returns_empty(client, auth_headers):
    resp = await client.get("/api/cards/search?q=%20", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.anyio
async def test_search_scoped_by_project(client, auth_headers):
    a_ctx = await _setup_board(client, auth_headers, "Session A")
    b_ctx = await _setup_board(client, auth_headers, "Session B")
    await _make_card(client, auth_headers, a_ctx["board"], title="Common shared title")
    await _make_card(client, auth_headers, b_ctx["board"], title="Common shared title")
    resp = await client.get(
        f"/api/cards/search?q=Common&session_id={a_ctx['project']['id']}",
        headers=auth_headers,
    )
    cards = resp.json()
    assert len(cards) == 1
    assert cards[0]["session_id"] == a_ctx["project"]["id"]


@pytest.mark.anyio
async def test_bulk_update_priority(client, auth_headers):
    ctx = await _setup_board(client, auth_headers, "Bulk Session")
    a = await _make_card(client, auth_headers, ctx["board"], title="A", priority="medium")
    b = await _make_card(client, auth_headers, ctx["board"], title="B", priority="low")

    resp = await client.post(
        "/api/cards-bulk",
        json={"ids": [a["id"], b["id"]], "patch": {"priority": "high"}},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert sorted(resp.json()["updated"]) == sorted([a["id"], b["id"]])

    a_after = (await client.get(f"/api/tickets/{a['id']}", headers=auth_headers)).json()
    assert a_after["card"]["priority"] == "high"


@pytest.mark.anyio
async def test_bulk_rejects_disallowed_field(client, auth_headers):
    ctx = await _setup_board(client, auth_headers, "Bulk Disallow")
    a = await _make_card(client, auth_headers, ctx["board"], title="A")
    resp = await client.post(
        "/api/cards-bulk",
        json={"ids": [a["id"]], "patch": {"title": "rewritten"}},
        headers=auth_headers,
    )
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_bulk_requires_auth(client):
    resp = await client.post("/api/cards-bulk", json={"ids": [], "patch": {"priority": "high"}})
    assert resp.status_code == 401
