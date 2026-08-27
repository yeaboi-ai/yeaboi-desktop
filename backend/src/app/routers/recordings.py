"""Recording REST endpoints — list, fetch, share, set expiry, delete.

Recordings are created by `services.recording.start_recording` (called from
the livekit-token mint path) and finalized by the LiveKit webhook receiver.
This router only exposes read/manage operations to the frontend.

Auth model:
  - List + fetch + playback URL: any session participant
  - Patch expiry / generate share token / revoke share / delete:
        host or co_host only
  - Public token route: anonymous (token IS the auth), expiry-respecting
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from secrets import token_urlsafe

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db import get_db
from ..deps import get_current_user
from ..models.recording import Recording
from ..models.session import Session
from ..models.user import User
from ..services.recording import delete_recording_asset, get_playback_url

logger = logging.getLogger(__name__)

router = APIRouter(tags=["recordings"])


# ── helpers ──────────────────────────────────────────────────────────────


async def _load_session_with_participants(db: AsyncSession, session_id: str) -> Session:
    result = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.participants))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


def _ensure_participant(session: Session, user: User) -> None:
    if not any(p.user_id == user.id for p in session.participants):
        raise HTTPException(status_code=403, detail="Not a participant")


def _ensure_host_or_cohost(session: Session, user: User) -> None:
    role = next((p.role for p in session.participants if p.user_id == user.id), None)
    if role not in ("host", "co_host"):
        raise HTTPException(status_code=403, detail="Host or co-host required")


def _is_expired(rec: Recording) -> bool:
    if rec.expires_at is None:
        return False
    # SQLite (test) drops tz info; pg keeps it. Normalise both to UTC-aware.
    expires = rec.expires_at if rec.expires_at.tzinfo else rec.expires_at.replace(tzinfo=UTC)
    return expires <= datetime.now(UTC)


def _serialize(rec: Recording, *, include_playback: bool = False, playback_url: str | None = None) -> dict:
    body: dict = {
        "id": rec.id,
        "session_id": rec.session_id,
        "status": rec.status,
        "duration_seconds": rec.duration_seconds,
        "file_size_bytes": rec.file_size_bytes,
        "started_at": rec.started_at.isoformat() if rec.started_at else None,
        "ended_at": rec.ended_at.isoformat() if rec.ended_at else None,
        "expires_at": rec.expires_at.isoformat() if rec.expires_at else None,
        "created_at": rec.created_at.isoformat() if rec.created_at else None,
        "share_token": rec.share_token,
        "share_url": f"/recording/{rec.share_token}" if rec.share_token else None,
        "error": rec.error,
    }
    if include_playback:
        body["playback_url"] = playback_url
    return body


# ── endpoints ────────────────────────────────────────────────────────────


@router.get("/api/sessions/{session_id}/recordings")
async def list_session_recordings(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    session = await _load_session_with_participants(db, session_id)
    _ensure_participant(session, user)

    rows = await db.execute(
        select(Recording).where(Recording.session_id == session_id).order_by(Recording.created_at.desc())
    )
    return [_serialize(r) for r in rows.scalars().all()]


@router.get("/api/recordings/{recording_id}")
async def get_recording(
    recording_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    rec = (await db.execute(select(Recording).where(Recording.id == recording_id))).scalar_one_or_none()
    if not rec:
        raise HTTPException(status_code=404, detail="Recording not found")
    if _is_expired(rec):
        raise HTTPException(status_code=410, detail="Recording has expired")

    session = await _load_session_with_participants(db, rec.session_id)
    _ensure_participant(session, user)

    playback = await get_playback_url(recording=rec) if rec.status == "completed" else None
    return _serialize(rec, include_playback=True, playback_url=playback)


class PatchRecordingBody(BaseModel):
    expires_at: datetime | None = None


@router.patch("/api/recordings/{recording_id}")
async def patch_recording(
    recording_id: str,
    body: PatchRecordingBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    rec = (await db.execute(select(Recording).where(Recording.id == recording_id))).scalar_one_or_none()
    if not rec:
        raise HTTPException(status_code=404, detail="Recording not found")
    session = await _load_session_with_participants(db, rec.session_id)
    _ensure_host_or_cohost(session, user)

    if body.expires_at is not None:
        target = body.expires_at if body.expires_at.tzinfo else body.expires_at.replace(tzinfo=UTC)
        if target <= datetime.now(UTC):
            raise HTTPException(status_code=422, detail="expires_at must be in the future")
        rec.expires_at = target

    await db.commit()
    await db.refresh(rec)
    return _serialize(rec)


@router.post("/api/recordings/{recording_id}/share", status_code=201)
async def create_share_token(
    recording_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    rec = (await db.execute(select(Recording).where(Recording.id == recording_id))).scalar_one_or_none()
    if not rec:
        raise HTTPException(status_code=404, detail="Recording not found")
    session = await _load_session_with_participants(db, rec.session_id)
    _ensure_host_or_cohost(session, user)

    if not rec.share_token:
        rec.share_token = token_urlsafe(16)[:24]
        await db.commit()
        await db.refresh(rec)
    return {"share_token": rec.share_token, "share_url": f"/recording/{rec.share_token}"}


@router.delete("/api/recordings/{recording_id}/share", status_code=204)
async def revoke_share_token(
    recording_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    rec = (await db.execute(select(Recording).where(Recording.id == recording_id))).scalar_one_or_none()
    if not rec:
        raise HTTPException(status_code=404, detail="Recording not found")
    session = await _load_session_with_participants(db, rec.session_id)
    _ensure_host_or_cohost(session, user)

    rec.share_token = None
    await db.commit()


@router.delete("/api/recordings/{recording_id}", status_code=204)
async def delete_recording(
    recording_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    rec = (await db.execute(select(Recording).where(Recording.id == recording_id))).scalar_one_or_none()
    if not rec:
        raise HTTPException(status_code=404, detail="Recording not found")
    session = await _load_session_with_participants(db, rec.session_id)
    _ensure_host_or_cohost(session, user)

    # Best-effort: delete the underlying egress asset; never block the row
    # delete on storage failure (the sweeper will retry orphans).
    await delete_recording_asset(egress_id=rec.egress_id)
    await db.delete(rec)
    await db.commit()


@router.get("/api/recordings/public/{share_token}")
async def get_recording_by_share_token(
    share_token: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Anonymous read by share token. Mirrors the clip pattern."""
    rec = (await db.execute(select(Recording).where(Recording.share_token == share_token))).scalar_one_or_none()
    if not rec:
        raise HTTPException(status_code=404, detail="Recording not found")
    if _is_expired(rec):
        raise HTTPException(status_code=410, detail="Recording has expired")
    if rec.status != "completed":
        raise HTTPException(status_code=409, detail="Recording is not ready yet")

    playback = await get_playback_url(recording=rec)
    return {
        "id": rec.id,
        "duration_seconds": rec.duration_seconds,
        "ended_at": rec.ended_at.isoformat() if rec.ended_at else None,
        "expires_at": rec.expires_at.isoformat() if rec.expires_at else None,
        "playback_url": playback,
    }
