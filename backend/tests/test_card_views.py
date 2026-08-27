"""Tests for the DB-backed saved-board-views endpoints."""

import pytest


@pytest.mark.anyio
async def test_create_list_card_view(client, auth_headers):
    create = await client.post(
        "/api/card-views",
        json={"name": "Sprint 5", "query": "q=critical&swimlane=assignee"},
        headers=auth_headers,
    )
    assert create.status_code == 201
    body = create.json()
    assert body["name"] == "Sprint 5"
    assert body["query"] == "q=critical&swimlane=assignee"

    listed = await client.get("/api/card-views", headers=auth_headers)
    assert listed.status_code == 200
    data = listed.json()
    assert any(v["id"] == body["id"] for v in data)


@pytest.mark.anyio
async def test_update_card_view(client, auth_headers):
    created = (
        await client.post(
            "/api/card-views",
            json={"name": "Initial", "query": ""},
            headers=auth_headers,
        )
    ).json()
    resp = await client.patch(
        f"/api/card-views/{created['id']}",
        json={"name": "Renamed"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Renamed"


@pytest.mark.anyio
async def test_delete_card_view(client, auth_headers):
    created = (
        await client.post(
            "/api/card-views", json={"name": "DeleteMe"}, headers=auth_headers
        )
    ).json()
    resp = await client.delete(f"/api/card-views/{created['id']}", headers=auth_headers)
    assert resp.status_code == 204
    listed = (await client.get("/api/card-views", headers=auth_headers)).json()
    assert all(v["id"] != created["id"] for v in listed)


@pytest.mark.anyio
async def test_views_scoped_per_user(client, auth_headers, other_auth_headers):
    me_view = (
        await client.post(
            "/api/card-views", json={"name": "Mine"}, headers=auth_headers
        )
    ).json()
    other_resp = await client.get("/api/card-views", headers=other_auth_headers)
    # Cross-user GET either returns an empty list (other user has their own org)
    # or an error envelope when their auto-created org has no project. Either
    # way, my view id must not appear.
    if other_resp.status_code == 200:
        listed = other_resp.json()
        if isinstance(listed, list):
            assert all(v["id"] != me_view["id"] for v in listed)

    cross = await client.delete(
        f"/api/card-views/{me_view['id']}", headers=other_auth_headers
    )
    assert cross.status_code in (400, 401, 403, 404)


@pytest.mark.anyio
async def test_card_views_require_auth(client):
    resp = await client.get("/api/card-views")
    assert resp.status_code == 401
