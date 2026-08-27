"""Credential validators for provider integrations.

Each validator makes a lightweight API call to verify that the supplied
credentials are valid before we store them.  All validators return either
{"ok": True} or {"ok": False, "error": "<human-readable message>"}.
"""

import base64
import hashlib
import hmac
import json
import logging
from datetime import UTC, datetime

import httpx

logger = logging.getLogger(__name__)

_TIMEOUT = 15.0  # seconds


# ---------------------------------------------------------------------------
# Individual validators
# ---------------------------------------------------------------------------


async def _validate_aws(credentials: dict) -> dict:
    """Validate AWS credentials via STS GetCallerIdentity (AWS Signature V4)."""
    access_key = credentials.get("access_key_id", "")
    secret_key = credentials.get("secret_access_key", "")
    region = credentials.get("region", "us-east-1") or "us-east-1"

    if not access_key or not secret_key:
        return {"ok": False, "error": "access_key_id and secret_access_key are required"}

    # Build the STS request with AWS Signature V4
    service = "sts"
    host = f"sts.{region}.amazonaws.com"
    endpoint = f"https://{host}/"
    method = "POST"
    payload = "Action=GetCallerIdentity&Version=2011-06-15"
    content_type = "application/x-www-form-urlencoded"

    now = datetime.now(tz=UTC)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")

    # Canonical request
    payload_hash = hashlib.sha256(payload.encode()).hexdigest()
    canonical_headers = f"content-type:{content_type}\nhost:{host}\nx-amz-date:{amz_date}\n"
    signed_headers = "content-type;host;x-amz-date"
    canonical_request = "\n".join([method, "/", "", canonical_headers, signed_headers, payload_hash])

    # String to sign
    credential_scope = f"{date_stamp}/{region}/{service}/aws4_request"
    string_to_sign = "\n".join(
        [
            "AWS4-HMAC-SHA256",
            amz_date,
            credential_scope,
            hashlib.sha256(canonical_request.encode()).hexdigest(),
        ]
    )

    # Signing key
    def _sign(key: bytes, msg: str) -> bytes:
        return hmac.new(key, msg.encode(), hashlib.sha256).digest()

    signing_key = _sign(
        _sign(
            _sign(
                _sign(f"AWS4{secret_key}".encode(), date_stamp),
                region,
            ),
            service,
        ),
        "aws4_request",
    )

    signature = hmac.new(signing_key, string_to_sign.encode(), hashlib.sha256).hexdigest()

    authorization = (
        f"AWS4-HMAC-SHA256 Credential={access_key}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, "
        f"Signature={signature}"
    )

    headers = {
        "Content-Type": content_type,
        "X-Amz-Date": amz_date,
        "Authorization": authorization,
    }

    session_token = credentials.get("session_token")
    if session_token:
        headers["X-Amz-Security-Token"] = session_token

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(endpoint, content=payload.encode(), headers=headers)
        if resp.status_code == 200:
            logger.info("AWS credentials validated successfully")
            return {"ok": True}
        logger.warning("AWS credential validation failed: HTTP %s", resp.status_code)
        return {"ok": False, "error": f"AWS rejected credentials (HTTP {resp.status_code})"}
    except httpx.TimeoutException:
        return {"ok": False, "error": "Request to AWS timed out"}
    except Exception as exc:
        logger.exception("Unexpected error validating AWS credentials")
        return {"ok": False, "error": str(exc)}


async def _validate_gcp(credentials: dict) -> dict:
    """Validate GCP service account key by checking required fields."""
    # credentials may be the parsed JSON dict, or a raw JSON string under "service_account_json"
    sa = credentials
    raw = credentials.get("service_account_json")
    if raw:
        try:
            sa = json.loads(raw) if isinstance(raw, str) else raw
        except json.JSONDecodeError:
            return {"ok": False, "error": "service_account_json is not valid JSON"}

    required = ("client_email", "private_key", "project_id")
    missing = [k for k in required if not sa.get(k)]
    if missing:
        return {"ok": False, "error": f"Service account key missing fields: {', '.join(missing)}"}

    logger.info("GCP service account key structure validated for project %s", sa.get("project_id"))
    return {"ok": True}


