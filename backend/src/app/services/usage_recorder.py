"""Record provider API usage to the `usage_events` ledger.

The recorder is the single funnel for billing-relevant events. Provider call
sites should never write to `usage_events` directly — they call
`record_usage(...)` (or open a `usage_span(...)`) which:

1. Resolves any pricing override for (org, provider, operation, model).
2. Computes `cost_usd` via `services.usage_costs.compute_cost`.
3. Inserts the row, flushed on the caller's session (caller commits).

Threading the call site context (`org_id`, `session_id`, `project_id`) is the
caller's responsibility — pass a `UsageContext` constructed at request entry.
"""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.usage_event import USAGE_OPERATIONS, USAGE_PROVIDERS, USAGE_SOURCES, PricingOverride, UsageEvent
from .usage_costs import compute_cost

logger = logging.getLogger(__name__)


@dataclass
class UsageContext:
    """Bag of identifiers threaded from the request edge to the call site so
    every usage event can be attributed correctly. `org_id` is mandatory;
    everything else may be `None` for org-level work (e.g., a scheduled
    report invoking the LLM)."""

    org_id: str
    project_id: str | None = None
    session_id: str | None = None
    user_id: str | None = None
    request_id: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)


# Tiny in-process TTL cache for override lookups so a hot loop (e.g. an agent
# emitting an event per turn) doesn't hit the DB each time. We don't import
# cachetools — a few lines beat a dependency.
_OVERRIDE_TTL_SECONDS = 300
_override_cache: dict[tuple[str | None, str, str, str | None], tuple[float, dict[str, Decimal]]] = {}


def _override_resolver_factory(db: AsyncSession, org_id: str | None):
    """Return a sync resolver compute_cost can call. We pre-fetch overrides
    once per (provider, operation, model) call rather than on every unit so
    the inner loop in compute_cost stays cheap."""

    cached_lookups: dict[tuple[str, str, str | None], dict[str, Decimal]] = {}

    def resolver(provider: str, operation: str, model: str | None) -> dict[str, Decimal]:
        key = (provider, operation, model)
        if key in cached_lookups:
            return cached_lookups[key]
        # Pre-fetched outside this call; if not pre-fetched, return empty so
        # compute_cost falls back to static pricing.
        cached_lookups[key] = {}
        return cached_lookups[key]

    async def prefetch(provider: str, operation: str, model: str | None) -> None:
        cache_key = (org_id, provider, operation, model)
        now = time.monotonic()
        cached = _override_cache.get(cache_key)
        if cached and (now - cached[0]) < _OVERRIDE_TTL_SECONDS:
            cached_lookups[(provider, operation, model)] = cached[1]
            return

        # Lookup: org-specific overrides win over global; effective_from /
        # _until window must contain "now". Among matches, the longest model
        # prefix wins per unit.
        now_dt = datetime.now(UTC)
        stmt = select(PricingOverride).where(
            PricingOverride.provider == provider,
            PricingOverride.operation == operation,
            or_(PricingOverride.org_id == org_id, PricingOverride.org_id.is_(None)),
            or_(PricingOverride.effective_from.is_(None), PricingOverride.effective_from <= now_dt),
            or_(PricingOverride.effective_until.is_(None), PricingOverride.effective_until > now_dt),
        )
        rows = (await db.execute(stmt)).scalars().all()

        # Filter by model prefix and pick the most specific per unit.
        best: dict[str, tuple[int, bool, Decimal]] = {}
        for row in rows:
            if row.model and (model is None or not model.startswith(row.model)):
                continue
            specificity = len(row.model or "")
            org_specific = row.org_id is not None
            current = best.get(row.unit)
            # Org-specific beats global; longer model match beats shorter.
            if current is None or (org_specific, specificity) > (current[1], current[0]):
                best[row.unit] = (specificity, org_specific, row.price_usd)

        result = {unit: price for unit, (_, _, price) in best.items()}
        _override_cache[cache_key] = (now, result)
        cached_lookups[(provider, operation, model)] = result

    resolver.prefetch = prefetch  # type: ignore[attr-defined]
    return resolver


