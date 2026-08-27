"""Tests for the org-branding endpoints.

Covers: GET/PUT brand auth + admin gating, generate (Claude mocked), apply
(creates org-shared theme + sets org default + saves brand metadata
atomically), logo upload validation.
"""

from __future__ import annotations

import io
import json
from unittest.mock import AsyncMock, patch

import jwt
import pytest
from sqlalchemy import select

from src.app.models.brand import OrgBrand
from src.app.models.organization import Organization, OrgMember
from src.app.models.theme import OrgTheme, ThemePreset
from src.app.models.user import User

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _email_from_headers(auth_headers: dict[str, str]) -> str:
    token = auth_headers["Authorization"].removeprefix("Bearer ")
    payload = jwt.decode(token, options={"verify_signature": False})
    return payload["email"]


async def _ensure_user(client, auth_headers, db_session) -> User:
    await client.get("/api/me", headers=auth_headers)
    email = _email_from_headers(auth_headers)
    result = await db_session.execute(select(User).where(User.email == email))
    return result.scalar_one()


async def _make_org(db_session, user: User, role: str = "admin") -> Organization:
    existing = (
        await db_session.execute(select(OrgMember).where(OrgMember.user_id == user.id))
    ).scalar_one_or_none()
    if existing:
        org = (
            await db_session.execute(select(Organization).where(Organization.id == existing.org_id))
        ).scalar_one()
        if existing.role != role:
            existing.role = role
            await db_session.commit()
        return org
    org = Organization(name="Brand Test Org", slug=f"brand-{user.id[:8]}")
    db_session.add(org)
    await db_session.flush()
    db_session.add(OrgMember(org_id=org.id, user_id=user.id, role=role))
    await db_session.commit()
    await db_session.refresh(org)
    return org


def _fake_brand_json() -> dict:
    """Mock JSON the Claude model would return for a brand prompt."""
    return {
        "app_name": "Youlend",
        "tagline": "Cash flow finance for SMBs",
        "color_scheme": "light",
        "reasoning": "Youlend uses a deep blue palette anchored on trust and clarity.",
        "tokens": {
            "background": "#ffffff",
            "foreground": "#0a1628",
            "primary": "#0a3a8c",
            "primary-foreground": "#ffffff",
        },
    }


def _apply_body(
    *,
    name: str | None = None,
    app_name: str = "Acme",
    color_scheme: str = "light",
    primary: str = "#0a3a8c",
    theme_name: str = "Acme brand",
) -> dict:
    return {
        "name": name,
        "app_name": app_name,
        "tagline": f"{app_name} tagline",
        "logo_url": f"/uploads/{app_name.lower()}.png",
        "favicon_url": f"https://{app_name.lower()}.example/favicon.ico",
        "source_url": f"https://{app_name.lower()}.example",
        "theme_name": theme_name,
        "theme": {
            "version": 1,
            "name": app_name,
            "base_preset": f"preset:{color_scheme}",
            "color_scheme": color_scheme,
            "tokens": {
                "background": "#ffffff" if color_scheme == "light" else "#0a0a0a",
                "foreground": "#0a1628" if color_scheme == "light" else "#f0f0f0",
                "primary": primary,
                "primary-foreground": "#ffffff",
            },
        },
    }


