"""Low-level Slack posting primitives.

Higher-level routing (which channels get which events) lives in
``services/slack_dispatcher.py``. This module is intentionally tiny and has no
routing logic of its own.
"""

from __future__ import annotations

import json
import logging

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...models.integration import OrgIntegration
from ..crypto import decrypt_api_key

logger = logging.getLogger(__name__)

SLACK_API = "https://slack.com/api"
_TIMEOUT = 10.0


async def _load_slack_token(db: AsyncSession, org_id: str) -> str | None:
    """Return the decrypted bot token for the org's active Slack integration, or None."""
    result = await db.execute(
        select(OrgIntegration).where(
            OrgIntegration.org_id == org_id,
            OrgIntegration.provider == "slack",
            OrgIntegration.status == "active",
        )
    )
    integration = result.scalar_one_or_none()
    if integration is None or not integration.access_token:
        return None
    return decrypt_api_key(integration.access_token)


async def _post_to_channel(
    token: str,
    channel_id: str,
    text: str,
    blocks: list | None,
    thread_ts: str | None = None,
) -> str | None:
    """Post a message to a Slack channel. Returns the message ``ts`` on success
    so callers can update/delete it later (e.g. removing a dead session link).
    Returns ``None`` on failure. Never raises. Existing truthy-checking callers
    keep working because ``None`` is falsy and the returned ``ts`` string is truthy.
    """
    payload: dict = {"channel": channel_id, "text": text}
    if blocks:
        payload["blocks"] = blocks
    if thread_ts:
        payload["thread_ts"] = thread_ts
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                f"{SLACK_API}/chat.postMessage",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json; charset=utf-8",
                },
                json=payload,
            )
            if resp.status_code != 200:
                logger.warning(
                    "Slack postMessage HTTP %s for channel %s: %s",
                    resp.status_code, channel_id, resp.text[:200],
                )
                return None
            data = resp.json()
            if not data.get("ok"):
                logger.warning(
                    "Slack postMessage error for channel %s: %s | metadata=%s",
                    channel_id,
                    data.get("error"),
                    data.get("response_metadata"),
                )
                return None
            return data.get("ts")
    except Exception:
        logger.exception("Slack postMessage failed for channel %s", channel_id)
        return None


async def _set_thinking_status(
    token: str,
    channel_id: str,
    thread_ts: str,
    status: str = "is thinking...",
) -> None:
    """Set an `is thinking...` status under the message composer.

    Uses Slack's assistant.threads.setStatus — auto-clears when the app posts
    a reply in the thread. Channel-based apps can now call this with just
    ``chat:write`` scope (March 2026 change). Failures are non-critical and
    logged at debug level.
    """
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                f"{SLACK_API}/assistant.threads.setStatus",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json; charset=utf-8",
                },
                json={
                    "channel_id": channel_id,
                    "thread_ts": thread_ts,
                    "status": status,
                },
            )
            if resp.status_code != 200 or not resp.json().get("ok"):
                logger.debug(
                    "assistant.threads.setStatus non-ok: %s",
                    resp.text[:200],
                )
    except Exception:
        logger.debug("assistant.threads.setStatus failed", exc_info=True)


async def load_admin_team_id(db: AsyncSession, org_id: str) -> str | None:
    """Return the admin team id persisted on the Slack integration metadata, or None."""
    result = await db.execute(
        select(OrgIntegration).where(
            OrgIntegration.org_id == org_id,
            OrgIntegration.provider == "slack",
            OrgIntegration.status == "active",
        )
    )
    integration = result.scalar_one_or_none()
    if integration is None or not integration.metadata_json:
        return None
    try:
        meta = json.loads(integration.metadata_json)
    except json.JSONDecodeError:
        return None
    value = meta.get("admin_team_id")
    return str(value) if value else None


def build_scan_blocks(event: str, provider_label: str, title: str, body: str | None) -> list:
    """Legacy Block Kit helper kept for scan notifications (used by slack_templates fallback)."""
    icon = {
        "scan_started": ":mag:",
        "scan_complete": ":white_check_mark:",
        "scan_partial": ":warning:",
        "scan_failed": ":x:",
    }.get(event, ":bell:")
    blocks: list = [
        {"type": "section", "text": {"type": "mrkdwn", "text": f"{icon} *{title}*"}},
    ]
    if body:
        blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": body[:2500]}})
    blocks.append(
        {
            "type": "context",
            "elements": [{"type": "mrkdwn", "text": f"_yeaboi · {provider_label} scan_"}],
        }
    )
    return blocks
