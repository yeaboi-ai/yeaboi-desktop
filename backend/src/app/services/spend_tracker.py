"""Compute current-month AI spend per org and enforce soft/hard limits.

Reads from the existing `usage_events` ledger so this is purely a query +
threshold layer — no new bookkeeping. Two surfaces:

1. `assert_under_hard_limit()` is called at the top of every public AIClient
   method so an org cannot exceed `monthly_spend_hard_limit_usd` even under
   a runaway loop. Raises `HardSpendLimitError` (mapped to HTTP 402).

2. `evaluate_spend()` is consumed by the /api/system/health-summary endpoint
   to drive the in-app banner + 80% / 95% spend-warning toasts.

3. `record_hourly_burn()` is a process-local rolling-hour counter keyed by
   `(provider, scope)`. It's a runtime tripwire — not an audit trail — so
   an in-memory deque is enough; restarts reset the window. Designed for
   the 2026-05-17 class of incident, where a single provider blip turned
   into $20+ within 15 minutes before anyone noticed.

Email alerts at 80% and 100% are deduped via `org_spend_alerts_sent` so a
threshold straddling many polls only emails the org's billing address once
per month.
"""

from __future__ import annotations

import logging
import time
from collections import deque
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.ai_config import OrgAIConfig, OrgSpendAlertSent
from ..models.organization import Organization
from ..models.usage_event import UsageEvent
from .cache import cache_get, cache_set
from .provider_errors import HardSpendLimitError

logger = logging.getLogger(__name__)

_SPEND_CACHE_TTL_SECONDS = 60

# ── Hourly burn-rate tripwire ──────────────────────────────────────────────
# Per-(provider, scope) rolling 1-hour cost window. Lives in process memory;
# precision is best-effort and resets on restart. The point is the alarm,
# not the audit — `usage_events` remains the source of truth.
_HOURLY_WINDOW_S = 3600
_HOURLY_THRESHOLD_USD = 3.0
# Suppress duplicate warnings within this many seconds per (provider, scope).
_HOURLY_WARN_COOLDOWN_S = 600
_hourly_buckets: dict[tuple[str, str], deque[tuple[float, float]]] = {}
_hourly_last_warned: dict[tuple[str, str], float] = {}


def record_hourly_burn(*, provider: str, scope: str, cost_usd: float, model: str | None = None) -> None:
    """Add `cost_usd` to the rolling 1-hour window for (provider, scope) and
    warn if the window total crosses `_HOURLY_THRESHOLD_USD`.

    Safe to call from any code path (including hot streaming loops) — does
    no I/O. Cooldown prevents log spam during a sustained burn.
    """
    if cost_usd <= 0:
        return
    key = (provider, scope)
    now = time.monotonic()
    window = _hourly_buckets.setdefault(key, deque())
    window.append((now, cost_usd))
    cutoff = now - _HOURLY_WINDOW_S
    while window and window[0][0] < cutoff:
        window.popleft()
    total = sum(c for _, c in window)
    if total < _HOURLY_THRESHOLD_USD:
        return
    last = _hourly_last_warned.get(key, 0.0)
    if now - last < _HOURLY_WARN_COOLDOWN_S:
        return
    _hourly_last_warned[key] = now
    logger.warning(
        "ai_hourly_burn_alarm provider=%s scope=%s model=%s rolling_1h_usd=%.2f threshold_usd=%.2f calls=%d",
        provider,
        scope,
        model or "?",
        total,
        _HOURLY_THRESHOLD_USD,
        len(window),
    )
    try:
        from ..metrics import AI_HOURLY_BURN_ALARM_COUNT

        AI_HOURLY_BURN_ALARM_COUNT.labels(provider=provider, scope=scope).inc()
    except Exception:
        logger.debug("AI_HOURLY_BURN_ALARM_COUNT metric failed", exc_info=True)


def _hourly_reset_for_tests() -> None:
    _hourly_buckets.clear()
    _hourly_last_warned.clear()