# ---------------------------------------------------------------------------
# GET active brand + list
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_get_brand_returns_empty_when_unset(client, auth_headers, db_session):
    user = await _ensure_user(client, auth_headers, db_session)
    org = await _make_org(db_session, user, role="member")
    r = await client.get(f"/api/orgs/{org.id}/brand", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["org_id"] == org.id
    assert body["app_name"] is None
    assert body["is_active"] is False


@pytest.mark.anyio
async def test_get_brand_unauthenticated(client, db_session):
    org = Organization(name="X", slug="x-anon")
    db_session.add(org)
    await db_session.commit()
    r = await client.get(f"/api/orgs/{org.id}/brand")
    assert r.status_code in (401, 403)


@pytest.mark.anyio
async def test_list_brands_returns_all_with_active_first(client, auth_headers, db_session):
    user = await _ensure_user(client, auth_headers, db_session)
    org = await _make_org(db_session, user, role="admin")

    a = await client.post(
        f"/api/orgs/{org.id}/brand/apply",
        headers=auth_headers,
        json=_apply_body(name="Brand A", app_name="Acme"),
    )
    assert a.status_code == 200
    b = await client.post(
        f"/api/orgs/{org.id}/brand/apply",
        headers=auth_headers,
        json=_apply_body(name="Brand B", app_name="Beta", primary="#ff5500"),
    )
    assert b.status_code == 200

    r = await client.get(f"/api/orgs/{org.id}/brands", headers=auth_headers)
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 2
    # B was applied second → active, listed first
    assert rows[0]["name"] == "Brand B"
    assert rows[0]["is_active"] is True
    assert rows[1]["name"] == "Brand A"
    assert rows[1]["is_active"] is False


# ---------------------------------------------------------------------------
# Generate (mocked Claude)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_generate_brand_admin_only(
    client, auth_headers, other_auth_headers, db_session
):
    admin = await _ensure_user(client, auth_headers, db_session)
    org = await _make_org(db_session, admin, role="admin")
    other = await _ensure_user(client, other_auth_headers, db_session)
    db_session.add(OrgMember(org_id=org.id, user_id=other.id, role="member"))
    await db_session.commit()

    forbidden = await client.post(
        f"/api/orgs/{org.id}/brand/generate",
        headers=other_auth_headers,
        json={"url": "https://youlend.com"},
    )
    assert forbidden.status_code == 403


@pytest.mark.anyio
async def test_generate_brand_returns_suggestion(client, auth_headers, db_session):
    user = await _ensure_user(client, auth_headers, db_session)
    org = await _make_org(db_session, user, role="admin")

    fake_evidence = {
        "url": "https://youlend.com",
        "host": "youlend.com",
        "title": "Youlend - Cash flow finance",
        "site_name": "Youlend",
        "description": "Funding for ambitious SMBs",
        "og_image": "https://youlend.com/og.png",
        "favicon": "https://youlend.com/favicon.ico",
        "color_candidates": ["#0a3a8c", "#1a59c2"],
    }
    fake_response = json.dumps(_fake_brand_json())

    with (
        patch(
            "src.app.services.brand_generator.fetch_brand_evidence",
            new_callable=AsyncMock,
            return_value=fake_evidence,
        ),
        patch(
            "src.app.services.brand_generator.get_ai_client_for_role",
            new_callable=AsyncMock,
        ) as mock_get_client,
    ):
        mock_client = AsyncMock()
        mock_client.chat = AsyncMock(return_value=fake_response)
        mock_get_client.return_value = mock_client

        r = await client.post(
            f"/api/orgs/{org.id}/brand/generate",
            headers=auth_headers,
            json={"url": "https://youlend.com", "color_scheme": "light"},
        )

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["app_name"] == "Youlend"
    assert body["tagline"] == "Cash flow finance for SMBs"
    assert body["theme"]["color_scheme"] == "light"
    # The token map merged with the light preset baseline → all keys present.
    assert body["theme"]["tokens"]["primary"] == "#0a3a8c"
    assert "background" in body["theme"]["tokens"]
    assert body["favicon_url"] == "https://youlend.com/favicon.ico"
    assert body["source_url"] == "https://youlend.com"


