"""Tests for spend_tracker math + hard-limit short-circuit."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from src.app.models.ai_config import OrgAIConfig
from src.app.models.usage_event import UsageEvent
from src.app.services import provider_health
from src.app.services.cache import _LOCAL_CACHE
from src.app.services.provider_errors import HardSpendLimitError
from src.app.services.spend_tracker import (
    assert_under_hard_limit,
    current_month_spend,
    evaluate_spend,
    get_org_spend_status,
    maybe_send_threshold_alert,
)


@pytest.fixture(autouse=True)
async def _clear_caches():
    _LOCAL_CACHE.clear()
    await provider_health.reset_for_tests_async()
    yield
    _LOCAL_CACHE.clear()
    await provider_health.reset_for_tests_async()


def test_evaluate_spend_no_limit_is_ok():
    status = evaluate_spend(Decimal("123.45"), None, None)
    assert status.status == "ok"
    assert status.percent_of_soft is None


def test_evaluate_spend_buckets_match_thresholds():
    soft = Decimal("100")
    assert evaluate_spend(Decimal("50"), soft, None).status == "ok"
    assert evaluate_spend(Decimal("80"), soft, None).status == "warn"
    assert evaluate_spend(Decimal("94.99"), soft, None).status == "warn"
    assert evaluate_spend(Decimal("95"), soft, None).status == "critical"
    assert evaluate_spend(Decimal("110"), soft, None).status == "critical"


def test_evaluate_spend_hard_blocked_overrides():
    status = evaluate_spend(Decimal("110"), Decimal("100"), Decimal("100"))
    assert status.status == "hard_blocked"


@pytest.mark.asyncio
async def test_current_month_spend_sums_only_current_month(db_session, sample_org):
    now = datetime.now(UTC)
    last_month = now.replace(day=1) - timedelta(days=5)
    db_session.add_all([
        UsageEvent(
            org_id=sample_org.id, provider="anthropic", operation="chat",
            units={"tokens_in": 100, "tokens_out": 50}, cost_usd=Decimal("5.00"),
            occurred_at=now,
        ),
        UsageEvent(
            org_id=sample_org.id, provider="openai", operation="chat",
            units={"tokens_in": 100}, cost_usd=Decimal("3.00"),
            occurred_at=now,
        ),
        UsageEvent(
            org_id=sample_org.id, provider="anthropic", operation="chat",
            units={"tokens_in": 100}, cost_usd=Decimal("99.99"),
            occurred_at=last_month,
        ),
    ])
    await db_session.commit()

    spend = await current_month_spend(db_session, sample_org.id)
    assert spend == Decimal("8.00")


@pytest.mark.asyncio
async def test_assert_under_hard_limit_raises_when_exceeded(db_session, sample_org):
    db_session.add(OrgAIConfig(
        org_id=sample_org.id,
        provider="platform",
        monthly_spend_hard_limit_usd=Decimal("10.00"),
    ))
    db_session.add(UsageEvent(
        org_id=sample_org.id, provider="anthropic", operation="chat",
        units={"tokens_in": 1}, cost_usd=Decimal("15.00"),
        occurred_at=datetime.now(UTC),
    ))
    await db_session.commit()

    with pytest.raises(HardSpendLimitError):
        await assert_under_hard_limit(db_session, sample_org.id)


@pytest.mark.asyncio
async def test_assert_under_hard_limit_noop_without_org(db_session):
    # Platform-internal calls (no org_id) should never raise.
    await assert_under_hard_limit(db_session, None)


@pytest.mark.asyncio
async def test_assert_under_hard_limit_noop_when_no_limit_set(db_session, sample_org):
    db_session.add(OrgAIConfig(org_id=sample_org.id, provider="platform"))
    db_session.add(UsageEvent(
        org_id=sample_org.id, provider="anthropic", operation="chat",
        units={"tokens_in": 1}, cost_usd=Decimal("1000.00"),
        occurred_at=datetime.now(UTC),
    ))
    await db_session.commit()
    # No exception — limit isn't configured.
    await assert_under_hard_limit(db_session, sample_org.id)


@pytest.mark.asyncio
async def test_threshold_alert_dedup(db_session, sample_org, monkeypatch):
    """Calling maybe_send_threshold_alert twice should only send once per
    (org, year_month, threshold) combination."""
    sent_count = {"n": 0}

    async def fake_sender(session, org_id, threshold, status):
        sent_count["n"] += 1
        return True

    monkeypatch.setattr(
        "src.app.services.spend_tracker._send_spend_alert_email", fake_sender
    )

    db_session.add(OrgAIConfig(
        org_id=sample_org.id,
        provider="platform",
        monthly_spend_soft_limit_usd=Decimal("100"),
    ))
    db_session.add(UsageEvent(
        org_id=sample_org.id, provider="anthropic", operation="chat",
        units={}, cost_usd=Decimal("85.00"),
        occurred_at=datetime.now(UTC),
    ))
    await db_session.commit()

    status1 = await get_org_spend_status(db_session, sample_org.id)
    await maybe_send_threshold_alert(db_session, sample_org.id, status1)
    await db_session.commit()
    assert sent_count["n"] == 1

    # Second call — already deduped via OrgSpendAlertSent
    status2 = await get_org_spend_status(db_session, sample_org.id)
    await maybe_send_threshold_alert(db_session, sample_org.id, status2)
    await db_session.commit()
    assert sent_count["n"] == 1
