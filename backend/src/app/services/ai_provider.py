"""AI provider abstraction layer.

Single entry point for all AI calls across the platform.
Routes through per-org configurable provider: platform-hosted (default),
BYOK, AWS Bedrock, or self-hosted.
"""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING

from anthropic import AsyncAnthropic
from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..models.ai_config import OrgAIConfig
from . import provider_health, spend_tracker
from .ai_retry import with_retry
from .anthropic_auth import anthropic_client_kwargs, has_anthropic_credential
from .crypto import decrypt_api_key
from .provider_errors import ProviderError, classify

# Explicit per-call timeout on the SDK clients. The Anthropic SDK defaults to
# ~600s; during an incident that's catastrophic — every blocked call holds a
# worker until the upstream gives up. 30s is plenty for non-streaming chat.
_SDK_TIMEOUT_S = 30.0

# Disable SDK-level retries. The SDK retries transient errors twice by default,
# and we already wrap every call in `with_retry` which retries 3×. Without
# this, a single logical call can produce up to ~9 HTTP requests on a flaky
# upstream — the amplification that drove the 2026-05-17 incident.
_SDK_MAX_RETRIES = 0

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

# Model tiers — map task complexity to model IDs per provider
_ANTHROPIC_MODELS = {
    "fast": "claude-haiku-4-5-20251001",
    "default": "claude-sonnet-4-6",
    "capable": "claude-opus-4-7",
}

_OPENAI_MODELS = {
    "fast": "gpt-4o-mini",
    "default": "gpt-4o",
    "capable": "gpt-4o",
}

_GEMINI_MODELS = {
    "fast": "gemini-2.5-flash-lite",
    "default": "gemini-2.5-flash",
    "capable": "gemini-2.5-pro",
}

_DEEPSEEK_MODELS = {
    # DeepSeek's chat endpoint serves V4. The reasoner variant uses the
    # extended-thinking pathway and is what we want for `capable`.
    "fast": "deepseek-chat",
    "default": "deepseek-chat",
    "capable": "deepseek-reasoner",
}

_QWEN_MODELS = {
    # DashScope-compatible model IDs.
    "fast": "qwen-turbo",
    "default": "qwen-plus",
    "capable": "qwen-max",
}

# Platform-hosted provider registry. The active provider is selected via
# `PLATFORM_AI_PROVIDER` env var (default: anthropic) and uses one shared
# API key per provider. All non-Anthropic providers expose an OpenAI-
# compatible API and route through `AsyncOpenAI` with a custom base_url.
_PLATFORM_PROVIDERS: dict[str, dict] = {
    "anthropic": {
        "kind": "anthropic",
        "models": _ANTHROPIC_MODELS,
        "env_key": "anthropic_api_key",
    },
    "openai": {
        # Native OpenAI uses the SDK's default base_url (api.openai.com);
        # distinct from `openai_compat` providers that swap the URL.
        "kind": "openai",
        "models": _OPENAI_MODELS,
        "env_key": "openai_api_key",
    },
    "gemini": {
        "kind": "openai_compat",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "models": _GEMINI_MODELS,
        "env_key": "google_api_key",
    },
    "deepseek": {
        "kind": "openai_compat",
        "base_url": "https://api.deepseek.com/v1",
        "models": _DEEPSEEK_MODELS,
        "env_key": "deepseek_api_key",
    },
    "qwen": {
        "kind": "openai_compat",
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "models": _QWEN_MODELS,
        "env_key": "qwen_api_key",
    },
}

_BEDROCK_MODELS = {
    "fast": "anthropic.claude-3-5-haiku-20241022-v1:0",
    "default": "anthropic.claude-3-5-sonnet-20241022-v2:0",
    "capable": "anthropic.claude-3-opus-20240229-v1:0",
}

# Role-based routing — every named AI call site maps to a role, and each
# role resolves to (provider, tier, platform_locked).
#
# `platform_locked=True` means: the platform mandates a specific provider
# for this role regardless of the org's BYOK config. Used for internal
# pipeline operations where cost/quality decisions are owned by the
# platform (wireframe gen, intent classifier, etc.) — the user's BYOK
# key is bypassed and the platform's own credentials are used.
#
# `platform_locked=False` means: BYOK takes precedence. Used for user-
# facing AI calls where the org should pay (chat, summaries, niko).
#
# Override per-role at runtime via env vars — `ROLE_<NAME>_PROVIDER` and
# `ROLE_<NAME>_TIER`. Even platform-locked roles can be re-pointed to a
# different provider via env, e.g. `ROLE_WIREFRAME_PROVIDER=deepseek`.
_ROLE_DEFAULTS: dict[str, tuple[str, str, bool]] = {
    # User-facing — BYOK applies (org pays with their own key)
    "chat": ("anthropic", "default", False),
    "summary": ("gemini", "fast", False),
    "niko": ("gemini", "fast", False),
    "suggest": ("gemini", "fast", False),
    # Platform-locked pipeline ops — always use platform creds
    # Hero DRAFT generator. DeepSeek V4 drafts the hero cheaply; the
    # wireframe_critic role (Opus) then critiques it and DeepSeek patches it
    # in the refinement loop (services/wireframe_refine.py). The loop lets a
    # cheap drafter reach expensive-single-shot quality.
    "wireframe": ("deepseek", "default", True),
    # Hero CRITIC. Opus scores the draft against the richness rubric and
    # returns surgical patch instructions. Capable tier (Opus 4.7) — taste
    # and gap-finding are exactly what we pay Opus for, and the output is a
    # small gap list, not a full page, so the cost is modest.
    "wireframe_critic": ("anthropic", "capable", True),
    # Sub-screen wireframe generation. The hero pass (wireframe role) sets the
    # design DNA via the drafter/critic loop. Every subsequent screen is
    # pattern-matching against that DNA — no creative latitude needed — so we
    # run it on Anthropic default tier (Sonnet 4.6) WITHOUT thinking to drop
    # per-screen latency from ~60-90s to ~20-30s and cut cost by ~70%.
    # The trade-off is no live "thinking" deltas streamed to the UI for
    # sub-screens; the hero's reasoning still streams.
    "wireframe_subscreen": ("anthropic", "default", True),
    "edit": ("gemini", "capable", True),
    # design + design_classify: anthropic explicit. Earlier these were "gemini"
    # in config, but with GOOGLE_API_KEY empty they silently fell through to
    # the anthropic platform fallback (Sonnet 4.6) — which burned $22 in one
    # day on 2026-05-17 because every retry on a single huge prompt billed
    # at Sonnet rates. Pinning here keeps the runtime honest; revert to
    # gemini only after GOOGLE_API_KEY is set and the design prompt is
    # validated against Flash output.
    "design": ("anthropic", "default", True),
    "design_classify": ("anthropic", "fast", True),
    "intent": ("gemini", "fast", True),
    "preflight": ("gemini", "fast", True),
    # flow + arch are graph-reasoning tasks where the logical layout
    # genuinely matters — Flash-Lite produces weaker structure. Pay Opus
    # rates (~$0.20/regen) for the better-thought-out graph.
    "flow": ("anthropic", "capable", True),
    "arch": ("anthropic", "capable", True),
    # Archetype + screen-plan inference. Cheap structural reasoning —
    # DeepSeek V3 is an order of magnitude cheaper than Opus and the
    # task is JSON classification, not visual design.
    "plan": ("deepseek", "fast", True),
    "extract": ("gemini", "fast", True),
    # Brand analysis — pulling color hints from a website + structured
    # JSON theme synthesis. Anthropic produces consistent JSON and good
    # color reasoning; capable tier is worth it for the one-off brand
    # generation flow.
    "brand": ("anthropic", "capable", True),
    # Code orchestrator — platform infra, locked
    "orch_delegate": ("anthropic", "capable", True),
    "orch_execute": ("deepseek", "default", True),
    # Background voice-pipeline LLM tasks (Haiku-class). All platform-locked:
    # these are internal processing the platform pays for, never billed to a
    # BYOK org. Routing them through the wrapper picks up retry/failover.
    "transcript_enhance": ("anthropic", "fast", True),
    "transcript_merge": ("anthropic", "fast", True),
    "passive_extract": ("anthropic", "fast", True),
    "agent_translate": ("anthropic", "fast", True),
    "agent_extract": ("anthropic", "fast", True),
}


