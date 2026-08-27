"""Tests for /api/system/health-summary."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

import pytest

from src.app.models.ai_config import OrgAIConfig
from src.app.models.organization import OrgMember
from src.app.models.usage_event import UsageEvent
from src.app.models.user import User
from src.app.services import provider_health
from src.app.services.cache import _LOCAL_CACHE
from src.app.services.provider_errors import CreditExhaustedError


@pytest.fixture(autouse=True)
async def _clear_caches():
    _LOCAL_CACHE.clear()
    await provider_health.reset_for_tests_async()
    yield
    _LOCAL_CACHE.clear()
    await provider_health.reset_for_tests_async()


@pytest.fixture
async def membership(db_session, sample_org):
    """Wire the JWT-resolved test user into the org so get_current_org succeeds."""
    user = User(email="test@example.com", name="Test User", role="admin")
    db_session.add(user)
    await db_session.flush()
    db_session.add(OrgMember(org_id=sample_org.id, user_id=user.id, role="admin"))
    await db_session.commit()
    return user


@pytest.mark.asyncio
async def test_health_summary_all_healthy(client, auth_headers, membership):
    res = await client.get("/api/system/health-summary", headers=auth_headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert all(p["status"] == "ok" for p in body["providers"].values())
    assert all(f["available"] is True for f in body["features"].values())
    # New: mode field is populated even on the happy path
    assert all(f.get("mode") == "ok" for f in body["features"].values())
    assert body["usage"]["status"] == "ok"


@pytest.mark.asyncio
async def test_health_summary_degraded_when_failover_active(
    client, auth_headers, membership
):
    """Anthropic unhealthy + active failover to Gemini → chat is degraded,
    not unavailable. Banner picks up amber, not red."""
    err = CreditExhaustedError(provider="anthropic", scope="platform", message="too low")
    await provider_health.mark_unhealthy("platform", "anthropic", err)
    await provider_health.record_active_failover(
        role="chat", from_provider="anthropic", to_provider="gemini"
    )

    res = await client.get("/api/system/health-summary", headers=auth_headers)
    body = res.json()

    assert body["providers"]["anthropic"]["status"] == "unhealthy"
    # Gemini stays healthy AND is annotated with serving_failover_for
    assert body["providers"]["gemini"]["status"] == "ok"
    assert "chat" in body["providers"]["gemini"].get("serving_failover_for", [])

    chat = body["features"]["chat"]
    assert chat["available"] is True
    assert chat["mode"] == "degraded"
    assert chat["primary_provider"] == "anthropic"
    assert chat["active_provider"] == "gemini"


@pytest.mark.asyncio
async def test_health_summary_unavailable_when_no_failover(
    client, auth_headers, membership
):
    """Anthropic unhealthy but NO active failover record → chat is hard-down."""
    err = CreditExhaustedError(provider="anthropic", scope="platform", message="too low")
    await provider_health.mark_unhealthy("platform", "anthropic", err)

    res = await client.get("/api/system/health-summary", headers=auth_headers)
    body = res.json()

    chat = body["features"]["chat"]
    assert chat["available"] is False
    assert chat["mode"] == "unavailable"
    assert chat["blocking_provider"] == "anthropic"


@pytest.mark.asyncio
async def test_health_summary_unavailable_when_backup_also_unhealthy(
    client, auth_headers, membership
):
    """If both primary AND active-failover target are unhealthy, the
    feature is unavailable, not degraded."""
    err = CreditExhaustedError(provider="anthropic", scope="platform", message="too low")
    err2 = CreditExhaustedError(provider="gemini", scope="platform", message="too low")
    await provider_health.mark_unhealthy("platform", "anthropic", err)
    await provider_health.mark_unhealthy("platform", "gemini", err2)
    await provider_health.record_active_failover(
        role="chat", from_provider="anthropic", to_provider="gemini"
    )

    res = await client.get("/api/system/health-summary", headers=auth_headers)
    body = res.json()

    chat = body["features"]["chat"]
    assert chat["available"] is False
    assert chat["mode"] == "unavailable"


@pytest.mark.asyncio
async def test_health_summary_marks_chat_unavailable_when_anthropic_down(
    client, auth_headers, membership
):
    err = CreditExhaustedError(provider="anthropic", scope="platform", message="too low")
    await provider_health.mark_unhealthy("platform", "anthropic", err)

    res = await client.get("/api/system/health-summary", headers=auth_headers)
    body = res.json()

    assert body["providers"]["anthropic"]["status"] == "unhealthy"
    assert body["features"]["chat"]["available"] is False
    assert body["features"]["chat"]["blocking_provider"] == "anthropic"
    assert body["features"]["video"]["available"] is False  # depends on anthropic


@pytest.mark.asyncio
async def test_health_summary_video_blocked_by_deepgram(client, auth_headers, membership):
    err = CreditExhaustedError(provider="deepgram", scope="platform", message="quota")
    await provider_health.mark_unhealthy("platform", "deepgram", err)

    res = await client.get("/api/system/health-summary", headers=auth_headers)
    body = res.json()

    assert body["features"]["video"]["available"] is False
    assert body["features"]["video"]["blocking_provider"] == "deepgram"
    # Chat doesn't depend on deepgram, so it stays up.
    assert body["features"]["chat"]["available"] is True


@pytest.mark.asyncio
async def test_health_summary_includes_spend_status(
    client, auth_headers, membership, db_session, sample_org
):
    db_session.add(OrgAIConfig(
        org_id=sample_org.id,
        provider="platform",
        monthly_spend_soft_limit_usd=Decimal("50"),
    ))
    db_session.add(UsageEvent(
        org_id=sample_org.id, provider="anthropic", operation="chat",
        units={}, cost_usd=Decimal("42.00"),
        occurred_at=datetime.now(UTC),
    ))
    await db_session.commit()

    res = await client.get("/api/system/health-summary", headers=auth_headers)
    body = res.json()

    assert body["usage"]["status"] == "warn"
    assert body["usage"]["soft_limit_usd"] == 50.0
    assert body["usage"]["month_to_date_usd"] == 42.0


@pytest.mark.asyncio
async def test_health_summary_hard_limit_blocks_all_features(
    client, auth_headers, membership, db_session, sample_org
):
    db_session.add(OrgAIConfig(
        org_id=sample_org.id,
        provider="platform",
        monthly_spend_hard_limit_usd=Decimal("10"),
    ))
    db_session.add(UsageEvent(
        org_id=sample_org.id, provider="anthropic", operation="chat",
        units={}, cost_usd=Decimal("12.00"),
        occurred_at=datetime.now(UTC),
    ))
    await db_session.commit()

    res = await client.get("/api/system/health-summary", headers=auth_headers)
    body = res.json()

    assert body["usage"]["status"] == "hard_blocked"
    for feature, info in body["features"].items():
        assert info["available"] is False, f"{feature} should be blocked"
        assert info["reason"] == "ORG_HARD_LIMIT_REACHED"
