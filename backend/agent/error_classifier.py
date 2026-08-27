"""LiveKit voice-agent helpers for surfacing provider-key failures.

The agent runs outside the FastAPI request loop, so it doesn't get the
backend's exception handler treatment for free. This thin shim re-uses
the platform's `provider_errors.classify` + `provider_health` so that when
Deepgram, ElevenLabs, or Anthropic returns a credit/auth error inside a
LiveKit room, the org-scoped Redis snapshot updates and the frontend banner
appears the same as for any other AI call.

Call `report_agent_provider_error(exc, provider, org_id)` from `except`
blocks around STT / TTS / LLM operations in the worker. It's a no-op for
exceptions that don't classify as provider errors.
"""

from __future__ import annotations

import logging

from app.services import provider_health
from app.services.provider_errors import ProviderError, classify

logger = logging.getLogger(__name__)


async def report_agent_provider_error(
    exc: Exception, *, provider: str, org_id: str | None
) -> ProviderError | None:
    """Classify `exc` and write the org-scope health snapshot if recognised.

    Returns the typed `ProviderError` so callers can decide whether to
    disconnect the room (recommended on `CreditExhaustedError` and
    `InvalidKeyError`) or just surface a synthetic chat message.
    """
    scope = f"org:{org_id}" if org_id else "platform"
    perr = classify(exc, provider=provider, scope=scope)
    if perr is None:
        return None
    try:
        await provider_health.mark_unhealthy(scope, provider, perr)
    except Exception:
        logger.debug("agent: failed to write provider_health snapshot", exc_info=True)
    logger.warning(
        "Agent provider error: provider=%s scope=%s code=%s msg=%s",
        provider,
        scope,
        perr.code,
        perr.message,
    )
    return perr


async def mark_agent_provider_healthy(provider: str, org_id: str | None) -> None:
    """Clear an org-scope health flag after a successful call."""
    scope = f"org:{org_id}" if org_id else "platform"
    try:
        await provider_health.mark_healthy(scope, provider)
    except Exception:
        logger.debug("agent: mark_healthy failed", exc_info=True)
