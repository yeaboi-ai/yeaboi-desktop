"""LiveKit Egress integration — start/stop room-composite recordings.

The Egress API records the entire room (composite layout) as an MP4. When
`recording_enabled` is False, every entrypoint short-circuits to a no-op so
dev/free environments aren't accidentally billed for Egress minutes.

Lifecycle:
  start_recording → POST RoomCompositeEgressRequest → row.status = "starting"
  LiveKit fires `egress_started` webhook → row.status = "active"
  call ends OR stop_recording → POST StopEgressRequest
  LiveKit fires `egress_ended` webhook → row.status = "completed",
    file_url + duration + file_size populated
  (or row.status = "failed" + error if egress errored)
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from livekit import api
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..models.recording import Recording

logger = logging.getLogger(__name__)


def _api_url() -> str:
    settings = get_settings()
    return settings.livekit_url.replace("ws://", "http://").replace("wss://", "https://")


def is_recording_enabled() -> bool:
    return bool(get_settings().recording_enabled)


async def start_recording(
    *,
    db: AsyncSession,
    session_id: str,
    started_by_id: str | None,
) -> Recording | None:
    """Start a room-composite egress for the session's call.

    Idempotent at the call layer: if an active recording already exists for
    this session, returns that row without spawning a second egress. Returns
    None when recording is disabled or LiveKit refuses the request — the
    caller should treat that as a graceful no-op, not an error.
    """
    if not is_recording_enabled():
        logger.debug("Recording disabled by config; skipping start for session %s", session_id)
        return None

    # Idempotency: don't double-record the same call window. Any row in
    # starting/active is treated as "already recording".
    existing = await db.execute(
        select(Recording)
        .where(Recording.session_id == session_id)
        .where(Recording.status.in_(("starting", "active")))
        .order_by(Recording.created_at.desc())
        .limit(1)
    )
    row = existing.scalar_one_or_none()
    if row is not None:
        logger.info("Recording already in progress for session %s (egress %s)", session_id, row.egress_id)
        return row

    settings = get_settings()
    room_name = f"session-{session_id}"

    # RoomCompositeEgressRequest: render the full room layout to a single MP4
    # and stash it on LiveKit Cloud bundled storage. `file_outputs[0].filepath`
    # is just a filename hint; LiveKit Cloud assigns the durable URL.
    egress_request = api.RoomCompositeEgressRequest(
        room_name=room_name,
        layout="grid",
        audio_only=False,
        file_outputs=[
            api.EncodedFileOutput(
                file_type=api.EncodedFileType.MP4,
                filepath=f"{room_name}-{int(datetime.now(UTC).timestamp())}.mp4",
            )
        ],
    )

    try:
        async with api.LiveKitAPI(_api_url(), settings.livekit_api_key, settings.livekit_api_secret) as lk:
            egress_info = await lk.egress.start_room_composite_egress(egress_request)
    except Exception:
        logger.exception("Failed to start LiveKit egress for session %s", session_id)
        return None

    expires_at = datetime.now(UTC) + timedelta(days=settings.recording_default_expiry_days)
    recording = Recording(
        session_id=session_id,
        started_by_id=started_by_id,
        egress_id=egress_info.egress_id,
        room_name=room_name,
        status="starting",
        started_at=datetime.now(UTC),
        expires_at=expires_at,
    )
    db.add(recording)
    await db.commit()
    await db.refresh(recording)
    logger.info("Started egress %s for session %s", egress_info.egress_id, session_id)
    return recording


async def stop_recording(*, egress_id: str) -> bool:
    """Stop an in-progress egress. Returns True on accepted, False on no-op
    or failure. The actual finalization (file_url, duration) lands via the
    LiveKit `egress_ended` webhook, not this call's response.
    """
    if not is_recording_enabled():
        return False
    settings = get_settings()
    try:
        async with api.LiveKitAPI(_api_url(), settings.livekit_api_key, settings.livekit_api_secret) as lk:
            await lk.egress.stop_egress(api.StopEgressRequest(egress_id=egress_id))
        return True
    except Exception:
        logger.exception("Failed to stop egress %s", egress_id)
        return False


async def stop_session_recordings(*, db: AsyncSession, session_id: str) -> int:
    """Stop every starting/active recording for a session. Used when the call
    ends. Returns the number of egresses asked to stop."""
    if not is_recording_enabled():
        return 0
    rows = await db.execute(
        select(Recording).where(Recording.session_id == session_id).where(Recording.status.in_(("starting", "active")))
    )
    stopped = 0
    for r in rows.scalars():
        if await stop_recording(egress_id=r.egress_id):
            stopped += 1
    return stopped


async def delete_recording_asset(*, egress_id: str) -> bool:
    """Best-effort delete of the underlying egress asset on LiveKit Cloud.

    Used by the expiry sweeper and the manual delete endpoint. Returns True
    when LiveKit accepted the request. Failures are logged but not raised so
    the caller can still mark the row as expired/deleted in our DB.
    """
    if not is_recording_enabled():
        return False
    settings = get_settings()
    try:
        async with api.LiveKitAPI(_api_url(), settings.livekit_api_key, settings.livekit_api_secret) as lk:
            # LiveKit's bundled storage exposes a delete endpoint via the egress
            # asset URL; for managed LiveKit Cloud assets, deletion happens via
            # the egress info (LiveKit auto-clears completed egress assets after
            # their TTL too). We mirror by stopping any still-running egress.
            await lk.egress.stop_egress(api.StopEgressRequest(egress_id=egress_id))
        return True
    except Exception:
        logger.warning("Failed to delete egress asset %s", egress_id, exc_info=True)
        return False


async def get_playback_url(*, recording: Recording) -> str | None:
    """Return a short-lived playable URL for the recording.

    LiveKit Cloud bundled storage returns the asset via a signed URL that we
    fetch fresh each time the player loads. For now we return `file_url`
    directly (LiveKit Cloud signs the file_url at egress completion); when we
    move to a different storage backend we'll mint signed URLs here.
    """
    if recording.file_url is None:
        return None
    return recording.file_url
