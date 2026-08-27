"""Redis-backed health snapshot for external AI providers.

The AIClient wrapper marks providers unhealthy when SDK calls fail with a
recognised credit/auth/rate-limit error, and marks them healthy again on the
next successful call. The frontend polls /api/system/health-summary, which
reads these snapshots to drive the global banner and per-feature gating.

Storage layout (Redis JSON-encoded values):
    Key:   provider_health:{scope}:{provider}
    Where: scope ∈ {"platform", "org:<org_id>"}
    TTL:   3600s on unhealthy entries — a credit recharge auto-recovers
           even if no successful call clears the flag explicitly.

Fail-open: every operation tolerates Redis being down. We fall back to a
process-local dict so a Redis outage doesn't take provider-status reporting
with it. That dict is intentionally tiny — health is global per-process,
not per-request.
"""

from __future__ import annotations

import json
import logging
import time
from datetime import UTC, datetime
from typing import Any

import redis.asyncio as aioredis

from ..config import get_settings
from .provider_errors import ProviderError

logger = logging.getLogger(__name__)


_KEY_PREFIX = "provider_health:"
# 24h safety-net TTL. The periodic probe (services/provider_probe.py) is the
# primary mechanism for keeping snapshots fresh — re-checking failing providers
# every ~5 minutes and either refreshing the snapshot or clearing it on
# recovery. The TTL only kicks in if the probe is broken or the process is
# down for a long stretch, so a stale snapshot can't haunt forever.
_UNHEALTHY_TTL_SECONDS = 86400

# Active failover snapshots — written when AIClient successfully routes around
# a failing primary provider. The frontend uses these to render the "degraded
# — using backup" banner variant. 10-minute TTL so the banner clears
# automatically once the primary recovers and stops failing.
_ACTIVE_FAILOVER_PREFIX = "ai_failover_active:"
_ACTIVE_FAILOVER_TTL_SECONDS = 600

_LOCAL: dict[str, dict[str, Any]] = {}
_REDIS_CLIENT: aioredis.Redis | None = None
_REDIS_UNAVAILABLE_UNTIL = 0.0


async def _get_redis() -> aioredis.Redis | None:
    """Return a live Redis client, or None if unreachable. Fail-open."""
    global _REDIS_CLIENT, _REDIS_UNAVAILABLE_UNTIL

    # No Redis at all (the desktop's local mode): straight to the in-process
    # fallback, no connection attempt and no first-touch stall.
    if not get_settings().redis_enabled:
        return None

    if time.time() < _REDIS_UNAVAILABLE_UNTIL:
        return None

    if _REDIS_CLIENT is None:
        try:
            _REDIS_CLIENT = aioredis.from_url(
                get_settings().redis_url,
                socket_connect_timeout=1.5,
                socket_timeout=1.5,
                decode_responses=True,
            )
            await _REDIS_CLIENT.ping()
        except Exception as exc:
            logger.debug("ProviderHealth: Redis unavailable (%s) — using local fallback", exc)
            _REDIS_CLIENT = None
            _REDIS_UNAVAILABLE_UNTIL = time.time() + 30
            return None
    return _REDIS_CLIENT


def _key(scope: str, provider: str) -> str:
    return f"{_KEY_PREFIX}{scope}:{provider}"


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


async def mark_unhealthy(scope: str, provider: str, error: ProviderError) -> None:
    """Record that `provider` is failing under `scope` (e.g. platform / org:<id>).

    Increments `consecutive_failures` if a snapshot already exists. Best-effort:
    a Redis outage is logged at debug and downgraded to the local fallback.
    """
    redis_client = await _get_redis()
    existing = await get(scope, provider)
    consecutive = (existing.get("consecutive_failures") or 0) + 1 if existing else 1
    payload: dict[str, Any] = {
        "status": "unhealthy",
        "error_code": error.code,
        "message": error.message,
        "since": existing.get("since") if existing else _now_iso(),
        "last_seen": _now_iso(),
        "consecutive_failures": consecutive,
    }
    serialised = json.dumps(payload)
    key = _key(scope, provider)

    if redis_client is not None:
        try:
            await redis_client.setex(key, _UNHEALTHY_TTL_SECONDS, serialised)
            logger.warning(
                "Provider %s marked unhealthy (scope=%s, code=%s, consecutive=%d)",
                provider,
                scope,
                error.code,
                consecutive,
            )
            return
        except Exception:
            logger.debug("provider_health.mark_unhealthy redis failed", exc_info=True)

    _LOCAL[key] = payload
    logger.warning("Provider %s marked unhealthy [local fallback] (scope=%s, code=%s)", provider, scope, error.code)


