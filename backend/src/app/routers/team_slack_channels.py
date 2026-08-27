"""CRUD for per-team Slack notification channel subscriptions."""

from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user
from ..models.organization import OrgMember, Team, TeamMember
from ..models.team_slack_channel import TeamSlackChannel
from ..models.user import User
from ..schemas.team_slack_channel import (
    TeamSlackChannelCreate,
    TeamSlackChannelList,
    TeamSlackChannelOut,
    TeamSlackChannelUpdate,
)
from ..services.connectors.slack_notifier import _load_slack_token

router = APIRouter(tags=["team-slack"])


async def _require_team_admin_or_org_admin(db: AsyncSession, user: User, team_id: str) -> Team:
    team = (await db.execute(select(Team).where(Team.id == team_id))).scalar_one_or_none()
    if team is None:
        raise HTTPException(404, "Team not found")

    org_admin = (
        await db.execute(
            select(OrgMember).where(
                OrgMember.org_id == team.org_id,
                OrgMember.user_id == user.id,
                OrgMember.role == "admin",
            )
        )
    ).scalar_one_or_none()
    if org_admin:
        return team

    team_admin = (
        await db.execute(
            select(TeamMember).where(
                TeamMember.team_id == team_id,
                TeamMember.user_id == user.id,
                TeamMember.role == "admin",
            )
        )
    ).scalar_one_or_none()
    if team_admin:
        return team

    raise HTTPException(403, "Admin access required")


async def _require_team_member_or_admin(db: AsyncSession, user: User, team_id: str) -> Team:
    team = (await db.execute(select(Team).where(Team.id == team_id))).scalar_one_or_none()
    if team is None:
        raise HTTPException(404, "Team not found")

    member = (
        await db.execute(select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == user.id))
    ).scalar_one_or_none()
    if member:
        return team

    org_admin = (
        await db.execute(
            select(OrgMember).where(
                OrgMember.org_id == team.org_id,
                OrgMember.user_id == user.id,
                OrgMember.role == "admin",
            )
        )
    ).scalar_one_or_none()
    if org_admin:
        return team

    raise HTTPException(403, "Not a team member")


def _to_out(row: TeamSlackChannel) -> TeamSlackChannelOut:
    return TeamSlackChannelOut(
        id=row.id,
        team_id=row.team_id,
        slack_channel_id=row.slack_channel_id,
        slack_channel_name=row.slack_channel_name,
        event_types=list(row.event_types or []),
    )


@router.get("/api/teams/{team_id}/slack-channels", response_model=TeamSlackChannelList)
async def list_channels(
    team_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TeamSlackChannelList:
    await _require_team_member_or_admin(db, user, team_id)
    rows = (await db.execute(select(TeamSlackChannel).where(TeamSlackChannel.team_id == team_id))).scalars().all()
    return TeamSlackChannelList(channels=[_to_out(r) for r in rows])


@router.post(
    "/api/teams/{team_id}/slack-channels",
    response_model=TeamSlackChannelOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_channel(
    team_id: str,
    body: TeamSlackChannelCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TeamSlackChannelOut:
    await _require_team_admin_or_org_admin(db, user, team_id)
    row = TeamSlackChannel(
        team_id=team_id,
        slack_channel_id=body.slack_channel_id,
        slack_channel_name=body.slack_channel_name,
        event_types=body.event_types,
        created_by=user.id,
    )
    db.add(row)
    try:
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(409, "Channel already configured for this team") from e
    await db.refresh(row)
    return _to_out(row)


@router.patch(
    "/api/teams/{team_id}/slack-channels/{channel_id}",
    response_model=TeamSlackChannelOut,
)
async def update_channel(
    team_id: str,
    channel_id: str,
    body: TeamSlackChannelUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TeamSlackChannelOut:
    await _require_team_admin_or_org_admin(db, user, team_id)
    row = (
        await db.execute(
            select(TeamSlackChannel).where(TeamSlackChannel.team_id == team_id, TeamSlackChannel.id == channel_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(404, "Channel not found")
    if body.slack_channel_id is not None:
        row.slack_channel_id = body.slack_channel_id
    if body.slack_channel_name is not None:
        row.slack_channel_name = body.slack_channel_name
    if body.event_types is not None:
        row.event_types = body.event_types
    await db.commit()
    await db.refresh(row)
    return _to_out(row)


@router.delete(
    "/api/teams/{team_id}/slack-channels/{channel_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_channel(
    team_id: str,
    channel_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    await _require_team_admin_or_org_admin(db, user, team_id)
    row = (
        await db.execute(
            select(TeamSlackChannel).where(TeamSlackChannel.team_id == team_id, TeamSlackChannel.id == channel_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(404, "Channel not found")
    await db.delete(row)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/api/teams/{team_id}/slack-channels/available")
async def available_channels(
    team_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    team = await _require_team_member_or_admin(db, user, team_id)
    token = await _load_slack_token(db, team.org_id)
    if token is None:
        return {"channels": []}
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            "https://slack.com/api/conversations.list",
            headers={"Authorization": f"Bearer {token}"},
            params={"types": "public_channel,private_channel", "exclude_archived": "true", "limit": 200},
        )
    if resp.status_code != 200:
        return {"channels": []}
    data = resp.json()
    return {"channels": [{"id": c["id"], "name": c["name"]} for c in data.get("channels", []) if c.get("is_member")]}
