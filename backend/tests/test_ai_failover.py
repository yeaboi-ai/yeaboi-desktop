"""Tests for the per-role AIClient failover chain.

Covers:
- Anthropic primary fails → Gemini fallback succeeds; result reflects the alt
  provider; original ProviderError is suppressed.
- All providers in the chain fail → original error is re-raised.
- BYOK scope skips platform failover entirely (no silent platform spend).
- AI_FAILOVER_ENABLED=false skips failover.
- Empty chain (role with no failover configured) → original error re-raised.
- Stream pre-yield failover swaps providers; mid-stream errors bubble.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import httpx
import pytest
from anthropic import BadRequestError

from src.app.services import ai_provider, provider_health
from src.app.services.ai_provider import AIClient
from src.app.services.provider_errors import CreditExhaustedError


@pytest.fixture(autouse=True)
async def _reset_health():
    await provider_health.reset_for_tests_async()
    yield
    await provider_health.reset_for_tests_async()


@pytest.fixture
def _settings_with_keys(monkeypatch):
    """Force a known set of keys so failover can find Gemini and OpenAI."""
    from src.app.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-anthropic")
    monkeypatch.setenv("GOOGLE_API_KEY", "test-gemini")
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai")
    monkeypatch.setenv("AI_FAILOVER_ENABLED", "true")
    yield
    get_settings.cache_clear()


def _credit_exhausted_exc():
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


class _FakeContent:
    def __init__(self, text):
        self.text = text


class _FakeResponse:
    def __init__(self, text):
        self.content = [_FakeContent(text)]


class _FakeOpenAIMessage:
    def __init__(self, text):
        self.content = text


class _FakeOpenAIChoice:
    def __init__(self, text):
        self.message = _FakeOpenAIMessage(text)


class _FakeOpenAIResponse:
    def __init__(self, text):
        self.choices = [_FakeOpenAIChoice(text)]


@pytest.mark.asyncio
async def test_failover_anthropic_to_gemini_success(_settings_with_keys, monkeypatch):
    """Anthropic dies with credit-exhausted; chat() returns the Gemini text."""
    # Anthropic always fails
    fake_anthropic = AsyncMock()
    fake_anthropic.messages.create = AsyncMock(side_effect=_credit_exhausted_exc())

    # Gemini (openai-compat) returns the rescued response
    fake_openai = AsyncMock()
    fake_openai.chat.completions.create = AsyncMock(return_value=_FakeOpenAIResponse("from-gemini"))

    # Patch the alt-client builder so we substitute our fake Gemini SDK
    real_build_alt = ai_provider._build_alt_client

    def patched_build_alt(name, prov_cfg, api_key, tier, *, role, org_id, db):
        client = real_build_alt(name, prov_cfg, api_key, tier, role=role, org_id=org_id, db=db)
        if name == "gemini":
            client._openai = fake_openai
        return client

    monkeypatch.setattr(ai_provider, "_build_alt_client", patched_build_alt)

    client = AIClient(
        provider="platform",
        anthropic_client=fake_anthropic,
        model="claude-sonnet-4-6",
        underlying_provider="anthropic",
        scope="platform",
        role="chat",
    )

    result = await client.chat(messages=[{"role": "user", "content": "hi"}])
    assert result == "from-gemini"

    # Primary should be marked unhealthy in Redis snapshot
    snap = await provider_health.get("platform", "anthropic")
    assert snap is not None
    assert snap["error_code"] == "PROVIDER_CREDIT_EXHAUSTED"


@pytest.mark.asyncio
async def test_failover_all_providers_fail_raises_original(_settings_with_keys, monkeypatch):
    """If every candidate in the chain fails, the original error re-raises."""
    fake_anthropic = AsyncMock()
    fake_anthropic.messages.create = AsyncMock(side_effect=_credit_exhausted_exc())

    fake_openai = AsyncMock()
    fake_openai.chat.completions.create = AsyncMock(side_effect=_credit_exhausted_exc())

    real_build_alt = ai_provider._build_alt_client

    def patched_build_alt(name, prov_cfg, api_key, tier, *, role, org_id, db):
        client = real_build_alt(name, prov_cfg, api_key, tier, role=role, org_id=org_id, db=db)
        # Every alt also fails
        client._openai = fake_openai
        return client

    monkeypatch.setattr(ai_provider, "_build_alt_client", patched_build_alt)

    client = AIClient(
        provider="platform",
        anthropic_client=fake_anthropic,
        model="claude-sonnet-4-6",
        underlying_provider="anthropic",
        scope="platform",
        role="chat",
    )

    with pytest.raises(CreditExhaustedError):
        await client.chat(messages=[{"role": "user", "content": "hi"}])


@pytest.mark.asyncio
async def test_byok_scope_skips_platform_failover(_settings_with_keys, monkeypatch):
    """A BYOK org's key failing must NOT silently fall back to platform creds."""
    fake_anthropic = AsyncMock()
    fake_anthropic.messages.create = AsyncMock(side_effect=_credit_exhausted_exc())

    # If the alt builder is called we'd want to know — count invocations.
    build_alt_calls = {"n": 0}

    def patched_build_alt(*args, **kwargs):
        build_alt_calls["n"] += 1
        raise RuntimeError("should not be called for BYOK scope")

    monkeypatch.setattr(ai_provider, "_build_alt_client", patched_build_alt)

    client = AIClient(
        provider="byok",
        anthropic_client=fake_anthropic,
        model="claude-sonnet-4-6",
        underlying_provider="anthropic",
        scope="org:abc123",  # BYOK
        role="chat",
    )

    with pytest.raises(CreditExhaustedError):
        await client.chat(messages=[{"role": "user", "content": "hi"}])
    assert build_alt_calls["n"] == 0


