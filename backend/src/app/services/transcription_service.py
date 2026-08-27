"""Audio transcription service with dual provider support (Whisper API + Deepgram).

Supports multi-pass transcription: when both API keys are available, runs both
providers in parallel and reconciles with an LLM for maximum accuracy.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

import httpx

from ..config import get_settings

logger = logging.getLogger(__name__)

FALLBACK_TEXT = "[Voice note — transcription unavailable]"


async def transcribe_audio(
    file_path: Path,
    keywords: list[str] | None = None,
    keyterms: list[str] | None = None,
    whisper_prompt: str | None = None,
) -> str:
    """Transcribe an audio file to text. Auto-selects provider based on config and available API keys.

    Args:
        file_path: Path to the audio file.
        keywords: Deepgram keyword boost strings for Nova-2 (e.g. ["Omar Noureldin:1.5"]).
        keyterms: Deepgram keyterm strings for Nova-3 (plain terms, no weights).
        whisper_prompt: Vocabulary hint string for Whisper API.
    """
    settings = get_settings()
    provider = settings.transcription_provider.lower()

    has_openai = bool(settings.openai_api_key)
    has_deepgram = bool(settings.deepgram_api_key)

    # Auto-detect: if only one key is set, use that provider
    if not has_openai and not has_deepgram:
        logger.warning("No transcription API key configured (OPENAI_API_KEY or DEEPGRAM_API_KEY)")
        return FALLBACK_TEXT
    if has_openai and not has_deepgram:
        provider = "whisper"
    elif has_deepgram and not has_openai:
        provider = "deepgram"

    try:
        if provider == "deepgram":
            return await _transcribe_deepgram(
                file_path, settings.deepgram_api_key, keywords=keywords, keyterms=keyterms
            )
        else:
            return await _transcribe_whisper(file_path, settings.openai_api_key, prompt=whisper_prompt)
    except Exception as e:
        logger.error("Transcription failed (%s): %s", provider, e)
        return FALLBACK_TEXT


async def _transcribe_whisper(file_path: Path, api_key: str, prompt: str | None = None) -> str:
    """Transcribe using OpenAI Whisper API."""
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=api_key)
    kwargs: dict = {"model": "whisper-1"}
    if prompt:
        kwargs["prompt"] = prompt

    with open(file_path, "rb") as f:
        kwargs["file"] = f
        transcript = await client.audio.transcriptions.create(**kwargs)
    text = transcript.text.strip()
    logger.info("Whisper transcription (%s chars): %s", len(text), text[:100])
    return text or FALLBACK_TEXT


async def _transcribe_deepgram(
    file_path: Path, api_key: str, keywords: list[str] | None = None, keyterms: list[str] | None = None
) -> str:
    """Transcribe using Deepgram Nova-3 API."""
    audio_bytes = file_path.read_bytes()
    content_type = "audio/webm" if file_path.suffix == ".webm" else "audio/mp4"

    params: dict[str, str | list[str]] = {"model": "nova-3", "smart_format": "true", "filler_words": "true"}
    if keyterms:
        params["keyterm"] = keyterms  # Nova-3 keyterm prompting (up to 100 terms)
    elif keywords:
        params["keywords"] = keywords  # Legacy Nova-2 format

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.deepgram.com/v1/listen",
            params=params,
            headers={
                "Authorization": f"Token {api_key}",
                "Content-Type": content_type,
            },
            content=audio_bytes,
        )
        resp.raise_for_status()
        data = resp.json()

    text = data.get("results", {}).get("channels", [{}])[0].get("alternatives", [{}])[0].get("transcript", "").strip()
    logger.info("Deepgram transcription (%s chars): %s", len(text), text[:100])
    return text or FALLBACK_TEXT


async def transcribe_audio_multipass(
    file_path: Path,
    keyterms: list[str] | None = None,
    whisper_prompt: str | None = None,
) -> str:
    """Run Deepgram + Whisper in parallel and reconcile for maximum accuracy.

    Falls back to single-provider if only one API key is available.
    """
    settings = get_settings()
    has_openai = bool(settings.openai_api_key)
    has_deepgram = bool(settings.deepgram_api_key)

    if not has_openai or not has_deepgram:
        return await transcribe_audio(file_path, keyterms=keyterms, whisper_prompt=whisper_prompt)

    # Run both providers in parallel
    results = await asyncio.gather(
        _transcribe_deepgram(file_path, settings.deepgram_api_key, keyterms=keyterms),
        _transcribe_whisper(file_path, settings.openai_api_key, prompt=whisper_prompt),
        return_exceptions=True,
    )

    transcripts = [r for r in results if isinstance(r, str) and r != FALLBACK_TEXT]
    if len(transcripts) < 2:
        return transcripts[0] if transcripts else FALLBACK_TEXT

    # If both are identical, no need to reconcile
    if transcripts[0].strip() == transcripts[1].strip():
        return transcripts[0]

    return await _reconcile_transcripts(transcripts[0], transcripts[1], keyterms)


async def _reconcile_transcripts(
    deepgram_text: str,
    whisper_text: str,
    keyterms: list[str] | None = None,
) -> str:
    """Use Claude Haiku to pick the most accurate version from two transcriptions."""
    settings = get_settings()
    if not settings.anthropic_api_key:
        return deepgram_text  # Default to Deepgram if no LLM available

    vocab_hint = ""
    if keyterms:
        vocab_hint = f"\n\nKnown correct terms/names: {', '.join(keyterms[:50])}"

    from .ai_provider import get_ai_client_for_role
    from .provider_errors import ProviderError

    try:
        client = await get_ai_client_for_role(org_id=None, db=None, role="transcript_merge")
        reconciled = await client.chat(
            system=(
                "You are a transcription reconciler. You receive two transcriptions of the same audio "
                "from different providers. Produce the single most accurate version by merging the "
                "strengths of both. Rules:\n"
                "- Where they agree, keep the agreed text\n"
                "- Where they disagree, use your judgment to pick the most likely correct version\n"
                "- Preserve proper nouns, names, and technical terms exactly\n"
                "- Do NOT add, remove, or summarize content\n"
                "- Return ONLY the final transcript, nothing else"
                f"{vocab_hint}"
            ),
            messages=[{
                "role": "user",
                "content": (
                    f"Transcription A (Deepgram):\n{deepgram_text}\n\n"
                    f"Transcription B (Whisper):\n{whisper_text}"
                ),
            }],
            max_tokens=max(len(deepgram_text), len(whisper_text)) + 200,
        )
        reconciled = reconciled.strip()
        if reconciled:
            logger.info("Multi-pass reconciliation: Deepgram=%d chars, Whisper=%d chars → Merged=%d chars",
                        len(deepgram_text), len(whisper_text), len(reconciled))
            return reconciled
    except ProviderError as e:
        # Both primary and any failover providers failed. Degrade to the
        # single-provider Deepgram result rather than blocking on the merge.
        logger.warning("Multi-pass reconciliation unavailable (%s) — using Deepgram", e.code)
    except Exception as e:
        logger.warning("Multi-pass reconciliation failed: %s", e)

    return deepgram_text
