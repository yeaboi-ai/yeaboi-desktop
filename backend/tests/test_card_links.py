"""Tests for /api/cards/{id}/links — typed relationships, cycle prevention, dedupe."""

import pytest


async def _make_board(client, auth_headers, name: str = "Link Project") -> dict:
    proj = (await client.post("/api/projects", json={"name": name}, headers=auth_headers)).json()
    board = (await client.get(f"/api/projects/{proj['id']}/board", headers=auth_headers)).json()
    return {"project": proj, "board": board}


async def _make_card(client, auth_headers, board: dict, title: str) -> dict:
    backlog = board["columns"][0]["id"]
    return (
        await client.post(
            f"/api/boards/{board['id']}/cards",
            json={"column_id": backlog, "title": title},
            headers=auth_headers,
        )
    ).json()


@pytest.mark.anyio
async def test_create_link_outbound_blocks(client, auth_headers):
    ctx = await _make_board(client, auth_headers, "Outbound block")
    a = await _make_card(client, auth_headers, ctx["board"], "A")
    b = await _make_card(client, auth_headers, ctx["board"], "B")

    resp = await client.post(
        f"/api/cards/{a['id']}/links",
        json={"target": b["id"], "link_type": "blocks"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["link_type"] == "blocks"
    assert body["direction"] == "outbound"
    assert body["other_card"]["id"] == b["id"]


@pytest.mark.anyio
async def test_inverse_blocked_by_normalized(client, auth_headers):
    ctx = await _make_board(client, auth_headers, "Inverse")
    a = await _make_card(client, auth_headers, ctx["board"], "A")
    b = await _make_card(client, auth_headers, ctx["board"], "B")

    resp = await client.post(
        f"/api/cards/{a['id']}/links",
        json={"target": b["id"], "link_type": "blocked_by"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    # "A blocked_by B" stored as "B blocks A" — A should see direction=inbound.
    assert body["link_type"] == "blocks"
    assert body["direction"] == "inbound"
    assert body["other_card"]["id"] == b["id"]


@pytest.mark.anyio
async def test_resolves_friendly_id(client, auth_headers):
    ctx = await _make_board(client, auth_headers, "Friendly id link")
    a = await _make_card(client, auth_headers, ctx["board"], "A")
    b = await _make_card(client, auth_headers, ctx["board"], "B")

    resp = await client.post(
        f"/api/cards/{a['id']}/links",
        json={"target": b["friendly_id"], "link_type": "relates_to"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["other_card"]["friendly_id"] == b["friendly_id"]


@pytest.mark.anyio
async def test_cycle_rejected(client, auth_headers):
    ctx = await _make_board(client, auth_headers, "Cycle")
    a = await _make_card(client, auth_headers, ctx["board"], "A")
    b = await _make_card(client, auth_headers, ctx["board"], "B")
    c = await _make_card(client, auth_headers, ctx["board"], "C")

    # A blocks B, B blocks C
    await client.post(
        f"/api/cards/{a['id']}/links",
        json={"target": b["id"], "link_type": "blocks"},
        headers=auth_headers,
    )
    await client.post(
        f"/api/cards/{b['id']}/links",
        json={"target": c["id"], "link_type": "blocks"},
        headers=auth_headers,
    )

    # Closing the loop with C blocks A would be a cycle.
    resp = await client.post(
        f"/api/cards/{c['id']}/links",
        json={"target": a["id"], "link_type": "blocks"},
        headers=auth_headers,
    )
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_self_link_rejected(client, auth_headers):
    ctx = await _make_board(client, auth_headers, "Self")
    a = await _make_card(client, auth_headers, ctx["board"], "A")
    resp = await client.post(
        f"/api/cards/{a['id']}/links",
        json={"target": a["id"], "link_type": "blocks"},
        headers=auth_headers,
    )
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_duplicate_triple_rejected(client, auth_headers):
    ctx = await _make_board(client, auth_headers, "Duplicate triple")
    a = await _make_card(client, auth_headers, ctx["board"], "A")
    b = await _make_card(client, auth_headers, ctx["board"], "B")

    first = await client.post(
        f"/api/cards/{a['id']}/links",
        json={"target": b["id"], "link_type": "blocks"},
        headers=auth_headers,
    )
    assert first.status_code == 201
    second = await client.post(
        f"/api/cards/{a['id']}/links",
        json={"target": b["id"], "link_type": "blocks"},
        headers=auth_headers,
    )
    assert second.status_code == 400


@pytest.mark.anyio
async def test_get_returns_both_directions(client, auth_headers):
    ctx = await _make_board(client, auth_headers, "Both directions")
    a = await _make_card(client, auth_headers, ctx["board"], "A")
    b = await _make_card(client, auth_headers, ctx["board"], "B")
    c = await _make_card(client, auth_headers, ctx["board"], "C")

    # A blocks B, C blocks A — A should see one outbound + one inbound.
    await client.post(
        f"/api/cards/{a['id']}/links",
        json={"target": b["id"], "link_type": "blocks"},
        headers=auth_headers,
    )
    await client.post(
        f"/api/cards/{c['id']}/links",
        json={"target": a["id"], "link_type": "blocks"},
        headers=auth_headers,
    )

    body = (await client.get(f"/api/cards/{a['id']}/links", headers=auth_headers)).json()
    directions = sorted(item["direction"] for item in body)
    assert directions == ["inbound", "outbound"]


@pytest.mark.anyio
async def test_delete_link(client, auth_headers):
    ctx = await _make_board(client, auth_headers, "Delete link")
    a = await _make_card(client, auth_headers, ctx["board"], "A")
    b = await _make_card(client, auth_headers, ctx["board"], "B")
    created = (
        await client.post(
            f"/api/cards/{a['id']}/links",
            json={"target": b["id"], "link_type": "blocks"},
            headers=auth_headers,
        )
    ).json()

    resp = await client.delete(
        f"/api/cards/{a['id']}/links/{created['id']}", headers=auth_headers
    )
    assert resp.status_code == 204

    listed = (await client.get(f"/api/cards/{a['id']}/links", headers=auth_headers)).json()
    assert listed == []


@pytest.mark.anyio
async def test_unknown_target_404(client, auth_headers):
    ctx = await _make_board(client, auth_headers, "Unknown target")
    a = await _make_card(client, auth_headers, ctx["board"], "A")
    resp = await client.post(
        f"/api/cards/{a['id']}/links",
        json={"target": "ZZZZ-9999", "link_type": "blocks"},
        headers=auth_headers,
    )
    assert resp.status_code == 404
