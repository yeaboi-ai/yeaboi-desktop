"""Jira Cloud writer — minimal create + update for outbound card push.

Reuses the OAuth access token already stored on ``OrgIntegration.access_token``
by the read-only scan connector. Resolves the Atlassian cloud-site id once per
call (cached on the integration metadata so we don't hit the resources endpoint
on every push).

The writer is the only place httpx is invoked; ``translator.py`` is the pure
field-translation layer. Every error becomes a structured ``JiraSyncError`` so
the route can map it to a user-facing 4xx/5xx status with the original Jira
message preserved (minus the OAuth token, which the secret_filter takes care of
in logs).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import httpx

logger = logging.getLogger(__name__)

ATLASSIAN_API = "https://api.atlassian.com"


@dataclass
class JiraSyncError(Exception):
    """Surfaced to the route as a 4xx/5xx with the Jira message preserved."""

    status_code: int
    message: str

    def __str__(self) -> str:  # pragma: no cover — trivial
        return f"Jira {self.status_code}: {self.message}"


@dataclass
class JiraCreateResult:
    issue_id: str
    issue_key: str
    self_url: str  # the API self-link
    browse_url: str  # the human-facing url, e.g. https://<site>.atlassian.net/browse/PROJ-42


class JiraWriter:
    """Lightweight wrapper around the bits of the Jira REST API we need.

    Holds the access token in memory for the duration of a request — never
    cache the JiraWriter across requests because tokens rotate and get
    re-encrypted on every connect/refresh.
    """

    def __init__(self, access_token: str, *, timeout: float = 30.0):
        self._token = access_token
        self._timeout = timeout
        self._cloud_id: str | None = None
        self._cloud_url: str | None = None  # https://<site>.atlassian.net

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    async def resolve_cloud(self, client: httpx.AsyncClient) -> tuple[str, str]:
        """Return (cloud_id, browse_base_url). Cached on the writer instance."""
        if self._cloud_id and self._cloud_url:
            return self._cloud_id, self._cloud_url
        resp = await client.get(
            f"{ATLASSIAN_API}/oauth/token/accessible-resources", headers=self._headers()
        )
        if resp.status_code != 200:
            raise JiraSyncError(resp.status_code, "Could not list accessible Jira resources")
        resources = resp.json()
        if not isinstance(resources, list) or not resources:
            raise JiraSyncError(404, "No accessible Jira sites for this token")
        self._cloud_id = resources[0]["id"]
        self._cloud_url = resources[0].get("url", "")
        return self._cloud_id, self._cloud_url

    async def create_issue(self, payload: dict[str, Any]) -> JiraCreateResult:
        """POST /rest/api/3/issue. Returns the created (id, key, self, browse_url)."""
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            cloud_id, browse_base = await self.resolve_cloud(client)
            url = f"{ATLASSIAN_API}/ex/jira/{cloud_id}/rest/api/3/issue"
            resp = await client.post(url, headers=self._headers(), json=payload)
            if resp.status_code >= 400:
                raise JiraSyncError(resp.status_code, _extract_error(resp))
            body = resp.json()
            return JiraCreateResult(
                issue_id=str(body.get("id", "")),
                issue_key=str(body.get("key", "")),
                self_url=str(body.get("self", "")),
                browse_url=f"{browse_base}/browse/{body.get('key', '')}",
            )

    async def update_issue(self, issue_id: str, payload: dict[str, Any]) -> None:
        """PUT /rest/api/3/issue/{id} — Jira returns 204 on success."""
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            cloud_id, _ = await self.resolve_cloud(client)
            url = f"{ATLASSIAN_API}/ex/jira/{cloud_id}/rest/api/3/issue/{issue_id}"
            resp = await client.put(url, headers=self._headers(), json=payload)
            if resp.status_code >= 400:
                raise JiraSyncError(resp.status_code, _extract_error(resp))


def _extract_error(resp: httpx.Response) -> str:
    """Pluck the human-readable error message Jira returns; fall back to body."""
    try:
        data = resp.json()
        if isinstance(data, dict):
            msgs = data.get("errorMessages") or []
            errs = data.get("errors") or {}
            if msgs:
                return "; ".join(str(m) for m in msgs)
            if errs:
                return "; ".join(f"{k}: {v}" for k, v in errs.items())
    except Exception:  # noqa: BLE001 — we want the raw body if JSON parse fails
        pass
    return resp.text[:300] if resp.text else "Unknown error"
