"""Slack delivery — posts a summary message and uploads the rendered report.

Uses the `chat.postMessage` + `files.upload_v2` flow so the file shows up as
a real Slack file (searchable + shareable) rather than a pasted blob in the
message body.

The bot token is per-org and lives in `OrgIntegration` (provider='slack',
status='active') after the user completes the Slack OAuth flow. Callers pass
in the resolved token; this module never touches the DB or settings."""

from __future__ import annotations

import logging

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from ...connectors.slack_notifier import _load_slack_token
from ..model import RenderedReport, Report

logger = logging.getLogger(__name__)


async def resolve_slack_token(db: AsyncSession, org_id: str) -> str | None:
    """Look up the org's installed Slack bot token. Returns None if the org
    hasn't connected Slack yet. Thin pass-through over the existing
    connectors.slack_notifier helper so we share the same encryption /
    `OrgIntegration` lookup as every other Slack call site."""
    return await _load_slack_token(db, org_id)


async def has_slack_integration(db: AsyncSession, org_id: str) -> bool:
    return bool(await resolve_slack_token(db, org_id))


def _summary_blocks(report: Report) -> list[dict]:
    """Build a small Slack Block Kit message that previews the report
    headline numbers above the file attachment."""
    estimated_note = (
        f" · {round(report.summary['estimated_share_pct'])}% estimated" if report.is_partially_estimated else ""
    )
    return [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": f"Analytics — {report.scope.label}", "emoji": True},
        },
        {
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*Range*\n{report.range.label()}"},
                {"type": "mrkdwn", "text": f"*Total spend*\n${float(report.total_cost_usd):,.2f}{estimated_note}"},
                {"type": "mrkdwn", "text": f"*Sessions*\n{report.summary['total_sessions']}"},
                {"type": "mrkdwn", "text": f"*Providers*\n{report.summary['providers']}"},
            ],
        },
    ]


def deliver_slack(
    *,
    report: Report,
    rendered: RenderedReport,
    channel: str,
    bot_token: str,
) -> dict:
    """Post a summary + upload the file to *channel*. The caller is
    responsible for resolving `bot_token` from the target org's
    `OrgIntegration` record (use `resolve_slack_token`).

    Returns a status dict so the caller can include it in the run audit log
    — this function never raises."""
    if not bot_token:
        return {"delivered": False, "error": "Slack not connected for this org"}
    if not channel:
        return {"delivered": False, "error": "channel is required"}
    token = bot_token

    try:
        with httpx.Client(timeout=15) as client:
            # 1. Post the summary message so it shows in conversation order.
            msg_resp = client.post(
                "https://slack.com/api/chat.postMessage",
                headers={"Authorization": f"Bearer {token}"},
                json={"channel": channel, "blocks": _summary_blocks(report)},
            )
            msg_data = msg_resp.json()
            if not msg_data.get("ok"):
                return {"delivered": False, "error": f"chat.postMessage failed: {msg_data.get('error')}"}

            # 2. Upload the rendered report file. files.upload_v2 has a
            #    two-step "get URL → PUT bytes → complete" flow.
            up_resp = client.post(
                "https://slack.com/api/files.getUploadURLExternal",
                headers={"Authorization": f"Bearer {token}"},
                data={"filename": rendered.filename, "length": str(len(rendered.content))},
            )
            up_data = up_resp.json()
            if not up_data.get("ok"):
                return {
                    "delivered": True,  # message landed
                    "file_uploaded": False,
                    "error": f"files.getUploadURLExternal failed: {up_data.get('error')}",
                }
            client.post(
                up_data["upload_url"],
                content=rendered.content,
                headers={"Content-Type": rendered.mimetype},
            )
            complete = client.post(
                "https://slack.com/api/files.completeUploadExternal",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "files": [{"id": up_data["file_id"], "title": rendered.filename}],
                    "channel_id": channel,
                },
            )
            complete_data = complete.json()
            return {
                "delivered": True,
                "file_uploaded": bool(complete_data.get("ok")),
                "error": None if complete_data.get("ok") else complete_data.get("error"),
            }
    except Exception as exc:
        logger.exception("Slack report delivery failed")
        return {"delivered": False, "error": str(exc)}
