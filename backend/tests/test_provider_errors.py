"""Tests for the provider-error classifier.

Builds canonical SDK exception fixtures and asserts they map to the right
ProviderError subclass with the right status_code/code.
"""

from __future__ import annotations

import httpx

from src.app.services.provider_errors import (
    CreditExhaustedError,
    InvalidKeyError,
    ProviderError,
    ProviderTransientError,
    RateLimitError,
    classify,
)


def _httpx_response(status: int, body: dict) -> httpx.Response:
    return httpx.Response(status_code=status, json=body, request=httpx.Request("POST", "https://x.test/"))


def test_anthropic_credit_message_classifies_as_credit_exhausted():
    from anthropic import BadRequestError

    body = {
        "type": "error",
        "error": {
            "type": "invalid_request_error",
            "message": "Your credit balance is too low to access the Anthropic API.",
        },
    }
    exc = BadRequestError(message="bad", response=_httpx_response(400, body), body=body)
    err = classify(exc, provider="anthropic", scope="platform")
    assert isinstance(err, CreditExhaustedError)
    assert err.code == "PROVIDER_CREDIT_EXHAUSTED"
    assert err.status_code == 402
    assert err.provider == "anthropic"
    assert err.scope == "platform"


def test_anthropic_authentication_error_classifies_as_invalid_key():
    from anthropic import AuthenticationError

    body = {"error": {"message": "invalid x-api-key"}}
    exc = AuthenticationError(message="auth", response=_httpx_response(401, body), body=body)
    err = classify(exc, provider="anthropic", scope="platform")
    assert isinstance(err, InvalidKeyError)
    assert err.status_code == 401


def test_anthropic_rate_limit_classifies_as_rate_limited():
    from anthropic import RateLimitError as ARate

    body = {"error": {"message": "Number of requests has exceeded your rate limit"}}
    exc = ARate(message="rate", response=_httpx_response(429, body), body=body)
    err = classify(exc, provider="anthropic", scope="platform")
    assert isinstance(err, RateLimitError)
    assert err.status_code == 429


def test_openai_insufficient_quota_classifies_as_credit_exhausted():
    from openai import RateLimitError as ORate

    body = {"error": {"code": "insufficient_quota", "message": "You exceeded your current quota"}}
    exc = ORate(message="rate", response=_httpx_response(429, body), body=body)
    err = classify(exc, provider="openai", scope="platform")
    assert isinstance(err, CreditExhaustedError)


def test_openai_plain_rate_limit_classifies_as_rate_limited():
    from openai import RateLimitError as ORate

    body = {"error": {"code": "rate_limit_exceeded", "message": "slow down"}}
    exc = ORate(message="rate", response=_httpx_response(429, body), body=body)
    err = classify(exc, provider="openai", scope="platform")
    assert isinstance(err, RateLimitError)


def test_openai_authentication_error_classifies_as_invalid_key():
    from openai import AuthenticationError

    body = {"error": {"message": "Invalid API key"}}
    exc = AuthenticationError(message="auth", response=_httpx_response(401, body), body=body)
    err = classify(exc, provider="openai", scope="platform")
    assert isinstance(err, InvalidKeyError)


def test_gemini_via_openai_compat_resource_exhausted_classifies_as_credit_exhausted():
    from openai import RateLimitError as ORate

    body = {"error": {"code": "RESOURCE_EXHAUSTED", "message": "Quota exceeded for daily requests"}}
    exc = ORate(message="rate", response=_httpx_response(429, body), body=body)
    err = classify(exc, provider="gemini", scope="platform")
    assert isinstance(err, CreditExhaustedError)


def test_httpx_timeout_classifies_as_transient():
    exc = httpx.TimeoutException("timed out")
    err = classify(exc, provider="anthropic", scope="platform")
    assert isinstance(err, ProviderTransientError)


def test_unrelated_exception_returns_none():
    err = classify(ValueError("bad input"), provider="anthropic", scope="platform")
    assert err is None


def test_envelope_includes_required_fields():
    err = CreditExhaustedError(provider="anthropic", scope="platform", message="too low")
    env = err.to_envelope()
    assert env["code"] == "PROVIDER_CREDIT_EXHAUSTED"
    assert env["provider"] == "anthropic"
    assert env["scope"] == "platform"
    assert env["message"] == "too low"


def test_provider_error_base_status_code():
    """Make sure the base class doesn't accidentally inherit a child's status."""
    err = ProviderError(provider="x", scope="platform", message="generic")
    assert err.status_code == 502
