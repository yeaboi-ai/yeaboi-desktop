"""Tests for the Redis-backed provider health snapshot.

Uses the in-memory fallback (Redis isn't available in the test env) so
behaviour around mark_unhealthy → get → mark_healthy is exercised end-to-end.
"""

from __future__ import annotations

import pytest

from src.app.services import provider_health
from src.app.services.provider_errors import CreditExhaustedError, InvalidKeyError


@pytest.fixture(autouse=True)
async def _reset_health():
    await provider_health.reset_for_tests_async()
    yield
    await provider_health.reset_for_tests_async()


@pytest.mark.asyncio
async def test_mark_unhealthy_then_get_returns_snapshot():
    err = CreditExhaustedError(provider="anthropic", scope="platform", message="too low")
    await provider_health.mark_unhealthy("platform", "anthropic", err)
    snap = await provider_health.get("platform", "anthropic")
    assert snap is not None
    assert snap["status"] == "unhealthy"
    assert snap["error_code"] == "PROVIDER_CREDIT_EXHAUSTED"
    assert snap["consecutive_failures"] == 1
    assert "since" in snap


@pytest.mark.asyncio
async def test_consecutive_failures_increment():
    err = CreditExhaustedError(provider="anthropic", scope="platform", message="too low")
    await provider_health.mark_unhealthy("platform", "anthropic", err)
    await provider_health.mark_unhealthy("platform", "anthropic", err)
    snap = await provider_health.get("platform", "anthropic")
    assert snap["consecutive_failures"] == 2


@pytest.mark.asyncio
async def test_mark_healthy_clears_snapshot():
    err = InvalidKeyError(provider="anthropic", scope="platform", message="bad key")
    await provider_health.mark_unhealthy("platform", "anthropic", err)
    await provider_health.mark_healthy("platform", "anthropic")
    snap = await provider_health.get("platform", "anthropic")
    assert snap is None


@pytest.mark.asyncio
async def test_mark_healthy_is_noop_when_no_snapshot():
    """Cheap fast-path: marking a never-failed provider healthy is a no-op."""
    await provider_health.mark_healthy("platform", "openai")
    assert await provider_health.get("platform", "openai") is None


@pytest.mark.asyncio
async def test_get_all_keyed_by_scope_provider():
    err = CreditExhaustedError(provider="anthropic", scope="platform", message="too low")
    err2 = InvalidKeyError(provider="deepgram", scope="org:abc", message="bad")
    await provider_health.mark_unhealthy("platform", "anthropic", err)
    await provider_health.mark_unhealthy("org:abc", "deepgram", err2)
    all_snap = await provider_health.get_all()
    assert "platform:anthropic" in all_snap
    assert "org:abc:deepgram" in all_snap
    assert all_snap["platform:anthropic"]["error_code"] == "PROVIDER_CREDIT_EXHAUSTED"
