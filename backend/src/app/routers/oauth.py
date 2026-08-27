"""OAuth authorize/callback endpoints and available-providers listing."""

import json
import logging
import os
import secrets
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db import get_db
from ..deps import get_current_org, get_current_user
from ..models.integration import OrgIntegration
from ..models.organization import Organization
from ..models.user import User
from ..services.audit_service import get_client_ip, log_audit
from ..services.crypto import encrypt_api_key
from ..services.github_app import get_app_config, get_installation_details, get_installation_url
from ..services.oauth_registry import (
    CREDENTIAL_PROVIDERS,
    get_available_providers,
    get_oauth_config,
    is_provider_configured,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["integrations"])

_CATEGORY_MAP = {
    "github": "version_control",
    "gitlab": "version_control",
    "bitbucket": "version_control",
    "azure_devops": "version_control",
    "digitalocean": "cloud",
    "vercel": "hosting",
    "railway": "hosting",
    "netlify": "hosting",
    "heroku": "hosting",
    "jira": "issue_tracking",
    "linear": "issue_tracking",
    "asana": "issue_tracking",
    "trello": "issue_tracking",
    "monday": "issue_tracking",
    "clickup": "issue_tracking",
    "confluence": "documentation",
    "notion": "documentation",
    "slack": "communication",
    "discord": "communication",
    "microsoft_teams": "communication",
    "sentry": "monitoring",
    "pagerduty": "monitoring",
    "figma": "design",
}


@router.get("/api/integrations/available")
async def list_available_providers(
    user: User = Depends(get_current_user),
):
    """Return the list of providers available for connection.

    OAuth providers appear only when their client ID/secret env vars are set.
    Credential-based providers are always listed.
    """
    provider_ids = get_available_providers()
    result = []
    for pid in provider_ids:
        oauth_cfg = get_oauth_config(pid)
        result.append(
            {
                "id": pid,
                "auth_type": "credential" if pid in CREDENTIAL_PROVIDERS else "oauth",
                "category": _CATEGORY_MAP.get(pid, "other"),
                "configured": is_provider_configured(pid),
                "has_oauth": oauth_cfg is not None,
            }
        )
    return result


@router.get("/api/integrations/oauth/authorize")
async def oauth_authorize(
    request: Request,
    provider: str = Query(..., description="Provider ID, e.g. 'github'"),
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
):
    """Generate an OAuth authorization URL and redirect the user to the provider."""
    settings = get_settings()

    # Validate provider exists
    oauth_cfg = get_oauth_config(provider)
    if oauth_cfg is None:
        raise HTTPException(status_code=400, detail=f"Unknown OAuth provider: {provider}")

    # Read optional permission / scope overrides from the frontend consent flow
    custom_scopes_str = request.query_params.get("scopes", "")
    permissions_str = request.query_params.get("permissions", "")

    # Build state JWT (needed by both the App flow and the plain OAuth flow)
    nonce = secrets.token_urlsafe(16)
    state_payload = {
        "provider": provider,
        "org_id": org.id,
        "user_id": user.id,
        "nonce": nonce,
        "permissions": permissions_str,
        "exp": datetime.now(tz=UTC) + timedelta(minutes=10),
        "iat": datetime.now(tz=UTC),
    }
    state_token = jwt.encode(state_payload, settings.nextauth_secret, algorithm="HS256")

    # Special case: GitHub uses the GitHub App installation flow when an App is
    # configured. Check this before the OAuth env-var validation so deployments
    # that only have GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY (and not the OAuth
    # client credentials) still work.
    if provider == "github":
        app_config = get_app_config()
        install_url = get_installation_url()
        if app_config and install_url:
            params = {"state": state_token}
            url = f"{install_url}?{urlencode(params)}"
            logger.info("GitHub App install redirect: org=%s user=%s", org.id, user.id)
            return RedirectResponse(url=url, status_code=307)

    # Validate provider has OAuth client credentials configured. GitHub falls
    # through to here only when the App config is missing, in which case
    # neither path is configured and the 400 is the right answer.
    if not is_provider_configured(provider):
        raise HTTPException(status_code=400, detail=f"Provider '{provider}' is not configured (missing env vars)")

    # Build callback URL
    callback_url = f"{settings.backend_url}/api/integrations/oauth/callback"

    # Use custom scopes if provided (from permission selection), otherwise default
    if custom_scopes_str:
        scopes = custom_scopes_str.split(",")
    else:
        scopes = oauth_cfg["scopes"]

    # Build authorize URL
    client_id = os.environ.get(oauth_cfg["env_client_id"], "")
    params = {
        "client_id": client_id,
        "redirect_uri": callback_url,
        "state": state_token,
        "response_type": "code",
        "scope": " ".join(scopes),
    }

    # Add any extra params from config (e.g. audience, prompt for Atlassian)
    extra_params = oauth_cfg.get("extra_params", {})
    params.update(extra_params)

    authorize_url = f"{oauth_cfg['authorize_url']}?{urlencode(params)}"

    logger.info("OAuth authorize redirect for provider=%s org=%s user=%s", provider, org.id, user.id)
    return RedirectResponse(url=authorize_url, status_code=307)


