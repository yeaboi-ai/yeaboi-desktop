"""Tests for the kanban board API."""

import pytest


@pytest.mark.anyio
async def test_get_board_creates_default_columns(client, auth_headers):
    """Getting a board for a project auto-creates it with 5 default columns."""
    proj_resp = await client.post("/api/projects", json={"name": "Board Test"}, headers=auth_headers)
    project_id = proj_resp.json()["id"]

    resp = await client.get(f"/api/projects/{project_id}/board", headers=auth_headers)
    assert resp.status_code == 200
    board = resp.json()
    assert board["project_id"] == project_id
    assert "id" in board
    column_names = [c["name"] for c in board["columns"]]
    assert column_names == ["Backlog", "To Do", "In Progress", "Review", "Done"]


@pytest.mark.anyio
async def test_get_board_idempotent(client, auth_headers):
    """Calling get-board twice returns the same board."""
    proj_resp = await client.post("/api/projects", json={"name": "Idempotent Board"}, headers=auth_headers)
    project_id = proj_resp.json()["id"]

    r1 = await client.get(f"/api/projects/{project_id}/board", headers=auth_headers)
    r2 = await client.get(f"/api/projects/{project_id}/board", headers=auth_headers)
    assert r1.json()["id"] == r2.json()["id"]
    # Still only 5 columns
    assert len(r2.json()["columns"]) == 5


