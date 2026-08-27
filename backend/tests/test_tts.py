from unittest.mock import MagicMock, patch

from src.app.services.tts_service import list_voices, synthesize_speech


async def test_tts_disabled_without_api_key():
    with patch("src.app.services.tts_service.get_settings") as mock_settings:
        mock_settings.return_value.elevenlabs_api_key = ""
        result = await synthesize_speech("Hello world")
    assert result is None


async def test_tts_returns_audio_bytes():
    import sys

    async def fake_chunks():
        yield b"audio_chunk_1"
        yield b"audio_chunk_2"

    # tts_service calls convert() synchronously and iterates the returned
    # async generator. AsyncMock would wrap the call in a coroutine —
    # MagicMock with side_effect returns the generator directly.
    mock_client = MagicMock()
    mock_client.text_to_speech.convert = MagicMock(side_effect=lambda *a, **kw: fake_chunks())

    mock_elevenlabs_module = MagicMock()
    mock_elevenlabs_module.AsyncElevenLabs = MagicMock(return_value=mock_client)

    with patch("src.app.services.tts_service.get_settings") as mock_settings:
        mock_settings.return_value.elevenlabs_api_key = "test-key"
        mock_settings.return_value.elevenlabs_voice_id = "test-voice"
        mock_settings.return_value.elevenlabs_model_id = "eleven_turbo_v2_5"

        original = sys.modules.get("elevenlabs")
        sys.modules["elevenlabs"] = mock_elevenlabs_module
        try:
            result = await synthesize_speech("Hello world")
        finally:
            if original is not None:
                sys.modules["elevenlabs"] = original
            else:
                del sys.modules["elevenlabs"]

    assert result == b"audio_chunk_1audio_chunk_2"


async def test_tts_handles_error_gracefully():
    with patch("src.app.services.tts_service.get_settings") as mock_settings:
        mock_settings.return_value.elevenlabs_api_key = "test-key"
        mock_settings.return_value.elevenlabs_voice_id = "test-voice"
        mock_settings.return_value.elevenlabs_model_id = "eleven_turbo_v2_5"

        import sys
        from unittest.mock import MagicMock

        mock_elevenlabs_module = MagicMock()
        mock_elevenlabs_module.AsyncElevenLabs.side_effect = Exception("API down")
        sys.modules["elevenlabs"] = mock_elevenlabs_module

        result = await synthesize_speech("Hello world")

    assert result is None


def test_list_voices():
    voices = list_voices()
    assert len(voices) == 4
    assert all("id" in v and "name" in v for v in voices)