def _validate_enums(provider: str, operation: str, source: str) -> None:
    if provider not in USAGE_PROVIDERS:
        raise ValueError(f"unknown usage provider: {provider!r}")
    if operation not in USAGE_OPERATIONS:
        raise ValueError(f"unknown usage operation: {operation!r}")
    if source not in USAGE_SOURCES:
        raise ValueError(f"unknown usage source: {source!r}")


async def record_usage(
    db: AsyncSession,
    *,
    provider: str,
    operation: str,
    units: dict,
    ctx: UsageContext,
    source: str = "api",
    model: str | None = None,
    is_estimated: bool = False,
    metadata: dict | None = None,
) -> UsageEvent:
    """Compute cost and append a row to `usage_events`.

    The caller's transaction owns the commit. We flush so the row's `id` is
    populated for the return value, but we never commit here — keeping the
    write inside the caller's unit-of-work means the LLM call and the
    accounting row land or roll back together.
    """
    _validate_enums(provider, operation, source)
    if not ctx.org_id:
        raise ValueError("UsageContext.org_id is required")

    resolver = _override_resolver_factory(db, ctx.org_id)
    await resolver.prefetch(provider, operation, model)
    cost = compute_cost(provider, operation, units, model=model, override_resolver=resolver)

    event = UsageEvent(
        org_id=ctx.org_id,
        project_id=ctx.project_id,
        session_id=ctx.session_id,
        provider=provider,
        operation=operation,
        model=model,
        units=dict(units),
        cost_usd=cost,
        is_estimated=is_estimated,
        source=source,
        event_metadata=_build_metadata(ctx, metadata),
    )
    db.add(event)
    try:
        await db.flush()
    except Exception:
        # We never want a billing-write failure to take down the caller's
        # primary work. Log loudly; the row is best-effort.
        logger.exception(
            "usage_event flush failed",
            extra={
                "provider": provider,
                "operation": operation,
                "org_id": ctx.org_id,
                "session_id": ctx.session_id,
            },
        )
        await db.rollback()
        raise
    return event


def _build_metadata(ctx: UsageContext, extra: dict | None) -> dict | None:
    base: dict[str, Any] = {}
    if ctx.user_id:
        base["user_id"] = ctx.user_id
    if ctx.request_id:
        base["request_id"] = ctx.request_id
    if ctx.extra:
        base.update(ctx.extra)
    if extra:
        base.update(extra)
    return base or None


@asynccontextmanager
async def usage_span(
    db: AsyncSession,
    *,
    provider: str,
    operation: str,
    ctx: UsageContext,
    source: str = "api",
    model: str | None = None,
    is_estimated: bool = False,
):
    """Open a span that records usage on exit. Yields a mutable dict the
    caller fills with `units` (and may set `model` via the `.model` attr).
    Records on success and on exception so cancelled or failed calls still
    land in the ledger when they consumed quota."""

    bag: dict = {}

    class _Span:
        units: dict = bag
        model_override: str | None = None
        skip: bool = False

        def __setitem__(self, key: str, value: Any) -> None:
            bag[key] = value

        def update(self, other: dict) -> None:
            bag.update(other)

    span = _Span()
    raised: BaseException | None = None
    try:
        yield span
    except BaseException as exc:
        raised = exc

    should_record = not span.skip and bool(bag)
    if should_record:
        try:
            await record_usage(
                db,
                provider=provider,
                operation=operation,
                units=bag,
                ctx=ctx,
                source=source,
                model=span.model_override or model,
                is_estimated=is_estimated,
            )
        except Exception:
            logger.exception("usage_span record_usage failed")
    if raised is not None:
        raise raised


