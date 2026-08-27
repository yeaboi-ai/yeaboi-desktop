"""Unit tests for the OAuth token rotation service."""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest

from src.app.models.integration import OrgIntegration
from src.app.services import oauth_token_service
from src.app.services.crypto import decrypt_api_key, encrypt_api_key


def _make_integration(provider: str = "jira", expires_in_seconds: int | None = 3600):
    expires_at = (
        datetime.now(tz=UTC) + timedelta(seconds=expires_in_seconds)
        if expires_in_seconds is not None
        else None
    )
    intg = OrgIntegration(
        id=f"i-{provider}-{expires_in_seconds}",
        org_id="org-1",
        provider=provider,
        category="issue_tracking",
        auth_type="oauth",
        status="active",
        access_token=encrypt_api_key("plaintext-access"),
        refresh_token=encrypt_api_key("plaintext-refresh"),
        token_expires_at=expires_at,
        scopes="[]",
        connected_by="u-1",
    )
    return intg


@pytest.mark.asyncio
async def test_returns_decrypted_token_when_not_expiring():
    intg = _make_integration(expires_in_seconds=3600)
    db = AsyncMock()
    db.flush = AsyncMock()
    token = await oauth_token_service.get_valid_access_token(intg, db)
    assert token == "plaintext-access"
    db.flush.assert_not_called()


@pytest.mark.asyncio
async def test_refreshes_when_within_window(monkeypatch):
    intg = _make_integration(expires_in_seconds=60)  # within 5-min window
    # Make sure get_oauth_config returns a fake config and httpx returns a token.
    monkeypatch.setenv("JIRA_CLIENT_ID", "cid")
    monkeypatch.setenv("JIRA_CLIENT_SECRET", "csec")

    async def fake_post(self, url, data=None, headers=None):
        class _Resp:
            status_code = 200
            headers = {"content-type": "application/json"}

            def json(self):
                return {
                    "access_token": "new-access",
                    "refresh_token": "new-refresh",
                    "expires_in": 3600,
                }

        return _Resp()

    db = AsyncMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()
    with patch("httpx.AsyncClient.post", new=fake_post):
        token = await oauth_token_service.get_valid_access_token(intg, db)
    assert token == "new-access"
    assert decrypt_api_key(intg.access_token) == "new-access"
    assert decrypt_api_key(intg.refresh_token) == "new-refresh"
    db.flush.assert_awaited()


@pytest.mark.asyncio
async def test_concurrent_refreshes_serialise(monkeypatch):
    """Two concurrent get_valid_access_token calls must trigger only one refresh.

    After the first acquires the lock, the second re-reads the integration
    (post-refresh) and sees the token no longer needs refresh.
    """
    intg = _make_integration(expires_in_seconds=60)
    monkeypatch.setenv("JIRA_CLIENT_ID", "cid")
    monkeypatch.setenv("JIRA_CLIENT_SECRET", "csec")
    call_count = 0

    async def fake_post(self, url, data=None, headers=None):
        nonlocal call_count
        call_count += 1
        # Yield so the second caller can race for the lock.
        await asyncio.sleep(0.01)

        class _Resp:
            status_code = 200
            headers = {"content-type": "application/json"}

            def json(self):
                return {
                    "access_token": "fresh-access",
                    "refresh_token": "fresh-refresh",
                    "expires_in": 3600,
                }

        return _Resp()

    # Simulated db.refresh writes back the in-memory integration state — for
    # this unit test that's a no-op because we never persist anywhere else.
    db = AsyncMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    # Pre-clear any lock from a previous test
    oauth_token_service._refresh_locks.pop(intg.id, None)

    with patch("httpx.AsyncClient.post", new=fake_post):
        results = await asyncio.gather(
            oauth_token_service.get_valid_access_token(intg, db),
            oauth_token_service.get_valid_access_token(intg, db),
        )

    assert results == ["fresh-access", "fresh-access"]
    # Only one upstream refresh should have fired even though we made two calls.
    assert call_count == 1


@pytest.mark.asyncio
async def test_refresh_failure_does_not_corrupt_stored_token(monkeypatch):
    intg = _make_integration(expires_in_seconds=60)
    monkeypatch.setenv("JIRA_CLIENT_ID", "cid")
    monkeypatch.setenv("JIRA_CLIENT_SECRET", "csec")
    original_access = intg.access_token
    original_refresh = intg.refresh_token

    async def fake_post(self, url, data=None, headers=None):
        class _Resp:
            status_code = 400
            headers = {"content-type": "application/json"}
            text = "{}"

            def json(self):
                return {}

        return _Resp()

    db = AsyncMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()
    oauth_token_service._refresh_locks.pop(intg.id, None)

    with patch("httpx.AsyncClient.post", new=fake_post):
        with pytest.raises(RuntimeError):
            await oauth_token_service.get_valid_access_token(intg, db)

    assert intg.access_token == original_access
    assert intg.refresh_token == original_refresh
