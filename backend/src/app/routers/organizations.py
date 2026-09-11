import logging
import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db import get_db
from ..deps import get_current_user
from ..middleware.rate_limit import limiter
from ..models.audit import AuditLog
from ..models.base import gen_uuid
from ..models.organization import Organization, OrgMember, Team, TeamMember
from ..models.user import User
from ..services.audit_service import get_client_ip, log_audit
from ..services.email_service import send_invite_email
from ..services.onboarding_seed import seed_demo_workspace

logger = logging.getLogger(__name__)

router = APIRouter(tags=["organizations"])

_SLUG_RE = re.compile(r"^[a-z0-9-]+$")


def _validate_slug(slug: str) -> str:
    slug = slug.lower().strip()
    if not slug or not _SLUG_RE.match(slug):
        raise HTTPException(
            status_code=422,
            detail="Slug must be lowercase alphanumeric and hyphens only",
        )
    return slug


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class OrgCreate(BaseModel):
    name: str
    slug: str
    seed_demo_session: bool = True


class OrgCreateResponse(BaseModel):
    """Response shape for `POST /api/orgs`. Declared explicitly so renaming
    `demo_session_id` server-side is a typed change the framework notices."""

    id: str
    name: str
    slug: str
    plan: str | None
    billing_email: str | None
    created_at: datetime
    updated_at: datetime
    demo_session_id: str | None = None


class OrgUpdate(BaseModel):
    name: str | None = None
    billing_email: str | None = None


class TeamCreate(BaseModel):
    name: str
    slug: str


class TeamUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class InviteBody(BaseModel):
    email: EmailStr
    team_id: str | None = None
    role: str = "member"


class AddTeamMemberBody(BaseModel):
    # Either user_id (single) or user_ids (bulk). One must be set.
    user_id: str | None = None
    user_ids: list[str] | None = None
    role: str = "member"


class DeleteTeamBody(BaseModel):
    confirm_name: str


# ---------------------------------------------------------------------------
# Helper: assert caller is org member, return OrgMember row
# ---------------------------------------------------------------------------


async def _require_org_member(org_id: str, user: User, db: AsyncSession) -> OrgMember:
    result = await db.execute(
        select(OrgMember).where(
            OrgMember.org_id == org_id,
            OrgMember.user_id == user.id,
        )
    )
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this organization")
    return membership


async def _require_org_admin(org_id: str, user: User, db: AsyncSession) -> OrgMember:
    membership = await _require_org_member(org_id, user, db)
    if membership.role != "admin":
        raise HTTPException(status_code=403, detail="Organization admin access required")
    return membership


# ---------------------------------------------------------------------------
# Org CRUD
# ---------------------------------------------------------------------------