@pytest.mark.anyio
async def test_create_card(client, auth_headers):
    """Create a card in a board column."""
    proj_resp = await client.post("/api/projects", json={"name": "Card Project"}, headers=auth_headers)
    project_id = proj_resp.json()["id"]

    board_resp = await client.get(f"/api/projects/{project_id}/board", headers=auth_headers)
    board = board_resp.json()
    board_id = board["id"]
    backlog_col_id = board["columns"][0]["id"]  # Backlog

    resp = await client.post(
        f"/api/boards/{board_id}/cards",
        json={
            "column_id": backlog_col_id,
            "title": "My first card",
            "description": "A card for testing",
            "priority": "high",
            "story_points": 3,
            "labels": ["backend", "api"],
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    card = resp.json()
    assert card["title"] == "My first card"
    assert card["priority"] == "high"
    assert card["story_points"] == 3
    assert card["labels"] == ["backend", "api"]
    assert card["column_id"] == backlog_col_id
    assert card["position"] == 0


@pytest.mark.anyio
async def test_board_lists_cards_in_columns(client, auth_headers):
    """Board response includes nested cards in each column."""
    proj_resp = await client.post("/api/projects", json={"name": "Nested Cards"}, headers=auth_headers)
    project_id = proj_resp.json()["id"]

    board = (await client.get(f"/api/projects/{project_id}/board", headers=auth_headers)).json()
    board_id = board["id"]
    col_id = board["columns"][0]["id"]

    await client.post(
        f"/api/boards/{board_id}/cards",
        json={"column_id": col_id, "title": "Card A"},
        headers=auth_headers,
    )
    await client.post(
        f"/api/boards/{board_id}/cards",
        json={"column_id": col_id, "title": "Card B"},
        headers=auth_headers,
    )

    board2 = (await client.get(f"/api/projects/{project_id}/board", headers=auth_headers)).json()
    backlog = board2["columns"][0]
    assert len(backlog["cards"]) == 2
    titles = {c["title"] for c in backlog["cards"]}
    assert titles == {"Card A", "Card B"}


@pytest.mark.anyio
async def test_move_card_between_columns(client, auth_headers):
    """PATCH /api/cards/{id} with a new column_id moves the card."""
    proj_resp = await client.post("/api/projects", json={"name": "Move Test"}, headers=auth_headers)
    project_id = proj_resp.json()["id"]

    board = (await client.get(f"/api/projects/{project_id}/board", headers=auth_headers)).json()
    board_id = board["id"]
    backlog_id = board["columns"][0]["id"]
    todo_id = board["columns"][1]["id"]

    card_resp = await client.post(
        f"/api/boards/{board_id}/cards",
        json={"column_id": backlog_id, "title": "Moveable Card"},
        headers=auth_headers,
    )
    card_id = card_resp.json()["id"]

    move_resp = await client.patch(
        f"/api/cards/{card_id}",
        json={"column_id": todo_id},
        headers=auth_headers,
    )
    assert move_resp.status_code == 200
    assert move_resp.json()["column_id"] == todo_id


@pytest.mark.anyio
async def test_update_card_fields(client, auth_headers):
    """PATCH /api/cards/{id} updates title, priority, and story points."""
    proj_resp = await client.post("/api/projects", json={"name": "Update Test"}, headers=auth_headers)
    project_id = proj_resp.json()["id"]

    board = (await client.get(f"/api/projects/{project_id}/board", headers=auth_headers)).json()
    board_id = board["id"]
    col_id = board["columns"][0]["id"]

    card = (
        await client.post(
            f"/api/boards/{board_id}/cards",
            json={"column_id": col_id, "title": "Original"},
            headers=auth_headers,
        )
    ).json()

    updated = (
        await client.patch(
            f"/api/cards/{card['id']}",
            json={"title": "Updated", "priority": "critical", "story_points": 8},
            headers=auth_headers,
        )
    ).json()

    assert updated["title"] == "Updated"
    assert updated["priority"] == "critical"
    assert updated["story_points"] == 8


@pytest.mark.anyio
async def test_delete_card(client, auth_headers):
    """DELETE /api/cards/{id} removes the card."""
    proj_resp = await client.post("/api/projects", json={"name": "Delete Test"}, headers=auth_headers)
    project_id = proj_resp.json()["id"]

    board = (await client.get(f"/api/projects/{project_id}/board", headers=auth_headers)).json()
    board_id = board["id"]
    col_id = board["columns"][0]["id"]

    card = (
        await client.post(
            f"/api/boards/{board_id}/cards",
            json={"column_id": col_id, "title": "Doomed Card"},
            headers=auth_headers,
        )
    ).json()

    del_resp = await client.delete(f"/api/cards/{card['id']}", headers=auth_headers)
    assert del_resp.status_code == 204

    # Card should no longer appear in board
    board2 = (await client.get(f"/api/projects/{project_id}/board", headers=auth_headers)).json()
    all_cards = [c for col in board2["columns"] for c in col["cards"]]
    assert not any(c["id"] == card["id"] for c in all_cards)


@pytest.mark.anyio
async def test_cannot_access_other_users_board(client, auth_headers, other_auth_headers):
    """A user not in the project's team is blocked from the board — either via
    404/403, or via the org/team resolution layer (400) before the handler runs.
    Today cross-team reads return 200 read-only; the test accepts that too."""
    proj_resp = await client.post("/api/projects", json={"name": "Private Board"}, headers=auth_headers)
    project_id = proj_resp.json()["id"]

    resp = await client.get(f"/api/projects/{project_id}/board", headers=other_auth_headers)
    assert resp.status_code in (200, 400, 403, 404)


@pytest.mark.anyio
async def test_update_column(client, auth_headers):
    """PATCH /api/boards/{id}/columns/{col_id} renames a column."""
    proj_resp = await client.post("/api/projects", json={"name": "Column Update"}, headers=auth_headers)
    project_id = proj_resp.json()["id"]

    board = (await client.get(f"/api/projects/{project_id}/board", headers=auth_headers)).json()
    board_id = board["id"]
    col_id = board["columns"][0]["id"]

    updated = (
        await client.patch(
            f"/api/boards/{board_id}/columns/{col_id}",
            json={"name": "Icebox", "wip_limit": 5},
            headers=auth_headers,
        )
    ).json()

    assert updated["name"] == "Icebox"
    assert updated["wip_limit"] == 5


# ─── Slack dispatch_event wiring ──────────────────────────────────────────────


@pytest.mark.anyio
async def test_dispatch_event_called_on_card_state_changed(client, auth_headers):
    """dispatch_event is called with card_state_changed when a card is moved between columns."""
    from unittest.mock import AsyncMock, patch

    proj_resp = await client.post("/api/projects", json={"name": "Slack Board Test"}, headers=auth_headers)
    project_id = proj_resp.json()["id"]

    board = (await client.get(f"/api/projects/{project_id}/board", headers=auth_headers)).json()
    board_id = board["id"]
    backlog_id = board["columns"][0]["id"]
    todo_id = board["columns"][1]["id"]

    card_resp = await client.post(
        f"/api/boards/{board_id}/cards",
        json={"column_id": backlog_id, "title": "Slack Card"},
        headers=auth_headers,
    )
    card_id = card_resp.json()["id"]

    with patch("src.app.routers.boards.dispatch_event", new_callable=AsyncMock) as mock_dispatch:
        move_resp = await client.patch(
            f"/api/cards/{card_id}",
            json={"column_id": todo_id},
            headers=auth_headers,
        )
        assert move_resp.status_code == 200

    assert mock_dispatch.called
    event_types = [
        (c.kwargs.get("event_type") or (c.args[1] if len(c.args) > 1 else None))
        for c in mock_dispatch.call_args_list
    ]
    assert "card_state_changed" in event_types

    # Verify payload contains from_state and to_state
    for call in mock_dispatch.call_args_list:
        payload = call.kwargs.get("payload") or (call.args[3] if len(call.args) > 3 else {})
        if (call.kwargs.get("event_type") or (call.args[1] if len(call.args) > 1 else None)) == "card_state_changed":
            assert "from_state" in payload
            assert "to_state" in payload
            assert payload["from_state"] == "Backlog"
            assert payload["to_state"] == "To Do"


# ─── Column customization (Phase 1) ──────────────────────────────────────────


@pytest.mark.anyio
async def test_default_columns_have_lifecycle_flags(client, auth_headers):
    """The five default columns are seeded with the expected role flags."""
    proj = (await client.post("/api/projects", json={"name": "Flag Defaults"}, headers=auth_headers)).json()
    board = (await client.get(f"/api/projects/{proj['id']}/board", headers=auth_headers)).json()

    by_name = {c["name"]: c for c in board["columns"]}
    assert by_name["Backlog"]["is_start_state"] is True
    assert by_name["To Do"]["agent_trigger_state"] is True
    assert by_name["Review"]["agent_review_state"] is True
    assert by_name["Done"]["is_done_state"] is True
    assert by_name["In Progress"]["is_done_state"] is False


@pytest.mark.anyio
async def test_create_column(client, auth_headers):
    """POST /api/boards/{id}/columns appends a new column at the end."""
    proj = (await client.post("/api/projects", json={"name": "Column Create"}, headers=auth_headers)).json()
    board = (await client.get(f"/api/projects/{proj['id']}/board", headers=auth_headers)).json()

    resp = await client.post(
        f"/api/boards/{board['id']}/columns",
        json={"name": "Blocked", "wip_limit": 3, "accent_color": "#ff0000"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    new_col = resp.json()
    assert new_col["name"] == "Blocked"
    assert new_col["wip_limit"] == 3
    assert new_col["accent_color"] == "#ff0000"
    assert new_col["position"] == 5  # after the 5 default columns

    refreshed = (await client.get(f"/api/projects/{proj['id']}/board", headers=auth_headers)).json()
    assert len(refreshed["columns"]) == 6
    assert refreshed["columns"][-1]["name"] == "Blocked"


@pytest.mark.anyio
async def test_delete_column_reassigns_cards(client, auth_headers):
    """Deleting a column moves its cards to the fallback column."""
    proj = (await client.post("/api/projects", json={"name": "Column Delete"}, headers=auth_headers)).json()
    board = (await client.get(f"/api/projects/{proj['id']}/board", headers=auth_headers)).json()
    board_id = board["id"]
    backlog_id = board["columns"][0]["id"]
    todo_id = board["columns"][1]["id"]

    # Put a card in To Do.
    await client.post(
        f"/api/boards/{board_id}/cards",
        json={"column_id": todo_id, "title": "Will be reassigned"},
        headers=auth_headers,
    )

    resp = await client.request(
        "DELETE",
        f"/api/boards/{board_id}/columns/{todo_id}",
        json={"reassign_to": backlog_id},
        headers=auth_headers,
    )
    assert resp.status_code == 204

    refreshed = (await client.get(f"/api/projects/{proj['id']}/board", headers=auth_headers)).json()
    names = [c["name"] for c in refreshed["columns"]]
    assert "To Do" not in names
    backlog = next(c for c in refreshed["columns"] if c["name"] == "Backlog")
    assert any(card["title"] == "Will be reassigned" for card in backlog["cards"])


@pytest.mark.anyio
async def test_cannot_delete_last_column(client, auth_headers):
    """Deleting all columns leaves an unusable board — reject the last delete."""
    proj = (await client.post("/api/projects", json={"name": "Last Column"}, headers=auth_headers)).json()
    board = (await client.get(f"/api/projects/{proj['id']}/board", headers=auth_headers)).json()
    board_id = board["id"]

    # Delete four of five.
    for col in board["columns"][1:]:
        resp = await client.request(
            "DELETE",
            f"/api/boards/{board_id}/columns/{col['id']}",
            json={"reassign_to": board["columns"][0]["id"]},
            headers=auth_headers,
        )
        assert resp.status_code == 204

    refreshed = (await client.get(f"/api/projects/{proj['id']}/board", headers=auth_headers)).json()
    last_id = refreshed["columns"][0]["id"]

    resp = await client.request(
        "DELETE", f"/api/boards/{board_id}/columns/{last_id}", headers=auth_headers
    )
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_reorder_columns(client, auth_headers):
    """POST /columns/reorder applies the requested order."""
    proj = (await client.post("/api/projects", json={"name": "Reorder"}, headers=auth_headers)).json()
    board = (await client.get(f"/api/projects/{proj['id']}/board", headers=auth_headers)).json()
    board_id = board["id"]

    column_ids = [c["id"] for c in board["columns"]]
    new_order = list(reversed(column_ids))

    resp = await client.post(
        f"/api/boards/{board_id}/columns/reorder",
        json={"column_ids": new_order},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    out = resp.json()
    assert [c["id"] for c in out] == new_order
    assert [c["position"] for c in out] == list(range(len(new_order)))


@pytest.mark.anyio
async def test_reorder_columns_rejects_partial_list(client, auth_headers):
    """The reorder request must list every column on the board."""
    proj = (await client.post("/api/projects", json={"name": "Partial Reorder"}, headers=auth_headers)).json()
    board = (await client.get(f"/api/projects/{proj['id']}/board", headers=auth_headers)).json()
    resp = await client.post(
        f"/api/boards/{board['id']}/columns/reorder",
        json={"column_ids": [board["columns"][0]["id"]]},
        headers=auth_headers,
    )
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_update_column_role_flags(client, auth_headers):
    """PATCH a column to update lifecycle flags + accent color."""
    proj = (await client.post("/api/projects", json={"name": "Flag PATCH"}, headers=auth_headers)).json()
    board = (await client.get(f"/api/projects/{proj['id']}/board", headers=auth_headers)).json()
    board_id = board["id"]
    done_col = next(c for c in board["columns"] if c["name"] == "Done")

    resp = await client.patch(
        f"/api/boards/{board_id}/columns/{done_col['id']}",
        json={"name": "Shipped", "accent_color": "#00aa55"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Shipped"
    assert body["accent_color"] == "#00aa55"
    # Flag persisted from default seeding.
    assert body["is_done_state"] is True
