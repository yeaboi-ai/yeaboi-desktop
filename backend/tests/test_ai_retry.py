"""Tests for the with_retry helper in services/ai_retry.py."""

from __future__ import annotations

import httpx
import pytest
from anthropic import BadRequestError
from anthropic import RateLimitError as AnthropicRateLimit

from src.app.services.ai_retry import with_retry
from src.app.services.provider_errors import (
    CreditExhaustedError,
    InvalidKeyError,
    ProviderTransientError,
    RateLimitError,
)


def _transient_anthropic_exc():
    """Anthropic SDK exception that classifies to ProviderTransientError."""
    return httpx.ConnectError("connection reset")


def _rate_limited_anthropic_exc():
    body = {"error": {"type": "rate_limit_error", "message": "rate limited"}}
    return AnthropicRateLimit(
        message="rate",
        response=httpx.Response(
            429, json=body, request=httpx.Request("POST", "https://x.test/"), headers={"retry-after": "1"}
        ),
        body=body,
    )


def _credit_exhausted_anthropic_exc():
    body = {
        "error": {
            "type": "invalid_request_error",
            "message": "Your credit balance is too low to access the Anthropic API.",
        }
    }
    return BadRequestError(
        message="bad",
        response=httpx.Response(400, json=body, request=httpx.Request("POST", "https://x.test/")),
        body=body,
    )


@pytest.mark.asyncio
async def test_retry_succeeds_after_two_transients():
    """Two transient errors then a successful call — with_retry returns the result."""
    calls = {"n": 0}

    async def fn():
        calls["n"] += 1
        if calls["n"] < 3:
            raise _transient_anthropic_exc()
        return "ok"

    result = await with_retry(
        fn,
        provider="anthropic",
        scope="platform",
        # tiny delays so the test runs in <1s
        delays=(0.0, 0.0, 0.0),
    )
    assert result == "ok"
    assert calls["n"] == 3


@pytest.mark.asyncio
async def test_retry_exhausts_after_max_attempts():
    """3 transient errors → ProviderTransientError raised."""
    calls = {"n": 0}

    async def fn():
        calls["n"] += 1
        raise _transient_anthropic_exc()

    with pytest.raises(ProviderTransientError):
        await with_retry(fn, provider="anthropic", scope="platform", delays=(0.0, 0.0, 0.0))
    assert calls["n"] == 3


@pytest.mark.asyncio
async def test_auth_error_fails_fast_no_retry():
    """A credit-exhausted error is deterministic — must NOT retry."""
    calls = {"n": 0}

    async def fn():
        calls["n"] += 1
        raise _credit_exhausted_anthropic_exc()

    with pytest.raises(CreditExhaustedError):
        await with_retry(fn, provider="anthropic", scope="platform", delays=(0.0, 0.0, 0.0))
    assert calls["n"] == 1  # one attempt, no retries


@pytest.mark.asyncio
async def test_invalid_key_fails_fast_no_retry():
    """Invalid key is deterministic — must NOT retry."""
    from anthropic import AuthenticationError

    calls = {"n": 0}

    async def fn():
        calls["n"] += 1
        body = {"error": {"type": "authentication_error", "message": "invalid x-api-key"}}
        raise AuthenticationError(
            message="auth",
            response=httpx.Response(401, json=body, request=httpx.Request("POST", "https://x.test/")),
            body=body,
        )

    with pytest.raises(InvalidKeyError):
        await with_retry(fn, provider="anthropic", scope="platform", delays=(0.0, 0.0, 0.0))
    assert calls["n"] == 1


@pytest.mark.asyncio
async def test_rate_limit_is_retried():
    """A rate-limit error is retried (might succeed on the next attempt)."""
    calls = {"n": 0}

    async def fn():
        calls["n"] += 1
        if calls["n"] < 2:
            raise _rate_limited_anthropic_exc()
        return "recovered"

    result = await with_retry(fn, provider="anthropic", scope="platform", delays=(0.0, 0.0, 0.0))
    assert result == "recovered"
    assert calls["n"] == 2


@pytest.mark.asyncio
async def test_typed_provider_error_passthrough():
    """A pre-classified RateLimitError should retry; CreditExhaustedError shouldn't."""
    calls = {"n": 0}

    async def fn_rate():
        calls["n"] += 1
        if calls["n"] < 2:
            raise RateLimitError(provider="anthropic", scope="platform", message="rate")
        return "ok"

    result = await with_retry(fn_rate, provider="anthropic", scope="platform", delays=(0.0, 0.0, 0.0))
    assert result == "ok"
    assert calls["n"] == 2

    calls["n"] = 0

    async def fn_credit():
        calls["n"] += 1
        raise CreditExhaustedError(provider="anthropic", scope="platform", message="out of credits")

    with pytest.raises(CreditExhaustedError):
        await with_retry(fn_credit, provider="anthropic", scope="platform", delays=(0.0, 0.0, 0.0))
    assert calls["n"] == 1


@pytest.mark.asyncio
async def test_non_provider_exception_bubbles():
    """An unrelated exception (TypeError) shouldn't be re-classified — bubble unchanged."""

    async def fn():
        raise TypeError("totally unrelated bug")

    with pytest.raises(TypeError, match="totally unrelated bug"):
        await with_retry(fn, provider="anthropic", scope="platform", delays=(0.0, 0.0, 0.0))


@pytest.mark.asyncio
async def test_open_circuit_keeps_the_recorded_diagnosis():
    """Past the second failure the call short-circuits, and the error it raises
    is what gets recorded next. Raising a generic transient here overwrote
    PROVIDER_INVALID_KEY, so a placeholder key read as "Anthropic is having
    trouble" in the banner and stayed green in Settings."""
    from src.app.services import provider_health

    provider_health.reset_for_tests()
    try:
        for _ in range(2):
            await provider_health.mark_unhealthy(
                "platform",
                "anthropic",
                InvalidKeyError(provider="anthropic", scope="platform", message="API key is invalid."),
            )

        calls = {"n": 0}

        async def fn():
            calls["n"] += 1
            return "never reached"

        with pytest.raises(InvalidKeyError) as excinfo:
            await with_retry(fn, provider="anthropic", scope="platform", delays=(0.0, 0.0, 0.0))
        assert calls["n"] == 0  # still fails fast
        assert "circuit" not in str(excinfo.value)  # no internals in the message
    finally:
        provider_health.reset_for_tests()