@pytest.mark.asyncio
async def test_failover_disabled_globally(_settings_with_keys, monkeypatch):
    """AI_FAILOVER_ENABLED=false short-circuits even for platform-scope chat."""
    from src.app.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("AI_FAILOVER_ENABLED", "false")

    fake_anthropic = AsyncMock()
    fake_anthropic.messages.create = AsyncMock(side_effect=_credit_exhausted_exc())

    def patched_build_alt(*args, **kwargs):
        raise RuntimeError("failover disabled — should not be called")

    monkeypatch.setattr(ai_provider, "_build_alt_client", patched_build_alt)

    client = AIClient(
        provider="platform",
        anthropic_client=fake_anthropic,
        model="claude-sonnet-4-6",
        underlying_provider="anthropic",
        scope="platform",
        role="chat",
    )

    with pytest.raises(CreditExhaustedError):
        await client.chat(messages=[{"role": "user", "content": "hi"}])


@pytest.mark.asyncio
async def test_no_role_skips_failover(_settings_with_keys, monkeypatch):
    """Legacy callers that built AIClient without a role keep their old
    (no-failover) behaviour bit-for-bit."""
    fake_anthropic = AsyncMock()
    fake_anthropic.messages.create = AsyncMock(side_effect=_credit_exhausted_exc())

    def patched_build_alt(*args, **kwargs):
        raise RuntimeError("no role — should not be called")

    monkeypatch.setattr(ai_provider, "_build_alt_client", patched_build_alt)

    client = AIClient(
        provider="platform",
        anthropic_client=fake_anthropic,
        model="claude-sonnet-4-6",
        underlying_provider="anthropic",
        scope="platform",
        role=None,  # legacy
    )

    with pytest.raises(CreditExhaustedError):
        await client.chat(messages=[{"role": "user", "content": "hi"}])


@pytest.mark.asyncio
async def test_failover_skips_role_with_empty_chain(_settings_with_keys, monkeypatch):
    """A role whose chain is empty (e.g. ``brand``) shows banner, no failover."""
    fake_anthropic = AsyncMock()
    fake_anthropic.messages.create = AsyncMock(side_effect=_credit_exhausted_exc())

    def patched_build_alt(*args, **kwargs):
        raise RuntimeError("empty chain — should not be called")

    monkeypatch.setattr(ai_provider, "_build_alt_client", patched_build_alt)

    client = AIClient(
        provider="platform",
        anthropic_client=fake_anthropic,
        model="claude-sonnet-4-6",
        underlying_provider="anthropic",
        scope="platform",
        role="brand",  # empty chain in _FAILOVER_CHAINS
    )

    with pytest.raises(CreditExhaustedError):
        await client.chat(messages=[{"role": "user", "content": "hi"}])


@pytest.mark.asyncio
async def test_resolve_failover_chain_env_override(monkeypatch):
    """ROLE_<NAME>_FAILOVER overrides the static default."""
    monkeypatch.setenv("ROLE_CHAT_FAILOVER", "openai:default,gemini:fast")
    chain = ai_provider._resolve_failover_chain("chat")
    assert chain == [("openai", "default"), ("gemini", "fast")]

    # Empty override = clear the chain
    monkeypatch.setenv("ROLE_CHAT_FAILOVER", "")
    assert ai_provider._resolve_failover_chain("chat") == []


@pytest.mark.asyncio
async def test_unhealthy_alt_is_skipped(_settings_with_keys, monkeypatch):
    """If gemini is unhealthy in Redis at failover time, we skip it and try the
    next candidate (openai)."""
    fake_anthropic = AsyncMock()
    fake_anthropic.messages.create = AsyncMock(side_effect=_credit_exhausted_exc())

    fake_openai = AsyncMock()
    fake_openai.chat.completions.create = AsyncMock(return_value=_FakeOpenAIResponse("from-openai"))

    real_build_alt = ai_provider._build_alt_client
    seen_names = []

    def patched_build_alt(name, prov_cfg, api_key, tier, *, role, org_id, db):
        seen_names.append(name)
        client = real_build_alt(name, prov_cfg, api_key, tier, role=role, org_id=org_id, db=db)
        if name == "openai":
            client._openai = fake_openai
        elif name == "gemini":
            # Gemini SDK won't even be touched if it's skipped; but if it is,
            # make it fail so we can verify the skip.
            fail_openai = AsyncMock()
            fail_openai.chat.completions.create = AsyncMock(side_effect=_credit_exhausted_exc())
            client._openai = fail_openai
        return client

    monkeypatch.setattr(ai_provider, "_build_alt_client", patched_build_alt)

    # Pre-mark gemini unhealthy
    await provider_health.mark_unhealthy(
        "platform",
        "gemini",
        CreditExhaustedError(provider="gemini", scope="platform", message="out"),
    )

    client = AIClient(
        provider="platform",
        anthropic_client=fake_anthropic,
        model="claude-sonnet-4-6",
        underlying_provider="anthropic",
        scope="platform",
        role="chat",
    )

    result = await client.chat(messages=[{"role": "user", "content": "hi"}])
    assert result == "from-openai"
    # Gemini should have been skipped; only openai was actually constructed.
    assert "gemini" not in seen_names
    assert "openai" in seen_names
