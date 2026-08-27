"""Tests for /api/me — profile read + update + avatar."""

import io
import os
from pathlib import Path

import pytest
from PIL import Image

ME_URL = "/api/me"
AVATAR_URL = "/api/me/avatar"
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "/tmp/planning-platform-uploads"))
AVATAR_DIR = UPLOAD_DIR / "avatars"


def _make_png_bytes(size=(64, 64), color=(255, 0, 0)) -> bytes:
    img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.mark.anyio
async def test_get_me_returns_profile_fields(client, auth_headers):
    resp = await client.get(ME_URL, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    # New fields should be present and null for a fresh user
    for field in (
        "pronouns",
        "job_title",
        "bio",
        "timezone",
        "onboarded_at",
        "tour_completed_at",
        "intended_use",
    ):
        assert field in data
        assert data[field] is None


@pytest.mark.anyio
async def test_patch_me_auto_stamps_onboarded_at_on_first_display_name(client, auth_headers):
    """Setting display_name for the first time finishes onboarding server-side
    — the client cannot send onboarded_at directly (it was a footgun: a
    null write would trap the user in an infinite onboarding loop)."""
    resp = await client.patch(
        ME_URL, json={"display_name": "Sam"}, headers=auth_headers
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["display_name"] == "Sam"
    assert body["onboarded_at"] is not None  # Server stamped it


@pytest.mark.anyio
async def test_patch_me_onboarded_at_is_idempotent_on_rename(client, auth_headers):
    """Renaming an already-onboarded user must NOT re-stamp onboarded_at.
    Otherwise the timestamp would drift and lose its meaning as the moment
    the user finished onboarding."""
    first = await client.patch(
        ME_URL, json={"display_name": "Sam"}, headers=auth_headers
    )
    assert first.status_code == 200
    first_stamp = first.json()["onboarded_at"]
    assert first_stamp is not None

    second = await client.patch(
        ME_URL, json={"display_name": "Samantha"}, headers=auth_headers
    )
    assert second.status_code == 200
    assert second.json()["onboarded_at"] == first_stamp


@pytest.mark.anyio
async def test_patch_me_ignores_client_sent_onboarded_at(client, auth_headers):
    """Even if the client sneaks `onboarded_at` into the body, the schema
    rejects/strips it — the server is the only writer."""
    resp = await client.patch(
        ME_URL,
        json={"display_name": "Sam", "onboarded_at": None},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["onboarded_at"] is not None  # Auto-stamped, not nulled


@pytest.mark.anyio
async def test_tour_complete_stamps_once(client, auth_headers):
    """POST /api/me/tour-complete is a one-way flip. Calling it stamps the
    timestamp; calling it again is a no-op (no re-stamping)."""
    first = await client.post("/api/me/tour-complete", headers=auth_headers)
    assert first.status_code == 200
    first_stamp = first.json()["tour_completed_at"]
    assert first_stamp is not None

    second = await client.post("/api/me/tour-complete", headers=auth_headers)
    assert second.status_code == 200
    assert second.json()["tour_completed_at"] == first_stamp


@pytest.mark.anyio
async def test_tour_complete_requires_auth(client):
    resp = await client.post("/api/me/tour-complete")
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_patch_me_sets_intended_use(client, auth_headers):
    resp = await client.patch(
        ME_URL, json={"intended_use": "Plan a side project"}, headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json()["intended_use"] == "Plan a side project"


@pytest.mark.anyio
async def test_patch_me_rejects_overlong_intended_use(client, auth_headers):
    resp = await client.patch(
        ME_URL, json={"intended_use": "x" * 501}, headers=auth_headers
    )
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_patch_me_updates_display_name(client, auth_headers):
    resp = await client.patch(ME_URL, json={"display_name": "Updated Name"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["display_name"] == "Updated Name"


@pytest.mark.anyio
async def test_patch_me_updates_pronouns(client, auth_headers):
    resp = await client.patch(ME_URL, json={"pronouns": "they/them"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["pronouns"] == "they/them"


@pytest.mark.anyio
async def test_patch_me_updates_job_title(client, auth_headers):
    resp = await client.patch(ME_URL, json={"job_title": "Senior Engineer"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["job_title"] == "Senior Engineer"


@pytest.mark.anyio
async def test_patch_me_updates_bio(client, auth_headers):
    resp = await client.patch(ME_URL, json={"bio": "Building things"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["bio"] == "Building things"


@pytest.mark.anyio
async def test_patch_me_updates_timezone(client, auth_headers):
    resp = await client.patch(ME_URL, json={"timezone": "America/New_York"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["timezone"] == "America/New_York"


@pytest.mark.anyio
async def test_patch_me_rejects_invalid_timezone(client, auth_headers):
    resp = await client.patch(ME_URL, json={"timezone": "Mars/Olympus"}, headers=auth_headers)
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_patch_me_rejects_overlong_bio(client, auth_headers):
    long_bio = "x" * 281
    resp = await client.patch(ME_URL, json={"bio": long_bio}, headers=auth_headers)
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_patch_me_rejects_overlong_pronouns(client, auth_headers):
    resp = await client.patch(ME_URL, json={"pronouns": "x" * 41}, headers=auth_headers)
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_patch_me_empty_string_collapses_to_null(client, auth_headers):
    # Set a value, then clear it with empty string
    await client.patch(ME_URL, json={"pronouns": "they/them"}, headers=auth_headers)
    resp = await client.patch(ME_URL, json={"pronouns": "   "}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["pronouns"] is None


@pytest.mark.anyio
async def test_patch_me_partial_update_does_not_clear_other_fields(client, auth_headers):
    # Set two fields, then update only one — the other should survive
    await client.patch(
        ME_URL,
        json={"pronouns": "she/her", "job_title": "Designer"},
        headers=auth_headers,
    )
    resp = await client.patch(ME_URL, json={"job_title": "Director of Design"}, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["pronouns"] == "she/her"
    assert data["job_title"] == "Director of Design"


@pytest.mark.anyio
async def test_patch_me_empty_timezone_clears_field(client, auth_headers):
    await client.patch(ME_URL, json={"timezone": "Europe/London"}, headers=auth_headers)
    resp = await client.patch(ME_URL, json={"timezone": ""}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["timezone"] is None


# ─── Avatar upload ────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_upload_avatar_valid_png(client, auth_headers):
    files = {"file": ("avatar.png", _make_png_bytes(), "image/png")}
    resp = await client.post(AVATAR_URL, files=files, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["avatar_url"] is not None
    assert data["avatar_url"].startswith("/uploads/avatars/")
    # File should exist on disk
    filename = data["avatar_url"].split("/")[-1]
    assert (AVATAR_DIR / filename).exists()


@pytest.mark.anyio
async def test_upload_avatar_valid_jpeg(client, auth_headers):
    img = Image.new("RGB", (32, 32), (0, 255, 0))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    files = {"file": ("avatar.jpg", buf.getvalue(), "image/jpeg")}
    resp = await client.post(AVATAR_URL, files=files, headers=auth_headers)
    assert resp.status_code == 200
    # Output is always PNG
    assert resp.json()["avatar_url"].endswith(".png")


@pytest.mark.anyio
async def test_upload_avatar_rejects_wrong_content_type(client, auth_headers):
    files = {"file": ("avatar.svg", b"<svg></svg>", "image/svg+xml")}
    resp = await client.post(AVATAR_URL, files=files, headers=auth_headers)
    assert resp.status_code == 415


@pytest.mark.anyio
async def test_upload_avatar_rejects_oversize(client, auth_headers):
    # Build a >5MB blob with an image/png content type
    payload = b"\x89PNG\r\n\x1a\n" + b"\x00" * (5 * 1024 * 1024 + 100)
    files = {"file": ("avatar.png", payload, "image/png")}
    resp = await client.post(AVATAR_URL, files=files, headers=auth_headers)
    assert resp.status_code == 413


@pytest.mark.anyio
async def test_upload_avatar_rejects_bogus_image_data(client, auth_headers):
    files = {"file": ("avatar.png", b"not an image", "image/png")}
    resp = await client.post(AVATAR_URL, files=files, headers=auth_headers)
    assert resp.status_code == 415


@pytest.mark.anyio
async def test_upload_avatar_replacement_deletes_previous_file(client, auth_headers):
    first = await client.post(
        AVATAR_URL,
        files={"file": ("a.png", _make_png_bytes(), "image/png")},
        headers=auth_headers,
    )
    assert first.status_code == 200
    first_filename = first.json()["avatar_url"].split("/")[-1]
    first_path = AVATAR_DIR / first_filename
    assert first_path.exists()

    second = await client.post(
        AVATAR_URL,
        files={"file": ("b.png", _make_png_bytes(color=(0, 0, 255)), "image/png")},
        headers=auth_headers,
    )
    assert second.status_code == 200
    second_filename = second.json()["avatar_url"].split("/")[-1]
    assert second_filename != first_filename
    # Previous file is gone
    assert not first_path.exists()
    # New file is on disk
    assert (AVATAR_DIR / second_filename).exists()


@pytest.mark.anyio
async def test_delete_avatar_clears_url_and_removes_file(client, auth_headers):
    upload = await client.post(
        AVATAR_URL,
        files={"file": ("a.png", _make_png_bytes(), "image/png")},
        headers=auth_headers,
    )
    assert upload.status_code == 200
    filename = upload.json()["avatar_url"].split("/")[-1]
    path = AVATAR_DIR / filename
    assert path.exists()

    resp = await client.delete(AVATAR_URL, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["avatar_url"] is None
    assert not path.exists()


@pytest.mark.anyio
async def test_delete_avatar_when_none_set_is_noop(client, auth_headers):
    # Fresh user has no avatar — DELETE should still succeed
    resp = await client.delete(AVATAR_URL, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["avatar_url"] is None


@pytest.mark.anyio
async def test_upload_avatar_output_is_256x256(client, auth_headers):
    # Send a non-square image, expect center-cropped 256x256 output
    img = Image.new("RGB", (640, 320), (255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    resp = await client.post(
        AVATAR_URL,
        files={"file": ("wide.png", buf.getvalue(), "image/png")},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    filename = resp.json()["avatar_url"].split("/")[-1]
    saved = Image.open(AVATAR_DIR / filename)
    assert saved.size == (256, 256)
