"""Typed exceptions for external AI provider failures.

Provider SDKs raise heterogeneous exceptions for the same conceptual error
("you ran out of credits" / "your key is invalid" / "you're being throttled").
This module normalises them into a small hierarchy so the rest of the app —
the AIClient wrapper, the FastAPI exception handler, the health-summary
endpoint — can react without sprinkling vendor-specific isinstance checks.

Exceptions carry the offending `provider` and `scope` so the global
exception handler can return a structured envelope and the frontend can
target the right banner copy.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


class ProviderError(Exception):
    """Base for normalised provider failures.

    Subclasses set `status_code` (HTTP) and `code` (machine-readable token
    surfaced in the JSON envelope and matched on the frontend).
    """

    status_code: int = 502
    code: str = "PROVIDER_ERROR"

    def __init__(
        self,
        *,
        provider: str,
        scope: str,
        message: str,
        retry_after: int | None = None,
        original: Exception | None = None,
    ) -> None:
        super().__init__(message)
        self.provider = provider
        self.scope = scope
        self.message = message
        self.retry_after = retry_after
        self.original = original

    def to_envelope(self) -> dict[str, Any]:
        env: dict[str, Any] = {
            "code": self.code,
            "message": self.message,
            "provider": self.provider,
            "scope": self.scope,
        }
        if self.retry_after is not None:
            env["retry_after"] = self.retry_after
        return env


class CreditExhaustedError(ProviderError):
    status_code = 402
    code = "PROVIDER_CREDIT_EXHAUSTED"


class InvalidKeyError(ProviderError):
    status_code = 401
    code = "PROVIDER_INVALID_KEY"


class RateLimitError(ProviderError):
    status_code = 429
    code = "PROVIDER_RATE_LIMITED"


class ProviderTransientError(ProviderError):
    status_code = 503
    code = "PROVIDER_TRANSIENT"


class HardSpendLimitError(ProviderError):
    """Org has exceeded their configured monthly hard spend cap.

    Raised before any SDK call when assert_under_hard_limit() trips, so
    runaway loops can't burn money. Returned to the frontend as 402 with
    a distinct code so the banner copy diverges from a real provider failure.
    """

    status_code = 402
    code = "ORG_HARD_LIMIT_REACHED"


_CREDIT_PHRASES = (
    "credit balance is too low",
    "insufficient_quota",
    "resource_exhausted",
    "quota exceeded",
    "billing hard limit",
)


def _looks_like_credit_message(text: str | None) -> bool:
    if not text:
        return False
    lowered = text.lower()
    return any(phrase in lowered for phrase in _CREDIT_PHRASES)


def _extract_anthropic_message(exc: Exception) -> str:
    body = getattr(exc, "body", None)
    if isinstance(body, dict):
        err = body.get("error")
        if isinstance(err, dict):
            return str(err.get("message") or "")
    return str(getattr(exc, "message", "") or exc)


def _extract_openai_code_and_message(exc: Exception) -> tuple[str, str]:
    body = getattr(exc, "body", None)
    code = ""
    message = ""
    if isinstance(body, dict):
        err = body.get("error")
        if isinstance(err, dict):
            code = str(err.get("code") or err.get("type") or "")
            message = str(err.get("message") or "")
    if not message:
        message = str(getattr(exc, "message", "") or exc)
    return code, message


def _retry_after_from(exc: Exception) -> int | None:
    resp = getattr(exc, "response", None)
    if resp is None:
        return None
    headers = getattr(resp, "headers", None)
    if headers is None:
        return None
    raw = headers.get("retry-after") or headers.get("Retry-After")
    if raw is None:
        return None
    try:
        return int(float(raw))
    except (TypeError, ValueError):
        return None


def classify(exc: Exception, *, provider: str, scope: str) -> ProviderError | None:
    """Map a vendor SDK exception to a `ProviderError`.

    Returns None for exceptions that aren't recognised provider failures —
    callers should re-raise the original in that case so unrelated bugs
    surface unchanged.
    """

    # ---- Anthropic SDK -------------------------------------------------
    try:
        from anthropic import (
            APIConnectionError as AnthropicConnectionError,
        )
        from anthropic import (
            APITimeoutError as AnthropicTimeoutError,
        )
        from anthropic import (
            AuthenticationError as AnthropicAuthError,
        )
        from anthropic import (
            BadRequestError as AnthropicBadRequest,
        )
        from anthropic import (
            PermissionDeniedError as AnthropicPermissionDenied,
        )
        from anthropic import (
            RateLimitError as AnthropicRateLimit,
        )
    except Exception:  # pragma: no cover — anthropic import always succeeds
        AnthropicAuthError = AnthropicBadRequest = AnthropicRateLimit = ()  # type: ignore[assignment]
        AnthropicPermissionDenied = AnthropicConnectionError = AnthropicTimeoutError = ()  # type: ignore[assignment]

    if isinstance(exc, AnthropicAuthError):
        return InvalidKeyError(
            provider=provider, scope=scope, message=_extract_anthropic_message(exc) or "API key invalid", original=exc
        )
    if isinstance(exc, AnthropicPermissionDenied):
        # Could be an org-permission issue or, on some routes, an out-of-credits
        # signal that Anthropic returns as 403.
        msg = _extract_anthropic_message(exc)
        if _looks_like_credit_message(msg):
            return CreditExhaustedError(provider=provider, scope=scope, message=msg, original=exc)
        return InvalidKeyError(provider=provider, scope=scope, message=msg or "permission denied", original=exc)
    if isinstance(exc, AnthropicBadRequest):
        msg = _extract_anthropic_message(exc)
        if _looks_like_credit_message(msg):
            return CreditExhaustedError(provider=provider, scope=scope, message=msg, original=exc)
        return None  # Other 400s aren't credit-related; let them bubble.
    if isinstance(exc, AnthropicRateLimit):
        msg = _extract_anthropic_message(exc)
        if _looks_like_credit_message(msg):
            return CreditExhaustedError(provider=provider, scope=scope, message=msg, original=exc)
        return RateLimitError(
            provider=provider,
            scope=scope,
            message=msg or "rate limited",
            retry_after=_retry_after_from(exc),
            original=exc,
        )
    if isinstance(exc, (AnthropicConnectionError, AnthropicTimeoutError)):
        return ProviderTransientError(
            provider=provider, scope=scope, message=str(exc) or "transient network error", original=exc
        )

    # ---- OpenAI / OpenAI-compat (Gemini, DeepSeek, Qwen) ---------------
    try:
        from openai import (
            APIConnectionError as OpenAIConnectionError,
        )
        from openai import (
            APITimeoutError as OpenAITimeoutError,
        )
        from openai import (
            AuthenticationError as OpenAIAuthError,
        )
        from openai import (
            BadRequestError as OpenAIBadRequest,
        )
        from openai import (
            PermissionDeniedError as OpenAIPermissionDenied,
        )
        from openai import (
            RateLimitError as OpenAIRateLimit,
        )
    except Exception:  # pragma: no cover
        OpenAIAuthError = OpenAIBadRequest = OpenAIRateLimit = ()  # type: ignore[assignment]
        OpenAIPermissionDenied = OpenAIConnectionError = OpenAITimeoutError = ()  # type: ignore[assignment]

    if isinstance(exc, OpenAIAuthError):
        _, msg = _extract_openai_code_and_message(exc)
        return InvalidKeyError(provider=provider, scope=scope, message=msg or "API key invalid", original=exc)
    if isinstance(exc, OpenAIPermissionDenied):
        code, msg = _extract_openai_code_and_message(exc)
        if code.lower() == "insufficient_quota" or _looks_like_credit_message(msg):
            return CreditExhaustedError(provider=provider, scope=scope, message=msg, original=exc)
        return InvalidKeyError(provider=provider, scope=scope, message=msg or "permission denied", original=exc)
    if isinstance(exc, OpenAIRateLimit):
        code, msg = _extract_openai_code_and_message(exc)
        if code.lower() == "insufficient_quota" or _looks_like_credit_message(msg):
            return CreditExhaustedError(provider=provider, scope=scope, message=msg, original=exc)
        return RateLimitError(
            provider=provider,
            scope=scope,
            message=msg or "rate limited",
            retry_after=_retry_after_from(exc),
            original=exc,
        )
    if isinstance(exc, OpenAIBadRequest):
        code, msg = _extract_openai_code_and_message(exc)
        if code.lower() == "insufficient_quota" or _looks_like_credit_message(msg):
            return CreditExhaustedError(provider=provider, scope=scope, message=msg, original=exc)
        return None
    if isinstance(exc, (OpenAIConnectionError, OpenAITimeoutError)):
        return ProviderTransientError(
            provider=provider, scope=scope, message=str(exc) or "transient network error", original=exc
        )

    # ---- httpx fallback ------------------------------------------------
    try:
        import httpx
    except Exception:  # pragma: no cover
        httpx = None  # type: ignore[assignment]
    if httpx is not None and isinstance(exc, (httpx.TimeoutException, httpx.ConnectError, httpx.ReadError)):
        return ProviderTransientError(
            provider=provider, scope=scope, message=str(exc) or "transient network error", original=exc
        )

    return None
