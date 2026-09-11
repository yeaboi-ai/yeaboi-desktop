"""Tests for /api/sessions/{id}/attachments — the screenshots a project carries."""

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


def _png(width: int = 12, height: int = 7) -> bytes:
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (width, height), "teal").save(buf, format="PNG")
    return buf.getvalue()


async def _project(client, headers, name="Shots") -> str:
    return (await client.post("/api/sessions", json={"name": name}, headers=headers)).json()["id"]


async def _upload(client, headers, session_id, name="login.png", data=None, mime="image/png"):
    files = {"file": (name, io.BytesIO(data if data is not None else _png()), mime)}
    return await client.post(f"/api/sessions/{session_id}/attachments", files=files, headers=headers)


async def test_upload_lists_and_shows_on_the_detail(client, auth_headers, upload_dir):
    session_id = await _project(client, auth_headers)
    resp = await _upload(client, auth_headers, session_id)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["filename"] == "login.png" and body["mime_type"] == "image/png"
    assert (body["width"], body["height"]) == (12, 7)
    assert body["url"].startswith("/uploads/projects/") and body["url"].endswith(".png")
    assert (upload_dir / body["url"].removeprefix("/uploads/")).exists()
    assert set(body) == {"id", "filename", "mime_type", "size_bytes", "width", "height", "url", "created_at"}

    second = (await _upload(client, auth_headers, session_id, name="dash.png")).json()
    listed = (await client.get(f"/api/sessions/{session_id}/attachments", headers=auth_headers)).json()
    # Both are there, and both endpoints agree on the order. Which order that is
    # cannot be asserted here: SQLite's CURRENT_TIMESTAMP has one-second
    # resolution, so two uploads in the same second tie and fall through to the
    # uuid tiebreak. Postgres timestamps them apart.
    assert {a["id"] for a in listed} == {body["id"], second["id"]}

    detail = (await client.get(f"/api/sessions/{session_id}", headers=auth_headers)).json()
    assert [a["id"] for a in detail["attachments"]] == [a["id"] for a in listed]


@pytest.mark.parametrize(
    ("name", "data", "mime", "status"),
    [
        ("note.txt", b"hello", "text/plain", 400),
        ("shot.png", b"not really a png", "image/png", 400),
        ("shot.png", b"", "image/png", 400),
        ("shot.bin", None, "image/png", 400),
        ("shot.png", None, "application/octet-stream", 400),
    ],
)
async def test_only_readable_images_are_accepted(client, auth_headers, upload_dir, name, data, mime, status):
    session_id = await _project(client, auth_headers)
    resp = await _upload(client, auth_headers, session_id, name=name, data=data, mime=mime)
    assert resp.status_code == status, resp.text


async def test_oversize_is_413(client, auth_headers, upload_dir, monkeypatch):
    from src.app.routers import session_attachments

    monkeypatch.setattr(session_attachments, "MAX_FILE_SIZE", 100)
    session_id = await _project(client, auth_headers)
    resp = await _upload(client, auth_headers, session_id, data=_png(64, 64))
    assert resp.status_code == 413


async def test_delete_by_uploader_removes_the_file(client, auth_headers, upload_dir):
    session_id = await _project(client, auth_headers)
    body = (await _upload(client, auth_headers, session_id)).json()
    path = upload_dir / body["url"].removeprefix("/uploads/")
    resp = await client.delete(f"/api/sessions/{session_id}/attachments/{body['id']}", headers=auth_headers)
    assert resp.status_code == 204
    assert not path.exists()
    assert (await client.get(f"/api/sessions/{session_id}/attachments", headers=auth_headers)).json() == []
    resp = await client.delete(f"/api/sessions/{session_id}/attachments/{body['id']}", headers=auth_headers)
    assert resp.status_code == 404


async def test_a_teammate_may_add_but_not_remove_anothers_shot(
    client, auth_headers, other_auth_headers, db_session, upload_dir
):
    from sqlalchemy import select

    from src.app.models.organization import OrgMember, TeamMember
    from src.app.models.session import Session
    from src.app.models.user import User

    session_id = await _project(client, auth_headers)
    project = (await db_session.execute(select(Session).where(Session.id == session_id))).scalar_one()
    await client.get("/api/me", headers=other_auth_headers)
    other = (await db_session.execute(select(User).where(User.email == "other@example.com"))).scalar_one()
    db_session.add(OrgMember(org_id=project.org_id, user_id=other.id, role="member"))
    db_session.add(TeamMember(team_id=project.team_id, user_id=other.id, role="member"))
    await db_session.commit()

    owners = (await _upload(client, auth_headers, session_id, name="owner.png")).json()
    theirs = (await _upload(client, other_auth_headers, session_id, name="theirs.png")).json()

    resp = await client.delete(f"/api/sessions/{session_id}/attachments/{owners['id']}", headers=other_auth_headers)
    assert resp.status_code == 403
    # The uploader removes their own; the project owner removes anyone's.
    assert (
        await client.delete(f"/api/sessions/{session_id}/attachments/{theirs['id']}", headers=other_auth_headers)
    ).status_code == 204
    theirs = (await _upload(client, other_auth_headers, session_id, name="again.png")).json()
    assert (
        await client.delete(f"/api/sessions/{session_id}/attachments/{theirs['id']}", headers=auth_headers)
    ).status_code == 204


async def test_cross_org_is_403_and_unknown_is_404(client, auth_headers, other_auth_headers, db_session, upload_dir):
    from sqlalchemy import select

    from src.app.models.organization import Organization, OrgMember
    from src.app.models.user import User

    session_id = await _project(client, auth_headers)
    await client.get("/api/me", headers=other_auth_headers)
    other = (await db_session.execute(select(User).where(User.email == "other@example.com"))).scalar_one()
    org = Organization(name="Elsewhere", slug="elsewhere")
    db_session.add(org)
    await db_session.flush()
    db_session.add(OrgMember(org_id=org.id, user_id=other.id, role="admin"))
    await db_session.commit()

    headers = {**other_auth_headers, "X-Org-Id": org.id}
    assert (await _upload(client, headers, session_id)).status_code == 403
    assert (await client.get(f"/api/sessions/{session_id}/attachments", headers=headers)).status_code == 403
    assert (await _upload(client, auth_headers, "nope")).status_code == 404


async def test_deleting_the_project_removes_rows_and_files(client, auth_headers, db_session, upload_dir):
    from sqlalchemy import select

    from src.app.models.session_attachment import SessionAttachment

    session_id = await _project(client, auth_headers)
    body = (await _upload(client, auth_headers, session_id)).json()
    path = upload_dir / body["url"].removeprefix("/uploads/")
    assert path.exists()

    resp = await client.delete(f"/api/sessions/{session_id}", headers=auth_headers)
    assert resp.status_code == 204, resp.text
    assert not path.exists()
    rows = (
        (await db_session.execute(select(SessionAttachment).where(SessionAttachment.session_id == session_id)))
        .scalars()
        .all()
    )
    assert rows == []