@pytest.mark.anyio
async def test_generate_brand_validates_inputs(client, auth_headers, db_session):
    user = await _ensure_user(client, auth_headers, db_session)
    org = await _make_org(db_session, user, role="admin")
    r = await client.post(
        f"/api/orgs/{org.id}/brand/generate",
        headers=auth_headers,
        json={},
    )
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Apply (atomic)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_apply_brand_creates_theme_and_active_row(client, auth_headers, db_session):
    user = await _ensure_user(client, auth_headers, db_session)
    org = await _make_org(db_session, user, role="admin")

    r = await client.post(
        f"/api/orgs/{org.id}/brand/apply",
        headers=auth_headers,
        json=_apply_body(app_name="Acme"),
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["org_id"] == org.id
    assert data["theme_id"].startswith("custom:")
    assert data["brand"]["app_name"] == "Acme"
    assert data["brand"]["is_active"] is True
    assert data["brand"]["id"]
    assert data["brand"]["name"] == "Acme brand"

    # Org default theme is set.
    org_theme = (
        await db_session.execute(select(OrgTheme).where(OrgTheme.org_id == org.id))
    ).scalar_one()
    assert org_theme.theme_id == data["theme_id"]

    # Theme preset row exists with scope=org.
    preset_id = data["theme_id"].removeprefix("custom:")
    preset = (
        await db_session.execute(select(ThemePreset).where(ThemePreset.id == preset_id))
    ).scalar_one()
    assert preset.scope == "org"
    assert preset.org_id == org.id
    assert preset.tokens["primary"] == "#0a3a8c"


@pytest.mark.anyio
async def test_apply_brand_creates_new_row_each_call(client, auth_headers, db_session):
    user = await _ensure_user(client, auth_headers, db_session)
    org = await _make_org(db_session, user, role="admin")

    a = await client.post(
        f"/api/orgs/{org.id}/brand/apply",
        headers=auth_headers,
        json=_apply_body(name="Brand A", app_name="Acme"),
    )
    a_id = a.json()["brand"]["id"]
    b = await client.post(
        f"/api/orgs/{org.id}/brand/apply",
        headers=auth_headers,
        json=_apply_body(name="Brand B", app_name="Beta", primary="#ff5500"),
    )
    b_id = b.json()["brand"]["id"]

    assert a_id != b_id
    rows = (
        await db_session.execute(select(OrgBrand).where(OrgBrand.org_id == org.id))
    ).scalars().all()
    assert len(rows) == 2
    actives = [r for r in rows if r.is_active]
    assert len(actives) == 1
    assert actives[0].id == b_id


@pytest.mark.anyio
async def test_apply_brand_admin_only(client, auth_headers, other_auth_headers, db_session):
    admin = await _ensure_user(client, auth_headers, db_session)
    org = await _make_org(db_session, admin, role="admin")
    other = await _ensure_user(client, other_auth_headers, db_session)
    db_session.add(OrgMember(org_id=org.id, user_id=other.id, role="member"))
    await db_session.commit()

    r = await client.post(
        f"/api/orgs/{org.id}/brand/apply",
        headers=other_auth_headers,
        json=_apply_body(name="Hijack", app_name="Pirate"),
    )
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Per-id PUT / DELETE / activate / duplicate
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_put_brand_by_id_updates_metadata(client, auth_headers, db_session):
    user = await _ensure_user(client, auth_headers, db_session)
    org = await _make_org(db_session, user, role="admin")
    a = await client.post(
        f"/api/orgs/{org.id}/brand/apply",
        headers=auth_headers,
        json=_apply_body(name="Brand A", app_name="Acme"),
    )
    bid = a.json()["brand"]["id"]
    r = await client.put(
        f"/api/orgs/{org.id}/brands/{bid}",
        headers=auth_headers,
        json={"name": "Renamed", "tagline": "New pitch"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Renamed"
    assert body["tagline"] == "New pitch"
    assert body["app_name"] == "Acme"  # untouched


@pytest.mark.anyio
async def test_put_brand_by_id_admin_only(
    client, auth_headers, other_auth_headers, db_session
):
    admin = await _ensure_user(client, auth_headers, db_session)
    org = await _make_org(db_session, admin, role="admin")
    a = await client.post(
        f"/api/orgs/{org.id}/brand/apply",
        headers=auth_headers,
        json=_apply_body(name="Brand A", app_name="Acme"),
    )
    bid = a.json()["brand"]["id"]
    other = await _ensure_user(client, other_auth_headers, db_session)
    db_session.add(OrgMember(org_id=org.id, user_id=other.id, role="member"))
    await db_session.commit()
    r = await client.put(
        f"/api/orgs/{org.id}/brands/{bid}",
        headers=other_auth_headers,
        json={"name": "Hijack"},
    )
    assert r.status_code == 403


@pytest.mark.anyio
async def test_delete_active_brand_returns_409(client, auth_headers, db_session):
    user = await _ensure_user(client, auth_headers, db_session)
    org = await _make_org(db_session, user, role="admin")
    a = await client.post(
        f"/api/orgs/{org.id}/brand/apply",
        headers=auth_headers,
        json=_apply_body(name="Brand A", app_name="Acme"),
    )
    bid = a.json()["brand"]["id"]
    r = await client.delete(f"/api/orgs/{org.id}/brands/{bid}", headers=auth_headers)
    assert r.status_code == 409


@pytest.mark.anyio
async def test_delete_inactive_brand_succeeds(client, auth_headers, db_session):
    user = await _ensure_user(client, auth_headers, db_session)
    org = await _make_org(db_session, user, role="admin")
    a = await client.post(
        f"/api/orgs/{org.id}/brand/apply",
        headers=auth_headers,
        json=_apply_body(name="Brand A", app_name="Acme"),
    )
    a_id = a.json()["brand"]["id"]
    # Apply B → A becomes inactive.
    await client.post(
        f"/api/orgs/{org.id}/brand/apply",
        headers=auth_headers,
        json=_apply_body(name="Brand B", app_name="Beta"),
    )
    r = await client.delete(f"/api/orgs/{org.id}/brands/{a_id}", headers=auth_headers)
    assert r.status_code == 204
    rows = (
        await db_session.execute(select(OrgBrand).where(OrgBrand.org_id == org.id))
    ).scalars().all()
    assert len(rows) == 1


@pytest.mark.anyio
async def test_activate_switches_active_and_org_default(client, auth_headers, db_session):
    user = await _ensure_user(client, auth_headers, db_session)
    org = await _make_org(db_session, user, role="admin")
    a = await client.post(
        f"/api/orgs/{org.id}/brand/apply",
        headers=auth_headers,
        json=_apply_body(name="Brand A", app_name="Acme"),
    )
    a_id = a.json()["brand"]["id"]
    a_theme = a.json()["theme_id"]
    b = await client.post(
        f"/api/orgs/{org.id}/brand/apply",
        headers=auth_headers,
        json=_apply_body(name="Brand B", app_name="Beta", primary="#ff5500"),
    )
    b_id = b.json()["brand"]["id"]

    # B is now active and org_themes points at B.
    r = await client.post(
        f"/api/orgs/{org.id}/brands/{a_id}/activate",
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["is_active"] is True
    assert r.json()["id"] == a_id

    # B is no longer active.
    rows_resp = await client.get(f"/api/orgs/{org.id}/brands", headers=auth_headers)
    rows = {row["id"]: row for row in rows_resp.json()}
    assert rows[a_id]["is_active"] is True
    assert rows[b_id]["is_active"] is False

    # org_themes now points at A's theme_id again.
    org_theme = (
        await db_session.execute(select(OrgTheme).where(OrgTheme.org_id == org.id))
    ).scalar_one()
    assert org_theme.theme_id == a_theme


@pytest.mark.anyio
async def test_activate_admin_only(client, auth_headers, other_auth_headers, db_session):
    admin = await _ensure_user(client, auth_headers, db_session)
    org = await _make_org(db_session, admin, role="admin")
    a = await client.post(
        f"/api/orgs/{org.id}/brand/apply",
        headers=auth_headers,
        json=_apply_body(name="Brand A", app_name="Acme"),
    )
    other = await _ensure_user(client, other_auth_headers, db_session)
    db_session.add(OrgMember(org_id=org.id, user_id=other.id, role="member"))
    await db_session.commit()
    r = await client.post(
        f"/api/orgs/{org.id}/brands/{a.json()['brand']['id']}/activate",
        headers=other_auth_headers,
    )
    assert r.status_code == 403


@pytest.mark.anyio
async def test_duplicate_creates_independent_theme(client, auth_headers, db_session):
    user = await _ensure_user(client, auth_headers, db_session)
    org = await _make_org(db_session, user, role="admin")
    a = await client.post(
        f"/api/orgs/{org.id}/brand/apply",
        headers=auth_headers,
        json=_apply_body(name="Brand A", app_name="Acme", primary="#aabbcc"),
    )
    a_id = a.json()["brand"]["id"]
    a_theme_id = a.json()["theme_id"]
    a_preset_id = a_theme_id.removeprefix("custom:")

    dup = await client.post(
        f"/api/orgs/{org.id}/brands/{a_id}/duplicate",
        headers=auth_headers,
        json={},
    )
    assert dup.status_code == 200
    body = dup.json()
    assert body["id"] != a_id
    assert body["name"] == "Brand A copy"
    assert body["is_active"] is False
    assert body["app_name"] == "Acme"
    new_theme_id = body["theme_id"]
    assert new_theme_id and new_theme_id != a_theme_id
    new_preset_id = new_theme_id.removeprefix("custom:")
    assert new_preset_id != a_preset_id

    # Mutating the duplicate's preset must not bleed into the original.
    new_preset = (
        await db_session.execute(select(ThemePreset).where(ThemePreset.id == new_preset_id))
    ).scalar_one()
    new_preset.tokens = {**new_preset.tokens, "primary": "#000000"}
    await db_session.commit()

    original_preset = (
        await db_session.execute(select(ThemePreset).where(ThemePreset.id == a_preset_id))
    ).scalar_one()
    assert original_preset.tokens["primary"] == "#aabbcc"


@pytest.mark.anyio
async def test_duplicate_admin_only(client, auth_headers, other_auth_headers, db_session):
    admin = await _ensure_user(client, auth_headers, db_session)
    org = await _make_org(db_session, admin, role="admin")
    a = await client.post(
        f"/api/orgs/{org.id}/brand/apply",
        headers=auth_headers,
        json=_apply_body(name="Brand A", app_name="Acme"),
    )
    other = await _ensure_user(client, other_auth_headers, db_session)
    db_session.add(OrgMember(org_id=org.id, user_id=other.id, role="member"))
    await db_session.commit()
    r = await client.post(
        f"/api/orgs/{org.id}/brands/{a.json()['brand']['id']}/duplicate",
        headers=other_auth_headers,
        json={},
    )
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Logo upload
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_logo_upload_admin_only(client, auth_headers, other_auth_headers, db_session, tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    admin = await _ensure_user(client, auth_headers, db_session)
    org = await _make_org(db_session, admin, role="admin")
    other = await _ensure_user(client, other_auth_headers, db_session)
    db_session.add(OrgMember(org_id=org.id, user_id=other.id, role="member"))
    await db_session.commit()

    png_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32  # not a real PNG, but content_type drives validation
    files = {"file": ("logo.png", io.BytesIO(png_bytes), "image/png")}

    forbidden = await client.post(
        f"/api/orgs/{org.id}/brand/logo",
        headers=other_auth_headers,
        files=files,
    )
    assert forbidden.status_code == 403


@pytest.mark.anyio
async def test_logo_upload_rejects_unsupported_type(
    client, auth_headers, db_session, tmp_path, monkeypatch
):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    user = await _ensure_user(client, auth_headers, db_session)
    org = await _make_org(db_session, user, role="admin")

    files = {"file": ("logo.exe", io.BytesIO(b"MZ"), "application/octet-stream")}
    r = await client.post(
        f"/api/orgs/{org.id}/brand/logo",
        headers=auth_headers,
        files=files,
    )
    assert r.status_code == 415


@pytest.mark.anyio
async def test_logo_upload_happy_path(client, auth_headers, db_session, tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    # The brand router resolves UPLOAD_DIR at module-import time, so re-bind it.
    from src.app.routers import brand as brand_router

    brand_router.UPLOAD_DIR = tmp_path  # type: ignore[attr-defined]

    user = await _ensure_user(client, auth_headers, db_session)
    org = await _make_org(db_session, user, role="admin")

    png_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
    files = {"file": ("logo.png", io.BytesIO(png_bytes), "image/png")}
    r = await client.post(
        f"/api/orgs/{org.id}/brand/logo",
        headers=auth_headers,
        files=files,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["url"].startswith("/uploads/brand-")
    assert data["url"].endswith(".png")