# Per-role failover. Walked left-to-right when the role's primary provider
# exhausts retries with a recoverable error (transient / rate-limited /
# credit-exhausted). Each entry is `(provider, tier)` so a fallback can pick
# a model class deliberately — e.g. fall an Opus call back to GPT-4o rather
# than gpt-4o-mini. An empty list = no failover; banner-only.
#
# Override per-role at runtime: `ROLE_<UPPER>_FAILOVER="gemini:default,openai:default"`.
_FAILOVER_CHAINS: dict[str, list[tuple[str, str]]] = {
    "chat": [("gemini", "default"), ("openai", "default")],
    "summary": [("anthropic", "fast"), ("deepseek", "fast")],
    "niko": [("anthropic", "fast")],
    "suggest": [("anthropic", "fast")],
    "transcript_enhance": [("gemini", "fast")],
    "transcript_merge": [("gemini", "fast")],
    "passive_extract": [("gemini", "fast")],
    "agent_translate": [("gemini", "fast")],
    "agent_extract": [("gemini", "fast")],
    "wireframe": [("anthropic", "capable"), ("openai", "capable")],
    "wireframe_subscreen": [("gemini", "capable"), ("openai", "default")],
    "wireframe_critic": [("openai", "capable"), ("gemini", "capable")],
    "edit": [("anthropic", "capable"), ("openai", "capable")],
    "flow": [("openai", "capable"), ("gemini", "capable")],
    "arch": [("openai", "capable"), ("gemini", "capable")],
    # Locked-down or single-purpose roles — no failover, banner if the
    # primary is down.
    "design": [],
    "design_classify": [],
    "intent": [],
    "preflight": [],
    "plan": [],
    "extract": [],
    "brand": [],
    "orch_delegate": [],
    "orch_execute": [],
}


def _resolve_failover_chain(role: str) -> list[tuple[str, str]]:
    """Return the failover chain for a role, honouring env-var overrides.

    Format of the override: ``ROLE_CHAT_FAILOVER="gemini:default,openai:default"``.
    Any malformed entry is skipped with a warning; an empty value clears the
    chain (forces banner-only behaviour for that role).
    """
    import os

    raw = os.environ.get(f"ROLE_{role.upper()}_FAILOVER")
    if raw is None:
        return list(_FAILOVER_CHAINS.get(role, []))
    if not raw.strip():
        return []
    out: list[tuple[str, str]] = []
    for entry in raw.split(","):
        parts = entry.strip().split(":")
        if len(parts) != 2 or not parts[0] or not parts[1]:
            logger.warning("Ignoring malformed failover entry %r for role %s", entry, role)
            continue
        out.append((parts[0].strip().lower(), parts[1].strip().lower()))
    return out


# Roles where chat_with_tools is known to work across providers. Other roles
# that use tool-calling will skip failover (the alt provider's tool-schema
# semantics aren't proven for our prompts). Conservative default: only
# user-facing chat is opted in. Verify each role's tool prompts before
# adding them here.
_TOOL_FAILOVER_SAFE_ROLES = {"chat"}


def warn_missing_platform_keys() -> None:
    """Log a warning for every platform-locked role whose primary provider
    has no API key in settings.

    Why: when a locked role's primary provider key is missing, the runtime
    silently falls through to whatever `PLATFORM_AI_PROVIDER` resolves to
    (typically anthropic). That fallback is what turned the 2026-05-17
    incident into a $22 surprise — `design` was configured as Gemini but
    ran on Sonnet 4.6 because `GOOGLE_API_KEY` was empty. This function
    is fail-loud-via-log, not fail-loud-via-crash, so dev environments
    without every provider's key keep booting.
    """
    settings = get_settings()
    fallback = (settings.platform_ai_provider or "anthropic").lower()
    fallback_cfg = _PLATFORM_PROVIDERS.get(fallback) or _PLATFORM_PROVIDERS["anthropic"]
    seen: set[tuple[str, str]] = set()
    for role, (provider, _tier, platform_locked) in _ROLE_DEFAULTS.items():
        if not platform_locked:
            continue
        if (provider, role) in seen:
            continue
        seen.add((provider, role))
        prov_cfg = _PLATFORM_PROVIDERS.get(provider)
        if not prov_cfg:
            logger.warning(
                "ai_provider_key_missing role=%s provider=%s reason=unknown-provider "
                "fallback=%s — calls will be routed to the fallback provider.",
                role,
                provider,
                fallback,
            )
            continue
        key = getattr(settings, prov_cfg["env_key"], "") or ""
        if not key and prov_cfg["kind"] == "anthropic" and has_anthropic_credential(key):
            continue  # a signed-in Claude subscription is the credential
        if not key:
            logger.warning(
                "ai_provider_key_missing role=%s provider=%s env_key=%s fallback=%s — "
                "calls for this role will silently route to %s. Set the key or "
                "re-pin the role in _ROLE_DEFAULTS to make this intentional.",
                role,
                provider,
                prov_cfg["env_key"].upper(),
                fallback,
                fallback_cfg["models"].get(_tier, fallback_cfg["models"]["default"]),
            )


def _resolve_role(role: str) -> tuple[str, str, bool]:
    """Return (provider, tier, platform_locked) for a role, honouring env overrides.

    Looks up `ROLE_<UPPER>_PROVIDER` and `ROLE_<UPPER>_TIER` as overrides,
    falling back to `_ROLE_DEFAULTS`. The `platform_locked` flag is taken
    from defaults only — it's a platform-architecture decision, not user-
    overridable. An unknown role falls back to anthropic/default/unlocked.
    """
    import os

    default = _ROLE_DEFAULTS.get(role)
    if default is None:
        logger.warning("Unknown AI role %r — defaulting to (anthropic, default, unlocked)", role)
        default = ("anthropic", "default", False)
    provider = os.environ.get(f"ROLE_{role.upper()}_PROVIDER", default[0])
    tier = os.environ.get(f"ROLE_{role.upper()}_TIER", default[1])
    return provider.lower(), tier.lower(), default[2]


async def get_org_ai_config(org_id: str, db: AsyncSession) -> OrgAIConfig | None:
    """Fetch the AI config for an org, or None for platform defaults."""
    result = await db.execute(select(OrgAIConfig).where(OrgAIConfig.org_id == org_id))
    return result.scalar_one_or_none()


def _anthropic_supports_temperature(model: str) -> bool:
    """Claude 4.7 family rejects `temperature` outright (HTTP 400 — 'temperature
    is deprecated for this model'). Older Sonnet/Opus/Haiku still accept it.
    Callers must skip the field when this returns False."""
    return not model.startswith(("claude-opus-4-7", "claude-sonnet-4-7"))


