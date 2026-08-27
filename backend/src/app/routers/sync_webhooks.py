"""Inbound sync webhooks — Jira webhook + ADO service hook receivers.

Auth model: per-integration shared secret in the path (Jira) or HTTP Basic
(ADO). The secret is generated at integration-mapping setup time and stored
encrypted in ``IntegrationProjectMapping.webhook_secret_encrypted``. We accept
the request, verify the secret in constant-time, look up the ``CardExternalLink``
by ``(provider, external_id)``, apply the remote change to the local Card, and
broadcast a ``card.updated`` WS event so live viewers see the change.

Conflict detection: if the local card's ``updated_at`` is newer than the link's
``last_synced_at``, both sides have changed since we last reconciled; we mark
``sync_state="conflict"``, snapshot the remote payload into the audit log, and
do NOT overwrite the local card. The frontend banner picks it up and lets the
user choose ``Keep local`` (re-push) or ``Keep remote`` (apply remote → local).

Phase 4b-3 ships this synchronously; Phase 5 swaps in the lifespan-owned async
worker once we're queueing on Redis.
"""

from __future__ import annotations

import hmac
import logging
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..models.board import Board, BoardColumn, Card
from ..models.sync import CardExternalLink, IntegrationProjectMapping, SyncEvent
from ..services.crypto import decrypt_api_key

logger = logging.getLogger(__name__)

router = APIRouter(tags=["sync"])


async def _broadcast(card: Card, kind: str = "card.updated") -> None:
    try:
        from ..ws.board_ws import board_manager

        await board_manager.broadcast_card_event(card.column_id, kind, card)
    except Exception:  # noqa: BLE001 — best-effort
        logger.debug("Webhook WS broadcast failed for card %s", card.id)


def _verify_webhook_secret(
    mapping_secret_encrypted: str | None, supplied_token: str | None
) -> bool:
    if not mapping_secret_encrypted or not supplied_token:
        return False
    try:
        expected = decrypt_api_key(mapping_secret_encrypted)
    except Exception:  # noqa: BLE001
        return False
    return hmac.compare_digest(expected, supplied_token)


async def _resolve_link_and_card(
    provider: str, external_id: str, db: AsyncSession
) -> tuple[CardExternalLink, Card] | None:
    row = (
        await db.execute(
            select(CardExternalLink, Card)
            .join(Card, Card.id == CardExternalLink.card_id)
            .where(
                CardExternalLink.provider == provider,
                CardExternalLink.external_id == external_id,
            )
        )
    ).first()
    if not row:
        return None
    link, card = row
    return link, card


def _is_done_column_name(name: str | None) -> bool:
    return (name or "").strip().lower() == "done"


async def _apply_remote_to_local(
    *,
    link: CardExternalLink,
    card: Card,
    title: str | None,
    description: str | None,
    remote_changed_at: datetime,
    payload_for_audit: dict[str, Any],
    db: AsyncSession,
) -> str:
    """Apply remote-side changes to the local card unless we have a conflict.

    Returns one of: "synced" (applied), "conflict" (skipped), "noop" (nothing changed).
    """
    # SQLite returns naive datetimes for DateTime(timezone=True) columns; the
    # rest of the system stores tz-aware values. Normalize both sides to UTC
    # before comparing so the conflict-detection arithmetic is portable.
    def _aware(dt: datetime | None) -> datetime | None:
        if dt is None:
            return None
        return dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)

    last_synced = _aware(link.last_synced_at)
    card_updated = _aware(card.updated_at)
    remote_changed_at = _aware(remote_changed_at) or datetime.now(UTC)

    local_changed_since_last_sync = (
        last_synced is not None and card_updated is not None and card_updated > last_synced
    )

    if local_changed_since_last_sync and last_synced is not None and remote_changed_at > last_synced:
        # Both sides moved → conflict. Snapshot and bail without overwriting.
        link.sync_state = "conflict"
        link.last_remote_change_at = remote_changed_at
        link.last_error = "Both local and remote changed since last sync"
        db.add(
            SyncEvent(
                card_id=card.id,
                link_id=link.id,
                direction="in",
                action="conflict",
                status="skipped",
                payload=payload_for_audit,
            )
        )
        return "conflict"

    changed = False
    if title is not None and title != card.title:
        card.title = title
        changed = True
    if description is not None and description != (card.description or ""):
        card.description = description
        changed = True

    now = datetime.now(UTC)
    if changed:
        link.sync_state = "synced"
        link.last_remote_change_at = remote_changed_at
        link.last_synced_at = now
        link.last_error = None
        link.retry_count = 0
        db.add(
            SyncEvent(
                card_id=card.id,
                link_id=link.id,
                direction="in",
                action="update",
                status="ok",
            )
        )
        return "synced"

    # Heartbeat — record we received the event so the timeline shows activity.
    link.last_remote_change_at = remote_changed_at
    db.add(
        SyncEvent(
            card_id=card.id,
            link_id=link.id,
            direction="in",
            action="update",
            status="skipped",
        )
    )
    return "noop"


# ─── Jira ───────────────────────────────────────────────────────────────────


