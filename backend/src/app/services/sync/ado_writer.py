"""Azure DevOps writer — minimal create + update for outbound work-item push.

Reuses the same auth pattern as the read-only ``azure_devops_scan`` connector:
PAT (HTTP Basic) when ``auth_type=credential`` with `{organization, personal_access_token}`
in `credentials`, or Microsoft Entra OAuth bearer when `auth_type=oauth` with the
organization slug pinned in `metadata_json`.

Work items are created via ``POST /{org}/{project}/_apis/wit/workitems/$<type>``
with a JSON-Patch body. Updates use ``PATCH _apis/wit/workitems/{id}`` with the
same body. ADO uses ``System.Rev`` for optimistic concurrency — we capture it on
create so the bidirectional flow can detect remote-side changes.
"""

from __future__ import annotations

import base64
import json
import logging
from dataclasses import dataclass
from typing import Any

import httpx

from ...models.integration import OrgIntegration
from ..crypto import decrypt_api_key

logger = logging.getLogger(__name__)

_API_VERSION = "api-version=7.1"


@dataclass
class AdoSyncError(Exception):
    """Surfaced to the route as a 4xx/5xx with the ADO message preserved."""

    status_code: int
    message: str

    def __str__(self) -> str:  # pragma: no cover
        return f"ADO {self.status_code}: {self.message}"


@dataclass
class AdoCreateResult:
    work_item_id: str
    rev: int  # System.Rev — used for optimistic concurrency on subsequent updates
    web_url: str  # human-facing URL
    self_url: str  # API self-link


def _auth_for_integration(integration: OrgIntegration) -> tuple[str, str]:
    """Return (Authorization header value, org slug). Raises if integration is misconfigured."""
    if integration.auth_type == "credential" and integration.credentials:
        try:
            creds = json.loads(decrypt_api_key(integration.credentials))
        except json.JSONDecodeError as exc:
            raise AdoSyncError(400, f"ADO credentials are not valid JSON: {exc}") from exc
        org = (creds.get("organization") or "").strip()
        pat = (creds.get("personal_access_token") or "").strip()
        if not org or not pat:
            raise AdoSyncError(400, "ADO credentials missing organization or PAT")
        token = base64.b64encode(f":{pat}".encode()).decode()
        return f"Basic {token}", org

    if integration.auth_type == "oauth" and integration.access_token:
        token = decrypt_api_key(integration.access_token)
        org = ""
        if integration.metadata_json:
            try:
                meta = json.loads(integration.metadata_json)
                org = (meta.get("organization") or "").strip()
            except json.JSONDecodeError:
                pass
        if not org:
            raise AdoSyncError(400, "ADO OAuth integration is missing organization metadata")
        return f"Bearer {token}", org

    raise AdoSyncError(400, "ADO integration has no usable credentials")


def _extract_error(resp: httpx.Response) -> str:
    try:
        data = resp.json()
        if isinstance(data, dict):
            return str(data.get("message") or data.get("typeKey") or resp.text[:300])
    except Exception:  # noqa: BLE001
        pass
    return resp.text[:300] if resp.text else "Unknown error"


class AdoWriter:
    def __init__(self, integration: OrgIntegration, *, timeout: float = 30.0):
        auth_header, org = _auth_for_integration(integration)
        self._auth_header = auth_header
        self._org = org
        self._timeout = timeout

    def _headers(self, *, json_patch: bool = False) -> dict[str, str]:
        ct = "application/json-patch+json" if json_patch else "application/json"
        return {
            "Authorization": self._auth_header,
            "Accept": "application/json",
            "Content-Type": ct,
        }

    def _base(self, project: str) -> str:
        return f"https://dev.azure.com/{self._org}/{project}/_apis/wit"

    def _web_url(self, project: str, work_item_id: str) -> str:
        return f"https://dev.azure.com/{self._org}/{project}/_workitems/edit/{work_item_id}"

    async def create_work_item(
        self, project: str, work_item_type: str, patch_doc: list[dict[str, Any]]
    ) -> AdoCreateResult:
        from urllib.parse import quote

        encoded_type = quote(work_item_type, safe="")
        url = f"{self._base(project)}/workitems/${encoded_type}?{_API_VERSION}"
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(url, headers=self._headers(json_patch=True), json=patch_doc)
            if resp.status_code >= 400:
                raise AdoSyncError(resp.status_code, _extract_error(resp))
            body = resp.json()
            wid = str(body.get("id", ""))
            rev = int(body.get("rev", 0))
            self_url = str((body.get("_links") or {}).get("self", {}).get("href") or body.get("url", ""))
            return AdoCreateResult(
                work_item_id=wid,
                rev=rev,
                web_url=self._web_url(project, wid),
                self_url=self_url,
            )

    async def update_work_item(
        self, work_item_id: str, patch_doc: list[dict[str, Any]]
    ) -> int:
        """PATCH the work item; returns the new System.Rev."""
        url = (
            f"https://dev.azure.com/{self._org}/_apis/wit/workitems/{work_item_id}?{_API_VERSION}"
        )
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.patch(url, headers=self._headers(json_patch=True), json=patch_doc)
            if resp.status_code >= 400:
                raise AdoSyncError(resp.status_code, _extract_error(resp))
            body = resp.json()
            return int(body.get("rev", 0))
