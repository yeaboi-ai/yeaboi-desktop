"""W6.6.2 — Highlight clipping ("share this 30s").

Text-only clips for the first cut. The transcript range is captured at
clip-create time so the share link works even if the source transcript is
later edited or redacted (snapshot semantics).
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db import get_db
from ..deps import get_current_user
from ..models.session import Session
from ..models.session_clip import SessionClip
from ..models.user import User

router = APIRouter(tags=["clips"])
logger = logging.getLogger(__name__)


class ClipLine(BaseModel):
    ts: str | None = None
    speaker: str | None = None
    text: str


class CreateClipBody(BaseModel):
    title: str | None = None
    transcript: list[ClipLine]
    start_ts: str | None = None
    end_ts: str | None = None


class ClipResponse(BaseModel):
    id: str
    session_id: str
    share_token: str
    title: str | None
    transcript: list[ClipLine]
    start_ts: str | None
    end_ts: str | None
    share_url: str

    model_config = {"from_attributes": True}


def _build_share_url(token: str) -> str:
    return f"/clip/{token}"


@router.post("/api/sessions/{session_id}/clips", status_code=201)
async def create_clip(
    session_id: str,
    body: CreateClipBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a transcript clip and return the share token."""
    if not body.transcript:
        raise HTTPException(status_code=422, detail="transcript must contain at least one line")

    result = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.participants))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not any(p.user_id == user.id for p in session.participants):
        raise HTTPException(status_code=403, detail="Not a participant")

    from datetime import datetime

    def _parse(ts: str | None) -> datetime | None:
        if not ts:
            return None
        try:
            return datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except ValueError:
            return None

    clip = SessionClip(
        session_id=session_id,
        created_by_id=user.id,
        title=body.title,
        transcript=[ln.model_dump() for ln in body.transcript],
        start_ts=_parse(body.start_ts),
        end_ts=_parse(body.end_ts),
    )
    db.add(clip)
    await db.commit()
    await db.refresh(clip)

    logger.info(
        "Clip created: session=%s clip=%s lines=%d by=%s",
        session_id,
        clip.id,
        len(body.transcript),
        user.id,
    )

    return {
        "id": clip.id,
        "session_id": clip.session_id,
        "share_token": clip.share_token,
        "title": clip.title,
        "transcript": clip.transcript,
        "start_ts": clip.start_ts.isoformat() if clip.start_ts else None,
        "end_ts": clip.end_ts.isoformat() if clip.end_ts else None,
        "share_url": _build_share_url(clip.share_token),
    }


@router.get("/api/clips/{share_token}")
async def get_clip_by_token(
    share_token: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Public-by-token clip retrieval. No auth required — the token IS the auth."""
    result = await db.execute(select(SessionClip).where(SessionClip.share_token == share_token))
    clip = result.scalar_one_or_none()
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")

    return {
        "id": clip.id,
        "session_id": clip.session_id,
        "share_token": clip.share_token,
        "title": clip.title,
        "transcript": clip.transcript,
        "start_ts": clip.start_ts.isoformat() if clip.start_ts else None,
        "end_ts": clip.end_ts.isoformat() if clip.end_ts else None,
        "created_at": clip.created_at.isoformat() if clip.created_at else None,
    }


@router.get("/api/sessions/{session_id}/clips")
async def list_session_clips(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """List clips for this session (host/participant only)."""
    result = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.participants))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not any(p.user_id == user.id for p in session.participants):
        raise HTTPException(status_code=403, detail="Not a participant")

    clips_result = await db.execute(
        select(SessionClip).where(SessionClip.session_id == session_id).order_by(SessionClip.created_at.desc())
    )
    clips = clips_result.scalars().all()
    return [
        {
            "id": c.id,
            "share_token": c.share_token,
            "title": c.title,
            "line_count": len(c.transcript or []),
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in clips
    ]