async def mark_healthy(scope: str, provider: str) -> None:
    """Clear an unhealthy snapshot for `provider` under `scope`.

    Cheap fast-path: only deletes when an entry exists. Avoids a write
    on every successful call.
    """
    existing = await get(scope, provider)
    if not existing:
        return
    key = _key(scope, provider)
    redis_client = await _get_redis()
    if redis_client is not None:
        try:
            await redis_client.delete(key)
        except Exception:
            logger.debug("provider_health.mark_healthy redis failed", exc_info=True)
    _LOCAL.pop(key, None)
    logger.info("Provider %s recovered (scope=%s)", provider, scope)


async def get(scope: str, provider: str) -> dict[str, Any] | None:
    """Return the snapshot for (scope, provider), or None if healthy/missing."""
    key = _key(scope, provider)
    redis_client = await _get_redis()
    if redis_client is not None:
        try:
            raw = await redis_client.get(key)
            if raw is not None:
                return json.loads(raw)
        except Exception:
            logger.debug("provider_health.get redis failed", exc_info=True)
    return _LOCAL.get(key)


async def get_all() -> dict[str, dict[str, Any]]:
    """Return every unhealthy snapshot keyed by `<scope>:<provider>`.

    Used by /api/system/health-summary. Healthy providers are absent from
    the returned dict; the caller fills them in with `{"status": "ok"}`.
    """
    result: dict[str, dict[str, Any]] = {}
    redis_client = await _get_redis()
    if redis_client is not None:
        try:
            async for key in redis_client.scan_iter(match=f"{_KEY_PREFIX}*", count=200):
                raw = await redis_client.get(key)
                if raw is None:
                    continue
                try:
                    payload = json.loads(raw)
                except (TypeError, ValueError):
                    continue
                short = key[len(_KEY_PREFIX) :]
                result[short] = payload
        except Exception:
            logger.debug("provider_health.get_all redis scan failed", exc_info=True)

    # Merge local fallback (only contains entries written when Redis was down)
    for key, payload in _LOCAL.items():
        short = key[len(_KEY_PREFIX) :]
        result.setdefault(short, payload)

    return result


async def record_active_failover(*, role: str, from_provider: str, to_provider: str) -> None:
    """Note that ``role`` is currently being served by ``to_provider`` instead
    of its primary ``from_provider``.

    Frontend reads these via the health-summary endpoint to switch the banner
    into the "degraded — using backup" variant. Best-effort: Redis outages
    fall back to the local dict so the banner still updates within the worker
    process even when Redis is unreachable.
    """
    payload = {
        "role": role,
        "from_provider": from_provider,
        "to_provider": to_provider,
        "since": _now_iso(),
    }
    serialised = json.dumps(payload)
    key = f"{_ACTIVE_FAILOVER_PREFIX}{role}"

    redis_client = await _get_redis()
    if redis_client is not None:
        try:
            await redis_client.setex(key, _ACTIVE_FAILOVER_TTL_SECONDS, serialised)
            return
        except Exception:
            logger.debug("provider_health.record_active_failover redis failed", exc_info=True)
    _LOCAL[key] = payload


async def get_active_failovers() -> dict[str, dict[str, Any]]:
    """Return all active-failover snapshots keyed by role.

    Used by /api/system/health-summary to surface the "active_provider" and
    "mode: degraded" fields. Healthy primary providers don't appear here at
    all — the dict is sparse.
    """
    result: dict[str, dict[str, Any]] = {}
    redis_client = await _get_redis()
    if redis_client is not None:
        try:
            async for key in redis_client.scan_iter(match=f"{_ACTIVE_FAILOVER_PREFIX}*", count=200):
                raw = await redis_client.get(key)
                if raw is None:
                    continue
                try:
                    payload = json.loads(raw)
                except (TypeError, ValueError):
                    continue
                role = key[len(_ACTIVE_FAILOVER_PREFIX) :]
                result[role] = payload
        except Exception:
            logger.debug("provider_health.get_active_failovers redis scan failed", exc_info=True)

    # Merge local fallback for keys we wrote while Redis was down.
    for key, payload in _LOCAL.items():
        if key.startswith(_ACTIVE_FAILOVER_PREFIX):
            role = key[len(_ACTIVE_FAILOVER_PREFIX) :]
            result.setdefault(role, payload)

    return result


def reset_for_tests() -> None:
    """Drop the local fallback. Tests call this between cases."""
    _LOCAL.clear()


async def reset_for_tests_async() -> None:
    """Drop both the local fallback and any Redis entries under our prefixes.

    Tests that run against a real Redis (e.g. on a dev machine with the
    docker-compose stack up) need this to start each case from a clean
    slate; the sync version only handles the in-memory fallback.
    """
    _LOCAL.clear()
    redis_client = await _get_redis()
    if redis_client is None:
        return
    for prefix in (_KEY_PREFIX, _ACTIVE_FAILOVER_PREFIX):
        try:
            async for key in redis_client.scan_iter(match=f"{prefix}*", count=200):
                await redis_client.delete(key)
        except Exception:
            logger.debug("provider_health.reset_for_tests_async redis clear failed", exc_info=True)
