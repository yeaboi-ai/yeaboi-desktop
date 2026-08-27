"""Admin endpoints for incidents, maintenance, and components."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from src.app.models.status import StatusComponent
from src.app.models.user import User

pytestmark = pytest.mark.anyio


async def _ensure_admin(db_session, email: str = "test@example.com") -> User:
    """Ensure the auth-headers user exists as an admin.

    `auth_headers` issues a JWT for test@example.com; `get_current_user`
    auto-creates the row on first request, but defaults to role=member
    when other users already exist. We create it eagerly with role=admin
    so the admin endpoints accept the test caller.
    """
    user = (await db_session.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user is None:
        user = User(email=email, name="Test User", role="admin")
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)
    elif user.role != "admin":
        user.role = "admin"
        await db_session.commit()
    return user


async def _seed_chat_component(db_session) -> StatusComponent:
    component = StatusComponent(key="chat", name="Chat", group="feature", display_order=10)
    db_session.add(component)
    await db_session.commit()
    await db_session.refresh(component)
    return component


async def test_admin_endpoints_require_auth(client):
    resp = await client.get("/api/admin/status/incidents")
    assert resp.status_code == 401


async def test_non_admin_user_forbidden(client, db_session, other_auth_headers):
    member = User(email="other@example.com", name="Other", role="member")
    db_session.add(member)
    await db_session.commit()

    resp = await client.get("/api/admin/status/incidents", headers=other_auth_headers)
    assert resp.status_code == 403


async def test_create_incident_happy_path(client, db_session, auth_headers):
    await _ensure_admin(db_session)
    component = await _seed_chat_component(db_session)

    payload = {
        "title": "Chat slow",
        "body": "Investigating sluggish replies.",
        "severity": "minor",
        "status": "investigating",
        "affected_component_keys": [component.key],
    }
    resp = await client.post("/api/admin/status/incidents", headers=auth_headers, json=payload)
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["title"] == "Chat slow"
    assert data["status"] == "investigating"
    assert "chat" in data["affected_components"]
    assert data["auto_detected"] is False


async def test_create_incident_rejects_unknown_component(client, db_session, auth_headers):
    await _ensure_admin(db_session)
    resp = await client.post(
        "/api/admin/status/incidents",
        headers=auth_headers,
        json={"title": "Bad", "affected_component_keys": ["does-not-exist"]},
    )
    assert resp.status_code == 400


async def test_post_update_flips_parent_status(client, db_session, auth_headers):
    await _ensure_admin(db_session)
    component = await _seed_chat_component(db_session)

    resp = await client.post(
        "/api/admin/status/incidents",
        headers=auth_headers,
        json={"title": "Outage", "affected_component_keys": [component.key]},
    )
    incident_id = resp.json()["id"]

    resp = await client.post(
        f"/api/admin/status/incidents/{incident_id}/updates",
        headers=auth_headers,
        json={"body": "Identified root cause.", "status": "identified"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "identified"
    assert len(data["updates"]) == 1
    assert data["updates"][0]["body"] == "Identified root cause."


async def test_resolve_incident(client, db_session, auth_headers):
    await _ensure_admin(db_session)
    component = await _seed_chat_component(db_session)

    resp = await client.post(
        "/api/admin/status/incidents",
        headers=auth_headers,
        json={"title": "Outage", "affected_component_keys": [component.key]},
    )
    incident_id = resp.json()["id"]

    resp = await client.post(f"/api/admin/status/incidents/{incident_id}/resolve", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "resolved"
    assert data["resolved_at"] is not None
    assert any(u["status"] == "resolved" for u in data["updates"])


async def test_create_maintenance_validates_window(client, db_session, auth_headers):
    await _ensure_admin(db_session)
    now = datetime.now(UTC)
    resp = await client.post(
        "/api/admin/status/maintenance",
        headers=auth_headers,
        json={
            "title": "DB upgrade",
            "scheduled_start": now.isoformat(),
            "scheduled_end": (now - timedelta(hours=1)).isoformat(),
        },
    )
    assert resp.status_code == 400


async def test_create_and_list_maintenance(client, db_session, auth_headers):
    await _ensure_admin(db_session)
    component = await _seed_chat_component(db_session)
    now = datetime.now(UTC)
    resp = await client.post(
        "/api/admin/status/maintenance",
        headers=auth_headers,
        json={
            "title": "DB upgrade",
            "body": "Short window of read-only.",
            "scheduled_start": now.isoformat(),
            "scheduled_end": (now + timedelta(hours=1)).isoformat(),
            "affected_component_keys": [component.key],
        },
    )
    assert resp.status_code == 201, resp.text

    resp = await client.get("/api/admin/status/maintenance", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1


async def test_list_components_admin(client, db_session, auth_headers):
    await _ensure_admin(db_session)
    await _seed_chat_component(db_session)
    resp = await client.get("/api/admin/status/components", headers=auth_headers)
    assert resp.status_code == 200
    keys = [c["key"] for c in resp.json()]
    assert "chat" in keys


async def test_update_component(client, db_session, auth_headers):
    await _ensure_admin(db_session)
    component = await _seed_chat_component(db_session)
    resp = await client.patch(
        f"/api/admin/status/components/{component.id}",
        headers=auth_headers,
        json={"name": "Chat (renamed)", "display_order": 99},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Chat (renamed)"
    assert data["display_order"] == 99
