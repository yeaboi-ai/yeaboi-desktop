"""Background probe that keeps the provider-health snapshot fresh.

The /api/system/health-summary endpoint shows the banner based on the Redis
snapshot written by `_invoke()` failures inside AIClient. Without a probe,
the snapshot only changes when the application happens to make an AI call:
if a credit-exhausted provider sees no traffic for the TTL window, the
banner silently disappears even though the underlying problem persists.

This probe runs in the lifespan loop and, every `PROBE_INTERVAL_SECONDS`,
re-tests each currently-unhealthy *platform-scope* provider with a tiny
no-op call:

  - Success → `mark_healthy()` clears the snapshot, banner goes away.
  - Failure → `mark_unhealthy()` refreshes `last_seen` + the TTL, banner
    stays put with current details.

Org-scope (BYOK) probing is out of scope here — those would require a DB
session + key decryption per org and the failing call sites already keep
those snapshots warm whenever the user retries.
"""

from __future__ import annotations

import asyncio
import logging

from anthropic import AsyncAnthropic
from openai import AsyncOpenAI

from ..config import get_settings
from . import provider_health
from .provider_errors import ProviderError, classify

logger = logging.getLogger(__name__)


PROBE_INTERVAL_SECONDS = 300  # 5 min — frequent enough to react, sparse enough to be cheap.


# Per-provider probe functions. Each must:
#   - return None on success
#   - raise the original SDK exception on failure (so classify() can map it)
# Probes are designed to consume the smallest possible amount of credit so
# polling a recovered key doesn't drain it.

async def _probe_anthropic(api_key: str) -> None:
    client = AsyncAnthropic(api_key=api_key, timeout=10.0)
    # 1 input token, 1 output token — the cheapest possible call.
    await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1,
        messages=[{"role": "user", "content": "."}],
    )


async def _probe_openai_compat(api_key: str, base_url: str | None, model: str) -> None:
    kwargs: dict = {"api_key": api_key, "timeout": 10.0}
    if base_url:
        kwargs["base_url"] = base_url
    client = AsyncOpenAI(**kwargs)
    await client.chat.completions.create(
        model=model,
        max_tokens=1,
        messages=[{"role": "user", "content": "."}],
    )


def _build_probes_for_settings(settings) -> dict[str, asyncio.coroutine]:
    """Map provider name → coroutine factory for that provider's probe.

    Only includes providers we have a platform key for — others can't be
    probed from this process and rely on the TTL.
    """
    probes: dict = {}

    if getattr(settings, "anthropic_api_key", None):
        probes["anthropic"] = lambda: _probe_anthropic(settings.anthropic_api_key)

    if getattr(settings, "openai_api_key", None):
        probes["openai"] = lambda: _probe_openai_compat(
            settings.openai_api_key, base_url=None, model="gpt-4o-mini"
        )

    if getattr(settings, "google_api_key", None):
        probes["gemini"] = lambda: _probe_openai_compat(
            settings.google_api_key,
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
            model="gemini-2.5-flash-lite",
        )

    if getattr(settings, "deepseek_api_key", None):
        probes["deepseek"] = lambda: _probe_openai_compat(
            settings.deepseek_api_key, base_url="https://api.deepseek.com/v1", model="deepseek-chat"
        )

    if getattr(settings, "qwen_api_key", None):
        probes["qwen"] = lambda: _probe_openai_compat(
            settings.qwen_api_key,
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
            model="qwen-turbo",
        )

    return probes


async def _probe_one(provider: str, probe_fn, scope: str = "platform") -> None:
    """Run a single probe and update the health snapshot accordingly."""
    try:
        await probe_fn()
    except Exception as exc:
        provider_error = classify(exc, provider=provider, scope=scope)
        if isinstance(provider_error, ProviderError):
            await provider_health.mark_unhealthy(scope, provider, provider_error)
            logger.info(
                "Probe: %s still unhealthy (code=%s)", provider, provider_error.code
            )
        else:
            # Unrecognised error during probe — log and leave the snapshot as-is.
            logger.warning("Probe: %s failed with unclassified exception: %s", provider, exc)
        return
    # Success — clear the snapshot if one existed.
    await provider_health.mark_healthy(scope, provider)
    logger.info("Probe: %s recovered, snapshot cleared", provider)


async def run_probe_loop() -> None:
    """Long-running task: re-check each unhealthy platform provider every interval.

    Runs from the FastAPI lifespan alongside the recording sweeper. Idempotent
    on cancellation — the outer try/finally ensures asyncio.CancelledError
    propagates without leaking state.
    """
    logger.info("provider-probe loop starting (interval=%ds)", PROBE_INTERVAL_SECONDS)
    settings = get_settings()
    probes = _build_probes_for_settings(settings)

    if not probes:
        logger.info("provider-probe loop idle: no platform API keys configured")
        # Still sleep so the task is cancellable; just don't do any work.
        while True:
            await asyncio.sleep(PROBE_INTERVAL_SECONDS)

    try:
        while True:
            try:
                snapshots = await provider_health.get_all()
            except Exception:
                logger.exception("provider-probe: failed to read snapshots")
                snapshots = {}

            # Probe only platform-scope unhealthy providers we know how to test.
            unhealthy_platform = {
                key.split(":", 1)[1]: payload
                for key, payload in snapshots.items()
                if key.startswith("platform:") and payload.get("status") != "ok"
            }

            for provider in list(unhealthy_platform.keys()):
                probe_fn = probes.get(provider)
                if probe_fn is None:
                    continue
                try:
                    await _probe_one(provider, probe_fn, scope="platform")
                except asyncio.CancelledError:
                    raise
                except Exception:
                    logger.exception("provider-probe: error probing %s", provider)

            await asyncio.sleep(PROBE_INTERVAL_SECONDS)
    except asyncio.CancelledError:
        logger.info("provider-probe loop cancelled")
        raise
