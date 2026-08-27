"""Tests for the transcript enhancer service.

The enhancer routes through ``get_ai_client_for_role`` (so it gets
retry/failover for free). Tests mock that factory instead of the raw
Anthropic SDK so behaviour is decoupled from which provider serves the
``transcript_enhance`` role.
"""

from unittest.mock import AsyncMock, patch

import pytest

from src.app.services.transcript_enhancer import (
    TranscriptContext,
    enhance_transcript,
)


def _fake_ai_client(*, response_text: str = "ok", raises: Exception | None = None):
    """Build a fake AIClient with a stubbed ``chat`` method."""
    client = AsyncMock()
    if raises is not None:
        client.chat = AsyncMock(side_effect=raises)
    else:
        client.chat = AsyncMock(return_value=response_text)
    return client


@pytest.mark.asyncio
async def test_empty_text_returns_unchanged():
    result = await enhance_transcript("")
    assert result.enhanced_text == ""
    assert result.was_enhanced is False


@pytest.mark.asyncio
async def test_whitespace_only_returns_unchanged():
    result = await enhance_transcript("   ")
    assert result.enhanced_text == "   "
    assert result.was_enhanced is False


@pytest.mark.asyncio
async def test_no_api_key_returns_raw():
    """When no Anthropic API key is set, enhancement is skipped."""
    from src.app.config import Settings

    mock_settings = Settings(anthropic_api_key="", database_url="sqlite+aiosqlite:///")
    with patch("src.app.services.transcript_enhancer.get_settings", return_value=mock_settings):
        result = await enhance_transcript("um so like hello")
    assert result.enhanced_text == "um so like hello"
    assert result.raw_text == "um so like hello"
    assert result.was_enhanced is False


@pytest.mark.asyncio
async def test_successful_enhancement(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    from src.app.config import get_settings

    get_settings.cache_clear()

    fake = _fake_ai_client(response_text="Hello, we should use PostgreSQL.")
    with patch(
        "src.app.services.transcript_enhancer.get_ai_client_for_role",
        AsyncMock(return_value=fake),
    ):
        result = await enhance_transcript(
            "um so like hello uh we should use PostgreSQL",
            context=TranscriptContext(session_topic="database selection", speaker_name="Omar"),
        )

    assert result.enhanced_text == "Hello, we should use PostgreSQL."
    assert result.raw_text == "um so like hello uh we should use PostgreSQL"
    assert result.was_enhanced is True

    # Verify the wrapper was called once with our message text
    fake.chat.assert_awaited_once()
    call_kwargs = fake.chat.call_args.kwargs
    assert "PostgreSQL" in call_kwargs["messages"][0]["content"]

    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_api_error_returns_raw(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    from src.app.config import get_settings

    get_settings.cache_clear()

    fake = _fake_ai_client(raises=Exception("API error"))
    with patch(
        "src.app.services.transcript_enhancer.get_ai_client_for_role",
        AsyncMock(return_value=fake),
    ):
        result = await enhance_transcript("hello world")

    assert result.enhanced_text == "hello world"
    assert result.was_enhanced is False

    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_vocabulary_hints_included_in_prompt(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    from src.app.config import get_settings

    get_settings.cache_clear()

    fake = _fake_ai_client(response_text="Omar Noureldin said hello.")
    ctx = TranscriptContext(vocabulary_hints=["Omar Noureldin", "PostgreSQL"])

    with patch(
        "src.app.services.transcript_enhancer.get_ai_client_for_role",
        AsyncMock(return_value=fake),
    ):
        await enhance_transcript("Omar Nouraldeen said hello", context=ctx)

    call_kwargs = fake.chat.call_args.kwargs
    assert "Omar Noureldin" in call_kwargs["system"]
    assert "PostgreSQL" in call_kwargs["system"]

    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_empty_llm_response_returns_raw(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    from src.app.config import get_settings

    get_settings.cache_clear()

    fake = _fake_ai_client(response_text="")
    with patch(
        "src.app.services.transcript_enhancer.get_ai_client_for_role",
        AsyncMock(return_value=fake),
    ):
        result = await enhance_transcript("hello world")

    assert result.enhanced_text == "hello world"
    assert result.was_enhanced is False

    get_settings.cache_clear()
