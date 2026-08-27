import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_org, get_current_user, require_admin
from ..middleware.rate_limit import limiter
from ..models.base import gen_uuid
from ..models.organization import Organization
from ..models.user import User
from ..services.audit_service import get_client_ip, log_audit
from ..services.email_service import send_invite_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/team", tags=["team"])


# ─── Schemas ──────────────────────────────────────────────────────────────────


class TeamMemberResponse(BaseModel):
    id: str
    email: str
    name: str | None
    avatar_url: str | None
    created_at: datetime
    invite_claimed: bool = True
    invite_token: str | None = None
    email_sent: bool = False
    role: str = "member"

    model_config = {"from_attributes": True}


class InviteRequest(BaseModel):
    email: str
    inviter_name: str = "A teammate"
    inviter_email: str = ""


class RoleUpdateRequest(BaseModel):
    role: str  # "admin" | "member"


# ─── Endpoints ────────────────────────────────────────────────────────────────


@router.get("", response_model=list[TeamMemberResponse])
@limiter.limit("60/minute")
async def list_team(
    request: Request,
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[User]:
    """Return all users (team members). Requires authentication."""
    result = await db.execute(select(User).order_by(User.created_at.asc()))
    return list(result.scalars().all())


@router.post("/invite", response_model=TeamMemberResponse, status_code=201)
@limiter.limit("10/minute")
async def invite_member(
    request: Request,
    body: InviteRequest,
    _admin: User = Depends(require_admin),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Invite a user by email. Creates a user record if one doesn't exist. Admin only."""
    # Check if user already exists
    result = await db.execute(select(User).where(User.email == body.email))
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="A user with that email already exists")

    invite_token = gen_uuid()
    user = User(
        id=gen_uuid(),
        email=body.email,
        name=None,
        avatar_url=None,
        invite_token=invite_token,
        invite_claimed=False,
        role="member",
    )
    db.add(user)
    await log_audit(
        db,
        org_id=org.id,
        user_id=_admin.id,
        action="invite",
        resource_type="member",
        resource_id=user.id,
        metadata={"email": body.email},
        ip_address=get_client_ip(request),
    )
    await db.commit()
    logger.info("Team member invited: %s", body.email)
    await db.refresh(user)

    email_sent = await send_invite_email(
        to_email=body.email,
        inviter_name=body.inviter_name,
        inviter_email=body.inviter_email,
        invite_token=invite_token,
        org_id=org.id,
        user_id=_admin.id,
    )

    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "avatar_url": user.avatar_url,
        "created_at": user.created_at,
        "role": user.role,
        "email_sent": email_sent,
        "invite_token": invite_token,
    }


@router.delete("/{user_id}", status_code=204)
async def remove_member(
    request: Request,
    user_id: str,
    _admin: User = Depends(require_admin),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Remove a team member by user ID. Admin only."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Team member not found")

    await log_audit(
        db,
        org_id=org.id,
        user_id=_admin.id,
        action="remove",
        resource_type="member",
        resource_id=user_id,
        metadata={"email": user.email},
        ip_address=get_client_ip(request),
    )
    await db.delete(user)
    await db.commit()
    logger.info("Team member removed: user=%s", user_id)


@router.patch("/{user_id}/role", response_model=TeamMemberResponse)
async def update_member_role(
    request: Request,
    user_id: str,
    body: RoleUpdateRequest,
    admin: User = Depends(require_admin),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Update a team member's role. Admin only. Cannot demote yourself."""
    if body.role not in ("admin", "member"):
        raise HTTPException(status_code=422, detail="role must be 'admin' or 'member'")

    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot change your own role")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Team member not found")

    old_role = user.role
    user.role = body.role
    await log_audit(
        db,
        org_id=org.id,
        user_id=admin.id,
        action="role_change",
        resource_type="member",
        resource_id=user_id,
        metadata={"old_role": old_role, "new_role": body.role},
        ip_address=get_client_ip(request),
    )
    await db.commit()
    logger.info("Team member role updated: user=%s, role=%s", user_id, body.role)
    await db.refresh(user)
    return user
