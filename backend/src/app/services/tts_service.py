import io
import logging
import os

import httpx

from ..config import get_settings
from . import provider_health
from .provider_errors import ProviderTransientError

logger = logging.getLogger(__name__)

# Cartesia HTTP TTS endpoint. We hit it directly rather than via the
# `livekit-plugins-cartesia` plugin (which is wired into the LiveKit voice
# pipeline, not for ad-hoc REST calls).
_CARTESIA_TTS_URL = "https://api.cartesia.ai/tts/bytes"
_CARTESIA_VERSION = "2024-11-13"
_CARTESIA_DEFAULT_VOICE_ID = "f114a467-c40a-4db8-964d-aaba89cd08fa"  # "Sonic"

ELEVENLABS_VOICES = {
    "rachel": {"id": "21m00Tcm4TlvDq8ikWAM", "name": "Rachel", "description": "Calm, professional"},
    "drew": {"id": "29vD33N1CtxCmqQRPOHJ", "name": "Drew", "description": "Warm, confident"},
    "clyde": {"id": "2EiwWnXFnvU5JabPnv8n", "name": "Clyde", "description": "Deep, authoritative"},
    "sarah": {"id": "EXAVITQu4vr4xnSDxMaL", "name": "Sarah", "description": "Soft, friendly"},
}

CARTESIA_VOICES = [
    {"id": "a167e0f3-df7e-4d52-a9c3-f949145efdab", "name": "Blake", "description": "Energetic American male"},
    {
        "id": "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
        "name": "Jacqueline",
        "description": "Confident young American female",
    },
    {"id": "f31cc6a7-c1e8-4764-980c-60a361443dd1", "name": "Robyn", "description": "Neutral, mature Australian female"},
    {"id": "f114a467-c40a-4db8-964d-aaba89cd08fa", "name": "Sonic", "description": "Clear, professional male"},
    {"id": "5c5ad5e7-1020-476b-8b91-fdcbe9cc313c", "name": "Daniela", "description": "Calm, trusting Mexican female"},
    {"id": "71a7ad14-091c-4e8e-a314-022ecdadfe07", "name": "Valentino", "description": "Warm, deep Italian male"},
    {"id": "c45bc5ec-dc68-4feb-8829-6e6b2748095d", "name": "Merchant", "description": "Authoritative British male"},
    {"id": "79a125e8-cd45-4c13-8a67-68995f14e2ef", "name": "Tina", "description": "Friendly, upbeat American female"},
]

AVAILABLE_VOICES = ELEVENLABS_VOICES  # legacy compat


async def _call_elevenlabs(text: str, voice_id: str | None, output_format: str) -> bytes | None:
    """Internal helper — call ElevenLabs and return raw audio bytes for the given format."""
    settings = get_settings()
    if not settings.elevenlabs_api_key:
        logger.warning("No ElevenLabs API key — TTS disabled")
        return None

    voice = voice_id or settings.elevenlabs_voice_id

    try:
        from elevenlabs import AsyncElevenLabs

        client = AsyncElevenLabs(api_key=settings.elevenlabs_api_key)
        audio_iterator = client.text_to_speech.convert(
            text=text,
            voice_id=voice,
            model_id=settings.elevenlabs_model_id,
            output_format=output_format,
        )

        buffer = io.BytesIO()
        async for chunk in audio_iterator:
            buffer.write(chunk)

        audio_bytes = buffer.getvalue()
        if not audio_bytes:
            logger.warning("ElevenLabs returned empty audio")
            return None

        logger.info(
            "TTS generated %s bytes via ElevenLabs (%s) for %s chars",
            len(audio_bytes),
            output_format,
            len(text),
        )
        await provider_health.mark_healthy("platform", "elevenlabs")
        return audio_bytes

    except Exception as e:
        logger.error("ElevenLabs TTS error: %s", e)
        # Best-effort: surface as a transient health snapshot so the banner
        # shows the affected feature. We don't know if the error is auth or
        # network — treat as transient so the next attempt clears it.
        try:
            await provider_health.mark_unhealthy(
                "platform",
                "elevenlabs",
                ProviderTransientError(
                    provider="elevenlabs", scope="platform", message=str(e) or "TTS error", original=e
                ),
            )
        except Exception:
            logger.debug("Failed to mark elevenlabs unhealthy", exc_info=True)
        return None


