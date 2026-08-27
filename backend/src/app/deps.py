import logging
import re

from fastapi import Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .auth import decode_jwt, get_token_from_request
from .db import get_db
from .logging_config import org_id_var, user_id_var
from .models.organization import Organization
from .models.user import User

logger = logging.getLogger(__name__)


async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    """FastAPI dependency: extract and validate JWT, return or create User."""
    token = get_token_from_request(request)
    payload = decode_jwt(token)

    email = payload.get("email")
    if not email:
        raise HTTPException(status_code=401, detail="Token missing email")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user:
        # Check if any users exist — first user gets admin role
        count_result = await db.execute(select(func.count()).select_from(User))
        user_count = count_result.scalar_one()
        role = "admin" if user_count == 0 else "member"

        logger.info("Auto-creating user: %s (role=%s)", email, role)
        user = User(
            email=email,
            name=payload.get("name"),
            avatar_url=payload.get("picture"),
            role=role,
        )
        db.add(user)
        await db.flush()  # flush to get user.id without committing

        # First user ever → create their org and team
        if user_count == 0:
            logger.info("Creating initial org and team for first user: %s", email)
            from .models.organization import Organization, OrgMember, Team, TeamMember

            slug = re.sub(r"[^a-z0-9-]", "", email.split("@")[0].lower())[:50] or "my-org"
            org = Organization(name="My Organization", slug=slug)
            db.add(org)
            await db.flush()
            db.add(OrgMember(org_id=org.id, user_id=user.id, role="admin"))
            team = Team(org_id=org.id, name="My Team", slug="default")
            db.add(team)
            await db.flush()
            db.add(TeamMember(team_id=team.id, user_id=user.id, role="admin"))

        await db.commit()
        await db.refresh(user)

    user_id_var.set(user.email)
    return user


async def require_admin(user: User = Depends(get_current_user)) -> User:
    """FastAPI dependency: require the current user to have admin role."""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def require_org_admin(org_id: str, user: User, db: AsyncSession):
    """Verify the user is an admin member of the given org. Returns the OrgMember row."""
    from .models.organization import OrgMember

    result = await db.execute(
        select(OrgMember).where(
            OrgMember.org_id == org_id,
            OrgMember.user_id == user.id,
        )
    )
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this organization")
    if membership.role != "admin":
        raise HTTPException(status_code=403, detail="Organization admin access required")
    return membership


async def require_org_member(org_id: str, user: User, db: AsyncSession):
    """Verify the user is a member of the given org. Returns the OrgMember row."""
    from .models.organization import OrgMember

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


async def get_current_org(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Organization:
    """Get org context from X-Org-Id header, or default to user's first org."""
    from .models.organization import Organization, OrgMember

    org_id = request.headers.get("X-Org-Id")

    if org_id:
        # Verify membership
        result = await db.execute(
            select(OrgMember).where(
                OrgMember.org_id == org_id,
                OrgMember.user_id == user.id,
            )
        )
        membership = result.scalar_one_or_none()
        if not membership:
            raise HTTPException(status_code=403, detail="Not a member of this organization")
        org_result = await db.execute(select(Organization).where(Organization.id == org_id))
    else:
        # Default to user's first org
        result = await db.execute(select(OrgMember).where(OrgMember.user_id == user.id).limit(1))
        membership = result.scalar_one_or_none()
        if not membership:
            raise HTTPException(status_code=400, detail="User not in any organization")
        org_result = await db.execute(select(Organization).where(Organization.id == membership.org_id))

    org = org_result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    org_id_var.set(str(org.id))
    logger.debug("Resolved org context: %s for user %s", org.id, user.id)
    return org


async def get_current_team(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get team context from X-Team-Id header, or default to user's first team."""
    from .models.organization import Team, TeamMember

    team_id = request.headers.get("X-Team-Id")

    if team_id:
        result = await db.execute(
            select(TeamMember).where(
                TeamMember.team_id == team_id,
                TeamMember.user_id == user.id,
            )
        )
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Not a member of this team")
        team_result = await db.execute(select(Team).where(Team.id == team_id))
    else:
        result = await db.execute(select(TeamMember).where(TeamMember.user_id == user.id).limit(1))
        membership = result.scalar_one_or_none()
        if not membership:
            raise HTTPException(status_code=400, detail="User not in any team")
        team_result = await db.execute(select(Team).where(Team.id == membership.team_id))

    team = team_result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    logger.debug("Resolved team context: %s for user %s", team.id, user.id)
    return team
