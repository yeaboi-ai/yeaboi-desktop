"""Stamp a team's currently-viewed project (used as default for Slack sessions)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user
from ..middleware.rate_limit import limiter
from ..models.organization import Team, TeamMember
from ..models.project import Project
from ..models.user import User
from ..schemas.team_last_viewed import LastViewedRequest

logger = logging.getLogger(__name__)
router = APIRouter(tags=["team-last-viewed"])


@router.patch("/api/teams/{team_id}/last-viewed", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
async def patch_last_viewed(
    request: Request,
    team_id: str,
    body: LastViewedRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    team = (await db.execute(select(Team).where(Team.id == team_id))).scalar_one_or_none()
    if team is None or team.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Team not found")

    membership = (
        await db.execute(
            select(TeamMember).where(
                TeamMember.team_id == team_id,
                TeamMember.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if membership is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a member of this team")

    project = (
        await db.execute(select(Project).where(Project.id == str(body.project_id)))
    ).scalar_one_or_none()
    if project is None or project.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    if project.org_id != team.org_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Project belongs to a different organization")

    if team.last_viewed_project_id != project.id:
        team.last_viewed_project_id = project.id
        await db.commit()
        logger.info(
            "Team last_viewed_project_id stamped",
            extra={"team_id": team.id, "project_id": project.id},
        )
    return None