async def _validate_azure(credentials: dict) -> dict:
    """Validate Azure credentials via client-credentials token exchange + /subscriptions."""
    tenant_id = credentials.get("tenant_id", "")
    client_id = credentials.get("client_id", "")
    client_secret = credentials.get("client_secret", "")

    if not all([tenant_id, client_id, client_secret]):
        return {"ok": False, "error": "tenant_id, client_id, and client_secret are required"}

    token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    token_data = {
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
        "scope": "https://management.azure.com/.default",
    }

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            token_resp = await client.post(token_url, data=token_data)
            if token_resp.status_code != 200:
                logger.warning("Azure token exchange failed: HTTP %s", token_resp.status_code)
                return {"ok": False, "error": f"Azure token exchange failed (HTTP {token_resp.status_code})"}

            token = token_resp.json().get("access_token")
            if not token:
                return {"ok": False, "error": "Azure token response did not contain access_token"}

            subs_resp = await client.get(
                "https://management.azure.com/subscriptions?api-version=2022-12-01",
                headers={"Authorization": f"Bearer {token}"},
            )
            if subs_resp.status_code == 200:
                logger.info("Azure credentials validated successfully")
                return {"ok": True}
            logger.warning("Azure /subscriptions check failed: HTTP %s", subs_resp.status_code)
            return {"ok": False, "error": f"Azure credential check failed (HTTP {subs_resp.status_code})"}
    except httpx.TimeoutException:
        return {"ok": False, "error": "Request to Azure timed out"}
    except Exception as exc:
        logger.exception("Unexpected error validating Azure credentials")
        return {"ok": False, "error": str(exc)}


async def _validate_flyio(credentials: dict) -> dict:
    """Validate Fly.io credentials via GET /v1/apps."""
    token = credentials.get("api_token", "")
    if not token:
        return {"ok": False, "error": "api_token is required"}

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(
                "https://api.machines.dev/v1/apps",
                headers={"Authorization": f"Bearer {token}"},
            )
        if resp.status_code == 200:
            logger.info("Fly.io credentials validated successfully")
            return {"ok": True}
        logger.warning("Fly.io credential validation failed: HTTP %s", resp.status_code)
        return {"ok": False, "error": f"Fly.io rejected credentials (HTTP {resp.status_code})"}
    except httpx.TimeoutException:
        return {"ok": False, "error": "Request to Fly.io timed out"}
    except Exception as exc:
        logger.exception("Unexpected error validating Fly.io credentials")
        return {"ok": False, "error": str(exc)}


async def _validate_render(credentials: dict) -> dict:
    """Validate Render credentials via GET /v1/owners."""
    token = credentials.get("api_key", "")
    if not token:
        return {"ok": False, "error": "api_key is required"}

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(
                "https://api.render.com/v1/owners",
                headers={"Authorization": f"Bearer {token}"},
            )
        if resp.status_code == 200:
            logger.info("Render credentials validated successfully")
            return {"ok": True}
        logger.warning("Render credential validation failed: HTTP %s", resp.status_code)
        return {"ok": False, "error": f"Render rejected credentials (HTTP {resp.status_code})"}
    except httpx.TimeoutException:
        return {"ok": False, "error": "Request to Render timed out"}
    except Exception as exc:
        logger.exception("Unexpected error validating Render credentials")
        return {"ok": False, "error": str(exc)}


async def _validate_shortcut(credentials: dict) -> dict:
    """Validate Shortcut credentials via GET /api/v3/member."""
    token = credentials.get("api_token", "")
    if not token:
        return {"ok": False, "error": "api_token is required"}

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(
                "https://api.app.shortcut.com/api/v3/member",
                headers={"Shortcut-Token": token},
            )
        if resp.status_code == 200:
            logger.info("Shortcut credentials validated successfully")
            return {"ok": True}
        logger.warning("Shortcut credential validation failed: HTTP %s", resp.status_code)
        return {"ok": False, "error": f"Shortcut rejected credentials (HTTP {resp.status_code})"}
    except httpx.TimeoutException:
        return {"ok": False, "error": "Request to Shortcut timed out"}
    except Exception as exc:
        logger.exception("Unexpected error validating Shortcut credentials")
        return {"ok": False, "error": str(exc)}


async def _validate_gitbook(credentials: dict) -> dict:
    """Validate GitBook credentials via GET /v1/user."""
    token = credentials.get("api_token", "")
    if not token:
        return {"ok": False, "error": "api_token is required"}

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(
                "https://api.gitbook.com/v1/user",
                headers={"Authorization": f"Bearer {token}"},
            )
        if resp.status_code == 200:
            logger.info("GitBook credentials validated successfully")
            return {"ok": True}
        logger.warning("GitBook credential validation failed: HTTP %s", resp.status_code)
        return {"ok": False, "error": f"GitBook rejected credentials (HTTP {resp.status_code})"}
    except httpx.TimeoutException:
        return {"ok": False, "error": "Request to GitBook timed out"}
    except Exception as exc:
        logger.exception("Unexpected error validating GitBook credentials")
        return {"ok": False, "error": str(exc)}


async def _validate_slite(credentials: dict) -> dict:
    """Validate Slite credentials via GET /v1/team."""
    token = credentials.get("api_token", "")
    if not token:
        return {"ok": False, "error": "api_token is required"}

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(
                "https://api.slite.com/v1/team",
                headers={"Authorization": f"Bearer {token}"},
            )
        if resp.status_code == 200:
            logger.info("Slite credentials validated successfully")
            return {"ok": True}
        logger.warning("Slite credential validation failed: HTTP %s", resp.status_code)
        return {"ok": False, "error": f"Slite rejected credentials (HTTP {resp.status_code})"}
    except httpx.TimeoutException:
        return {"ok": False, "error": "Request to Slite timed out"}
    except Exception as exc:
        logger.exception("Unexpected error validating Slite credentials")
        return {"ok": False, "error": str(exc)}


