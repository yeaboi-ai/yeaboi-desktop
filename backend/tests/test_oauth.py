"""Tests for the OAuth provider registry."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.app.services.credential_validators import validate_credentials
from src.app.services.oauth_registry import (
    CREDENTIAL_PROVIDERS,
    OAUTH_PROVIDERS,
    REQUIRED_OAUTH_KEYS,
    get_available_providers,
    get_oauth_config,
)


def test_oauth_registry_has_all_oauth_providers():
    """Registry must contain exactly 23 OAuth providers, each with the required keys."""
    assert len(OAUTH_PROVIDERS) == 23, f"Expected 23 OAuth providers, got {len(OAUTH_PROVIDERS)}"

    for provider_id, config in OAUTH_PROVIDERS.items():
        missing = REQUIRED_OAUTH_KEYS - config.keys()
        assert not missing, f"Provider '{provider_id}' is missing keys: {missing}"


def test_get_oauth_config_returns_none_for_unknown():
    """Unknown provider IDs must return None."""
    assert get_oauth_config("does_not_exist") is None
    assert get_oauth_config("") is None


def test_get_oauth_config_returns_config():
    """get_oauth_config returns the correct config dict for a known provider."""
    config = get_oauth_config("github")
    assert config is not None
    assert config["authorize_url"] == "https://github.com/login/oauth/authorize"
    assert config["token_url"] == "https://github.com/login/oauth/access_token"
    assert "repo" in config["scopes"]
    assert config["env_client_id"] == "GITHUB_CLIENT_ID"
    assert config["env_client_secret"] == "GITHUB_CLIENT_SECRET"


def test_get_available_providers_excludes_unconfigured(monkeypatch):
    """With no OAuth env vars set, no OAuth providers should appear in the available list."""
    # Remove all possible OAuth client env vars
    for config in OAUTH_PROVIDERS.values():
        monkeypatch.delenv(config["env_client_id"], raising=False)
        monkeypatch.delenv(config["env_client_secret"], raising=False)
    # Also remove the GitHub App vars — GitHub is special-cased to be available
    # whenever the App is registered (separate from the OAuth client).
    for var in ("GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_SLUG"):
        monkeypatch.delenv(var, raising=False)

    available = get_available_providers()

    # No OAuth provider should be present
    for provider_id in OAUTH_PROVIDERS:
        assert provider_id not in available, f"OAuth provider '{provider_id}' should not be available without env vars"

    # All credential providers should still be present
    for provider_id in CREDENTIAL_PROVIDERS:
        assert provider_id in available, f"Credential provider '{provider_id}' should always be available"


def test_get_available_providers_includes_configured(monkeypatch):
    """When GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are set, github appears in the list."""
    # Clear all OAuth vars first
    for config in OAUTH_PROVIDERS.values():
        monkeypatch.delenv(config["env_client_id"], raising=False)
        monkeypatch.delenv(config["env_client_secret"], raising=False)

    # Set GitHub specifically
    monkeypatch.setenv("GITHUB_CLIENT_ID", "test-client-id")
    monkeypatch.setenv("GITHUB_CLIENT_SECRET", "test-client-secret")

    available = get_available_providers()

    assert "github" in available

    # Other OAuth providers should still be absent
    for provider_id in OAUTH_PROVIDERS:
        if provider_id != "github":
            assert provider_id not in available, f"'{provider_id}' should not be available without env vars"

    # Credential providers still present
    for provider_id in CREDENTIAL_PROVIDERS:
        assert provider_id in available


# ---------------------------------------------------------------------------
# Credential validator tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_validate_unknown_provider():
    """Unknown provider returns ok=False with 'Unsupported' in the error message."""
    result = await validate_credentials("does_not_exist", {})
    assert result["ok"] is False
    assert "Unsupported" in result["error"]


@pytest.mark.asyncio
async def test_validate_datadog_success():
    """Valid Datadog credentials return ok=True when the API responds with 200."""
    mock_response = MagicMock()
    mock_response.status_code = 200

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=mock_response)

    with patch("src.app.services.credential_validators.httpx.AsyncClient", return_value=mock_client):
        result = await validate_credentials(
            "datadog",
            {"api_key": "test-api-key", "app_key": "test-app-key"},
        )

    assert result["ok"] is True


@pytest.mark.asyncio
async def test_validate_datadog_failure():
    """Invalid Datadog credentials return ok=False when the API responds with 403."""
    mock_response = MagicMock()
    mock_response.status_code = 403

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=mock_response)

    with patch("src.app.services.credential_validators.httpx.AsyncClient", return_value=mock_client):
        result = await validate_credentials(
            "datadog",
            {"api_key": "bad-key", "app_key": "bad-app-key"},
        )

    assert result["ok"] is False
    assert "403" in result["error"]


# ---------------------------------------------------------------------------
# OAuth endpoint tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_oauth_authorize_redirects(client, auth_headers, monkeypatch):
    """GET /api/integrations/oauth/authorize should redirect to provider.

    For 'github' specifically, the authorize endpoint special-cases the
    GitHub App install URL when GITHUB_APP_ID/SLUG are configured (the
    App flow is preferred over the legacy OAuth App). We exercise a
    non-App provider here to assert the generic OAuth redirect path.
    """
    monkeypatch.setenv("GITLAB_CLIENT_ID", "test-client-id")
    monkeypatch.setenv("GITLAB_CLIENT_SECRET", "test-secret")
    resp = await client.get(
        "/api/integrations/oauth/authorize?provider=gitlab",
        headers=auth_headers,
        follow_redirects=False,
    )
    assert resp.status_code == 307
    assert "gitlab.com/oauth/authorize" in resp.headers["location"]
    assert "test-client-id" in resp.headers["location"]


@pytest.mark.asyncio
async def test_oauth_authorize_unknown_provider(client, auth_headers):
    resp = await client.get(
        "/api/integrations/oauth/authorize?provider=nonexistent",
        headers=auth_headers,
        follow_redirects=False,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_oauth_authorize_unconfigured_provider(client, auth_headers, monkeypatch):
    monkeypatch.delenv("GITHUB_CLIENT_ID", raising=False)
    monkeypatch.delenv("GITHUB_CLIENT_SECRET", raising=False)
    resp = await client.get(
        "/api/integrations/oauth/authorize?provider=github",
        headers=auth_headers,
        follow_redirects=False,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_oauth_available_endpoint(client, auth_headers, monkeypatch):
    monkeypatch.setenv("GITHUB_CLIENT_ID", "id")
    monkeypatch.setenv("GITHUB_CLIENT_SECRET", "secret")
    resp = await client.get("/api/integrations/available", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    ids = [p["id"] for p in data]
    assert "github" in ids
    assert "datadog" in ids  # credential providers always available