def clear_override_cache() -> None:
    """Test helper — drop the in-process override cache."""
    _override_cache.clear()


# ---------------------------------------------------------------------------
# Per-provider convenience helpers. Call these from the existing call sites —
# they keep instrumentation to one line at the use site and centralise the
# shape of `units` per provider so we can't drift across files.
# ---------------------------------------------------------------------------


async def record_anthropic_chat(
    db: AsyncSession,
    ctx: UsageContext,
    *,
    model: str,
    input_tokens: int,
    output_tokens: int,
    cache_read: int = 0,
    cache_write: int = 0,
    source: str = "api",
    metadata: dict | None = None,
) -> UsageEvent:
    units: dict = {"tokens_in": input_tokens, "tokens_out": output_tokens}
    if cache_read:
        units["cache_read"] = cache_read
    if cache_write:
        units["cache_write"] = cache_write
    return await record_usage(
        db,
        provider="anthropic",
        operation="chat",
        units=units,
        ctx=ctx,
        source=source,
        model=model,
        metadata=metadata,
    )


async def record_openai_chat(
    db: AsyncSession,
    ctx: UsageContext,
    *,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    source: str = "api",
    metadata: dict | None = None,
) -> UsageEvent:
    return await record_usage(
        db,
        provider="openai",
        operation="chat",
        units={"tokens_in": prompt_tokens, "tokens_out": completion_tokens},
        ctx=ctx,
        source=source,
        model=model,
        metadata=metadata,
    )


async def record_elevenlabs_tts(
    db: AsyncSession,
    ctx: UsageContext,
    *,
    characters: int,
    model: str | None = None,
    source: str = "api",
    metadata: dict | None = None,
) -> UsageEvent:
    return await record_usage(
        db,
        provider="elevenlabs",
        operation="tts",
        units={"characters": characters},
        ctx=ctx,
        source=source,
        model=model,
        metadata=metadata,
    )


async def record_cartesia_tts(
    db: AsyncSession,
    ctx: UsageContext,
    *,
    characters: int,
    model: str | None = None,
    source: str = "api",
    metadata: dict | None = None,
) -> UsageEvent:
    return await record_usage(
        db,
        provider="cartesia",
        operation="tts",
        units={"characters": characters},
        ctx=ctx,
        source=source,
        model=model,
        metadata=metadata,
    )


async def record_deepgram_stt(
    db: AsyncSession,
    ctx: UsageContext,
    *,
    seconds: float,
    model: str | None = None,
    source: str = "api",
    metadata: dict | None = None,
) -> UsageEvent:
    return await record_usage(
        db,
        provider="deepgram",
        operation="stt",
        units={"seconds": seconds},
        ctx=ctx,
        source=source,
        model=model,
        metadata=metadata,
    )


async def record_livekit_egress(
    db: AsyncSession,
    ctx: UsageContext,
    *,
    seconds: int,
    source: str = "webhook",
    metadata: dict | None = None,
) -> UsageEvent:
    return await record_usage(
        db,
        provider="livekit",
        operation="egress",
        units={"seconds": seconds},
        ctx=ctx,
        source=source,
        metadata=metadata,
    )


async def record_livekit_room_minutes(
    db: AsyncSession,
    ctx: UsageContext,
    *,
    participant_minutes: float,
    source: str = "webhook",
    metadata: dict | None = None,
) -> UsageEvent:
    return await record_usage(
        db,
        provider="livekit",
        operation="room_minutes",
        units={"participant_minutes": participant_minutes},
        ctx=ctx,
        source=source,
        metadata=metadata,
    )


async def record_resend_email(
    db: AsyncSession,
    ctx: UsageContext,
    *,
    count: int = 1,
    source: str = "api",
    metadata: dict | None = None,
) -> UsageEvent:
    return await record_usage(
        db,
        provider="resend",
        operation="email_send",
        units={"count": count},
        ctx=ctx,
        source=source,
        metadata=metadata,
    )
