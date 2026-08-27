"""Per-provider scope discovery — fetches the list of resources
(spaces, projects, etc.) the connected integration can access so the user
can choose which ones Planr is allowed to scan.
"""

from __future__ import annotations

import json
import logging

import httpx

from ..models.integration import OrgIntegration
from .crypto import decrypt_api_key

logger = logging.getLogger(__name__)

_ATLASSIAN_API = "https://api.atlassian.com"
_TIMEOUT = 15.0


async def _atlassian_cloud_id(client: httpx.AsyncClient, headers: dict) -> str | None:
    """Resolve the Atlassian cloud site ID for the current token."""
    resp = await client.get(f"{_ATLASSIAN_API}/oauth/token/accessible-resources", headers=headers)
    if resp.status_code != 200:
        logger.warning("accessible-resources failed: %s", resp.status_code)
        return None
    resources = resp.json()
    if not isinstance(resources, list) or not resources:
        return None
    return resources[0].get("id")


async def _confluence_spaces(integration: OrgIntegration) -> list[dict]:
    """Return the list of Confluence spaces visible to the token."""
    if not integration.access_token:
        return []
    token = decrypt_api_key(integration.access_token)
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        cloud_id = await _atlassian_cloud_id(client, headers)
        if not cloud_id:
            return []
        resp = await client.get(
            f"{_ATLASSIAN_API}/ex/confluence/{cloud_id}/wiki/api/v2/spaces?limit=250",
            headers=headers,
        )
        if resp.status_code != 200:
            logger.warning("Confluence spaces list failed: %s", resp.status_code)
            return []
        results = resp.json().get("results", [])
        return [
            {
                "id": str(space.get("id")),
                "name": space.get("name"),
                "key": space.get("key"),
                "type": space.get("type"),
            }
            for space in results
        ]


async def _ado_projects(integration: OrgIntegration) -> list[dict]:
    """Return the list of Azure DevOps projects visible to the integration.

    Supports both OAuth access tokens (Bearer) and PAT credentials (Basic).
    """
    import base64 as _b64

    org = ""
    auth_header = ""

    if integration.auth_type == "credential" and integration.credentials:
        try:
            creds = json.loads(decrypt_api_key(integration.credentials))
        except Exception:
            logger.exception("ADO creds decrypt/parse failed")
            return []
        org = (creds.get("organization") or "").strip()
        pat = (creds.get("personal_access_token") or "").strip()
        if not org or not pat:
            return []
        auth_header = "Basic " + _b64.b64encode(f":{pat}".encode()).decode()
    elif integration.auth_type == "oauth" and integration.access_token:
        token = decrypt_api_key(integration.access_token)
        if integration.metadata_json:
            try:
                meta = json.loads(integration.metadata_json)
                org = (meta.get("organization") or "").strip()
            except Exception:
                pass
        if not org:
            return []
        auth_header = f"Bearer {token}"
    else:
        return []

    url = f"https://dev.azure.com/{org}/_apis/projects?api-version=7.1"
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(url, headers={"Authorization": auth_header, "Accept": "application/json"})
        if resp.status_code != 200:
            logger.warning("ADO project list failed: %s", resp.status_code)
            return []
        return [
            {
                "id": str(p.get("id")),
                "key": p.get("name"),
                "name": p.get("name"),
            }
            for p in resp.json().get("value", [])
        ]


async def _jira_projects(integration: OrgIntegration) -> list[dict]:
    """Return the list of Jira projects visible to the token."""
    if not integration.access_token:
        return []
    token = decrypt_api_key(integration.access_token)
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        cloud_id = await _atlassian_cloud_id(client, headers)
        if not cloud_id:
            return []
        resp = await client.get(
            f"{_ATLASSIAN_API}/ex/jira/{cloud_id}/rest/api/3/project/search?maxResults=250",
            headers=headers,
        )
        if resp.status_code != 200:
            logger.warning("Jira project list failed: %s", resp.status_code)
            return []
        return [
            {
                "id": str(p.get("id")),
                "key": p.get("key"),
                "name": p.get("name"),
            }
            for p in resp.json().get("values", [])
        ]


async def _slack_channels(integration: OrgIntegration) -> list[dict]:
    """Return channels the Slack bot can interact with.

    Includes public channels (bot has ``chat:write.public`` so it can post even
    without joining) and private channels the bot has been invited to. Each
    entry carries an ``is_member`` flag so the frontend can split the list into
    "channels we can read from" vs. "channels we can post to".
    """
    if not integration.access_token:
        return []
    token = decrypt_api_key(integration.access_token)
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

    channels: list[dict] = []
    cursor = ""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        for _ in range(5):  # cap pagination
            resp = await client.get(
                "https://slack.com/api/conversations.list",
                headers=headers,
                params={
                    "types": "public_channel,private_channel",
                    "exclude_archived": "true",
                    "limit": 200,
                    "cursor": cursor,
                },
            )
            if resp.status_code != 200:
                logger.warning("Slack conversations.list HTTP %s", resp.status_code)
                break
            data = resp.json()
            if not data.get("ok"):
                logger.warning("Slack conversations.list error: %s", data.get("error"))
                break
            for ch in data.get("channels", []) or []:
                cid = ch.get("id")
                if not cid:
                    continue
                is_private = bool(ch.get("is_private"))
                is_member = bool(ch.get("is_member"))
                channels.append(
                    {
                        "id": cid,
                        "key": ch.get("name"),
                        "name": f"#{ch.get('name')}" + (" (private)" if is_private else ""),
                        "is_member": is_member,
                        "is_private": is_private,
                    }
                )
            cursor = (data.get("response_metadata") or {}).get("next_cursor", "") or ""
            if not cursor:
                break
    return channels


async def get_available_scopes(integration: OrgIntegration) -> list[dict]:
    """Fetch the list of selectable resources for an integration.

    Each item has ``id`` (str, stable identifier used in metadata.included_scopes),
    plus human-readable fields for the UI. Returns an empty list if the provider
    doesn't support scope restriction or the fetch fails.
    """
    if integration.provider == "confluence":
        return await _confluence_spaces(integration)
    if integration.provider == "jira":
        return await _jira_projects(integration)
    if integration.provider == "azure_devops":
        return await _ado_projects(integration)
    if integration.provider == "slack":
        return await _slack_channels(integration)
    return []
