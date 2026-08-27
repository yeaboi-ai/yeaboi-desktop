"""Tests for the theming endpoints.

Covers: built-ins listing, GET/PUT user preference, GET/PUT org default,
custom preset CRUD, validation, admin gating, resolver order.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select

from src.app.models.organization import Organization, OrgMember
from src.app.models.theme import OrgTheme, ThemePreset, UserThemePreference
from src.app.models.user import User
from src.app.services.theme_presets import _DARK_TOKENS as PY_DARK
from src.app.services.theme_presets import BUILTIN_PRESETS

# ---------------------------------------------------------------------------
# Built-in presets
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_builtin_presets_endpoint_lists_all(client):
    resp = await client.get("/api/themes/builtins")
    assert resp.status_code == 200
    body = resp.json()
    ids = {row["id"] for row in body}
    assert ids == {
        "preset:light",
        "preset:dark",
        "preset:midnight",
        "preset:high-contrast",
        "preset:sepia",
        "preset:ember",
        "preset:ocean",
        "preset:rose",
        "preset:sunshine",
        "preset:forest",
    }


def test_builtin_python_presets_match_token_keys():
    """All built-ins must define the same token set as `preset:dark`."""
    expected_keys = set(BUILTIN_PRESETS["preset:dark"].tokens.keys())
    for theme_id, doc in BUILTIN_PRESETS.items():
        diff = expected_keys.symmetric_difference(set(doc.tokens.keys()))
        assert not diff, f"{theme_id} differs in keys: {diff}"


# ---------------------------------------------------------------------------
# /api/themes/me
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_themes_me_returns_dark_fallback_for_new_user(client, auth_headers):
    resp = await client.get("/api/themes/me", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["source"] in ("fallback", "org_default")
    assert data["active"]["color_scheme"] in ("light", "dark")
    assert data["preference"]["mode"] == "org_default"


@pytest.mark.anyio
async def test_themes_me_unauthenticated(client):
    resp = await client.get("/api/themes/me")
    assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# User preference
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_user_preference_set_explicit_builtin(client, auth_headers):
    resp = await client.put(
        "/api/users/me/theme-preference",
        headers=auth_headers,
        json={"mode": "explicit", "theme_id": "preset:midnight"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["mode"] == "explicit"
    assert body["theme_id"] == "preset:midnight"

    me = await client.get("/api/themes/me", headers=auth_headers)
    assert me.status_code == 200
    me_body = me.json()
    assert me_body["source"] == "explicit"
    assert me_body["active"]["base_preset"] == "preset:midnight"


@pytest.mark.anyio
async def test_user_preference_system_mode(client, auth_headers):
    resp = await client.put(
        "/api/users/me/theme-preference",
        headers=auth_headers,
        json={
            "mode": "system",
            "auto_light_id": "preset:light",
            "auto_dark_id": "preset:dark",
        },
    )
    assert resp.status_code == 200, resp.text
    me = await client.get("/api/themes/me", headers=auth_headers)
    me_body = me.json()
    assert me_body["source"] == "system"
    assert me_body["light"] is not None
    assert me_body["dark"] is not None
    assert me_body["light"]["color_scheme"] == "light"
    assert me_body["dark"]["color_scheme"] == "dark"


@pytest.mark.anyio
async def test_user_preference_explicit_requires_theme_id(client, auth_headers):
    resp = await client.put(
        "/api/users/me/theme-preference",
        headers=auth_headers,
        json={"mode": "explicit"},
    )
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_user_preference_unknown_builtin_rejected(client, auth_headers):
    resp = await client.put(
        "/api/users/me/theme-preference",
        headers=auth_headers,
        json={"mode": "explicit", "theme_id": "preset:does-not-exist"},
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Org default theme
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_get_org_theme_returns_default_when_unset(client, auth_headers, db_session):
    user = await _ensure_user(client, auth_headers, db_session)
    org = await _make_org(db_session, user, role="member")
    resp = await client.get(f"/api/orgs/{org.id}/theme", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["theme_id"] == "preset:dark"


@pytest.mark.anyio
async def test_put_org_theme_admin_only(client, auth_headers, other_auth_headers, db_session):
    admin_user = await _ensure_user(client, auth_headers, db_session)
    org = await _make_org(db_session, admin_user, role="admin")

    # Admin succeeds
    ok = await client.put(
        f"/api/orgs/{org.id}/theme",
        headers=auth_headers,
        json={"theme_id": "preset:midnight"},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["theme_id"] == "preset:midnight"

    # Non-member is 403
    forbidden = await client.put(
        f"/api/orgs/{org.id}/theme",
        headers=other_auth_headers,
        json={"theme_id": "preset:light"},
    )
    assert forbidden.status_code in (403, 404)

    # Member-but-not-admin is 403
    other_user = await _ensure_user(client, other_auth_headers, db_session)
    db_session.add(OrgMember(org_id=org.id, user_id=other_user.id, role="member"))
    await db_session.commit()

    member_resp = await client.put(
        f"/api/orgs/{org.id}/theme",
        headers=other_auth_headers,
        json={"theme_id": "preset:light"},
    )
    assert member_resp.status_code == 403


@pytest.mark.anyio
async def test_put_org_theme_rejects_user_scoped_custom(client, auth_headers, db_session):
    admin_user = await _ensure_user(client, auth_headers, db_session)
    org = await _make_org(db_session, admin_user, role="admin")
    preset = ThemePreset(
        name="My pers theme",
        scope="user",
        owner_user_id=admin_user.id,
        org_id=None,
        color_scheme="dark",
        tokens=PY_DARK,
        version=1,
    )
    db_session.add(preset)
    await db_session.commit()
    await db_session.refresh(preset)

    resp = await client.put(
        f"/api/orgs/{org.id}/theme",
        headers=auth_headers,
        json={"theme_id": f"custom:{preset.id}"},
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Resolver: org default → user
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_resolver_uses_org_default_when_user_pref_is_org_default(client, auth_headers, db_session):
    user = await _ensure_user(client, auth_headers, db_session)
    org = await _make_org(db_session, user, role="admin")

    set_resp = await client.put(
        f"/api/orgs/{org.id}/theme",
        headers=auth_headers,
        json={"theme_id": "preset:high-contrast"},
    )
    assert set_resp.status_code == 200

    me = await client.get("/api/themes/me", headers=auth_headers)
    body = me.json()
    assert body["source"] == "org_default"
    assert body["active"]["base_preset"] == "preset:high-contrast"


# ---------------------------------------------------------------------------
# Custom presets CRUD
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_create_user_scoped_preset(client, auth_headers):
    body = {
        "name": "My theme",
        "scope": "user",
        "color_scheme": "dark",
        "tokens": PY_DARK,
    }
    resp = await client.post("/api/themes/presets", headers=auth_headers, json=body)
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["scope"] == "user"
    assert data["owner_user_id"]
    assert data["org_id"] is None


@pytest.mark.anyio
async def test_create_preset_validates_unknown_token(client, auth_headers):
    bad_tokens = {**PY_DARK, "fake-token-name": "#000000"}
    resp = await client.post(
        "/api/themes/presets",
        headers=auth_headers,
        json={"name": "Bad", "scope": "user", "color_scheme": "dark", "tokens": bad_tokens},
    )
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_create_preset_validates_invalid_hex(client, auth_headers):
    bad_tokens = {**PY_DARK, "background": "not-a-hex"}
    resp = await client.post(
        "/api/themes/presets",
        headers=auth_headers,
        json={"name": "Bad", "scope": "user", "color_scheme": "dark", "tokens": bad_tokens},
    )
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_org_scoped_preset_requires_admin(client, auth_headers, other_auth_headers, db_session):
    admin_user = await _ensure_user(client, auth_headers, db_session)
    org = await _make_org(db_session, admin_user, role="admin")

    other_user = await _ensure_user(client, other_auth_headers, db_session)
    db_session.add(OrgMember(org_id=org.id, user_id=other_user.id, role="member"))
    await db_session.commit()

    body = {
        "name": "Org theme",
        "scope": "org",
        "org_id": org.id,
        "color_scheme": "dark",
        "tokens": PY_DARK,
    }
    member_resp = await client.post("/api/themes/presets", headers=other_auth_headers, json=body)
    assert member_resp.status_code == 403

    admin_resp = await client.post("/api/themes/presets", headers=auth_headers, json=body)
    assert admin_resp.status_code == 201, admin_resp.text


@pytest.mark.anyio
async def test_delete_preset_blocks_when_set_as_org_default(client, auth_headers, db_session):
    admin_user = await _ensure_user(client, auth_headers, db_session)
    org = await _make_org(db_session, admin_user, role="admin")

    create_resp = await client.post(
        "/api/themes/presets",
        headers=auth_headers,
        json={
            "name": "Brand",
            "scope": "org",
            "org_id": org.id,
            "color_scheme": "dark",
            "tokens": PY_DARK,
        },
    )
    preset_id = create_resp.json()["id"]

    set_resp = await client.put(
        f"/api/orgs/{org.id}/theme",
        headers=auth_headers,
        json={"theme_id": f"custom:{preset_id}"},
    )
    assert set_resp.status_code == 200

    del_resp = await client.delete(f"/api/themes/presets/{preset_id}", headers=auth_headers)
    assert del_resp.status_code == 409


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _ensure_user(client, auth_headers, db_session) -> User:
    """Trigger user auto-creation by hitting an authed endpoint, then load."""
    await client.get("/api/me", headers=auth_headers)
    email = _email_from_headers(auth_headers)
    result = await db_session.execute(select(User).where(User.email == email))
    user = result.scalar_one()
    return user


def _email_from_headers(auth_headers: dict[str, str]) -> str:
    import jwt

    token = auth_headers["Authorization"].removeprefix("Bearer ")
    payload = jwt.decode(token, options={"verify_signature": False})
    return payload["email"]


async def _make_org(db_session, user: User, role: str = "admin") -> Organization:
    # Use a stable slug per user so repeated calls in one test reuse the same org.
    existing = (await db_session.execute(select(OrgMember).where(OrgMember.user_id == user.id))).scalar_one_or_none()
    if existing:
        org = (await db_session.execute(select(Organization).where(Organization.id == existing.org_id))).scalar_one()
        if existing.role != role:
            existing.role = role
            await db_session.commit()
        return org

    slug = f"test-{user.id[:8]}"
    org = Organization(name="Test Org", slug=slug)
    db_session.add(org)
    await db_session.flush()
    db_session.add(OrgMember(org_id=org.id, user_id=user.id, role=role))
    await db_session.commit()
    await db_session.refresh(org)
    return org


# Silence unused imports for tools that flag from sqlalchemy.select use only in some tests.
_ = (UserThemePreference, OrgTheme)
