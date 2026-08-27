"""Tests for /api/cards/{id}/attachments — upload, list, delete via the storage abstraction."""

import io

import pytest


@pytest.fixture
def upload_dir(tmp_path, monkeypatch):
    """Point storage at a per-test temp dir and reset the singleton."""
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    monkeypatch.setenv("ATTACHMENT_BACKEND", "local")

    from src.app.config import get_settings
    from src.app.services import attachment_storage

    get_settings.cache_clear()
    attachment_storage.reset_storage_for_tests()
    yield tmp_path
    attachment_storage.reset_storage_for_tests()
    get_settings.cache_clear()


async def _make_card(client, auth_headers, name: str = "Attach Project") -> dict:
    proj = (await client.post("/api/projects", json={"name": name}, headers=auth_headers)).json()
    board = (await client.get(f"/api/projects/{proj['id']}/board", headers=auth_headers)).json()
    backlog = board["columns"][0]["id"]
    card = (
        await client.post(
            f"/api/boards/{board['id']}/cards",
            json={"column_id": backlog, "title": "Has attachment"},
            headers=auth_headers,
        )
    ).json()
    return {"project": proj, "board": board, "card": card}


@pytest.mark.anyio
async def test_upload_and_list(client, auth_headers, upload_dir):
    ctx = await _make_card(client, auth_headers, "Upload happy")
    card_id = ctx["card"]["id"]
    files = {"file": ("note.txt", io.BytesIO(b"hello world"), "text/plain")}
    resp = await client.post(
        f"/api/cards/{card_id}/attachments", files=files, headers=auth_headers
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["filename"] == "note.txt"
    assert body["mime_type"] == "text/plain"
    assert body["size_bytes"] == 11
    assert body["url"].startswith("/uploads/")

    listed = (
        await client.get(f"/api/cards/{card_id}/attachments", headers=auth_headers)
    ).json()
    assert len(listed) == 1
    assert listed[0]["id"] == body["id"]


@pytest.mark.anyio
async def test_upload_unsupported_mime(client, auth_headers, upload_dir):
    ctx = await _make_card(client, auth_headers, "Upload bad")
    card_id = ctx["card"]["id"]
    files = {"file": ("bad.exe", io.BytesIO(b"x"), "application/octet-stream")}
    resp = await client.post(
        f"/api/cards/{card_id}/attachments", files=files, headers=auth_headers
    )
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_upload_oversize(client, auth_headers, upload_dir, monkeypatch):
    ctx = await _make_card(client, auth_headers, "Upload big")
    card_id = ctx["card"]["id"]

    from src.app.routers import card_attachments

    monkeypatch.setattr(card_attachments, "MAX_FILE_SIZE", 16)

    files = {"file": ("x.txt", io.BytesIO(b"too many bytes here"), "text/plain")}
    resp = await client.post(
        f"/api/cards/{card_id}/attachments", files=files, headers=auth_headers
    )
    assert resp.status_code == 413


@pytest.mark.anyio
async def test_delete_only_uploader(client, auth_headers, other_auth_headers, upload_dir):
    ctx = await _make_card(client, auth_headers, "Delete auth")
    card_id = ctx["card"]["id"]
    files = {"file": ("note.txt", io.BytesIO(b"x"), "text/plain")}
    a = (
        await client.post(
            f"/api/cards/{card_id}/attachments", files=files, headers=auth_headers
        )
    ).json()

    # Other user attempts delete — any 4xx indicates rejection (the org-deps
    # layer can produce 400/401/403 depending on whether the other user has any
    # org membership of their own).
    resp = await client.delete(
        f"/api/cards/{card_id}/attachments/{a['id']}", headers=other_auth_headers
    )
    assert 400 <= resp.status_code < 500

    # Original uploader succeeds.
    resp = await client.delete(
        f"/api/cards/{card_id}/attachments/{a['id']}", headers=auth_headers
    )
    assert resp.status_code == 204

    listed = (
        await client.get(f"/api/cards/{card_id}/attachments", headers=auth_headers)
    ).json()
    assert listed == []


@pytest.mark.anyio
async def test_unknown_card_404(client, auth_headers, upload_dir):
    files = {"file": ("note.txt", io.BytesIO(b"x"), "text/plain")}
    resp = await client.post(
        "/api/cards/00000000-0000-0000-0000-000000000000/attachments",
        files=files,
        headers=auth_headers,
    )
    assert resp.status_code == 404