@dataclass
class SpendStatus:
    """Snapshot of an org's monthly spend versus its configured limits."""

    month_to_date_usd: Decimal
    soft_limit_usd: Decimal | None
    hard_limit_usd: Decimal | None
    percent_of_soft: float | None
    status: str  # "ok" | "warn" | "critical" | "hard_blocked"

    def to_dict(self) -> dict:
        return {
            "month_to_date_usd": float(self.month_to_date_usd),
            "soft_limit_usd": float(self.soft_limit_usd) if self.soft_limit_usd is not None else None,
            "hard_limit_usd": float(self.hard_limit_usd) if self.hard_limit_usd is not None else None,
            "percent_of_soft": self.percent_of_soft,
            "status": self.status,
        }


def _start_of_month_utc() -> datetime:
    now = datetime.now(UTC)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _current_year_month() -> str:
    return datetime.now(UTC).strftime("%Y-%m")


async def current_month_spend(session: AsyncSession, org_id: str) -> Decimal:
    """Return month-to-date spend for `org_id`, cached for 60s.

    The 60s TTL is shorter than the frontend poll interval; cache primes on
    the first hit and saves N-1 SUMs across the next minute of polls.
    """
    cached = await cache_get(f"spend:current:{org_id}")
    if cached is not None:
        try:
            return Decimal(str(cached))
        except (TypeError, ValueError):
            pass

    stmt = select(func.coalesce(func.sum(UsageEvent.cost_usd), 0)).where(
        UsageEvent.org_id == org_id,
        UsageEvent.occurred_at >= _start_of_month_utc(),
    )
    result = await session.execute(stmt)
    total = result.scalar_one()
    spend = Decimal(str(total or 0))
    await cache_set(f"spend:current:{org_id}", str(spend), ttl=_SPEND_CACHE_TTL_SECONDS)
    return spend


def evaluate_spend(
    spend: Decimal,
    soft_limit: Decimal | None,
    hard_limit: Decimal | None,
) -> SpendStatus:
    """Bucket the spend into ok | warn | critical | hard_blocked.

    Thresholds (relative to soft_limit):
        < 80%   → ok
        80-94%  → warn
        ≥ 95%   → critical
    Independent of hard_limit, which is a separate hard cutoff.
    """
    percent: float | None = None
    if soft_limit is not None and soft_limit > 0:
        percent = float((spend / soft_limit) * 100)

    if hard_limit is not None and hard_limit > 0 and spend >= hard_limit:
        status = "hard_blocked"
    elif percent is None:
        status = "ok"
    elif percent >= 95.0:
        status = "critical"
    elif percent >= 80.0:
        status = "warn"
    else:
        status = "ok"

    return SpendStatus(
        month_to_date_usd=spend,
        soft_limit_usd=soft_limit,
        hard_limit_usd=hard_limit,
        percent_of_soft=percent,
        status=status,
    )


async def get_org_spend_status(session: AsyncSession, org_id: str) -> SpendStatus:
    """Convenience: fetch limits + spend together."""
    config = (
        (await session.execute(select(OrgAIConfig).where(OrgAIConfig.org_id == org_id)))
        .scalar_one_or_none()
    )
    soft = config.monthly_spend_soft_limit_usd if config else None
    hard = config.monthly_spend_hard_limit_usd if config else None
    spend = await current_month_spend(session, org_id)
    return evaluate_spend(spend, soft, hard)


async def assert_under_hard_limit(session: AsyncSession, org_id: str | None) -> None:
    """Raise `HardSpendLimitError` if the org has exceeded their hard limit.

    Skipped when `org_id` is None (platform-internal calls without org
    attribution) or no hard limit is configured.
    """
    if not org_id:
        return
    status = await get_org_spend_status(session, org_id)
    if status.status == "hard_blocked":
        raise HardSpendLimitError(
            provider="org",
            scope=f"org:{org_id}",
            message=(
                f"Monthly spend cap reached "
                f"(${status.month_to_date_usd:.2f} / ${status.hard_limit_usd:.2f}). "
                "AI calls paused until next billing cycle or limit is raised."
            ),
        )


