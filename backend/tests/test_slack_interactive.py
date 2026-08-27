"""Tests for the Slack interactive router (slash commands, events, interactivity)."""

from __future__ import annotations

import hashlib
import hmac
import json
import time

import pytest

TEST_SIGNING_SECRET = "test-signing-secret"


def _make_slack_headers(body: bytes, secret: str = TEST_SIGNING_SECRET) -> dict:
    """Build the X-Slack-Request-Timestamp and X-Slack-Signature headers."""
    ts = str(int(time.time()))
    base = f"v0:{ts}:{body.decode(errors='replace')}".encode()
    sig = "v0=" + hmac.new(secret.encode(), base, hashlib.sha256).hexdigest()
    return {
        "X-Slack-Request-Timestamp": ts,
        "X-Slack-Signature": sig,
    }


@pytest.fixture(autouse=True)
def _set_slack_env(monkeypatch):
    monkeypatch.setenv("SLACK_SIGNING_SECRET", TEST_SIGNING_SECRET)
    from src.app.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


# ---------------------------------------------------------------------------
# Test 1: Feature flag off → 404
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_flag_off_returns_404(client, monkeypatch):
    """When slack_interactive_enabled is False the endpoint returns 404."""
    monkeypatch.setenv("SLACK_INTERACTIVE_ENABLED", "false")
    from src.app.config import get_settings

    get_settings.cache_clear()

    body = b"command=%2Fhello&text=world"
    headers = _make_slack_headers(body)
    headers["Content-Type"] = "application/x-www-form-urlencoded"

    resp = await client.post(
        "/api/integrations/slack/commands",
        content=body,
        headers=headers,
    )
    assert resp.status_code == 404
    get_settings.cache_clear()


# ---------------------------------------------------------------------------
# Test 2: URL verification challenge echoed back
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_url_verification_challenge(client, monkeypatch):
    """Events API url_verification challenge is echoed with a 200."""
    monkeypatch.setenv("SLACK_INTERACTIVE_ENABLED", "true")
    from src.app.config import get_settings

    get_settings.cache_clear()

    payload = {"type": "url_verification", "challenge": "test-challenge-abc123"}
    body = json.dumps(payload).encode()
    headers = _make_slack_headers(body)
    headers["Content-Type"] = "application/json"

    resp = await client.post(
        "/api/integrations/slack/events",
        content=body,
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["challenge"] == "test-challenge-abc123"
    get_settings.cache_clear()


# ---------------------------------------------------------------------------
# Test 3: Invalid signature → 401
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invalid_signature_returns_401(client, monkeypatch):
    """A request with a bad Slack signature is rejected with 401."""
    monkeypatch.setenv("SLACK_INTERACTIVE_ENABLED", "true")
    from src.app.config import get_settings

    get_settings.cache_clear()

    body = b"command=%2Fhello&text=world"
    # Build headers using wrong secret
    headers = _make_slack_headers(body, secret="wrong-secret")
    headers["Content-Type"] = "application/x-www-form-urlencoded"

    resp = await client.post(
        "/api/integrations/slack/commands",
        content=body,
        headers=headers,
    )
    assert resp.status_code == 401
    get_settings.cache_clear()


# ---------------------------------------------------------------------------
# Test 4: event_callback passes full envelope to handler (regression)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_slack_events_route_passes_full_envelope_to_handler(client, monkeypatch):
    """Regression: the router must pass the full envelope, not just event.

    An earlier version passed payload['event'] and slack_event_handler.handle
    short-circuited on `envelope.get("type") != "event_callback"`.
    """
    from unittest.mock import AsyncMock

    monkeypatch.setenv("SLACK_INTERACTIVE_ENABLED", "true")
    from src.app.config import get_settings

    get_settings.cache_clear()

    captured = {}

    async def fake_handle(db, envelope, background_tasks):
        captured["envelope"] = envelope
        return {"ok": True}

    envelope_payload = {
        "type": "event_callback",
        "team_id": "T1",
        "event": {"type": "app_mention", "user": "U1", "channel": "C1", "text": "hi"},
    }
    body = json.dumps(envelope_payload).encode()

    monkeypatch.setattr(
        "src.app.services.slack_event_handler.handle",
        fake_handle,
    )
    # Patch _verified_body so signature check is bypassed
    monkeypatch.setattr(
        "src.app.routers.slack_interactive._verified_body",
        AsyncMock(return_value=body),
    )
    # Patch _require_flag so feature-flag check is bypassed
    monkeypatch.setattr(
        "src.app.routers.slack_interactive._require_flag",
        lambda: None,
    )

    resp = await client.post("/api/integrations/slack/events")
    assert resp.status_code == 200
    assert captured["envelope"]["type"] == "event_callback"
    assert captured["envelope"]["team_id"] == "T1"
    assert captured["envelope"]["event"]["type"] == "app_mention"

    get_settings.cache_clear()
