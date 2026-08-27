"""Lightweight Redis-backed JSON cache with in-memory fallback.

Designed for read-heavy endpoints whose cost we want to amortise (scan-wide
aggregations, tree listings, etc.). Every operation is fail-open: if Redis is
unreachable we serve fresh data rather than 500'ing the request.

Usage::

    cached = await cache_get("directory:insights:org-123")
    if cached is not None:
        return cached
    result = expensive_computation()
    await cache_set("directory:insights:org-123", result, ttl=60)
    return result

Invalidation::

    await cache_delete("directory:insights:org-123")
    await cache_delete_prefix("directory:")   # drop everything under the prefix
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

import redis.asyncio as aioredis

from ..config import get_settings

logger = logging.getLogger(__name__)

# In-memory fallback. Tiny, process-local — only used when Redis is down or
# when tests run without a Redis container. Not designed for high load.
_LOCAL_CACHE: dict[str, tuple[float, str]] = {}
_REDIS_CLIENT: aioredis.Redis | None = None
_REDIS_UNAVAILABLE_UNTIL = 0.0  # suppress reconnect storms for 30s after failure


async def _get_redis() -> aioredis.Redis | None:
    """Return a live Redis client, or None if unreachable."""
    global _REDIS_CLIENT, _REDIS_UNAVAILABLE_UNTIL

    # No Redis at all (the desktop's local mode): straight to the in-process
    # fallback, no connection attempt and no first-touch stall.
    if not get_settings().redis_enabled:
        return None

    # Back off briefly after a failure rather than hammering a dead Redis
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
            logger.debug("Cache: Redis unavailable (%s) — using in-memory fallback", exc)
            _REDIS_CLIENT = None
            _REDIS_UNAVAILABLE_UNTIL = time.time() + 30
            return None
    return _REDIS_CLIENT


async def cache_get(key: str) -> Any | None:
    """Return the cached value for *key*, or None if missing/expired."""
    redis_client = await _get_redis()
    if redis_client is not None:
        try:
            raw = await redis_client.get(key)
            if raw is None:
                return None
            return json.loads(raw)
        except Exception:
            logger.debug("Cache get failed for %s", key, exc_info=True)
            return _local_get(key)
    return _local_get(key)


async def cache_set(key: str, value: Any, ttl: int = 60) -> None:
    """Cache *value* under *key* for up to *ttl* seconds."""
    redis_client = await _get_redis()
    # Strict serialisation — stringifying random objects into JSON creates
    # surprising round-trips. Reject and log instead; callers should serialise
    # ahead of time if they need unusual types.
    try:
        payload = json.dumps(value)
    except (TypeError, ValueError):
        logger.warning("Cache: value for %s is not JSON-serialisable, skipping cache", key)
        return

    if redis_client is not None:
        try:
            await redis_client.setex(key, ttl, payload)
            return
        except Exception:
            logger.debug("Cache set failed for %s, falling back to local", key, exc_info=True)
    _local_set(key, payload, ttl)


async def cache_delete(*keys: str) -> None:
    """Drop one or more exact keys from the cache."""
    if not keys:
        return
    redis_client = await _get_redis()
    if redis_client is not None:
        try:
            await redis_client.delete(*keys)
        except Exception:
            logger.debug("Cache delete failed", exc_info=True)
    for key in keys:
        _LOCAL_CACHE.pop(key, None)


async def cache_delete_prefix(prefix: str) -> None:
    """Drop all keys starting with *prefix*. Use sparingly — SCAN is O(N)."""
    redis_client = await _get_redis()
    if redis_client is not None:
        try:
            async for key in redis_client.scan_iter(match=f"{prefix}*", count=200):
                await redis_client.delete(key)
        except Exception:
            logger.debug("Cache scan-delete failed for %s", prefix, exc_info=True)
    for key in list(_LOCAL_CACHE.keys()):
        if key.startswith(prefix):
            _LOCAL_CACHE.pop(key, None)


# ----- Internal in-memory fallback -------------------------------------------


def _local_get(key: str) -> Any | None:
    entry = _LOCAL_CACHE.get(key)
    if entry is None:
        return None
    expires, payload = entry
    if expires < time.time():
        _LOCAL_CACHE.pop(key, None)
        return None
    try:
        return json.loads(payload)
    except (TypeError, ValueError):
        return None


def _local_set(key: str, payload: str, ttl: int) -> None:
    _LOCAL_CACHE[key] = (time.time() + ttl, payload)