def _cartesia_output_format(target: str) -> dict:
    """Translate our internal format names to Cartesia's `output_format` block.

    - ``pcm_24000``     → 24kHz mono signed-16 PCM in a raw container (matches
                          the LiveKit-agent path used elsewhere)
    - ``mp3_44100_128`` → 44.1kHz MP3 at 128 kbps for browser playback
    """
    if target == "mp3_44100_128":
        return {"container": "mp3", "encoding": "mp3", "sample_rate": 44100, "bit_rate": 128000}
    return {"container": "raw", "encoding": "pcm_s16le", "sample_rate": 24000}


async def _call_cartesia(text: str, voice_id: str | None, output_format: str) -> bytes | None:
    """Internal helper — call Cartesia's REST TTS endpoint.

    Returns audio bytes on success, None on any failure (caller falls through
    to ElevenLabs). Marks Cartesia unhealthy on errors so the banner can
    reflect the outage even when the user-visible call succeeds via the
    backup.
    """
    api_key = os.getenv("CARTESIA_API_KEY")
    if not api_key:
        return None

    voice = voice_id or _CARTESIA_DEFAULT_VOICE_ID
    body = {
        "model_id": "sonic-2",
        "transcript": text,
        "voice": {"mode": "id", "id": voice},
        "output_format": _cartesia_output_format(output_format),
    }
    headers = {
        "X-API-Key": api_key,
        "Cartesia-Version": _CARTESIA_VERSION,
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(_CARTESIA_TTS_URL, json=body, headers=headers)
            resp.raise_for_status()
            audio_bytes = resp.content
            if not audio_bytes:
                logger.warning("Cartesia returned empty audio")
                return None
            logger.info(
                "TTS generated %s bytes via Cartesia (%s) for %s chars",
                len(audio_bytes),
                output_format,
                len(text),
            )
            await provider_health.mark_healthy("platform", "cartesia")
            return audio_bytes
    except Exception as e:
        logger.warning("Cartesia TTS error (%s) — falling back to ElevenLabs", e)
        try:
            await provider_health.mark_unhealthy(
                "platform",
                "cartesia",
                ProviderTransientError(
                    provider="cartesia", scope="platform", message=str(e) or "TTS error", original=e
                ),
            )
        except Exception:
            logger.debug("Failed to mark cartesia unhealthy", exc_info=True)
        return None


async def _synthesize_with_fallback(text: str, voice_id: str | None, output_format: str) -> bytes | None:
    """Try Cartesia first (cheaper, lower latency), fall back to ElevenLabs.

    Records active failover in Redis when Cartesia is the primary and we
    end up serving the request from ElevenLabs — so the banner can show
    "TTS is using ElevenLabs as a backup".
    """
    # Cartesia is only the primary when its key is set; otherwise we go
    # straight to ElevenLabs without recording a failover.
    cartesia_primary = bool(os.getenv("CARTESIA_API_KEY"))

    if cartesia_primary:
        result = await _call_cartesia(text, voice_id, output_format)
        if result is not None:
            return result
        # Cartesia failed — try ElevenLabs and surface the failover state.
        fallback_result = await _call_elevenlabs(text, voice_id, output_format)
        if fallback_result is not None:
            try:
                await provider_health.record_active_failover(
                    role="tts", from_provider="cartesia", to_provider="elevenlabs"
                )
            except Exception:
                logger.debug("Failed to record TTS active failover", exc_info=True)
        return fallback_result

    return await _call_elevenlabs(text, voice_id, output_format)


async def synthesize_speech(text: str, voice_id: str | None = None) -> bytes | None:
    """Convert text to speech and return raw PCM (pcm_24000).

    Used by the LiveKit agent for in-room audio. Tries Cartesia first when
    its key is configured, falls back to ElevenLabs.
    """
    return await _synthesize_with_fallback(text, voice_id, "pcm_24000")


async def synthesize_speech_mp3(text: str, voice_id: str | None = None) -> bytes | None:
    """Convert text to speech and return MP3 bytes suitable for browser playback.

    Uses mp3_44100_128 format which is universally supported by the Web Audio API.
    Tries Cartesia first when its key is configured, falls back to ElevenLabs.
    Returns None if both providers fail.
    """
    return await _synthesize_with_fallback(text, voice_id, "mp3_44100_128")


def list_voices() -> list[dict]:
    """Return available voice options — Cartesia if available, else ElevenLabs."""
    import os

    if os.getenv("CARTESIA_API_KEY"):
        return [{"id": v["id"], "name": v["name"], "description": v["description"]} for v in CARTESIA_VOICES]
    return [{"id": v["id"], "name": v["name"], "description": v["description"]} for v in ELEVENLABS_VOICES.values()]
