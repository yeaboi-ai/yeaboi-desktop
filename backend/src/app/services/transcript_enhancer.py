"""LLM-powered transcript enhancement — cleans raw ASR output into polished text.

Removes filler words, handles self-corrections, fixes punctuation, and preserves
technical terms. Uses Claude Haiku for fast, cheap post-processing (~200ms).
"""

import logging
from dataclasses import dataclass, field

from ..config import get_settings
from .ai_provider import get_ai_client_for_role
from .provider_errors import ProviderError

logger = logging.getLogger(__name__)

ENHANCER_SYSTEM_PROMPT = """\
You are a transcript enhancer. Clean up this speech-to-text transcript so it reads \
as if the speaker had typed it directly.

Rules:
- Remove filler words (um, uh, ah, like, you know, sort of, kind of, I mean) \
ONLY when they are verbal fillers, not when they carry meaning.
- When the speaker corrects themselves (e.g. "5pm, no actually 6pm", \
"let's use React, scratch that, Vue"), keep ONLY the final corrected version.
- Add proper punctuation (commas, periods, question marks) based on speech rhythm.
- NEVER replace one word with a different word. Do NOT substitute synonyms. \
If the transcript says "testing", keep "testing" — do NOT change it to "checking" \
or any other word. Your job is to clean formatting, not rewrite content.
- Preserve ALL words exactly as transcribed. Only remove filler words and \
handle self-corrections.
- NEVER change, correct, or alter people's names.
- Do NOT change the meaning, add new content, summarize, or editorialize.
- Do NOT add markdown formatting.
- If the transcript is already clean, return it unchanged.
{vocabulary_context}
Return ONLY the cleaned text, nothing else."""

FALLBACK_REASON = "enhancement_unavailable"


@dataclass
class TranscriptContext:
    """Optional context to improve enhancement quality."""

    session_topic: str | None = None
    speaker_name: str | None = None
    vocabulary_hints: list[str] = field(default_factory=list)


@dataclass
class EnhancedTranscript:
    """Result of transcript enhancement."""

    enhanced_text: str
    raw_text: str
    was_enhanced: bool


async def enhance_transcript(
    raw_text: str,
    context: TranscriptContext | None = None,
) -> EnhancedTranscript:
    """Run raw ASR output through Claude Haiku for cleanup.

    Returns the enhanced text along with the original raw text.
    Falls back to raw text if enhancement fails or no API key is configured.
    """
    if not raw_text or not raw_text.strip():
        return EnhancedTranscript(enhanced_text=raw_text, raw_text=raw_text, was_enhanced=False)

    settings = get_settings()
    if not settings.anthropic_api_key:
        logger.debug("No Anthropic API key — skipping transcript enhancement")
        return EnhancedTranscript(enhanced_text=raw_text, raw_text=raw_text, was_enhanced=False)

    # Build vocabulary context for the system prompt
    vocab_context = ""
    if context and context.vocabulary_hints:
        terms = ", ".join(context.vocabulary_hints[:100])
        vocab_context = f"\n- The following terms should be spelled exactly as shown: {terms}"

    system_prompt = ENHANCER_SYSTEM_PROMPT.format(vocabulary_context=vocab_context)

    # Build user message with optional context
    user_parts = []
    if context and context.session_topic:
        user_parts.append(f'[Context: planning session about "{context.session_topic}"]')
    if context and context.speaker_name:
        user_parts.append(f"[Speaker: {context.speaker_name}]")
    user_parts.append(raw_text)
    user_message = "\n".join(user_parts)

    try:
        # Platform-locked role, no BYOK billing — db/org_id not needed.
        client = await get_ai_client_for_role(org_id=None, db=None, role="transcript_enhance")
        enhanced = await client.chat(
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
            max_tokens=len(raw_text) + 200,
        )
        enhanced = enhanced.strip()

        if not enhanced:
            logger.warning("LLM returned empty enhancement — using raw text")
            return EnhancedTranscript(enhanced_text=raw_text, raw_text=raw_text, was_enhanced=False)

        logger.info(
            "Transcript enhanced: %d chars → %d chars",
            len(raw_text),
            len(enhanced),
        )
        return EnhancedTranscript(enhanced_text=enhanced, raw_text=raw_text, was_enhanced=True)

    except ProviderError as e:
        # All providers in the role's failover chain failed (or retries
        # exhausted). Banner will pick up the unhealthy snapshot; the user
        # just gets the raw transcript without the polish pass.
        logger.warning("Transcript enhancement unavailable (%s) — using raw text", e.code)
        return EnhancedTranscript(enhanced_text=raw_text, raw_text=raw_text, was_enhanced=False)
    except Exception as e:
        logger.error("Transcript enhancement failed: %s", e)
        return EnhancedTranscript(enhanced_text=raw_text, raw_text=raw_text, was_enhanced=False)
