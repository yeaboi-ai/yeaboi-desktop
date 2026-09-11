"""Tests for GET /api/tickets/{id_or_key} — the standalone-ticket-route resolver."""

import pytest


async def _create_card(client, auth_headers, name: str = "Session A") -> dict:
    proj = (await client.post("/api/sessions", json={"name": name}, headers=auth_headers)).json()
    board = (await client.get(f"/api/sessions/{proj['id']}/board", headers=auth_headers)).json()
    backlog = board["columns"][0]["id"]
    card = (
        await client.post(
            f"/api/boards/{board['id']}/cards",
            json={"column_id": backlog, "title": "Resolve me"},
            headers=auth_headers,
        )
    ).json()
    return {"project": proj, "board": board, "card": card}


@pytest.mark.anyio
async def test_resolve_by_uuid(client, auth_headers):
    """Look up a ticket by its raw uuid."""
    ctx = await _create_card(client, auth_headers, "Acme Storefront")
    card_id = ctx["card"]["id"]
    resp = await client.get(f"/api/tickets/{card_id}", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["card"]["id"] == card_id
    assert body["card"]["friendly_id"]
    assert body["board_id"] == ctx["board"]["id"]
    assert body["session_key"]
    assert body["session_name"] == "Acme Storefront"
    assert body["attachments"] == []
    assert body["links"] == []
    assert body["events"] == []


@pytest.mark.anyio
async def test_resolve_by_friendly_id_case_insensitive(client, auth_headers):
    """Friendly ids resolve in any casing."""
    ctx = await _create_card(client, auth_headers, "Resolver Test")
    fid: str = ctx["card"]["friendly_id"]
    assert fid

    upper = await client.get(f"/api/tickets/{fid}", headers=auth_headers)
    lower = await client.get(f"/api/tickets/{fid.lower()}", headers=auth_headers)
    mixed = await client.get(f"/api/tickets/{fid.title()}", headers=auth_headers)

    assert upper.status_code == 200
    assert lower.status_code == 200
    assert mixed.status_code == 200
    assert upper.json()["card"]["id"] == ctx["card"]["id"]
    assert lower.json()["card"]["id"] == ctx["card"]["id"]
    assert mixed.json()["card"]["id"] == ctx["card"]["id"]


@pytest.mark.anyio
async def test_resolve_returns_comments(client, auth_headers):
    """Comments on the card are bundled into the response."""
    ctx = await _create_card(client, auth_headers, "Comments Session")
    card_id = ctx["card"]["id"]
    await client.post(
        f"/api/cards/{card_id}/comments",
        json={"content": "First comment"},
        headers=auth_headers,
    )
    resp = await client.get(f"/api/tickets/{card_id}", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["comments"]) == 1
    assert body["comments"][0]["content"] == "First comment"


@pytest.mark.anyio
async def test_resolve_404_for_unknown(client, auth_headers):
    """Unknown id returns 404."""
    resp = await client.get("/api/tickets/PROJ-9999", headers=auth_headers)
    assert resp.status_code == 404
    resp_uuid = await client.get(
        "/api/tickets/00000000-0000-0000-0000-000000000000", headers=auth_headers
    )
    assert resp_uuid.status_code == 404


@pytest.mark.anyio
async def test_resolve_400ish_for_blank(client, auth_headers):
    """Whitespace id returns 404 (blank → not-found rather than 422)."""
    resp = await client.get("/api/tickets/%20", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_resolve_unauthorized(client):
    """Missing auth returns 401."""
    resp = await client.get("/api/tickets/anything")
    assert resp.status_code == 401