async def _validate_datadog(credentials: dict) -> dict:
    """Validate Datadog credentials via GET /api/v1/validate."""
    api_key = credentials.get("api_key", "")
    app_key = credentials.get("app_key", "")
    site = credentials.get("site", "datadoghq.com") or "datadoghq.com"

    if not api_key or not app_key:
        return {"ok": False, "error": "api_key and app_key are required"}

    url = f"https://api.{site}/api/v1/validate"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(
                url,
                headers={
                    "DD-API-KEY": api_key,
                    "DD-APPLICATION-KEY": app_key,
                },
            )
        if resp.status_code == 200:
            logger.info("Datadog credentials validated successfully")
            return {"ok": True}
        logger.warning("Datadog credential validation failed: HTTP %s", resp.status_code)
        return {"ok": False, "error": f"Datadog rejected credentials (HTTP {resp.status_code})"}
    except httpx.TimeoutException:
        return {"ok": False, "error": "Request to Datadog timed out"}
    except Exception as exc:
        logger.exception("Unexpected error validating Datadog credentials")
        return {"ok": False, "error": str(exc)}


async def _validate_newrelic(credentials: dict) -> dict:
    """Validate New Relic credentials via GraphQL API."""
    api_key = credentials.get("api_key", "")
    if not api_key:
        return {"ok": False, "error": "api_key is required"}

    query = "{ actor { user { name } } }"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                "https://api.newrelic.com/graphql",
                headers={
                    "API-Key": api_key,
                    "Content-Type": "application/json",
                },
                json={"query": query},
            )
        if resp.status_code == 200:
            body = resp.json()
            # A valid key returns data; an invalid key returns errors
            if body.get("data", {}).get("actor") is not None:
                logger.info("New Relic credentials validated successfully")
                return {"ok": True}
            errors = body.get("errors")
            msg = errors[0].get("message", "Unknown error") if errors else "Unexpected response from New Relic"
            logger.warning("New Relic credential validation failed: %s", msg)
            return {"ok": False, "error": msg}
        logger.warning("New Relic credential validation failed: HTTP %s", resp.status_code)
        return {"ok": False, "error": f"New Relic rejected credentials (HTTP {resp.status_code})"}
    except httpx.TimeoutException:
        return {"ok": False, "error": "Request to New Relic timed out"}
    except Exception as exc:
        logger.exception("Unexpected error validating New Relic credentials")
        return {"ok": False, "error": str(exc)}


async def _validate_azure_devops(credentials: dict) -> dict:
    """Validate Azure DevOps PAT + organization by hitting the Projects API."""
    org = (credentials.get("organization") or "").strip()
    pat = (credentials.get("personal_access_token") or "").strip()
    if not org or not pat:
        return {"ok": False, "error": "organization and personal_access_token are required"}

    # ADO uses Basic auth with empty username + PAT as password
    token = base64.b64encode(f":{pat}".encode()).decode()
    url = f"https://dev.azure.com/{org}/_apis/projects?api-version=7.1&$top=1"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(url, headers={"Authorization": f"Basic {token}"})
        if resp.status_code == 200:
            return {"ok": True}
        if resp.status_code in (401, 203):
            # ADO returns 203 Non-Authoritative with a sign-in HTML page for bad PATs
            return {"ok": False, "error": "PAT rejected — check the token has Read access and hasn't expired"}
        if resp.status_code == 404:
            return {"ok": False, "error": f"Organization '{org}' not found"}
        return {"ok": False, "error": f"Azure DevOps rejected credentials (HTTP {resp.status_code})"}
    except httpx.TimeoutException:
        return {"ok": False, "error": "Request to Azure DevOps timed out"}
    except Exception as exc:
        logger.exception("Unexpected error validating Azure DevOps credentials")
        return {"ok": False, "error": str(exc)}


# ---------------------------------------------------------------------------
# Registry + public entry-point
# ---------------------------------------------------------------------------

_VALIDATORS = {
    "aws": _validate_aws,
    "gcp": _validate_gcp,
    "azure": _validate_azure,
    "azure_devops": _validate_azure_devops,
    "flyio": _validate_flyio,
    "render": _validate_render,
    "shortcut": _validate_shortcut,
    "gitbook": _validate_gitbook,
    "slite": _validate_slite,
    "datadog": _validate_datadog,
    "newrelic": _validate_newrelic,
}


async def validate_credentials(provider: str, credentials: dict) -> dict:
    """Validate credentials for a given provider.

    Returns ``{"ok": True}`` on success or ``{"ok": False, "error": "..."}`` on failure.
    Unknown providers return ``{"ok": False, "error": "Unsupported provider: <name>"}``.
    """
    validator = _VALIDATORS.get(provider)
    if validator is None:
        return {"ok": False, "error": f"Unsupported provider: {provider}"}
    return await validator(credentials)