@router.get("/api/integrations/oauth/callback")
async def oauth_callback(
    request: Request,
    code: str = Query(..., description="Authorization code from provider"),
    state: str = Query(..., description="State JWT for CSRF protection"),
    db: AsyncSession = Depends(get_db),
):
    """Handle the OAuth callback from the provider.

    Exchanges the authorization code for tokens, encrypts them, and
    creates/updates the OrgIntegration record.
    """
    settings = get_settings()
    error_redirect = f"{settings.app_url}/settings?tab=integrations&error=token_exchange_failed"

    # Decode and verify state JWT
    try:
        state_payload = jwt.decode(state, settings.nextauth_secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        logger.warning("OAuth callback: state JWT expired")
        return RedirectResponse(url=f"{settings.app_url}/settings?tab=integrations&error=state_expired")
    except jwt.InvalidTokenError:
        logger.warning("OAuth callback: invalid state JWT")
        return RedirectResponse(url=f"{settings.app_url}/settings?tab=integrations&error=invalid_state")

    provider = state_payload.get("provider")
    org_id = state_payload.get("org_id")
    user_id = state_payload.get("user_id")

    if not provider or not org_id or not user_id:
        logger.warning("OAuth callback: incomplete state payload")
        return RedirectResponse(url=error_redirect)

    oauth_cfg = get_oauth_config(provider)
    if oauth_cfg is None:
        logger.error("OAuth callback: unknown provider '%s' in state", provider)
        return RedirectResponse(url=error_redirect)

    # Exchange code for tokens
    client_id = os.environ.get(oauth_cfg["env_client_id"], "")
    client_secret = os.environ.get(oauth_cfg["env_client_secret"], "")
    callback_url = f"{settings.backend_url}/api/integrations/oauth/callback"

    token_data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": callback_url,
        "client_id": client_id,
        "client_secret": client_secret,
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as http_client:
            token_resp = await http_client.post(
                oauth_cfg["token_url"],
                data=token_data,
                headers={"Accept": "application/json"},
            )

        if token_resp.status_code != 200:
            logger.error(
                "OAuth token exchange failed: provider=%s status=%s body=%s",
                provider,
                token_resp.status_code,
                token_resp.text[:500],
            )
            return RedirectResponse(url=error_redirect)

        # Parse token response (some providers return form-encoded, most return JSON)
        content_type = token_resp.headers.get("content-type", "")
        if "application/json" in content_type:
            tokens = token_resp.json()
        else:
            # Parse form-encoded response (e.g. GitHub)
            from urllib.parse import parse_qs

            parsed = parse_qs(token_resp.text)
            tokens = {k: v[0] for k, v in parsed.items()}

    except httpx.HTTPError as exc:
        logger.exception("OAuth token exchange HTTP error for provider=%s: %s", provider, exc)
        return RedirectResponse(url=error_redirect)

    access_token = tokens.get("access_token", "")
    refresh_token = tokens.get("refresh_token")
    expires_in = tokens.get("expires_in")

    if not access_token:
        logger.error("OAuth token exchange returned no access_token for provider=%s", provider)
        return RedirectResponse(url=error_redirect)

    # Encrypt tokens
    encrypted_access = encrypt_api_key(access_token)
    encrypted_refresh = encrypt_api_key(refresh_token) if refresh_token else None

    # Calculate expiry
    token_expires_at = None
    if expires_in:
        try:
            token_expires_at = datetime.now(tz=UTC) + timedelta(seconds=int(expires_in))
        except (ValueError, TypeError):
            logger.warning("Could not parse expires_in=%s for provider=%s", expires_in, provider)

    # Create or update OrgIntegration
    category = _CATEGORY_MAP.get(provider, "other")

    # Extract granted permissions from state JWT (set during authorize)
    permissions_str = state_payload.get("permissions", "")
    granted_permissions = [p for p in permissions_str.split(",") if p] if permissions_str else []
    metadata = json.dumps({"granted_permissions": granted_permissions}) if granted_permissions else None

    result = await db.execute(
        select(OrgIntegration).where(
            OrgIntegration.org_id == org_id,
            OrgIntegration.provider == provider,
        )
    )
    existing = result.scalar_one_or_none()

    # Providers where we enforce per-resource scope selection (space/project/etc.)
    # after OAuth. The integration stays pending_scope until the user picks.
    # For Slack, the scope is the notification channel the bot will post to.
    SCOPE_RESTRICTABLE = {"confluence", "jira", "azure_devops", "slack"}
    initial_status = "pending_scope" if provider in SCOPE_RESTRICTABLE else "active"

    # Slack: only ask for a notification channel if the user actually granted
    # post_notifications. If they didn't, there's nothing to post and no reason
    # to block them with the scope picker.
    if provider == "slack" and "post_notifications" not in granted_permissions:
        initial_status = "active"

    if existing:
        existing.access_token = encrypted_access
        existing.refresh_token = encrypted_refresh
        existing.token_expires_at = token_expires_at
        # Keep existing status if already active and scopes already chosen — reconnect
        # should not wipe the user's previous scope selection.
        if existing.status != "active":
            existing.status = initial_status
        existing.scopes = json.dumps(oauth_cfg["scopes"])
        existing.connected_by = user_id
        if metadata:
            existing.metadata_json = metadata
        logger.info("Updated existing integration: provider=%s org=%s", provider, org_id)
    else:
        integration = OrgIntegration(
            org_id=org_id,
            provider=provider,
            category=category,
            auth_type="oauth",
            status=initial_status,
            access_token=encrypted_access,
            refresh_token=encrypted_refresh,
            token_expires_at=token_expires_at,
            scopes=json.dumps(oauth_cfg["scopes"]),
            connected_by=user_id,
            metadata_json=metadata,
        )
        db.add(integration)
        logger.info("Created new integration: provider=%s org=%s status=%s", provider, org_id, initial_status)

    # Log audit event
    await log_audit(
        db,
        org_id=org_id,
        user_id=user_id,
        action="create" if not existing else "update",
        resource_type="integration",
        resource_id=provider,
        metadata={"provider": provider, "auth_type": "oauth"},
        ip_address=get_client_ip(request),
    )

    await db.commit()

    success_redirect = f"{settings.app_url}/settings?tab=integrations&connected={provider}"
    logger.info("OAuth flow completed: provider=%s org=%s user=%s", provider, org_id, user_id)
    return RedirectResponse(url=success_redirect)


@router.get("/api/integrations/github/callback")
async def github_app_callback(
    request: Request,
    installation_id: str = Query(...),
    setup_action: str = Query("install"),
    state: str = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Handle GitHub App installation callback.

    GitHub redirects here after a user installs/configures the app.
    We store the installation_id and fetch the accessible repos.
    """
    settings = get_settings()
    error_redirect = f"{settings.app_url}/settings?tab=integrations&error=github_install_failed"

    # Decode state to get org_id and user_id
    if not state:
        logger.warning("GitHub App callback: no state parameter")
        return RedirectResponse(url=error_redirect)

    try:
        state_payload = jwt.decode(state, settings.nextauth_secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        return RedirectResponse(url=f"{settings.app_url}/settings?tab=integrations&error=state_expired")
    except jwt.InvalidTokenError:
        return RedirectResponse(url=f"{settings.app_url}/settings?tab=integrations&error=invalid_state")

    org_id = state_payload.get("org_id")
    user_id = state_payload.get("user_id")

    if not org_id or not user_id:
        return RedirectResponse(url=error_redirect)

    if setup_action == "request":
        # User requested installation but doesn't have permission — org admin needs to approve
        logger.info("GitHub App installation requested (pending admin approval): org=%s", org_id)
        return RedirectResponse(
            url=f"{settings.app_url}/settings?tab=integrations&error=github_approval_pending"
        )

    # Fetch installation details from GitHub
    try:
        details = await get_installation_details(installation_id)
    except Exception:
        logger.exception("Failed to fetch GitHub installation details: %s", installation_id)
        return RedirectResponse(url=error_redirect)

    account_name = details.get("account", {}).get("login", "unknown")
    permissions = details.get("permissions", {})

    # Store the installation
    encrypted_installation_id = encrypt_api_key(installation_id)

    result = await db.execute(
        select(OrgIntegration).where(
            OrgIntegration.org_id == org_id,
            OrgIntegration.provider == "github",
        )
    )
    existing = result.scalar_one_or_none()

    metadata = json.dumps({
        "installation_id": installation_id,
        "account": account_name,
        "permissions": permissions,
        "setup_action": setup_action,
    })

    if existing:
        existing.access_token = encrypted_installation_id
        existing.status = "active"
        existing.metadata_json = metadata
        existing.connected_by = user_id
    else:
        integration = OrgIntegration(
            org_id=org_id,
            provider="github",
            category="version_control",
            auth_type="github_app",
            status="active",
            access_token=encrypted_installation_id,
            metadata_json=metadata,
            scopes=json.dumps(list(permissions.keys())),
            connected_by=user_id,
        )
        db.add(integration)

    await log_audit(
        db,
        org_id=org_id,
        user_id=user_id,
        action="create" if not existing else "update",
        resource_type="integration",
        resource_id="github",
        metadata={"provider": "github", "auth_type": "github_app", "account": account_name},
        ip_address=get_client_ip(request),
    )

    await db.commit()
    logger.info("GitHub App installed: installation=%s account=%s org=%s", installation_id, account_name, org_id)

    return RedirectResponse(
        url=f"{settings.app_url}/settings?tab=integrations&connected=github",
        status_code=302,
    )