@router.post("/api/orgs", status_code=201, response_model=OrgCreateResponse)
@limiter.limit("30/minute")
async def create_org(
    request: Request,
    body: OrgCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    slug = _validate_slug(body.slug)

    # Check slug uniqueness
    existing = await db.execute(select(Organization).where(Organization.slug == slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Slug already in use")

    org = Organization(name=body.name, slug=slug)
    db.add(org)
    await db.flush()

    db.add(OrgMember(org_id=org.id, user_id=user.id, role="admin"))

    team = Team(org_id=org.id, name="General", slug="general")
    db.add(team)
    await db.flush()

    db.add(TeamMember(team_id=team.id, user_id=user.id, role="admin"))

    # Demo seed runs inside a SAVEPOINT so a seed failure (e.g. a unique
    # constraint collision on the canned content) degrades to "no demo
    # project" — the user still gets an org + team and can keep onboarding.
    # Without this, a seed crash would roll back the whole org-create
    # transaction and the user would hit a 409 on retry.
    demo_session_id: str | None = None
    if body.seed_demo_session:
        try:
            async with db.begin_nested():
                demo_session = await seed_demo_workspace(
                    db, org_id=org.id, team_id=team.id, user_id=user.id
                )
                demo_session_id = demo_session.id
        except Exception:
            logger.exception(
                "Demo workspace seed failed for org %s — continuing without it",
                org.id,
            )

    await log_audit(
        db,
        org_id=org.id,
        user_id=user.id,
        action="create",
        resource_type="org",
        resource_id=org.id,
        metadata={"name": body.name, "slug": slug},
        ip_address=get_client_ip(request),
    )
    await db.commit()
    logger.info("Organization created: %s (slug=%s)", org.id, body.slug)
    await db.refresh(org)

    return {
        "id": org.id,
        "name": org.name,
        "slug": org.slug,
        "plan": org.plan,
        "billing_email": org.billing_email,
        "created_at": org.created_at,
        "updated_at": org.updated_at,
        "demo_session_id": demo_session_id,
    }


@router.get("/api/orgs")
@limiter.limit("60/minute")
async def list_orgs(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    result = await db.execute(
        select(OrgMember).where(OrgMember.user_id == user.id).options(selectinload(OrgMember.organization))
    )
    memberships = result.scalars().all()

    out = []
    for m in memberships:
        org = m.organization
        if org and not org.deleted_at:
            out.append(
                {
                    "id": org.id,
                    "name": org.name,
                    "slug": org.slug,
                    "plan": org.plan,
                    "billing_email": org.billing_email,
                    "role": m.role,
                    "created_at": org.created_at,
                    "updated_at": org.updated_at,
                }
            )
    return out


@router.get("/api/orgs/{org_id}")
@limiter.limit("60/minute")
async def get_org(
    request: Request,
    org_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await _require_org_member(org_id, user, db)

    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org or org.deleted_at:
        raise HTTPException(status_code=404, detail="Organization not found")

    return {
        "id": org.id,
        "name": org.name,
        "slug": org.slug,
        "plan": org.plan,
        "billing_email": org.billing_email,
        "created_at": org.created_at,
        "updated_at": org.updated_at,
    }


@router.patch("/api/orgs/{org_id}")
@limiter.limit("30/minute")
async def update_org(
    request: Request,
    org_id: str,
    body: OrgUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await _require_org_admin(org_id, user, db)

    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org or org.deleted_at:
        raise HTTPException(status_code=404, detail="Organization not found")

    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(org, key, value)

    await log_audit(
        db,
        org_id=org_id,
        user_id=user.id,
        action="update",
        resource_type="org",
        resource_id=org_id,
        metadata={"fields": list(body.model_dump(exclude_unset=True).keys())},
        ip_address=get_client_ip(request),
    )
    await db.commit()
    logger.info("Organization updated: %s", org_id)
    await db.refresh(org)

    return {
        "id": org.id,
        "name": org.name,
        "slug": org.slug,
        "plan": org.plan,
        "billing_email": org.billing_email,
        "created_at": org.created_at,
        "updated_at": org.updated_at,
    }


# ---------------------------------------------------------------------------
# Team CRUD
# ---------------------------------------------------------------------------


@router.post("/api/orgs/{org_id}/teams", status_code=201)
@limiter.limit("30/minute")
async def create_team(
    request: Request,
    org_id: str,
    body: TeamCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await _require_org_admin(org_id, user, db)

    slug = _validate_slug(body.slug)

    # Slug unique within org
    existing = await db.execute(select(Team).where(Team.org_id == org_id, Team.slug == slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Team slug already in use in this org")

    team = Team(org_id=org_id, name=body.name, slug=slug)
    db.add(team)
    await log_audit(
        db,
        org_id=org_id,
        user_id=user.id,
        action="create",
        resource_type="team",
        resource_id=team.id,
        metadata={"name": body.name, "slug": slug},
        ip_address=get_client_ip(request),
    )
    await db.commit()
    logger.info("Team created: %s in org %s", team.id, org_id)
    await db.refresh(team)

    return {
        "id": team.id,
        "org_id": team.org_id,
        "name": team.name,
        "slug": team.slug,
        "created_at": team.created_at,
        "updated_at": team.updated_at,
    }


@router.get("/api/orgs/{org_id}/teams")
@limiter.limit("60/minute")
async def list_teams(
    request: Request,
    org_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    await _require_org_member(org_id, user, db)

    result = await db.execute(select(Team).where(Team.org_id == org_id, Team.deleted_at.is_(None)))
    teams = result.scalars().all()

    return [
        {
            "id": t.id,
            "org_id": t.org_id,
            "name": t.name,
            "slug": t.slug,
            "created_at": t.created_at,
            "updated_at": t.updated_at,
        }
        for t in teams
    ]


@router.delete("/api/orgs/{org_id}/teams/{team_id}", status_code=204)
@limiter.limit("10/minute")
async def delete_team(
    request: Request,
    org_id: str,
    team_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Soft-delete a team. Cannot delete the last team in an org."""
    await _require_org_admin(org_id, user, db)

    # Count active teams
    count_result = await db.execute(
        select(func.count()).select_from(Team).where(Team.org_id == org_id, Team.deleted_at.is_(None))
    )
    team_count = count_result.scalar_one()
    if team_count <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the only team in the organization")

    result = await db.execute(select(Team).where(Team.id == team_id, Team.org_id == org_id))
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    from datetime import UTC, datetime

    team.deleted_at = datetime.now(UTC)
    await log_audit(
        db,
        org_id=org_id,
        user_id=user.id,
        action="delete",
        resource_type="team",
        resource_id=team_id,
        metadata={"name": team.name},
        ip_address=get_client_ip(request),
    )
    await db.commit()


@router.patch("/api/orgs/{org_id}/teams/{team_id}")
@limiter.limit("30/minute")
async def update_team(
    request: Request,
    org_id: str,
    team_id: str,
    body: TeamUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    # Allow team admin or org admin
    membership = await _require_org_member(org_id, user, db)

    if membership.role != "admin":
        # Check if user is team admin
        tm_result = await db.execute(
            select(TeamMember).where(
                TeamMember.team_id == team_id,
                TeamMember.user_id == user.id,
                TeamMember.role == "admin",
            )
        )
        if not tm_result.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Team admin or org admin access required")

    result = await db.execute(select(Team).where(Team.id == team_id, Team.org_id == org_id))
    team = result.scalar_one_or_none()
    if not team or team.deleted_at:
        raise HTTPException(status_code=404, detail="Team not found")

    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(team, key, value)

    await db.commit()
    await db.refresh(team)

    return {
        "id": team.id,
        "org_id": team.org_id,
        "name": team.name,
        "slug": team.slug,
        "created_at": team.created_at,
        "updated_at": team.updated_at,
    }


# ---------------------------------------------------------------------------
# Org Members
# ---------------------------------------------------------------------------


@router.get("/api/orgs/{org_id}/members")
@limiter.limit("60/minute")
async def list_org_members(
    request: Request,
    org_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    await _require_org_member(org_id, user, db)

    # Load org members with their users
    om_result = await db.execute(
        select(OrgMember).where(OrgMember.org_id == org_id).options(selectinload(OrgMember.user))
    )
    org_members = om_result.scalars().all()

    # For each member, get their teams within this org
    out = []
    for om in org_members:
        # Get teams in this org the user belongs to
        teams_result = await db.execute(
            select(TeamMember).where(TeamMember.user_id == om.user_id).options(selectinload(TeamMember.team))
        )
        team_memberships = teams_result.scalars().all()
        teams = [
            {"id": tm.team.id, "name": tm.team.name, "slug": tm.team.slug, "role": tm.role}
            for tm in team_memberships
            if tm.team.org_id == org_id and not tm.team.deleted_at
        ]

        out.append(
            {
                "user_id": om.user_id,
                "email": om.user.email,
                "name": om.user.name,
                "avatar_url": om.user.avatar_url,
                "pronouns": om.user.pronouns,
                "job_title": om.user.job_title,
                "role": om.role,
                "invite_claimed": om.user.invite_claimed if om.user else True,
                "teams": teams,
            }
        )
    return out


@router.post("/api/orgs/{org_id}/invite", status_code=201)
@limiter.limit("20/minute")
async def invite_to_org(
    request: Request,
    org_id: str,
    body: InviteBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await _require_org_admin(org_id, user, db)

    # Verify org exists
    org_result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = org_result.scalar_one_or_none()
    if not org or org.deleted_at:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Find or create the invited user
    user_result = await db.execute(select(User).where(User.email == body.email))
    invited_user = user_result.scalar_one_or_none()

    # The invite token powers the /invite/<token> claim URL in the email. We
    # mint one for brand-new users; existing users already have an account
    # they can sign into normally, so no token is needed.
    is_new_user = invited_user is None
    if not invited_user:
        invited_user = User(
            email=body.email,
            invite_claimed=False,
            invite_token=gen_uuid(),
        )
        db.add(invited_user)
        await db.flush()

    # Add to org if not already a member
    existing_membership = await db.execute(
        select(OrgMember).where(
            OrgMember.org_id == org_id,
            OrgMember.user_id == invited_user.id,
        )
    )
    org_member = existing_membership.scalar_one_or_none()
    if not org_member:
        role = body.role if body.role in ("admin", "member") else "member"
        org_member = OrgMember(org_id=org_id, user_id=invited_user.id, role=role)
        db.add(org_member)
        await db.flush()

    # Optionally add to a specific team
    if body.team_id:
        team_result = await db.execute(select(Team).where(Team.id == body.team_id, Team.org_id == org_id))
        team = team_result.scalar_one_or_none()
        if not team or team.deleted_at:
            raise HTTPException(status_code=404, detail="Team not found in this org")

        existing_tm = await db.execute(
            select(TeamMember).where(
                TeamMember.team_id == body.team_id,
                TeamMember.user_id == invited_user.id,
            )
        )
        if not existing_tm.scalar_one_or_none():
            db.add(TeamMember(team_id=body.team_id, user_id=invited_user.id, role="member"))

    await log_audit(
        db,
        org_id=org_id,
        user_id=user.id,
        action="invite",
        resource_type="member",
        resource_id=invited_user.id,
        metadata={"email": body.email, "role": org_member.role},
        ip_address=get_client_ip(request),
    )
    await db.commit()
    logger.info("User invited to org %s: %s", org_id, body.email)

    # Notify the invitee. send_invite_email no-ops (and logs a warning) when
    # no Resend API key is configured, so this is safe in dev.
    inviter_name = user.display_name or user.name or user.email
    email_sent = await send_invite_email(
        to_email=body.email,
        inviter_name=inviter_name,
        inviter_email=user.email,
        invite_token=invited_user.invite_token if is_new_user else None,
        org_id=org_id,
        user_id=user.id,
    )

    return {
        "user_id": invited_user.id,
        "email": invited_user.email,
        "org_id": org_id,
        "role": org_member.role,
        "email_sent": email_sent,
    }


@router.delete("/api/orgs/{org_id}/members/{user_id}", status_code=204)
@limiter.limit("30/minute")
async def remove_org_member(
    request: Request,
    org_id: str,
    user_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await _require_org_admin(org_id, user, db)

    # Guard: cannot remove last admin
    if user_id != user.id:
        # Check whether target is the last admin
        admins_result = await db.execute(
            select(OrgMember).where(
                OrgMember.org_id == org_id,
                OrgMember.role == "admin",
            )
        )
        admins = admins_result.scalars().all()
        target_is_admin = any(a.user_id == user_id for a in admins)
        if target_is_admin and len(admins) == 1:
            raise HTTPException(status_code=409, detail="Cannot remove the last org admin")
    else:
        # Self-removal: guard against removing self if last admin
        admins_result = await db.execute(
            select(OrgMember).where(
                OrgMember.org_id == org_id,
                OrgMember.role == "admin",
            )
        )
        admins = admins_result.scalars().all()
        if len(admins) == 1 and admins[0].user_id == user.id:
            raise HTTPException(status_code=409, detail="Cannot remove the last org admin")

    # Remove from all teams in this org
    teams_in_org_result = await db.execute(select(Team.id).where(Team.org_id == org_id))
    team_ids = teams_in_org_result.scalars().all()
    if team_ids:
        await db.execute(
            delete(TeamMember).where(
                TeamMember.team_id.in_(team_ids),
                TeamMember.user_id == user_id,
            )
        )

    # Remove from org
    await db.execute(
        delete(OrgMember).where(
            OrgMember.org_id == org_id,
            OrgMember.user_id == user_id,
        )
    )
    await log_audit(
        db,
        org_id=org_id,
        user_id=user.id,
        action="remove",
        resource_type="member",
        resource_id=user_id,
        ip_address=get_client_ip(request),
    )
    await db.commit()
    logger.info("Org member removed: org=%s, user=%s", org_id, user_id)


# ---------------------------------------------------------------------------
# Team Details & Members
# ---------------------------------------------------------------------------


@router.get("/api/teams/{team_id}")
@limiter.limit("60/minute")
async def get_team(
    request: Request,
    team_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get team details."""
    result = await db.execute(select(Team).where(Team.id == team_id))
    team = result.scalar_one_or_none()
    if not team or team.deleted_at:
        raise HTTPException(status_code=404, detail="Team not found")
    # Verify user is in the org
    await _require_org_member(team.org_id, user, db)
    return {
        "id": team.id,
        "org_id": team.org_id,
        "name": team.name,
        "slug": team.slug,
        "description": team.description,
        "created_at": team.created_at,
    }


@router.patch("/api/teams/{team_id}")
@limiter.limit("30/minute")
async def update_team_by_id(
    request: Request,
    team_id: str,
    body: TeamUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update team name and description."""
    result = await db.execute(select(Team).where(Team.id == team_id))
    team = result.scalar_one_or_none()
    if not team or team.deleted_at:
        raise HTTPException(status_code=404, detail="Team not found")
    await _require_org_admin(team.org_id, user, db)
    if body.name is not None:
        team.name = body.name
    if body.description is not None:
        team.description = body.description
    await db.commit()
    return {
        "id": team.id,
        "name": team.name,
        "slug": team.slug,
        "description": team.description,
    }


@router.delete("/api/teams/{team_id}", status_code=204)
@limiter.limit("10/minute")
async def delete_team_by_id(
    request: Request,
    team_id: str,
    body: DeleteTeamBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Soft-delete a team. Org admin only. Requires confirm_name to match exactly."""
    result = await db.execute(select(Team).where(Team.id == team_id))
    team = result.scalar_one_or_none()
    if not team or team.deleted_at:
        raise HTTPException(status_code=404, detail="Team not found")
    await _require_org_admin(team.org_id, user, db)

    if body.confirm_name != team.name:
        raise HTTPException(status_code=400, detail="confirm_name does not match team name")

    from datetime import UTC, datetime

    team.deleted_at = datetime.now(UTC)
    await log_audit(
        db,
        org_id=team.org_id,
        user_id=user.id,
        action="delete",
        resource_type="team",
        resource_id=team_id,
        metadata={"name": team.name},
        ip_address=get_client_ip(request),
    )
    await db.commit()


@router.post("/api/teams/{team_id}/leave", status_code=204)
@limiter.limit("10/minute")
async def leave_team(
    request: Request,
    team_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Caller removes themselves from a team. Rejected if caller is the sole admin."""
    team_result = await db.execute(select(Team).where(Team.id == team_id))
    team = team_result.scalar_one_or_none()
    if not team or team.deleted_at:
        raise HTTPException(status_code=404, detail="Team not found")

    # Caller must already be on the team
    own_tm_result = await db.execute(
        select(TeamMember).where(
            TeamMember.team_id == team_id,
            TeamMember.user_id == user.id,
        )
    )
    own_tm = own_tm_result.scalar_one_or_none()
    if not own_tm:
        raise HTTPException(status_code=404, detail="You are not a member of this team")

    # If caller is the sole admin, block — they need to promote someone first
    if own_tm.role == "admin":
        admin_count_result = await db.execute(
            select(func.count())
            .select_from(TeamMember)
            .where(TeamMember.team_id == team_id, TeamMember.role == "admin")
        )
        admin_count = admin_count_result.scalar_one()
        if admin_count <= 1:
            raise HTTPException(
                status_code=400,
                detail="You are the only admin on this team — promote another member to admin before leaving",
            )

    await db.delete(own_tm)
    await log_audit(
        db,
        org_id=team.org_id,
        user_id=user.id,
        action="leave",
        resource_type="team",
        resource_id=team_id,
        metadata={"team_name": team.name},
        ip_address=get_client_ip(request),
    )
    await db.commit()


@router.get("/api/teams/{team_id}/members")
@limiter.limit("60/minute")
async def list_team_members(
    request: Request,
    team_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    # Resolve org from team, then verify user is org member
    team_result = await db.execute(select(Team).where(Team.id == team_id))
    team = team_result.scalar_one_or_none()
    if not team or team.deleted_at:
        raise HTTPException(status_code=404, detail="Team not found")

    await _require_org_member(team.org_id, user, db)

    tm_result = await db.execute(
        select(TeamMember).where(TeamMember.team_id == team_id).options(selectinload(TeamMember.user))
    )
    members = tm_result.scalars().all()

    return [
        {
            "user_id": tm.user_id,
            "email": tm.user.email,
            "name": tm.user.name,
            "avatar_url": tm.user.avatar_url,
            "pronouns": tm.user.pronouns,
            "job_title": tm.user.job_title,
            "role": tm.role,
        }
        for tm in members
    ]


@router.post("/api/teams/{team_id}/members", status_code=201)
@limiter.limit("30/minute")
async def add_team_member(
    request: Request,
    team_id: str,
    body: AddTeamMemberBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    # Resolve org from team
    team_result = await db.execute(select(Team).where(Team.id == team_id))
    team = team_result.scalar_one_or_none()
    if not team or team.deleted_at:
        raise HTTPException(status_code=404, detail="Team not found")

    # Caller must be team admin or org admin
    org_membership = await _require_org_member(team.org_id, user, db)
    if org_membership.role != "admin":
        tm_result = await db.execute(
            select(TeamMember).where(
                TeamMember.team_id == team_id,
                TeamMember.user_id == user.id,
                TeamMember.role == "admin",
            )
        )
        if not tm_result.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Team admin or org admin access required")

    # Determine single vs bulk mode
    target_ids: list[str]
    bulk_mode: bool
    if body.user_ids is not None:
        target_ids = body.user_ids
        bulk_mode = True
    elif body.user_id is not None:
        target_ids = [body.user_id]
        bulk_mode = False
    else:
        raise HTTPException(status_code=400, detail="user_id or user_ids is required")

    role = body.role if body.role in ("admin", "member") else "member"

    # Verify all targets are org members
    org_members_rows = (
        await db.execute(
            select(OrgMember).where(
                OrgMember.org_id == team.org_id,
                OrgMember.user_id.in_(target_ids),
            )
        )
    ).scalars().all()
    org_member_ids = {m.user_id for m in org_members_rows}
    missing = [uid for uid in target_ids if uid not in org_member_ids]
    if missing:
        raise HTTPException(
            status_code=400,
            detail="One or more users are not members of this organization",
        )

    # Skip targets already in team (idempotent for bulk; 409 for single)
    existing_rows = (
        await db.execute(
            select(TeamMember.user_id).where(
                TeamMember.team_id == team_id,
                TeamMember.user_id.in_(target_ids),
            )
        )
    ).scalars().all()
    already_in_team = set(existing_rows)

    if not bulk_mode and target_ids[0] in already_in_team:
        raise HTTPException(status_code=409, detail="User is already a member of this team")

    new_ids = [uid for uid in target_ids if uid not in already_in_team]
    for uid in new_ids:
        db.add(TeamMember(team_id=team_id, user_id=uid, role=role))
    await db.commit()

    # Fetch user rows for response
    if not new_ids and bulk_mode:
        return {"added": [], "skipped_existing": list(already_in_team)}

    users_to_fetch = new_ids if bulk_mode else target_ids
    u_rows = (
        await db.execute(select(User).where(User.id.in_(users_to_fetch)))
    ).scalars().all()
    user_by_id = {u.id: u for u in u_rows}

    if bulk_mode:
        return {
            "added": [
                {
                    "user_id": uid,
                    "email": user_by_id[uid].email,
                    "name": user_by_id[uid].name,
                    "team_id": team_id,
                    "role": role,
                }
                for uid in new_ids
            ],
            "skipped_existing": list(already_in_team),
        }

    target_user = user_by_id[target_ids[0]]
    return {
        "user_id": target_ids[0],
        "email": target_user.email,
        "name": target_user.name,
        "team_id": team_id,
        "role": role,
    }


@router.delete("/api/teams/{team_id}/members/{user_id}", status_code=204)
@limiter.limit("30/minute")
async def remove_team_member(
    request: Request,
    team_id: str,
    user_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    # Resolve org from team
    team_result = await db.execute(select(Team).where(Team.id == team_id))
    team = team_result.scalar_one_or_none()
    if not team or team.deleted_at:
        raise HTTPException(status_code=404, detail="Team not found")

    # Caller must be team admin or org admin
    org_membership = await _require_org_member(team.org_id, user, db)
    if org_membership.role != "admin":
        tm_result = await db.execute(
            select(TeamMember).where(
                TeamMember.team_id == team_id,
                TeamMember.user_id == user.id,
                TeamMember.role == "admin",
            )
        )
        if not tm_result.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Team admin or org admin access required")

    # Guard: cannot remove last team admin
    admins_result = await db.execute(
        select(TeamMember).where(
            TeamMember.team_id == team_id,
            TeamMember.role == "admin",
        )
    )
    admins = admins_result.scalars().all()
    target_is_admin = any(a.user_id == user_id for a in admins)
    if target_is_admin and len(admins) == 1:
        raise HTTPException(status_code=409, detail="Cannot remove the last team admin")

    await db.execute(
        delete(TeamMember).where(
            TeamMember.team_id == team_id,
            TeamMember.user_id == user_id,
        )
    )
    await db.commit()


# ---------------------------------------------------------------------------
# Audit Logs
# ---------------------------------------------------------------------------


@router.get("/api/orgs/{org_id}/audit-logs")
@limiter.limit("60/minute")
async def list_audit_logs(
    request: Request,
    org_id: str,
    action: str | None = None,
    resource_type: str | None = None,
    user_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """List audit logs for an org. Admin only. Filterable by action, resource_type, user_id."""
    await _require_org_admin(org_id, user, db)

    query = select(AuditLog).where(AuditLog.org_id == org_id)
    if action:
        query = query.where(AuditLog.action == action)
    if resource_type:
        query = query.where(AuditLog.resource_type == resource_type)
    if user_id:
        query = query.where(AuditLog.user_id == user_id)

    query = query.order_by(AuditLog.created_at.desc()).offset(offset).limit(min(limit, 200))
    result = await db.execute(query)
    logs = result.scalars().all()

    return [
        {
            "id": log.id,
            "user_id": log.user_id,
            "action": log.action,
            "resource_type": log.resource_type,
            "resource_id": log.resource_id,
            "metadata": log.metadata_,
            "ip_address": log.ip_address,
            "created_at": log.created_at,
        }
        for log in logs
    ]
