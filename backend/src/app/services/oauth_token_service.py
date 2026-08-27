"""Centralised OAuth access-token rotation for integration connectors.

Connectors should call :func:`get_valid_access_token` instead of decrypting
``integration.access_token`` directly. The service:

* Returns the current plaintext access token if it's not close to expiry.
* Refreshes via the provider's ``token_url`` when the token is within the
  pre-expiry window (default 5 minutes) and a refresh token is available.
* Re-encrypts the new access (and refresh, if rotated) and persists it in
  the same transaction the caller is using.
* Serialises concurrent refreshes per-integration via an :class:`asyncio.Lock`
  so two scans don't race and corrupt the stored refresh token.

Atlassian (Jira, Confluence) rotates the refresh token on every refresh call
— if two scans refresh in parallel, one wins and the other invalidates its
own future refreshes. The lock prevents that.

GitHub App auth uses short-lived installation tokens minted on demand, so
this service short-circuits to ``get_installation_token`` for that path.
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.integration import OrgIntegration
from .crypto import decrypt_api_key, encrypt_api_key
from .oauth_registry import get_oauth_config

logger = logging.getLogger(__name__)

REFRESH_WINDOW = timedelta(minutes=5)
TOKEN_REFRESH_TIMEOUT = 15.0

# Per-integration locks live in-process for the life of the worker. Concurrent
# refresh requests for the same integration serialize through the same lock;
# different integrations are independent.
_refresh_locks: dict[str, asyncio.Lock] = {}


def _lock_for(integration_id: str) -> asyncio.Lock:
    lock = _refresh_locks.get(integration_id)
    if lock is None:
        lock = asyncio.Lock()
        _refresh_locks[integration_id] = lock
    return lock


def _needs_refresh(integration: OrgIntegration) -> bool:
    """True when the access token expires within ``REFRESH_WINDOW``."""
    if integration.token_expires_at is None:
        return False
    expires_at = integration.token_expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    return expires_at <= datetime.now(tz=UTC) + REFRESH_WINDOW


async def _refresh(integration: OrgIntegration, db: AsyncSession) -> str:
    """Exchange the refresh token for a new access token. Returns plaintext access."""
    if not integration.refresh_token:
        raise RuntimeError(
            f"Integration {integration.id} ({integration.provider}) needs refresh "
            "but has no refresh_token stored"
        )

    oauth_cfg = get_oauth_config(integration.provider)
    if oauth_cfg is None:
        raise RuntimeError(
            f"No OAuth config registered for provider {integration.provider}; "
            "cannot refresh"
        )

    client_id = os.environ.get(oauth_cfg["env_client_id"], "")
    client_secret = os.environ.get(oauth_cfg["env_client_secret"], "")
    if not client_id or not client_secret:
        raise RuntimeError(
            f"OAuth client credentials for {integration.provider} are missing; "
            "cannot refresh"
        )

    refresh_plaintext = decrypt_api_key(integration.refresh_token)

    payload = {
        "grant_type": "refresh_token",
        "refresh_token": refresh_plaintext,
        "client_id": client_id,
        "client_secret": client_secret,
    }

    async with httpx.AsyncClient(timeout=TOKEN_REFRESH_TIMEOUT) as client:
        resp = await client.post(
            oauth_cfg["token_url"],
            data=payload,
            headers={"Accept": "application/json"},
        )

    if resp.status_code != 200:
        logger.error(
            "OAuth refresh failed: provider=%s integration=%s status=%s",
            integration.provider,
            integration.id,
            resp.status_code,
        )
        raise RuntimeError(
            f"Refresh token exchange returned {resp.status_code} for "
            f"{integration.provider}"
        )

    content_type = resp.headers.get("content-type", "")
    if "application/json" in content_type:
        tokens = resp.json()
    else:
        from urllib.parse import parse_qs

        parsed = parse_qs(resp.text)
        tokens = {k: v[0] for k, v in parsed.items()}

    new_access = tokens.get("access_token")
    if not new_access:
        raise RuntimeError(
            f"Refresh response missing access_token for {integration.provider}"
        )

    integration.access_token = encrypt_api_key(new_access)

    new_refresh = tokens.get("refresh_token")
    if new_refresh:
        integration.refresh_token = encrypt_api_key(new_refresh)

    expires_in = tokens.get("expires_in")
    if expires_in:
        try:
            integration.token_expires_at = datetime.now(tz=UTC) + timedelta(
                seconds=int(expires_in)
            )
        except (ValueError, TypeError):
            integration.token_expires_at = None

    await db.flush()
    logger.info(
        "Refreshed access token for %s integration %s",
        integration.provider,
        integration.id,
    )
    return new_access


async def get_valid_access_token(
    integration: OrgIntegration, db: AsyncSession
) -> str:
    """Return a plaintext access token, refreshing transparently if needed.

    For ``github_app`` integrations, returns a fresh installation token from
    GitHub (these are short-lived and minted on demand — no refresh needed).

    For OAuth integrations with a non-expiring or far-from-expiry token,
    returns the decrypted stored value.

    For OAuth integrations within the refresh window, acquires the
    per-integration lock, re-reads the integration (in case a concurrent call
    already refreshed), and refreshes if still needed. The new token is
    persisted via ``db.flush`` — the caller's transaction handles the commit.
    """
    if integration.auth_type == "github_app":
        from .github_app import get_installation_token

        installation_id = decrypt_api_key(integration.access_token)
        token_data = await get_installation_token(installation_id)
        return token_data["token"]

    if not integration.access_token:
        raise RuntimeError(
            f"Integration {integration.id} ({integration.provider}) has no "
            "access_token stored"
        )

    if not _needs_refresh(integration):
        return decrypt_api_key(integration.access_token)

    lock = _lock_for(integration.id)
    async with lock:
        # Re-read inside the lock: a concurrent call may have already refreshed.
        await db.refresh(integration)
        if not _needs_refresh(integration):
            return decrypt_api_key(integration.access_token)
        return await _refresh(integration, db)