@router.post("/api/integrations/jira/webhook/{mapping_id}")
async def jira_webhook(
    mapping_id: str,
    request: Request,
    token: str = Query(..., description="Per-mapping shared secret"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Atlassian webhook receiver. Atlassian doesn't sign payloads, so we use a
    per-mapping path token instead. Map → integration → CardExternalLink lookup
    by (provider, external_id) finds the local card to update.
    """
    mapping = (
        await db.execute(
            select(IntegrationProjectMapping).where(IntegrationProjectMapping.id == mapping_id)
        )
    ).scalar_one_or_none()
    if not mapping:
        raise HTTPException(status_code=404, detail="Unknown mapping")

    if not _verify_webhook_secret(mapping.webhook_secret_encrypted, token):
        raise HTTPException(status_code=401, detail="Invalid webhook token")

    payload = await request.json()
    issue = payload.get("issue") or {}
    issue_id = str(issue.get("id") or "")
    if not issue_id:
        return {"accepted": True, "reason": "no issue id"}

    found = await _resolve_link_and_card("jira", issue_id, db)
    if not found:
        # Not synced from us — silently accept so Atlassian doesn't retry.
        return {"accepted": True, "reason": "no local link"}
    link, card = found

    fields = issue.get("fields") or {}
    title = str(fields["summary"]) if "summary" in fields else None

    # Description could be ADF or plain text depending on the webhook version;
    # extract a text representation if present, leave None to skip update.
    description = _adf_to_plain(fields.get("description"))

    remote_updated_raw = fields.get("updated") or payload.get("timestamp")
    remote_changed_at = _parse_iso(remote_updated_raw) or datetime.now(UTC)

    state = await _apply_remote_to_local(
        link=link,
        card=card,
        title=title,
        description=description,
        remote_changed_at=remote_changed_at,
        payload_for_audit={
            "webhook_event": payload.get("webhookEvent"),
            "issue_key": issue.get("key"),
            "summary": title,
        },
        db=db,
    )
    await db.commit()
    await _broadcast(card, "card.updated" if state == "synced" else "card.updated")
    return {"accepted": True, "state": state}


def _adf_to_plain(value: Any) -> str | None:
    """Tiny ADF→text fallback. If the value isn't a string or ADF doc, returns None."""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        out: list[str] = []

        def walk(node: Any) -> None:
            if isinstance(node, dict):
                if node.get("type") == "text":
                    out.append(str(node.get("text", "")))
                for child in node.get("content") or []:
                    walk(child)
                if node.get("type") in ("paragraph", "heading", "listItem"):
                    out.append("\n")
            elif isinstance(node, list):
                for child in node:
                    walk(child)

        walk(value)
        return "".join(out).strip() or None
    return None


def _parse_iso(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, int | float):
        # Atlassian sometimes uses epoch milliseconds.
        ts = value / 1000 if value > 1e12 else value
        return datetime.fromtimestamp(ts, tz=UTC)
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


# ─── Azure DevOps ────────────────────────────────────────────────────────────


@router.post("/api/integrations/azure-devops/webhook/{mapping_id}")
async def ado_webhook(
    mapping_id: str,
    request: Request,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """ADO service hook. ADO supports HTTP Basic auth on subscription setup so we
    use ``Basic <base64(":<token>")>`` and compare against the per-mapping secret.
    """
    mapping = (
        await db.execute(
            select(IntegrationProjectMapping).where(IntegrationProjectMapping.id == mapping_id)
        )
    ).scalar_one_or_none()
    if not mapping:
        raise HTTPException(status_code=404, detail="Unknown mapping")

    supplied = _extract_basic_token(authorization)
    if not _verify_webhook_secret(mapping.webhook_secret_encrypted, supplied):
        raise HTTPException(status_code=401, detail="Invalid webhook auth")

    payload = await request.json()
    resource = payload.get("resource") or {}
    work_item_id = str(resource.get("id") or "")
    if not work_item_id:
        return {"accepted": True, "reason": "no work item id"}

    found = await _resolve_link_and_card("azure_devops", work_item_id, db)
    if not found:
        return {"accepted": True, "reason": "no local link"}
    link, card = found

    fields = resource.get("fields") or {}
    title = str(fields["System.Title"]) if "System.Title" in fields else None
    desc_raw = fields.get("System.Description")
    description = _strip_html(desc_raw) if isinstance(desc_raw, str) else None

    remote_updated_raw = fields.get("System.ChangedDate") or payload.get("createdDate")
    remote_changed_at = _parse_iso(remote_updated_raw) or datetime.now(UTC)

    rev_value = resource.get("rev")
    if isinstance(rev_value, int | str) and str(rev_value):
        link.version_token = str(rev_value)

    state = await _apply_remote_to_local(
        link=link,
        card=card,
        title=title,
        description=description,
        remote_changed_at=remote_changed_at,
        payload_for_audit={
            "event_type": payload.get("eventType"),
            "work_item_id": work_item_id,
            "title": title,
        },
        db=db,
    )
    await db.commit()
    await _broadcast(card, "card.updated")
    return {"accepted": True, "state": state}


def _extract_basic_token(authorization: str | None) -> str | None:
    """Pull the password out of an ``Authorization: Basic <base64(":<token>")>`` header."""
    if not authorization or not authorization.lower().startswith("basic "):
        return None
    import base64

    try:
        decoded = base64.b64decode(authorization[6:].strip()).decode()
    except Exception:  # noqa: BLE001
        return None
    if ":" not in decoded:
        return None
    return decoded.split(":", 1)[1] or None


def _strip_html(html: str) -> str:
    """Tiny HTML→text fallback for ADO's HTML descriptions. Good enough for
    title/description sync; full HTML rendering lives on the local card."""
    import re

    text = re.sub(r"<br\s*/?>", "\n", html)
    text = re.sub(r"</p>", "\n\n", text)
    text = re.sub(r"</li>", "\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    return text.strip()


# Suppress unused-import warning for the BoardColumn / Board imports used
# transitively through the WS broadcast and selectinload paths.
_ = BoardColumn
_ = Board
