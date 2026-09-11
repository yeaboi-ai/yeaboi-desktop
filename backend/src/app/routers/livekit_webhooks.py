"""LiveKit webhook receiver — egress lifecycle + room events.

LiveKit signs webhook bodies with a JWT carried in the Authorization header.
We verify the token using the project's API key/secret via the SDK's
`WebhookReceiver`. Bodies are protobuf-serialized as JSON and parsed by the
SDK into a `WebhookEvent`.

Events handled:
  - egress_started  → mark recording row as "active"
  - egress_updated  → opportunistic file_url/duration updates
  - egress_ended    → finalize the row: file_url, duration, file_size,
                       status="completed" (or "failed" + error)
  - room_finished   → stop any starting/active recordings on that session
                       (covers the case where the egress outlives the room)
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from livekit.api import TokenVerifier, WebhookReceiver
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db import get_db
from ..models.recording import Recording
from ..models.session import Session
from ..services.recording import stop_session_recordings
from ..services.usage_recorder import UsageContext, record_livekit_egress

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


def _receiver() -> WebhookReceiver:
    """Build a WebhookReceiver bound to the project's LiveKit credentials."""
    settings = get_settings()
    verifier = TokenVerifier(settings.livekit_api_key, settings.livekit_api_secret)
    return WebhookReceiver(verifier)


@router.post("/livekit")
async def livekit_webhook(
    request: Request,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Single ingress for all LiveKit webhook events.

    Always returns 200 once auth passes — LiveKit retries non-2xx responses
    aggressively, and we don't want a transient DB hiccup to multiply events.
    Internal failures are logged but absorbed.
    """
    if authorization is None:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    body_bytes = await request.body()
    try:
        event = _receiver().receive(body=body_bytes.decode("utf-8"), auth_token=authorization)
    except Exception:
        logger.warning("Rejected LiveKit webhook with invalid signature")
        raise HTTPException(status_code=401, detail="Invalid webhook signature") from None

    event_type = event.event
    logger.info("LiveKit webhook: %s (id=%s)", event_type, event.id)

    try:
        if event_type in ("egress_started", "egress_updated", "egress_ended"):
            await _handle_egress_event(db, event)
        elif event_type == "room_finished":
            room_name = event.room.name if event.room else ""
            if room_name.startswith("session-"):
                session_id = room_name[len("session-") :]
                await stop_session_recordings(db=db, session_id=session_id)
    except Exception:
        logger.exception("Failed processing LiveKit webhook %s", event_type)

    return {"ok": True}


async def _handle_egress_event(db: AsyncSession, event) -> None:
    """Update the matching Recording row from an egress lifecycle event."""
    info = event.egress_info
    if info is None or not info.egress_id:
        return

    row = (await db.execute(select(Recording).where(Recording.egress_id == info.egress_id))).scalar_one_or_none()
    if row is None:
        logger.warning("Egress event for unknown egress_id=%s", info.egress_id)
        return

    # LiveKit `EgressInfo.status` enum: STARTING=0, ACTIVE=1, ENDING=2,
    # COMPLETE=3, FAILED=4, ABORTED=5, LIMIT_REACHED=6. Map to our row state.
    lk_status = info.status
    if event.event == "egress_started" or lk_status == 1:
        row.status = "active"
    elif event.event == "egress_ended" or lk_status in (3, 4, 5, 6):
        if lk_status == 3:
            row.status = "completed"
        else:
            row.status = "failed"
            row.error = info.error or f"egress_status={lk_status}"
        row.ended_at = datetime.now(UTC)
        if info.ended_at:
            # ended_at is unix nanoseconds in newer SDKs; protobuf int64
            try:
                row.ended_at = datetime.fromtimestamp(info.ended_at / 1_000_000_000, tz=UTC)
            except (TypeError, ValueError, OverflowError):
                pass
        if row.started_at and row.ended_at:
            started = row.started_at if row.started_at.tzinfo else row.started_at.replace(tzinfo=UTC)
            ended = row.ended_at if row.ended_at.tzinfo else row.ended_at.replace(tzinfo=UTC)
            row.duration_seconds = max(0, int((ended - started).total_seconds()))

    # File metadata lands on the first `file_results` entry once egress
    # uploads to LiveKit Cloud bundled storage.
    if info.file_results:
        f = info.file_results[0]
        if getattr(f, "location", ""):
            row.file_url = f.location
        if getattr(f, "size", 0):
            row.file_size_bytes = int(f.size)
        if getattr(f, "duration", 0):
            row.duration_seconds = max(row.duration_seconds or 0, int(f.duration / 1_000_000_000))

    # Append a usage_event for completed egress so cost dashboards know about
    # the LiveKit minutes this recording consumed. Only on the terminal
    # transition; updated/started events would double-count.
    if row.status == "completed" and row.duration_seconds:
        try:
            session_row = (
                await db.execute(select(Session).where(Session.id == row.session_id))
            ).scalar_one_or_none()
            if session_row is not None:
                ctx = UsageContext(
                    org_id=session_row.org_id,
                    session_id=session_row.id,
                )
                await record_livekit_egress(
                    db,
                    ctx,
                    seconds=row.duration_seconds,
                    metadata={"egress_id": info.egress_id, "recording_id": row.id},
                )
        except Exception:
            # Recording write must succeed even if cost accounting hiccups.
            logger.exception("Failed to record LiveKit egress usage for recording %s", row.id)

    await db.commit()
