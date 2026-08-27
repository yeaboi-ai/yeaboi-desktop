"""Slack interactive endpoints — slash commands, Events API, and interactivity.

All three endpoints are gated behind the ``slack_interactive_enabled`` feature
flag and verify the Slack request signature before dispatching.
"""

from __future__ import annotations

import json
import logging
import urllib.parse

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

from ..config import get_settings
from ..services import slack_actions, slack_command_handler, slack_event_handler
from ..services.slack_signature import verify_slack_request

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/integrations/slack", tags=["slack-interactive"])


def _require_flag() -> None:
    """Raise 404 when the slack_interactive feature flag is off."""
    if not get_settings().slack_interactive_enabled:
        raise HTTPException(status_code=404, detail="Not found")


async def _verified_body(request: Request) -> bytes:
    """Read the request body and verify the Slack signature.  Raises 401 on failure."""
    settings = get_settings()
    ts = request.headers.get("X-Slack-Request-Timestamp", "")
    sig = request.headers.get("X-Slack-Signature", "")
    body = await request.body()
    if not verify_slack_request(settings.slack_signing_secret, ts, sig, body):
        raise HTTPException(status_code=401, detail="Invalid Slack signature")
    return body


@router.post("/commands")
async def slack_commands(
    request: Request,
    background_tasks: BackgroundTasks,
) -> dict:
    """Handle Slack slash commands."""
    _require_flag()
    body = await _verified_body(request)

    # Slack sends slash commands as application/x-www-form-urlencoded
    fields = dict(urllib.parse.parse_qsl(body.decode()))

    from ..db import get_db as _get_db  # local import to allow dependency injection in tests

    async for db in _get_db():
        return await slack_command_handler.handle(db, fields, background_tasks)

    return {}  # unreachable — satisfies type checker


@router.post("/events")
async def slack_events(
    request: Request,
    background_tasks: BackgroundTasks,
) -> dict:
    """Handle Slack Events API payloads.

    Handles ``url_verification`` challenge inline; routes ``event_callback``
    to the event handler service.
    """
    _require_flag()
    body = await _verified_body(request)

    payload = json.loads(body)

    # URL verification handshake — Slack sends this once when the endpoint is
    # first registered.  Respond immediately with the challenge value.
    if payload.get("type") == "url_verification":
        return {"challenge": payload.get("challenge", "")}

    if payload.get("type") == "event_callback":
        from ..db import get_db as _get_db

        async for db in _get_db():
            return await slack_event_handler.handle(db, payload, background_tasks)

    # Unknown event type — acknowledge with ok
    return {"ok": True}


@router.post("/interactivity")
async def slack_interactivity(
    request: Request,
    background_tasks: BackgroundTasks,
) -> dict:
    """Handle Slack interactive component payloads (block actions, shortcuts, modals)."""
    _require_flag()
    body = await _verified_body(request)

    # Slack sends interactivity as application/x-www-form-urlencoded with a
    # single ``payload`` field containing JSON.
    fields = dict(urllib.parse.parse_qsl(body.decode()))
    raw_payload = fields.get("payload", "{}")
    payload = json.loads(raw_payload)

    from ..db import get_db as _get_db

    async for db in _get_db():
        await slack_actions.handle(db, payload, background_tasks)
        return {}

    return {}
