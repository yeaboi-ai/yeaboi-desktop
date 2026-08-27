import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..middleware.rate_limit import limiter
from ..models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/invites", tags=["invites"])


# ─── Schemas ──────────────────────────────────────────────────────────────────


class InviteInfoResponse(BaseModel):
    email: str
    token: str


class ClaimRequest(BaseModel):
    email: str
    name: str | None = None
    avatar_url: str | None = None


# ─── Endpoints ────────────────────────────────────────────────────────────────


@router.get("/{token}", response_model=InviteInfoResponse)
@limiter.limit("10/minute")
async def get_invite(
    request: Request,
    token: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return invite info for a valid, unclaimed token. No auth required."""
    result = await db.execute(
        select(User).where(User.invite_token == token, User.invite_claimed == False)  # noqa: E712
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Invalid or already claimed invite")
    return {"email": user.email, "token": token}


@router.post("/{token}/claim")
@limiter.limit("10/minute")
async def claim_invite(
    request: Request,
    token: str,
    body: ClaimRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Claim an invite token by linking it to an OAuth-authenticated user.

    Updates the invited user record with the OAuth identity details,
    marks the invite as claimed, and clears the token.
    The token itself acts as the secret — no additional auth required.
    """
    result = await db.execute(
        select(User).where(User.invite_token == token, User.invite_claimed == False)  # noqa: E712
    )
    invited_user = result.scalar_one_or_none()
    if not invited_user:
        raise HTTPException(status_code=404, detail="Invalid or already claimed invite")

    # Update with OAuth user info
    invited_user.email = body.email
    if body.name is not None:
        invited_user.name = body.name
    if body.avatar_url is not None:
        invited_user.avatar_url = body.avatar_url
    invited_user.invite_claimed = True
    invited_user.invite_token = None

    await db.commit()
    logger.info("Invite claimed by %s", body.email)
    return {"ok": True}
