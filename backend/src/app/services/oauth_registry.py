"""OAuth provider registry.

Defines all supported OAuth providers and credential-based providers,
with helpers to check availability based on configured environment variables.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from .github_app import get_app_config as get_github_app_config

# Load .env from project root so os.getenv() sees OAuth credentials
_env_path = Path(__file__).resolve().parents[4] / ".env"
if _env_path.exists():
    load_dotenv(_env_path)

logger = logging.getLogger(__name__)

# Providers that use credential-based auth (API keys / cloud credentials) rather than OAuth
CREDENTIAL_PROVIDERS: set[str] = {
    "aws",
    "gcp",
    "azure",
    "flyio",
    "render",
    "shortcut",
    "gitbook",
    "slite",
    "datadog",
    "newrelic",
}

# OAuth provider configurations
# Each entry has: authorize_url, token_url, scopes, env_client_id, env_client_secret
# and optionally extra_params for non-standard OAuth flows.
OAUTH_PROVIDERS: dict[str, dict[str, Any]] = {
    "github": {
        "authorize_url": "https://github.com/login/oauth/authorize",
        "token_url": "https://github.com/login/oauth/access_token",
        "scopes": ["repo", "read:org", "read:user"],
        "env_client_id": "GITHUB_CLIENT_ID",
        "env_client_secret": "GITHUB_CLIENT_SECRET",
    },
    "gitlab": {
        "authorize_url": "https://gitlab.com/oauth/authorize",
        "token_url": "https://gitlab.com/oauth/token",
        "scopes": ["read_api", "read_user", "read_repository"],
        "env_client_id": "GITLAB_CLIENT_ID",
        "env_client_secret": "GITLAB_CLIENT_SECRET",
    },
    "bitbucket": {
        "authorize_url": "https://bitbucket.org/site/oauth2/authorize",
        "token_url": "https://bitbucket.org/site/oauth2/access_token",
        "scopes": ["repository", "account", "team"],
        "env_client_id": "BITBUCKET_CLIENT_ID",
        "env_client_secret": "BITBUCKET_CLIENT_SECRET",
    },
    "azure_devops": {
        "authorize_url": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        "token_url": "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        "scopes": ["499b84ac-1321-427f-aa17-267ca6975798/.default"],
        "env_client_id": "AZURE_DEVOPS_CLIENT_ID",
        "env_client_secret": "AZURE_DEVOPS_CLIENT_SECRET",
    },
    "digitalocean": {
        "authorize_url": "https://cloud.digitalocean.com/v1/oauth/authorize",
        "token_url": "https://cloud.digitalocean.com/v1/oauth/token",
        "scopes": ["read"],
        "env_client_id": "DIGITALOCEAN_CLIENT_ID",
        "env_client_secret": "DIGITALOCEAN_CLIENT_SECRET",
    },
    "vercel": {
        "authorize_url": "https://vercel.com/integrations/oauth/authorize",
        "token_url": "https://api.vercel.com/v2/oauth/access_token",
        "scopes": ["read"],
        "env_client_id": "VERCEL_CLIENT_ID",
        "env_client_secret": "VERCEL_CLIENT_SECRET",
    },
    "railway": {
        "authorize_url": "https://railway.app/oauth/authorize",
        "token_url": "https://railway.app/oauth/token",
        "scopes": ["read"],
        "env_client_id": "RAILWAY_CLIENT_ID",
        "env_client_secret": "RAILWAY_CLIENT_SECRET",
    },
    "netlify": {
        "authorize_url": "https://app.netlify.com/authorize",
        "token_url": "https://api.netlify.com/oauth/token",
        "scopes": ["read"],
        "env_client_id": "NETLIFY_CLIENT_ID",
        "env_client_secret": "NETLIFY_CLIENT_SECRET",
    },
    "heroku": {
        "authorize_url": "https://id.heroku.com/oauth/authorize",
        "token_url": "https://id.heroku.com/oauth/token",
        "scopes": ["read", "identity"],
        "env_client_id": "HEROKU_CLIENT_ID",
        "env_client_secret": "HEROKU_CLIENT_SECRET",
    },
    "jira": {
        "authorize_url": "https://auth.atlassian.com/authorize",
        "token_url": "https://auth.atlassian.com/oauth/token",
        "scopes": ["read:jira-work", "read:jira-user", "offline_access"],
        "env_client_id": "JIRA_CLIENT_ID",
        "env_client_secret": "JIRA_CLIENT_SECRET",
        "extra_params": {"audience": "api.atlassian.com", "prompt": "consent"},
    },
    "linear": {
        "authorize_url": "https://linear.app/oauth/authorize",
        "token_url": "https://api.linear.app/oauth/token",
        "scopes": ["read"],
        "env_client_id": "LINEAR_CLIENT_ID",
        "env_client_secret": "LINEAR_CLIENT_SECRET",
    },
    "asana": {
        "authorize_url": "https://app.asana.com/-/oauth_authorize",
        "token_url": "https://app.asana.com/-/oauth_token",
        "scopes": ["default"],
        "env_client_id": "ASANA_CLIENT_ID",
        "env_client_secret": "ASANA_CLIENT_SECRET",
    },
    "trello": {
        "authorize_url": "https://trello.com/1/authorize",
        "token_url": "https://trello.com/1/OAuthGetAccessToken",
        "scopes": ["read"],
        "env_client_id": "TRELLO_CLIENT_ID",
        "env_client_secret": "TRELLO_CLIENT_SECRET",
    },
    "monday": {
        "authorize_url": "https://auth.monday.com/oauth2/authorize",
        "token_url": "https://auth.monday.com/oauth2/token",
        "scopes": ["boards:read", "users:read"],
        "env_client_id": "MONDAY_CLIENT_ID",
        "env_client_secret": "MONDAY_CLIENT_SECRET",
    },
    "clickup": {
        "authorize_url": "https://app.clickup.com/api",
        "token_url": "https://api.clickup.com/api/v2/oauth/token",
        "scopes": ["task:read", "team:read"],
        "env_client_id": "CLICKUP_CLIENT_ID",
        "env_client_secret": "CLICKUP_CLIENT_SECRET",
    },
    "confluence": {
        "authorize_url": "https://auth.atlassian.com/authorize",
        "token_url": "https://auth.atlassian.com/oauth/token",
        "scopes": [
            "read:space:confluence",
            "read:page:confluence",
            "read:confluence-user",
            "offline_access",
        ],
        "env_client_id": "CONFLUENCE_CLIENT_ID",
        "env_client_secret": "CONFLUENCE_CLIENT_SECRET",
        "extra_params": {"audience": "api.atlassian.com", "prompt": "consent"},
    },
    "notion": {
        "authorize_url": "https://api.notion.com/v1/oauth/authorize",
        "token_url": "https://api.notion.com/v1/oauth/token",
        "scopes": [],
        "env_client_id": "NOTION_CLIENT_ID",
        "env_client_secret": "NOTION_CLIENT_SECRET",
    },
    "slack": {
        "authorize_url": "https://slack.com/oauth/v2/authorize",
        "token_url": "https://slack.com/api/oauth.v2.access",
        "scopes": [
            "channels:history",
            "channels:read",
            "groups:history",
            "groups:read",
            "users:read",
            "team:read",
            "pins:read",
            "chat:write",
            "chat:write.public",
        ],
        "env_client_id": "SLACK_CLIENT_ID",
        "env_client_secret": "SLACK_CLIENT_SECRET",
    },
    "discord": {
        "authorize_url": "https://discord.com/api/oauth2/authorize",
        "token_url": "https://discord.com/api/oauth2/token",
        "scopes": ["guilds.members.read", "guilds"],
        "env_client_id": "DISCORD_CLIENT_ID",
        "env_client_secret": "DISCORD_CLIENT_SECRET",
    },
    "microsoft_teams": {
        "authorize_url": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        "token_url": "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        "scopes": ["Team.ReadBasic.All", "Channel.ReadBasic.All", "User.Read"],
        "env_client_id": "MICROSOFT_CLIENT_ID",
        "env_client_secret": "MICROSOFT_CLIENT_SECRET",
    },
    "sentry": {
        "authorize_url": "https://sentry.io/oauth/authorize/",
        "token_url": "https://sentry.io/oauth/token/",
        "scopes": ["project:read", "org:read", "event:read"],
        "env_client_id": "SENTRY_OAUTH_CLIENT_ID",
        "env_client_secret": "SENTRY_OAUTH_CLIENT_SECRET",
    },
    "pagerduty": {
        "authorize_url": "https://app.pagerduty.com/oauth/authorize",
        "token_url": "https://app.pagerduty.com/oauth/token",
        "scopes": ["read"],
        "env_client_id": "PAGERDUTY_CLIENT_ID",
        "env_client_secret": "PAGERDUTY_CLIENT_SECRET",
    },
    "figma": {
        "authorize_url": "https://www.figma.com/oauth",
        "token_url": "https://api.figma.com/v1/oauth/token",
        "scopes": ["file_read"],
        "env_client_id": "FIGMA_CLIENT_ID",
        "env_client_secret": "FIGMA_CLIENT_SECRET",
    },
}

REQUIRED_OAUTH_KEYS = {"authorize_url", "token_url", "scopes", "env_client_id", "env_client_secret"}
# Backwards-compat alias for code that imported the private name.
_REQUIRED_OAUTH_KEYS = REQUIRED_OAUTH_KEYS


def get_oauth_config(provider_id: str) -> dict[str, Any] | None:
    """Return the OAuth config for *provider_id*, or None if not an OAuth provider."""
    return OAUTH_PROVIDERS.get(provider_id)


def is_provider_configured(provider_id: str) -> bool:
    """Return True if the provider's required environment variables are present.

    For OAuth providers this checks both client ID and client secret env vars.
    Credential providers are considered always configured (credentials are
    supplied at the org level by users, not via platform env vars).
    """
    if provider_id in CREDENTIAL_PROVIDERS:
        return True

    config = OAUTH_PROVIDERS.get(provider_id)
    if config is None:
        logger.debug("is_provider_configured: unknown provider %s", provider_id)
        return False

    client_id = os.environ.get(config["env_client_id"], "")
    client_secret = os.environ.get(config["env_client_secret"], "")
    return bool(client_id and client_secret)


def get_available_providers() -> list[str]:
    """Return a list of provider IDs that are available for use.

    A provider is available when:
    - It is a credential provider (always available — credentials are org-level), or
    - It is an OAuth provider whose client ID and client secret env vars are set.
    """
    available: list[str] = []

    for provider_id in OAUTH_PROVIDERS:
        if is_provider_configured(provider_id):
            available.append(provider_id)
            logger.debug("OAuth provider available: %s", provider_id)

    for provider_id in CREDENTIAL_PROVIDERS:
        available.append(provider_id)

    # GitHub App takes priority over GitHub OAuth
    if "github" not in available:
        github_app_cfg = get_github_app_config()
        if github_app_cfg and github_app_cfg.get("slug"):
            available.append("github")

    return available