class AIClient:
    """Unified AI client that wraps provider-specific SDKs.

    Usage:
        client = await get_ai_client(org_id, db, task="default")
        response = await client.chat(system="...", messages=[...], max_tokens=1024)
    """

    def __init__(
        self,
        provider: str,
        anthropic_client: AsyncAnthropic | None = None,
        openai_client: AsyncOpenAI | None = None,
        model: str = "",
        *,
        underlying_provider: str | None = None,
        scope: str = "platform",
        org_id: str | None = None,
        db: AsyncSession | None = None,
        role: str | None = None,
        project_id: str | None = None,
        session_id: str | None = None,
        user_id: str | None = None,
    ):
        self.provider = provider
        self._anthropic = anthropic_client
        self._openai = openai_client
        self.model = model
        # Concrete vendor name for health reporting / classification
        # (e.g. "anthropic", "openai", "gemini"). Falls back to `provider`
        # for callers that haven't been updated yet.
        self._underlying_provider = underlying_provider or provider
        # "platform" or f"org:{org_id}" — drives the Redis health key.
        self._scope = scope
        # Optional context for hard-limit checks at the AIClient edge.
        self._org_id = org_id
        self._db = db
        # Role identifier (e.g. "chat", "summary"). Drives failover chain
        # lookup and metric labels. None when the client was built via the
        # legacy task-based path; failover is skipped in that case so
        # behaviour stays bit-for-bit identical for un-migrated callers.
        self._role = role
        # Attribution for the `usage_events` ledger. When org_id is set, each
        # chat call schedules a fire-and-forget write to usage_events tagged
        # with these IDs. project/session/user may be None for org-level work.
        self._project_id = project_id
        self._session_id = session_id
        self._user_id = user_id

    async def _pre_call(self) -> None:
        """Hard-limit gate run before every SDK call.

        Skipped when no DB session / org_id is attached (e.g. background
        tasks that don't bill an org).
        """
        if self._db is not None and self._org_id is not None:
            await spend_tracker.assert_under_hard_limit(self._db, self._org_id)

    async def _classify_and_raise(self, exc: Exception):
        provider_error = classify(exc, provider=self._underlying_provider, scope=self._scope)
        if provider_error is not None:
            await provider_health.mark_unhealthy(self._scope, self._underlying_provider, provider_error)
            raise provider_error from exc
        raise exc

    async def _invoke(self, fn, *args, **kwargs):
        """Run an SDK call with retry, classify errors, update health.

        Retries on transient + rate-limit errors (3 attempts, backed off
        ~0.5s/2s/5s with jitter). Auth/credit/validation errors fail-fast.
        On final failure, classifies into a typed `ProviderError`, marks
        the provider unhealthy in Redis, and re-raises.
        """
        await self._pre_call()
        try:
            result = await with_retry(
                lambda: fn(*args, **kwargs),
                provider=self._underlying_provider,
                scope=self._scope,
                role=self._role,
            )
        except ProviderError as exc:
            # Already classified by with_retry on the way out. Mark unhealthy
            # so the banner reflects the outage even when failover saves the
            # user-facing call.
            await provider_health.mark_unhealthy(self._scope, self._underlying_provider, exc)
            raise
        except Exception as exc:
            await self._classify_and_raise(exc)
            raise  # unreachable
        await provider_health.mark_healthy(self._scope, self._underlying_provider)
        return result

    async def _try_failover(
        self,
        original_exc: ProviderError,
        method_name: str,
        *,
        is_tool_call: bool = False,
        **kwargs,
    ):
        """Walk the role's failover chain and return the first successful result.

        Skips candidates with no API key, candidates Redis marks unhealthy,
        and (for tool-calling roles) candidates whose tool-schema parity we
        haven't verified. Re-raises ``original_exc`` if nothing in the chain
        produces a result.

        Failover is also skipped when:
        - the global ``AI_FAILOVER_ENABLED`` flag is off (emergency rollback)
        - this client has no role attached (legacy callers — preserve their
          old behaviour bit-for-bit)
        - the scope is ``org:*`` (BYOK — the org's key failed; the platform
          must not silently spend on their behalf, see plan §3 §"BYOK")
        """
        settings = get_settings()
        if not getattr(settings, "ai_failover_enabled", True):
            raise original_exc
        if self._role is None:
            raise original_exc
        if self._scope != "platform":
            raise original_exc
        chain = _resolve_failover_chain(self._role)
        if not chain:
            raise original_exc
        if is_tool_call and self._role not in _TOOL_FAILOVER_SAFE_ROLES:
            # Don't auto-failover tool-using roles whose schema parity hasn't
            # been verified — a malformed call would corrupt the conversation.
            raise original_exc

        for alt_provider, alt_tier in chain:
            if alt_provider == self._underlying_provider:
                continue  # Don't loop back to the failing primary
            prov_cfg = _PLATFORM_PROVIDERS.get(alt_provider)
            if not prov_cfg:
                continue
            api_key = getattr(settings, prov_cfg["env_key"], "") or ""
            if not api_key:
                continue
            snap = await provider_health.get("platform", alt_provider)
            if snap is not None and snap.get("status") == "unhealthy":
                continue
            try:
                alt = _build_alt_client(
                    alt_provider,
                    prov_cfg,
                    api_key,
                    alt_tier,
                    role=self._role,
                    org_id=self._org_id,
                    db=self._db,
                )
            except Exception:
                logger.warning(
                    "Failed to build failover client %s for role %s",
                    alt_provider,
                    self._role,
                    exc_info=True,
                )
                continue
            try:
                result = await getattr(alt, method_name)(**kwargs)
            except ProviderError:
                continue
            logger.warning(
                "ai_failover",
                extra={
                    "role": self._role,
                    "from_provider": self._underlying_provider,
                    "to_provider": alt_provider,
                    "from_error_code": original_exc.code,
                    "method": method_name,
                },
            )
            _record_failover_breadcrumb(
                role=self._role,
                from_provider=self._underlying_provider,
                to_provider=alt_provider,
                error_code=original_exc.code,
            )
            await provider_health.record_active_failover(
                role=self._role,
                from_provider=self._underlying_provider,
                to_provider=alt_provider,
            )
            return result

        # Nothing in the chain succeeded — surface the original error.
        raise original_exc

    async def chat(
        self,
        *,
        system: str = "",
        messages: list[dict],
        max_tokens: int = 2048,
        temperature: float | None = None,
    ) -> str:
        """Send a chat completion and return the text response."""
        from ..tracing import tracer

        start = time.perf_counter()

        with tracer.start_as_current_span(
            "ai.chat",
            attributes={"ai.provider": self.provider, "ai.model": self.model, "ai.max_tokens": max_tokens},
        ) as span:
            try:
                result = await self._chat_inner(
                    system=system, messages=messages, max_tokens=max_tokens, temperature=temperature
                )
            except ProviderError as exc:
                result = await self._try_failover(
                    exc,
                    "chat",
                    system=system,
                    messages=messages,
                    max_tokens=max_tokens,
                    temperature=temperature,
                )
            span.set_attribute("ai.response_length", len(result))

        self._log_timing(start)
        return result

    async def chat_with_usage(
        self,
        *,
        system: str = "",
        messages: list[dict],
        max_tokens: int = 2048,
        temperature: float | None = None,
    ) -> tuple[str, int]:
        """Send a chat completion and return (text, total_tokens)."""
        start = time.perf_counter()
        try:
            text, tokens = await self._chat_inner_with_usage(
                system=system, messages=messages, max_tokens=max_tokens, temperature=temperature
            )
        except ProviderError as exc:
            text, tokens = await self._try_failover(
                exc,
                "chat_with_usage",
                system=system,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
            )
        self._log_timing(start)
        return text, tokens

    async def chat_with_full_usage(
        self,
        *,
        system: str = "",
        messages: list[dict],
        max_tokens: int = 2048,
        temperature: float | None = None,
    ) -> tuple[str, int, int]:
        """Send a chat completion and return (text, input_tokens, output_tokens)."""
        start = time.perf_counter()
        try:
            return await self._chat_with_full_usage_inner(
                system=system, messages=messages, max_tokens=max_tokens, temperature=temperature, start=start
            )
        except ProviderError as exc:
            return await self._try_failover(
                exc,
                "chat_with_full_usage",
                system=system,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
            )

    async def _chat_with_full_usage_inner(
        self,
        *,
        system: str = "",
        messages: list[dict],
        max_tokens: int = 2048,
        temperature: float | None = None,
        start: float | None = None,
    ) -> tuple[str, int, int]:
        if start is None:
            start = time.perf_counter()
        if self._anthropic:
            kwargs: dict = {"model": self.model, "max_tokens": max_tokens, "messages": messages}
            if system:
                kwargs["system"] = system
            if temperature is not None and _anthropic_supports_temperature(self.model):
                kwargs["temperature"] = temperature
            response = await self._invoke(self._anthropic.messages.create, **kwargs)
            self._record_usage(getattr(response, "usage", None))
            in_tok = int(getattr(response.usage, "input_tokens", 0) or 0)
            out_tok = int(getattr(response.usage, "output_tokens", 0) or 0)
            self._log_timing(start)
            return response.content[0].text, in_tok, out_tok
        if self._openai:
            oai_messages: list[dict] = []
            if system:
                oai_messages.append({"role": "system", "content": system})
            oai_messages.extend(messages)
            kw: dict = {"model": self.model, "messages": oai_messages, "max_tokens": max_tokens}
            if temperature is not None:
                kw["temperature"] = temperature
            response = await self._invoke(self._openai.chat.completions.create, **kw)
            usage = getattr(response, "usage", None)
            self._record_usage(usage)
            in_tok = int(getattr(usage, "prompt_tokens", 0) or 0)
            out_tok = int(getattr(usage, "completion_tokens", 0) or 0)
            self._log_timing(start)
            return response.choices[0].message.content or "", in_tok, out_tok
        raise RuntimeError(f"No client configured for provider: {self.provider}")

    async def _chat_inner_with_usage(
        self,
        *,
        system: str = "",
        messages: list[dict],
        max_tokens: int = 2048,
        temperature: float | None = None,
    ) -> tuple[str, int]:
        """Internal chat returning (text, total_tokens)."""
        if self._anthropic:
            kwargs: dict = {
                "model": self.model,
                "max_tokens": max_tokens,
                "messages": messages,
            }
            if system:
                kwargs["system"] = system
            if temperature is not None and _anthropic_supports_temperature(self.model):
                kwargs["temperature"] = temperature
            response = await self._invoke(self._anthropic.messages.create, **kwargs)
            self._record_usage(getattr(response, "usage", None))
            tokens = (response.usage.input_tokens or 0) + (response.usage.output_tokens or 0)
            return response.content[0].text, tokens

        if self._openai:
            oai_messages: list[dict] = []
            if system:
                oai_messages.append({"role": "system", "content": system})
            oai_messages.extend(messages)
            kw: dict = {"model": self.model, "messages": oai_messages, "max_tokens": max_tokens}
            if temperature is not None:
                kw["temperature"] = temperature
            response = await self._invoke(self._openai.chat.completions.create, **kw)
            self._record_usage(getattr(response, "usage", None))
            tokens = response.usage.total_tokens if response.usage else 0
            return response.choices[0].message.content or "", tokens

        raise RuntimeError(f"No client configured for provider: {self.provider}")

    async def _chat_inner(
        self,
        *,
        system: str = "",
        messages: list[dict],
        max_tokens: int = 2048,
        temperature: float | None = None,
    ) -> str:
        """Internal chat implementation without timing/tracing."""
        if self._anthropic:
            kwargs: dict = {
                "model": self.model,
                "max_tokens": max_tokens,
                "messages": messages,
            }
            if system:
                kwargs["system"] = system
            if temperature is not None and _anthropic_supports_temperature(self.model):
                kwargs["temperature"] = temperature
            response = await self._invoke(self._anthropic.messages.create, **kwargs)
            self._record_usage(getattr(response, "usage", None))
            return response.content[0].text

        if self._openai:
            oai_messages = []
            if system:
                oai_messages.append({"role": "system", "content": system})
            oai_messages.extend(messages)
            kwargs = {
                "model": self.model,
                "messages": oai_messages,
                "max_tokens": max_tokens,
            }
            if temperature is not None and _anthropic_supports_temperature(self.model):
                kwargs["temperature"] = temperature
            response = await self._invoke(self._openai.chat.completions.create, **kwargs)
            self._record_usage(getattr(response, "usage", None))
            return response.choices[0].message.content or ""

        raise RuntimeError(f"No client configured for provider: {self.provider}")

    def _track_burn(self, in_tok: int, out_tok: int) -> None:
        """Feed the hourly-burn tripwire without re-logging [USAGE].

        Used from streaming paths that emit their own [USAGE] line and just
        need the alarm side-effect.
        """
        try:
            from . import spend_tracker
            from .usage_costs import estimate_cost_usd

            cost = estimate_cost_usd(self.model, in_tok + out_tok)
            spend_tracker.record_hourly_burn(
                provider=self._underlying_provider,
                scope=self._scope,
                cost_usd=cost,
                model=self.model,
            )
        except Exception:
            logger.debug("burn track failed", exc_info=True)

    def _record_usage(self, usage: object | None) -> None:
        """Log token counts + feed the hourly-burn tripwire + write the
        per-event row to the `usage_events` ledger.

        Tolerant of both Anthropic-shaped (`input_tokens`/`output_tokens`,
        plus cache fields) and OpenAI-shaped (`prompt_tokens`/`completion_tokens`)
        usage objects. Best-effort: never let observability take down a call.
        """
        if usage is None:
            return
        try:
            in_tok = int(getattr(usage, "input_tokens", None) or getattr(usage, "prompt_tokens", 0) or 0)
            out_tok = int(getattr(usage, "output_tokens", None) or getattr(usage, "completion_tokens", 0) or 0)
            cache_create = int(getattr(usage, "cache_creation_input_tokens", 0) or 0)
            cache_read = int(getattr(usage, "cache_read_input_tokens", 0) or 0)
            logger.info(
                "[USAGE] model=%s input=%d output=%d cache_create=%d cache_read=%d",
                self.model,
                in_tok,
                out_tok,
                cache_create,
                cache_read,
            )
            from . import spend_tracker
            from .usage_costs import estimate_cost_usd

            cost = estimate_cost_usd(self.model, in_tok + out_tok)
            spend_tracker.record_hourly_burn(
                provider=self._underlying_provider,
                scope=self._scope,
                cost_usd=cost,
                model=self.model,
            )
            self._schedule_ledger_write(
                in_tok=in_tok,
                out_tok=out_tok,
                cache_create=cache_create,
                cache_read=cache_read,
            )
        except Exception:
            logger.debug("usage record failed", exc_info=True)

    # ── Usage ledger ────────────────────────────────────────────────────────
    # Provider names accepted by USAGE_PROVIDERS in models.usage_event. Anything
    # else (gemini / deepseek / qwen / self_hosted) is logged but not persisted
    # until we extend the ledger schema for it.
    _LEDGER_PROVIDERS = {"anthropic", "openai", "bedrock"}

    def _schedule_ledger_write(
        self,
        *,
        in_tok: int,
        out_tok: int,
        cache_create: int = 0,
        cache_read: int = 0,
    ) -> None:
        """Fire-and-forget write to the `usage_events` ledger.

        Uses its own DB session (via the global session factory) so a slow
        ledger insert can't stall the calling request and a failure here
        can't roll back the caller's transaction. Skipped when we lack an
        org_id (org-less callers don't bill anyone) or when the underlying
        provider isn't in `USAGE_PROVIDERS`.
        """
        if self._org_id is None:
            return
        if in_tok == 0 and out_tok == 0:
            return
        provider = self._underlying_provider
        # Bedrock serves the Anthropic API — record it as anthropic so the
        # analytics breakdown buckets it under a known provider key.
        if provider == "bedrock":
            provider = "anthropic"
        if provider not in self._LEDGER_PROVIDERS:
            return

        import asyncio

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        loop.create_task(
            _write_usage_event(
                org_id=self._org_id,
                project_id=self._project_id,
                session_id=self._session_id,
                user_id=self._user_id,
                provider=provider,
                model=self.model,
                in_tok=in_tok,
                out_tok=out_tok,
                cache_create=cache_create,
                cache_read=cache_read,
            )
        )

    def _log_timing(self, start: float) -> None:
        from ..metrics import AI_CALL_COUNT, AI_CALL_LATENCY

        duration_s = time.perf_counter() - start
        duration_ms = duration_s * 1000

        AI_CALL_COUNT.labels(provider=self.provider, model=self.model).inc()
        AI_CALL_LATENCY.labels(provider=self.provider, model=self.model).observe(duration_s)

        if duration_ms > 5000:
            logger.warning("Slow AI call: provider=%s model=%s duration=%.0fms", self.provider, self.model, duration_ms)
        else:
            logger.info("AI call: provider=%s model=%s duration=%.0fms", self.provider, self.model, duration_ms)

    async def chat_stream(
        self,
        *,
        system: str = "",
        messages: list[dict],
        max_tokens: int = 2048,
        enable_thinking: bool = False,
        thinking_budget: int = 4096,
    ):
        """Stream a chat completion, yielding text deltas (str).

        When enable_thinking=True, also yields thinking deltas as
        ('thinking', text) tuples so callers can route them separately.
        Text deltas continue to be yielded as plain str. Caller switches on
        type. Falls back to text-only on providers without thinking support.

        Provider errors raised either when opening the stream or while
        consuming events are normalised through `_classify_and_raise` so
        callers see typed `ProviderError`s and the health cache stays in
        sync.

        Pre-yield failover: if the upstream call fails *before* any tokens
        have been emitted to the caller, the failover chain for this role
        kicks in (assuming the conditions in ``_try_failover`` are met).
        Once tokens have started flowing, errors bubble unchanged — we
        can't safely swap mid-stream without corrupting the user-visible
        response.
        """
        await self._pre_call()
        started_yielding = False
        try:
            async for chunk in self._chat_stream_inner(
                system=system,
                messages=messages,
                max_tokens=max_tokens,
                enable_thinking=enable_thinking,
                thinking_budget=thinking_budget,
            ):
                started_yielding = True
                yield chunk
        except ProviderError as exc:
            await provider_health.mark_unhealthy(self._scope, self._underlying_provider, exc)
            if started_yielding:
                raise
            async for chunk in self._failover_stream(
                exc,
                system=system,
                messages=messages,
                max_tokens=max_tokens,
                enable_thinking=enable_thinking,
                thinking_budget=thinking_budget,
            ):
                yield chunk
            return
        except Exception as exc:
            classified = classify(exc, provider=self._underlying_provider, scope=self._scope)
            if classified is not None:
                await provider_health.mark_unhealthy(self._scope, self._underlying_provider, classified)
                if not started_yielding:
                    async for chunk in self._failover_stream(
                        classified,
                        system=system,
                        messages=messages,
                        max_tokens=max_tokens,
                        enable_thinking=enable_thinking,
                        thinking_budget=thinking_budget,
                    ):
                        yield chunk
                    return
                raise classified from exc
            raise
        else:
            await provider_health.mark_healthy(self._scope, self._underlying_provider)

    async def _failover_stream(self, original_exc: ProviderError, **kwargs):
        """Stream-aware failover. Walks the role's chain like ``_try_failover``
        but for an async generator. Yields chunks from the first alt provider
        that opens the stream successfully; re-raises ``original_exc`` if no
        alternate works.

        Failover is skipped under the same conditions as ``_try_failover``
        (flag off, no role, BYOK scope, empty chain).
        """
        settings = get_settings()
        if not getattr(settings, "ai_failover_enabled", True):
            raise original_exc
        if self._role is None or self._scope != "platform":
            raise original_exc
        chain = _resolve_failover_chain(self._role)
        if not chain:
            raise original_exc

        for alt_provider, alt_tier in chain:
            if alt_provider == self._underlying_provider:
                continue
            prov_cfg = _PLATFORM_PROVIDERS.get(alt_provider)
            if not prov_cfg:
                continue
            api_key = getattr(settings, prov_cfg["env_key"], "") or ""
            if not api_key:
                continue
            snap = await provider_health.get("platform", alt_provider)
            if snap is not None and snap.get("status") == "unhealthy":
                continue
            try:
                alt = _build_alt_client(
                    alt_provider,
                    prov_cfg,
                    api_key,
                    alt_tier,
                    role=self._role,
                    org_id=self._org_id,
                    db=self._db,
                )
            except Exception:
                logger.warning(
                    "Failed to build failover stream client %s for role %s", alt_provider, self._role, exc_info=True
                )
                continue
            try:
                # Drive the alt stream, but only switch to it if the first
                # chunk arrives successfully. If the alt also fails before
                # yielding, try the next candidate.
                aiter = alt.chat_stream(**kwargs).__aiter__()
                first = await aiter.__anext__()
            except StopAsyncIteration:
                # Alt opened OK but produced no content. Treat as success.
                logger.warning(
                    "ai_failover",
                    extra={
                        "role": self._role,
                        "from_provider": self._underlying_provider,
                        "to_provider": alt_provider,
                        "from_error_code": original_exc.code,
                        "method": "chat_stream",
                    },
                )
                _record_failover_breadcrumb(
                    role=self._role,
                    from_provider=self._underlying_provider,
                    to_provider=alt_provider,
                    error_code=original_exc.code,
                )
                return
            except ProviderError:
                continue
            # Got the first chunk — commit to this alt provider.
            logger.warning(
                "ai_failover",
                extra={
                    "role": self._role,
                    "from_provider": self._underlying_provider,
                    "to_provider": alt_provider,
                    "from_error_code": original_exc.code,
                    "method": "chat_stream",
                },
            )
            _record_failover_breadcrumb(
                role=self._role,
                from_provider=self._underlying_provider,
                to_provider=alt_provider,
                error_code=original_exc.code,
            )
            await provider_health.record_active_failover(
                role=self._role,
                from_provider=self._underlying_provider,
                to_provider=alt_provider,
            )
            yield first
            async for chunk in aiter:
                yield chunk
            return

        raise original_exc

    async def _chat_stream_inner(
        self,
        *,
        system: str,
        messages: list[dict],
        max_tokens: int,
        enable_thinking: bool,
        thinking_budget: int,
    ):
        if self._anthropic:
            kwargs: dict = {
                "model": self.model,
                "max_tokens": max_tokens,
                "messages": messages,
            }
            if system:
                kwargs["system"] = system
            if enable_thinking:
                # Opus 4.7 (and later) uses the adaptive-thinking API:
                # `thinking.type = adaptive` + `output_config.effort` rather
                # than the older `thinking.type = enabled` + `budget_tokens`.
                # Detect by model id; fall back to the legacy shape for
                # earlier Sonnet/Opus that still accept the old format.
                is_new_thinking = self.model.startswith(("claude-opus-4-7", "claude-sonnet-4-7"))
                if is_new_thinking:
                    kwargs["thinking"] = {"type": "adaptive"}
                    # output_config.effort: low | medium | high
                    effort = "high" if thinking_budget >= 4096 else "medium" if thinking_budget >= 1024 else "low"
                    kwargs["output_config"] = {"effort": effort}
                else:
                    budget = min(thinking_budget, max(1024, max_tokens // 2))
                    kwargs["thinking"] = {"type": "enabled", "budget_tokens": budget}
                # Anthropic requires temperature=1 when thinking is enabled —
                # but only on the legacy `thinking.type=enabled` shape.
                # Adaptive thinking (opus-4-7+) rejects `temperature` outright.
                if not is_new_thinking:
                    kwargs["temperature"] = 1.0
                # Walk events at the lowest level so we can pull thinking
                # deltas separately from text deltas.
                async with self._anthropic.messages.stream(**kwargs) as stream:
                    async for event in stream:
                        et = getattr(event, "type", None)
                        if et == "content_block_delta":
                            delta = getattr(event, "delta", None)
                            dt = getattr(delta, "type", None) if delta else None
                            if dt == "thinking_delta":
                                yield ("thinking", getattr(delta, "thinking", "") or "")
                            elif dt == "text_delta":
                                yield getattr(delta, "text", "") or ""
                    # After the stream completes, yield final usage so callers
                    # can record token counts / cost. Older code that filters
                    # on `isinstance(chunk, str)` ignores this safely.
                    try:
                        final_msg = await stream.get_final_message()
                        usage = getattr(final_msg, "usage", None)
                        if usage:
                            in_tok = int(getattr(usage, "input_tokens", 0) or 0)
                            out_tok = int(getattr(usage, "output_tokens", 0) or 0)
                            cache_create = int(getattr(usage, "cache_creation_input_tokens", 0) or 0)
                            cache_read = int(getattr(usage, "cache_read_input_tokens", 0) or 0)
                            logger.info(
                                "[USAGE] model=%s input=%d output=%d cache_create=%d cache_read=%d",
                                self.model,
                                in_tok,
                                out_tok,
                                cache_create,
                                cache_read,
                            )
                            self._track_burn(in_tok, out_tok)
                            self._schedule_ledger_write(
                                in_tok=in_tok,
                                out_tok=out_tok,
                                cache_create=cache_create,
                                cache_read=cache_read,
                            )
                            yield (
                                "usage",
                                {
                                    "model": self.model,
                                    "input_tokens": in_tok,
                                    "output_tokens": out_tok,
                                    "cache_creation_input_tokens": cache_create,
                                    "cache_read_input_tokens": cache_read,
                                },
                            )
                    except Exception:
                        pass
                return
            async with self._anthropic.messages.stream(**kwargs) as stream:
                async for text in stream.text_stream:
                    yield text
                try:
                    final_msg = await stream.get_final_message()
                    usage = getattr(final_msg, "usage", None)
                    if usage:
                        in_tok = int(getattr(usage, "input_tokens", 0) or 0)
                        out_tok = int(getattr(usage, "output_tokens", 0) or 0)
                        cache_create = int(getattr(usage, "cache_creation_input_tokens", 0) or 0)
                        cache_read = int(getattr(usage, "cache_read_input_tokens", 0) or 0)
                        logger.info(
                            "[USAGE] model=%s input=%d output=%d cache_create=%d cache_read=%d",
                            self.model,
                            in_tok,
                            out_tok,
                            cache_create,
                            cache_read,
                        )
                        self._track_burn(in_tok, out_tok)
                        self._schedule_ledger_write(
                            in_tok=in_tok,
                            out_tok=out_tok,
                            cache_create=cache_create,
                            cache_read=cache_read,
                        )
                        yield (
                            "usage",
                            {
                                "model": self.model,
                                "input_tokens": in_tok,
                                "output_tokens": out_tok,
                                "cache_creation_input_tokens": cache_create,
                                "cache_read_input_tokens": cache_read,
                            },
                        )
                except Exception:
                    pass
            return

        elif self._openai:
            oai_messages = []
            if system:
                oai_messages.append({"role": "system", "content": system})
            oai_messages.extend(messages)
            stream = await self._openai.chat.completions.create(
                model=self.model,
                messages=oai_messages,
                max_tokens=max_tokens,
                stream=True,
                # Ask for usage in the final chunk so cost tracking works
                # the same way it does for Anthropic streams (yielding a
                # ("usage", {...}) tuple after the text deltas).
                stream_options={"include_usage": True},
            )
            final_usage = None
            async for chunk in stream:
                # The final chunk in an include_usage stream has empty
                # choices and a populated `usage`. Capture it before
                # exiting the loop.
                u = getattr(chunk, "usage", None)
                if u is not None:
                    final_usage = u
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta.content
                if delta:
                    yield delta
            if final_usage is not None:
                in_tok = int(getattr(final_usage, "prompt_tokens", 0) or 0)
                out_tok = int(getattr(final_usage, "completion_tokens", 0) or 0)
                self._track_burn(in_tok, out_tok)
                self._schedule_ledger_write(in_tok=in_tok, out_tok=out_tok)
                yield (
                    "usage",
                    {
                        "model": self.model,
                        "input_tokens": in_tok,
                        "output_tokens": out_tok,
                    },
                )

        else:
            raise RuntimeError(f"No client configured for provider: {self.provider}")

    async def chat_with_tools(
        self,
        *,
        system: str = "",
        messages: list[dict],
        tools: list[dict],
        max_tokens: int = 4096,
    ) -> dict:
        """Send a chat completion with tool definitions. Returns the full message object.

        Returns dict with:
            - role: "assistant"
            - content: list of content blocks (text and tool_use)
            - stop_reason: "end_turn" | "tool_use"
        """
        from ..tracing import tracer

        start = time.perf_counter()

        with tracer.start_as_current_span(
            "ai.chat_with_tools",
            attributes={"ai.provider": self.provider, "ai.model": self.model, "ai.tool_count": len(tools)},
        ):
            try:
                result = await self._chat_with_tools_inner(
                    system=system, messages=messages, tools=tools, max_tokens=max_tokens
                )
            except ProviderError as exc:
                result = await self._try_failover(
                    exc,
                    "chat_with_tools",
                    is_tool_call=True,
                    system=system,
                    messages=messages,
                    tools=tools,
                    max_tokens=max_tokens,
                )

        self._log_timing(start)
        return result

    async def _chat_with_tools_inner(
        self,
        *,
        system: str = "",
        messages: list[dict],
        tools: list[dict],
        max_tokens: int = 4096,
    ) -> dict:
        """Internal tool-calling implementation."""
        if self._anthropic:
            kwargs: dict = {
                "model": self.model,
                "max_tokens": max_tokens,
                "messages": messages,
                "tools": tools,
            }
            if system:
                kwargs["system"] = system
            response = await self._invoke(self._anthropic.messages.create, **kwargs)
            self._record_usage(getattr(response, "usage", None))
            return {
                "role": "assistant",
                "content": [block.model_dump() for block in response.content],
                "stop_reason": response.stop_reason,
            }

        if self._openai:
            oai_messages = []
            if system:
                oai_messages.append({"role": "system", "content": system})
            oai_messages.extend(messages)
            # Convert Anthropic tool format to OpenAI function format
            oai_tools = [
                {
                    "type": "function",
                    "function": {
                        "name": t["name"],
                        "description": t.get("description", ""),
                        "parameters": t.get("input_schema", {}),
                    },
                }
                for t in tools
            ]
            response = await self._invoke(
                self._openai.chat.completions.create,
                model=self.model,
                messages=oai_messages,
                max_tokens=max_tokens,
                tools=oai_tools,
            )
            self._record_usage(getattr(response, "usage", None))
            choice = response.choices[0]
            content_blocks = []
            if choice.message.content:
                content_blocks.append({"type": "text", "text": choice.message.content})
            if choice.message.tool_calls:
                import json

                for tc in choice.message.tool_calls:
                    content_blocks.append(
                        {
                            "type": "tool_use",
                            "id": tc.id,
                            "name": tc.function.name,
                            "input": json.loads(tc.function.arguments),
                        }
                    )
            return {
                "role": "assistant",
                "content": content_blocks,
                "stop_reason": "tool_use" if choice.message.tool_calls else "end_turn",
            }

        raise RuntimeError(f"No client configured for provider: {self.provider}")


def _build_platform_client(
    name: str,
    settings,
    task: str,
    *,
    org_id: str | None = None,
    db: AsyncSession | None = None,
    role: str | None = None,
    project_id: str | None = None,
    session_id: str | None = None,
    user_id: str | None = None,
    model_override: str | None = None,
) -> AIClient:
    """Build a platform-hosted AIClient for the named provider.

    Looks up the provider config from `_PLATFORM_PROVIDERS`, reads its API
    key from settings, and instantiates the appropriate client. Falls back
    to Anthropic if the named provider isn't registered or has no key.
    """
    prov_cfg = _PLATFORM_PROVIDERS.get(name)
    if not prov_cfg:
        logger.warning(
            "Unknown PLATFORM_AI_PROVIDER=%r — falling back to anthropic",
            name,
        )
        prov_cfg = _PLATFORM_PROVIDERS["anthropic"]
        name = "anthropic"

    api_key = getattr(settings, prov_cfg["env_key"], "") or ""
    # A signed-in Claude subscription counts as an Anthropic credential
    # (anthropic_auth.py) — the desktop's local mode runs on it with no
    # API key configured at all.
    if not api_key and not (prov_cfg["kind"] == "anthropic" and has_anthropic_credential(api_key)):
        # Soft fallback so a missing key doesn't take the whole app down —
        # log loudly and try Anthropic, which historically had its key set.
        logger.warning(
            "%s API key missing (settings.%s); falling back to anthropic",
            name,
            prov_cfg["env_key"],
        )
        prov_cfg = _PLATFORM_PROVIDERS["anthropic"]
        name = "anthropic"
        api_key = settings.anthropic_api_key

    if not api_key and not has_anthropic_credential(api_key):
        raise RuntimeError(
            "AI features unavailable — ANTHROPIC_API_KEY is not set and no "
            "Claude subscription is signed in. Get a key at "
            "https://console.anthropic.com and add it to .env, or sign in to "
            "your Claude subscription in Settings, then restart the backend."
        )

    model = prov_cfg["models"].get(task, prov_cfg["models"]["default"])
    # Per-task org override (e.g. Settings → "UI/mockups model"). The caller
    # has already verified the override is compatible with `name`.
    if model_override:
        model = model_override

    if prov_cfg["kind"] == "anthropic":
        return AIClient(
            provider="platform",
            anthropic_client=AsyncAnthropic(
                **anthropic_client_kwargs(api_key),
                timeout=_SDK_TIMEOUT_S,
                max_retries=_SDK_MAX_RETRIES,
            ),
            model=model,
            underlying_provider=name,
            scope="platform",
            org_id=org_id,
            db=db,
            role=role,
            project_id=project_id,
            session_id=session_id,
            user_id=user_id,
        )

    if prov_cfg["kind"] == "openai":
        return AIClient(
            provider="platform",
            openai_client=AsyncOpenAI(api_key=api_key, timeout=_SDK_TIMEOUT_S),
            model=model,
            underlying_provider=name,
            scope="platform",
            org_id=org_id,
            db=db,
            role=role,
            project_id=project_id,
            session_id=session_id,
            user_id=user_id,
        )

    if prov_cfg["kind"] == "openai_compat":
        return AIClient(
            provider="platform",
            openai_client=AsyncOpenAI(api_key=api_key, base_url=prov_cfg["base_url"], timeout=_SDK_TIMEOUT_S),
            model=model,
            underlying_provider=name,
            scope="platform",
            org_id=org_id,
            db=db,
            role=role,
            project_id=project_id,
            session_id=session_id,
            user_id=user_id,
        )

    raise RuntimeError(f"Unsupported platform provider kind: {prov_cfg['kind']}")


def _build_alt_client(
    name: str,
    prov_cfg: dict,
    api_key: str,
    tier: str,
    *,
    role: str | None,
    org_id: str | None,
    db: AsyncSession | None,
) -> AIClient:
    """Build a transient AIClient for a failover candidate.

    Unlike ``_build_platform_client`` this NEVER falls back to anthropic on a
    missing key — the caller has already verified ``api_key`` is set. The
    point of an alt client is to be exactly the alternate provider; silently
    re-routing to the same provider that just failed would be useless.

    Always platform-scoped: failover only happens when the primary was
    platform-scoped (we never silently spend platform credit for a BYOK org).
    """
    model = prov_cfg["models"].get(tier, prov_cfg["models"]["default"])
    if prov_cfg["kind"] == "anthropic":
        return AIClient(
            provider="platform",
            anthropic_client=AsyncAnthropic(api_key=api_key, timeout=_SDK_TIMEOUT_S, max_retries=_SDK_MAX_RETRIES),
            model=model,
            underlying_provider=name,
            scope="platform",
            org_id=org_id,
            db=db,
            role=role,
        )
    if prov_cfg["kind"] == "openai":
        return AIClient(
            provider="platform",
            openai_client=AsyncOpenAI(api_key=api_key, timeout=_SDK_TIMEOUT_S),
            model=model,
            underlying_provider=name,
            scope="platform",
            org_id=org_id,
            db=db,
            role=role,
        )
    if prov_cfg["kind"] == "openai_compat":
        return AIClient(
            provider="platform",
            openai_client=AsyncOpenAI(api_key=api_key, base_url=prov_cfg["base_url"], timeout=_SDK_TIMEOUT_S),
            model=model,
            underlying_provider=name,
            scope="platform",
            org_id=org_id,
            db=db,
            role=role,
        )
    raise RuntimeError(f"Unsupported failover provider kind: {prov_cfg['kind']}")


def _record_failover_breadcrumb(*, role: str, from_provider: str, to_provider: str, error_code: str) -> None:
    """Best-effort Sentry breadcrumb + Prometheus counter when a failover
    succeeds.

    Wrapped in a try/except so missing/misconfigured Sentry doesn't take the
    happy path down.
    """
    try:
        import sentry_sdk

        sentry_sdk.add_breadcrumb(
            category="ai.failover",
            level="warning",
            message=f"AI failover {from_provider} → {to_provider} ({role})",
            data={"from": from_provider, "to": to_provider, "role": role, "error_code": error_code},
        )
    except Exception:
        logger.debug("Sentry breadcrumb for failover failed", exc_info=True)
    try:
        from ..metrics import AI_FAILOVER_COUNT

        AI_FAILOVER_COUNT.labels(role=role, from_provider=from_provider, to_provider=to_provider).inc()
    except Exception:
        logger.debug("AI_FAILOVER_COUNT metric failed", exc_info=True)


# Locked roles whose model an org may override from Settings → maps the role
# to the OrgAIConfig column holding the chosen model id.
_ROLE_OVERRIDE_FIELD: dict[str, str] = {
    "flow": "flow_model",
    "arch": "arch_model",
    "wireframe": "wireframe_model",
    "wireframe_critic": "wireframe_critic_model",
}


def _provider_for_model(model_id: str | None) -> str | None:
    """Map a model id to its platform provider so an override can name a model
    from a different provider than the role's default (e.g. an Opus model for
    the Gemini-default wireframe task). Returns None if unrecognised."""
    m = (model_id or "").lower()
    if m.startswith("claude"):
        return "anthropic"
    if m.startswith(("gpt", "o1", "o3", "o4")):
        return "openai"
    if m.startswith("gemini"):
        return "gemini"
    if m.startswith("deepseek"):
        return "deepseek"
    if m.startswith("qwen"):
        return "qwen"
    return None


async def get_ai_client_for_role(
    org_id: str | None,
    db: AsyncSession | None,
    role: str,
    *,
    project_id: str | None = None,
    session_id: str | None = None,
    user_id: str | None = None,
) -> AIClient:
    """Return an AI client routed by role rather than tier.

    Roles encode *purpose* (chat / wireframe / orch_execute / …) and
    resolve to a (provider, tier, platform_locked) triple via
    `_ROLE_DEFAULTS` plus env overrides.

    Behaviour:
    - **platform_locked=True roles** (wireframe / edit / intent / design /
      preflight / flow / extract / orch_*) ALWAYS use platform credentials
      regardless of the org's BYOK config. The platform mandates the
      provider for these — they're internal pipeline ops where cost and
      quality are platform decisions, not user choices.
    - **platform_locked=False roles** (chat / summary / niko / suggest)
      respect BYOK. If the org has their own key, those calls use it and
      the org pays. Falls back to the platform's role-default provider
      otherwise.

    ``db`` may be ``None`` for platform-locked roles (the BYOK lookup is
    skipped). User-facing roles still require ``db`` to load org config.
    """
    provider, tier, locked = _resolve_role(role)
    settings = get_settings()
    if locked:
        # Pipeline ops run on platform credentials, but an org MAY override
        # which model powers a heavy task (flow / arch / wireframe) via
        # Settings. The override can name a model from another provider, in
        # which case we route to that platform provider's key.
        model_override: str | None = None
        if db is not None and org_id and role in _ROLE_OVERRIDE_FIELD:
            cfg = await get_org_ai_config(org_id, db)
            chosen = getattr(cfg, _ROLE_OVERRIDE_FIELD[role], None) if cfg else None
            if chosen:
                model_override = chosen
                provider = _provider_for_model(chosen) or provider
        return _build_platform_client(
            provider,
            settings,
            tier,
            org_id=org_id,
            db=db,
            role=role,
            project_id=project_id,
            session_id=session_id,
            user_id=user_id,
            model_override=model_override,
        )
    if db is None:
        # Unlocked role but no DB session — fall through to platform defaults
        # (we can't look up the org's BYOK config). Caller passed org_id but
        # no db; treat as platform-only.
        return _build_platform_client(
            provider,
            settings,
            tier,
            org_id=org_id,
            db=None,
            role=role,
            project_id=project_id,
            session_id=session_id,
            user_id=user_id,
        )
    # User-facing role: defer to org config (BYOK takes precedence) with
    # the resolved provider as the platform fallback.
    return await get_ai_client(
        org_id,
        db,
        task=tier,
        _platform_override=provider,
        _role=role,
        project_id=project_id,
        session_id=session_id,
        user_id=user_id,
    )


async def get_ai_client(
    org_id: str | None,
    db: AsyncSession,
    task: str = "default",
    *,
    _platform_override: str | None = None,
    _role: str | None = None,
    project_id: str | None = None,
    session_id: str | None = None,
    user_id: str | None = None,
) -> AIClient:
    """Return a configured AI client for the org's provider setting.

    Args:
        org_id: Organization ID. If None, uses platform defaults.
        db: Database session.
        task: Complexity tier — "fast", "default", or "capable".
        _platform_override: Internal — when set and the org has no BYOK
            config, force the platform tier to use this provider instead
            of `PLATFORM_AI_PROVIDER`. Used by `get_ai_client_for_role`.
    """
    settings = get_settings()

    # No org or no config → platform-hosted defaults
    config = None
    if org_id:
        config = await get_org_ai_config(org_id, db)

    provider = config.provider if config else "platform"

    if provider == "platform":
        # Resolution order: explicit override (from role-based dispatch) →
        # PLATFORM_AI_PROVIDER env var → anthropic. Lets per-role routing
        # win over the platform default while keeping legacy `task=` paths
        # working unchanged.
        platform_name = (_platform_override or settings.platform_ai_provider or "anthropic").lower()
        return _build_platform_client(
            platform_name,
            settings,
            task,
            org_id=org_id,
            db=db,
            role=_role,
            project_id=project_id,
            session_id=session_id,
            user_id=user_id,
        )

    if provider == "byok":
        if not config or not config.byok_api_key:
            raise ValueError("BYOK provider configured but no API key set")
        key = decrypt_api_key(config.byok_api_key)
        byok_provider = (config.byok_provider or "anthropic").lower()
        byok_scope = f"org:{org_id}" if org_id else "byok"

        def _resolve_byok_model(tier_dict: dict[str, str]) -> str:
            """Pick the model per task + user overrides.

            Priority: byok_fast_model (when task=="fast") → byok_default_model
            → hardcoded tier dict. Empty strings are ignored.
            """
            if task == "fast" and config and config.byok_fast_model:
                return config.byok_fast_model
            if config and config.byok_default_model:
                return config.byok_default_model
            return tier_dict.get(task, tier_dict["default"])

        if byok_provider == "anthropic":
            return AIClient(
                provider="byok",
                anthropic_client=AsyncAnthropic(api_key=key, timeout=_SDK_TIMEOUT_S, max_retries=_SDK_MAX_RETRIES),
                model=_resolve_byok_model(_ANTHROPIC_MODELS),
                underlying_provider="anthropic",
                scope=byok_scope,
                org_id=org_id,
                db=db,
                role=_role,
                project_id=project_id,
                session_id=session_id,
                user_id=user_id,
            )
        if byok_provider == "openai":
            return AIClient(
                provider="byok",
                openai_client=AsyncOpenAI(api_key=key, timeout=_SDK_TIMEOUT_S),
                model=_resolve_byok_model(_OPENAI_MODELS),
                underlying_provider="openai",
                scope=byok_scope,
                org_id=org_id,
                db=db,
                role=_role,
                project_id=project_id,
                session_id=session_id,
                user_id=user_id,
            )
        # Gemini / DeepSeek / Qwen: same OpenAI-compatible path, different
        # base URLs + model maps. Sourced from the platform registry.
        prov_cfg = _PLATFORM_PROVIDERS.get(byok_provider)
        if prov_cfg and prov_cfg["kind"] == "openai_compat":
            return AIClient(
                provider="byok",
                openai_client=AsyncOpenAI(api_key=key, base_url=prov_cfg["base_url"], timeout=_SDK_TIMEOUT_S),
                model=_resolve_byok_model(prov_cfg["models"]),
                underlying_provider=byok_provider,
                scope=byok_scope,
                org_id=org_id,
                db=db,
                role=_role,
                project_id=project_id,
                session_id=session_id,
                user_id=user_id,
            )

        raise ValueError(f"Unknown BYOK provider: {byok_provider}")

    if provider == "bedrock":
        if not config or not config.bedrock_role_arn:
            raise ValueError("Bedrock provider configured but no role ARN set")
        # Bedrock uses boto3 with STS AssumeRole
        import boto3

        sts = boto3.client("sts")
        assumed = sts.assume_role(
            RoleArn=config.bedrock_role_arn,
            RoleSessionName=f"planr-{org_id[:8]}",
            ExternalId=org_id,  # Prevents confused deputy
            DurationSeconds=900,
        )
        creds = assumed["Credentials"]

        import aiobotocore.session

        session = aiobotocore.session.get_session()
        _bedrock_client = session.create_client(
            "bedrock-runtime",
            region_name=config.bedrock_region or "us-east-1",
            aws_access_key_id=creds["AccessKeyId"],
            aws_secret_access_key=creds["SecretAccessKey"],
            aws_session_token=creds["SessionToken"],
        )
        # Per-task override: when task=="fast" and bedrock_fast_model is set,
        # use it; else fall back to the org's default bedrock_model, then to
        # the platform Bedrock tier dict.
        if task == "fast" and config.bedrock_fast_model:
            model_id = config.bedrock_fast_model
        else:
            model_id = config.bedrock_model or _BEDROCK_MODELS.get(task, _BEDROCK_MODELS["default"])

        # Wrap Bedrock in Anthropic client (Bedrock supports Claude API format)
        return AIClient(
            provider="bedrock",
            anthropic_client=AsyncAnthropic(
                aws_secret_key=creds["SecretAccessKey"],
                aws_access_key=creds["AccessKeyId"],
                aws_session_token=creds["SessionToken"],
                aws_region=config.bedrock_region or "us-east-1",
                max_retries=_SDK_MAX_RETRIES,
            ),
            model=model_id,
            underlying_provider="bedrock",
            scope=f"org:{org_id}" if org_id else "bedrock",
            org_id=org_id,
            db=db,
            project_id=project_id,
            session_id=session_id,
            user_id=user_id,
        )

    if provider == "self_hosted":
        if not config or not config.self_hosted_url:
            raise ValueError("Self-hosted provider configured but no URL set")
        # Same per-task override pattern as Bedrock.
        if task == "fast" and config.self_hosted_fast_model:
            sh_model = config.self_hosted_fast_model
        else:
            sh_model = config.self_hosted_model or "default"
        return AIClient(
            provider="self_hosted",
            openai_client=AsyncOpenAI(
                base_url=config.self_hosted_url,
                api_key="not-needed",
                timeout=_SDK_TIMEOUT_S,
            ),
            model=sh_model,
            underlying_provider="self_hosted",
            scope=f"org:{org_id}" if org_id else "self_hosted",
            org_id=org_id,
            db=db,
            project_id=project_id,
            session_id=session_id,
            user_id=user_id,
        )

    raise ValueError(f"Unknown provider: {provider}")


async def test_ai_connection(org_id: str, db: AsyncSession) -> dict:
    """Test the AI connection for an org. Returns {ok: bool, message: str}."""
    try:
        client = await get_ai_client(org_id, db)
        response = await client.chat(
            messages=[{"role": "user", "content": "Say hello in one word."}],
            max_tokens=10,
        )
        return {"ok": True, "message": f"Connected. Response: {response.strip()[:50]}"}
    except Exception as e:
        logger.error("AI connection test failed for org %s: %s", org_id, e)
        return {"ok": False, "message": str(e)}


async def _write_usage_event(
    *,
    org_id: str,
    project_id: str | None,
    session_id: str | None,
    user_id: str | None,
    provider: str,
    model: str | None,
    in_tok: int,
    out_tok: int,
    cache_create: int,
    cache_read: int,
) -> None:
    """Background-task body for the per-event ledger write.

    Opens its own DB session via `get_session_factory()` so the caller's
    transaction is unaffected — a slow insert or rollback here doesn't
    leak back into the chat-handler request.
    """
    try:
        from ..db import get_session_factory
        from .usage_recorder import UsageContext, record_anthropic_chat, record_openai_chat

        factory = get_session_factory()
        async with factory() as db:
            ctx = UsageContext(
                org_id=org_id,
                project_id=project_id,
                session_id=session_id,
                user_id=user_id,
            )
            if provider == "anthropic":
                await record_anthropic_chat(
                    db,
                    ctx,
                    model=model or "",
                    input_tokens=in_tok,
                    output_tokens=out_tok,
                    cache_read=cache_read,
                    cache_write=cache_create,
                )
            elif provider == "openai":
                await record_openai_chat(
                    db,
                    ctx,
                    model=model or "",
                    prompt_tokens=in_tok,
                    completion_tokens=out_tok,
                )
            else:
                return
            await db.commit()
    except Exception:
        # Ledger writes are best-effort — log loudly but never raise into
        # the event loop (would crash the background task with no caller).
        logger.exception("usage_events ledger write failed")