async def maybe_send_threshold_alert(
    session: AsyncSession, org_id: str, status: SpendStatus
) -> None:
    """Email at 80% and 100% only, with per-(org, month, threshold) dedup.

    95% is deliberately skipped — it shows in-app but doesn't email, to
    avoid 80→95 producing two emails minutes apart.
    """
    if status.percent_of_soft is None:
        return

    thresholds_hit: list[int] = []
    if status.percent_of_soft >= 80.0:
        thresholds_hit.append(80)
    if status.status == "hard_blocked" or (
        status.percent_of_soft is not None and status.percent_of_soft >= 100.0
    ):
        thresholds_hit.append(100)

    if not thresholds_hit:
        return

    year_month = _current_year_month()
    for threshold in thresholds_hit:
        # Dedup: skip if we already sent this threshold for this month.
        existing = await session.execute(
            select(OrgSpendAlertSent.id).where(
                OrgSpendAlertSent.org_id == org_id,
                OrgSpendAlertSent.year_month == year_month,
                OrgSpendAlertSent.threshold == threshold,
            )
        )
        if existing.scalar_one_or_none() is not None:
            continue

        sent = await _send_spend_alert_email(session, org_id, threshold, status)
        if not sent:
            continue
        session.add(
            OrgSpendAlertSent(org_id=org_id, year_month=year_month, threshold=threshold)
        )
        try:
            await session.flush()
        except Exception:
            logger.exception("Failed to record spend alert dedup row")


async def _send_spend_alert_email(
    session: AsyncSession, org_id: str, threshold: int, status: SpendStatus
) -> bool:
    """Look up the org's alert email and dispatch via Resend. Returns success."""
    from ..config import get_settings

    settings = get_settings()
    if not settings.resend_api_key:
        logger.info("Spend alert: no Resend key — would have emailed org=%s threshold=%d", org_id, threshold)
        return False

    config_row = (
        (await session.execute(select(OrgAIConfig).where(OrgAIConfig.org_id == org_id))).scalar_one_or_none()
    )
    org_row = (
        (await session.execute(select(Organization).where(Organization.id == org_id))).scalar_one_or_none()
    )

    to_email = (config_row.spend_alert_email if config_row else None) or (
        getattr(org_row, "billing_email", None) if org_row else None
    )
    if not to_email:
        logger.warning("Spend alert: no billing email for org=%s", org_id)
        return False

    org_name = getattr(org_row, "name", None) or "your organization"
    subject = (
        f"AI spend reached {threshold}% of monthly cap"
        if threshold < 100
        else "AI spend cap reached — calls paused"
    )
    tail = (
        "Calls are now paused until the cap is raised or the next billing cycle begins."
        if threshold >= 100
        else "No action required — this is a heads-up."
    )
    body = (
        f"Hi,\n\n{org_name} has reached {threshold}% of its configured monthly AI spend "
        f"cap.\n\nMonth-to-date spend: ${float(status.month_to_date_usd):.2f}\n"
        f"Soft cap: ${float(status.soft_limit_usd or 0):.2f}\n"
        f"Hard cap: ${float(status.hard_limit_usd or 0):.2f}\n\n"
        f"{tail}\n\n"
        "Manage limits in Settings → Integrations.\n"
    )

    try:
        import resend

        resend.api_key = settings.resend_api_key
        resend.Emails.send(
            {
                "from": "yeaboi.ai <billing@resend.dev>",
                "to": [to_email],
                "subject": subject,
                "text": body,
            }
        )
        logger.info("Spend alert email sent to %s (org=%s, threshold=%d)", to_email, org_id, threshold)
        return True
    except Exception:
        logger.exception("Failed to send spend alert email")
        return False
