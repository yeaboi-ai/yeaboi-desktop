"""Tests that AIClient surfaces provider errors via _invoke + clears health on success."""

from __future__ import annotations

from unittest.mock import AsyncMock

import httpx
import pytest

from src.app.services import provider_health
from src.app.services.ai_provider import AIClient
from src.app.services.provider_errors import CreditExhaustedError


@pytest.fixture(autouse=True)
async def _reset_health():
    await provider_health.reset_for_tests_async()
    yield
    await provider_health.reset_for_tests_async()


def _credit_exhausted_anthropic_exc():
    from anthropic import BadRequestError

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
async def test_invoke_classifies_credit_exhausted_and_writes_health():
    fake_anthropic = AsyncMock()
    fake_anthropic.messages.create = AsyncMock(side_effect=_credit_exhausted_anthropic_exc())

    client = AIClient(
        provider="platform",
        anthropic_client=fake_anthropic,
        model="claude-sonnet-4-6",
        underlying_provider="anthropic",
        scope="platform",
    )

    with pytest.raises(CreditExhaustedError) as excinfo:
        await client.chat(messages=[{"role": "user", "content": "hi"}])
    assert excinfo.value.provider == "anthropic"
    assert excinfo.value.scope == "platform"

    snap = await provider_health.get("platform", "anthropic")
    assert snap is not None
    assert snap["error_code"] == "PROVIDER_CREDIT_EXHAUSTED"


@pytest.mark.asyncio
async def test_invoke_clears_health_on_recovery():
    """After a failure marked the provider unhealthy, the next successful call clears it."""
    fake_anthropic = AsyncMock()
    # First call fails …
    fake_anthropic.messages.create = AsyncMock(side_effect=_credit_exhausted_anthropic_exc())

    client = AIClient(
        provider="platform",
        anthropic_client=fake_anthropic,
        model="claude-sonnet-4-6",
        underlying_provider="anthropic",
        scope="platform",
    )

    with pytest.raises(CreditExhaustedError):
        await client.chat(messages=[{"role": "user", "content": "hi"}])
    assert await provider_health.get("platform", "anthropic") is not None

    # Then succeeds — mock a response shape AIClient._chat_inner expects
    class _FakeContent:
        text = "ok"

    class _FakeResponse:
        content = [_FakeContent()]

    fake_anthropic.messages.create = AsyncMock(return_value=_FakeResponse())
    out = await client.chat(messages=[{"role": "user", "content": "hi"}])
    assert out == "ok"
    assert await provider_health.get("platform", "anthropic") is None
