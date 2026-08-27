"""Tests for the directory cache helper.

Uses the in-memory fallback path — Redis isn't available in CI and these
tests exercise the fail-open behaviour we actually depend on anyway.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from src.app.services import cache


@pytest.fixture(autouse=True)
def reset_cache_state():
    """Wipe the process-local cache before each test.

    Also forces the module to skip any real Redis connection by flagging it
    as unavailable for the duration of the test.
    """
    cache._LOCAL_CACHE.clear()
    cache._REDIS_CLIENT = None
    import time

    cache._REDIS_UNAVAILABLE_UNTIL = time.time() + 3600
    yield
    cache._LOCAL_CACHE.clear()
    cache._REDIS_UNAVAILABLE_UNTIL = 0.0


@pytest.mark.asyncio
async def test_cache_round_trip_with_local_fallback():
    await cache.cache_set("k1", {"hello": "world"}, ttl=10)
    result = await cache.cache_get("k1")
    assert result == {"hello": "world"}


@pytest.mark.asyncio
async def test_cache_get_missing_key_returns_none():
    assert await cache.cache_get("missing") is None


@pytest.mark.asyncio
async def test_cache_expires_in_local_fallback():
    await cache.cache_set("k1", "v1", ttl=1)
    # Manipulate the stored expiry directly rather than sleeping
    import time

    expires, payload = cache._LOCAL_CACHE["k1"]
    cache._LOCAL_CACHE["k1"] = (time.time() - 1, payload)
    assert await cache.cache_get("k1") is None


@pytest.mark.asyncio
async def test_cache_delete_removes_key():
    await cache.cache_set("k1", "v1", ttl=60)
    await cache.cache_delete("k1")
    assert await cache.cache_get("k1") is None


@pytest.mark.asyncio
async def test_cache_delete_multi_removes_all():
    await cache.cache_set("k1", "v1", ttl=60)
    await cache.cache_set("k2", "v2", ttl=60)
    await cache.cache_delete("k1", "k2")
    assert await cache.cache_get("k1") is None
    assert await cache.cache_get("k2") is None


@pytest.mark.asyncio
async def test_cache_delete_prefix_drops_matching_keys():
    await cache.cache_set("directory:tree:team-1", "t1", ttl=60)
    await cache.cache_set("directory:insights:team-1", "i1", ttl=60)
    await cache.cache_set("other:thing", "x", ttl=60)

    await cache.cache_delete_prefix("directory:")

    assert await cache.cache_get("directory:tree:team-1") is None
    assert await cache.cache_get("directory:insights:team-1") is None
    assert await cache.cache_get("other:thing") == "x"


@pytest.mark.asyncio
async def test_cache_set_skips_unserialisable_values(caplog):
    # Objects without a default serialiser should be skipped, not raise
    class Thing:
        pass

    value = {"obj": Thing()}
    await cache.cache_set("k1", value, ttl=10)
    # Verify nothing landed in the cache
    assert await cache.cache_get("k1") is None


@pytest.mark.asyncio
async def test_cache_falls_back_when_redis_unreachable():
    """If Redis is unreachable, in-memory cache still works end-to-end."""
    # Force the module to try Redis (clear the back-off) but mock it to fail
    cache._REDIS_UNAVAILABLE_UNTIL = 0.0
    cache._REDIS_CLIENT = None

    with patch.object(cache.aioredis, "from_url") as mock_from_url:
        fake = AsyncMock()
        fake.ping = AsyncMock(side_effect=ConnectionError("down"))
        mock_from_url.return_value = fake

        await cache.cache_set("k1", "v1", ttl=10)
        assert await cache.cache_get("k1") == "v1"


def test_local_get_returns_none_for_corrupt_json():
    import time

    cache._LOCAL_CACHE["k1"] = (time.time() + 60, "not-json")
    assert cache._local_get("k1") is None


@pytest.mark.asyncio
async def test_concurrent_sets_isolated_by_key():
    await asyncio.gather(
        cache.cache_set("a", 1, ttl=10),
        cache.cache_set("b", 2, ttl=10),
        cache.cache_set("c", 3, ttl=10),
    )
    assert await cache.cache_get("a") == 1
    assert await cache.cache_get("b") == 2
    assert await cache.cache_get("c") == 3
