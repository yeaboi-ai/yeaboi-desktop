"""Exponential-backoff retry helper for AI SDK calls.

Wraps a single SDK invocation so transient provider blips (rate limits, brief
network glitches, the kind of "elevated error rates" Anthropic posts on its
status page) don't surface to the user. Retries only on classes of errors
that *might* succeed on a re-try; auth/credit/validation errors fail fast.

Used by `AIClient._invoke()` and the streaming entry-point before any tokens
are yielded. Once a stream has started emitting bytes we can't safely retry
without confusing the client, so the helper is intentionally not wrapped
around the iterator itself.
"""

from __future__ import annotations

import asyncio
import logging
import random
from collections.abc import Awaitable, Callable
from typing import TypeVar

from . import provider_health
from .provider_errors import ProviderError, ProviderTransientError, RateLimitError, classify

logger = logging.getLogger(__name__)

T = TypeVar("T")

# 3 attempts → ~0.5s, ~2s, ~5s between (plus ±20% jitter). Total ceiling
# of ~8 seconds before we give up and try the failover chain or surface
# the error. Matches Anthropic's typical incident-window of a few seconds
# of elevated errors before requests start succeeding again.
_DEFAULT_DELAYS = (0.5, 2.0, 5.0)


def _jitter(delay: float) -> float:
    """±20% jitter to avoid retry stampedes across concurrent callers."""
    return delay * random.uniform(0.8, 1.2)


async def with_retry(
    fn: Callable[[], Awaitable[T]],
    *,
    provider: str,
    scope: str,
    role: str | None = None,
    max_attempts: int = 3,
    delays: tuple[float, ...] = _DEFAULT_DELAYS,
) -> T:
    """Invoke ``fn`` with retry on transient errors only.

    Args:
        fn: Zero-arg async callable that performs one SDK call. Wrapping in
            a closure lets the caller bake in its own kwargs.
        provider: Underlying vendor name (e.g. "anthropic"). Used to classify
            unrecognised exceptions into typed ProviderError subclasses so
            the caller can decide whether to retry.
        scope: "platform" or f"org:{id}" — same as everywhere else in the
            provider stack.
        role: Optional role name for logs and metrics (e.g. "chat").
        max_attempts: Total tries including the first. Default 3.
        delays: Tuple of delays before attempts 2..N. Default (0.5s, 2s, 5s).

    Returns:
        Whatever ``fn`` returns on success.

    Raises:
        ProviderError on the final failure (typed). Non-provider exceptions
        bubble unchanged so unrelated bugs surface.
    """
    # Half-open circuit breaker: short-circuit only after ≥2 consecutive
    # failures have been recorded. This preserves the classic "first call
    # fails → next call probes recovery" pattern (and the test for it),
    # while still catching the May-17 amplification class — once the
    # second trace has also failed, every concurrent trace after it fails
    # fast instead of walking the retry ladder against a known-bad upstream.
    # The typed error flows into the caller's failover chain, so banner
    # UX is unchanged.
    snap = await provider_health.get(scope, provider)
    if (
        snap is not None
        and snap.get("status") == "unhealthy"
        and int(snap.get("consecutive_failures") or 0) >= 2
    ):
        logger.info(
            "ai_call_fail_fast — provider circuit open",
            extra={
                "provider": provider,
                "scope": scope,
                "role": role,
                "error_code": snap.get("error_code"),
                "consecutive_failures": snap.get("consecutive_failures"),
            },
        )
        raise ProviderTransientError(
            provider=provider,
            scope=scope,
            message=(
                f"Provider {provider} circuit open "
                f"(consecutive_failures={snap.get('consecutive_failures')}); "
                "failing fast to prevent retry amplification."
            ),
        )

    last_exc: Exception | None = None
    last_classified: ProviderError | None = None

    for attempt in range(1, max_attempts + 1):
        try:
            return await fn()
        except ProviderError as exc:
            # Already classified — decide retry by type.
            last_exc = exc
            last_classified = exc
            if not _is_retryable(exc):
                raise
        except Exception as exc:
            # Classify so we know whether to retry.
            classified = classify(exc, provider=provider, scope=scope)
            last_exc = exc
            last_classified = classified
            if classified is None:
                # Unrelated exception (TypeError, KeyError, etc.) — bubble
                # unchanged so unrelated bugs surface as themselves.
                raise
            if not _is_retryable(classified):
                # Recognised but deterministic (auth, credit, validation).
                # Surface the typed error so callers don't have to
                # re-classify the raw SDK exception themselves.
                raise classified from exc

        # Last attempt — don't sleep, just give up after this loop iter.
        if attempt >= max_attempts:
            break

        delay_idx = min(attempt - 1, len(delays) - 1)
        sleep_for = _jitter(delays[delay_idx])
        logger.warning(
            "ai_call_retry",
            extra={
                "provider": provider,
                "scope": scope,
                "role": role,
                "attempt": attempt,
                "max_attempts": max_attempts,
                "next_delay_s": round(sleep_for, 2),
                "error_code": getattr(last_classified, "code", None),
            },
        )
        try:
            from ..metrics import AI_RETRY_COUNT

            AI_RETRY_COUNT.labels(provider=provider, attempt=str(attempt)).inc()
        except Exception:
            # Metrics are observability — never break the call path.
            logger.debug("AI_RETRY_COUNT metric failed", exc_info=True)
        await asyncio.sleep(sleep_for)

    # Exhausted. Raise the typed error if we have one, else the original.
    if last_classified is not None:
        raise last_classified
    assert last_exc is not None  # one of the two is always set
    raise last_exc


def _is_retryable(exc: ProviderError) -> bool:
    """Only retry transient + rate-limit. Auth/credit/validation fail fast."""
    return isinstance(exc, (ProviderTransientError, RateLimitError))
