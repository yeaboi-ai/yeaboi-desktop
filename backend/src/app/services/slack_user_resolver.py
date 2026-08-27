"""Resolve a Slack user identity to a platform User.

Two paths:
  1. Existing ``SlackUserLink`` record → return its ``user_id`` immediately.
  2. Auto-match via verified Slack email → look up ``User.email`` within the
     org that owns the Slack workspace.  On match, persist a new link and
     return the user id.

``link_user`` allows callers to create an explicit / admin-initiated link.
"""

from __future__ import annotations

import json
import logging

import httpx
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.integration import OrgIntegration
from ..models.slack_user_link import SlackUserLink
from ..models.user import User

logger = logging.getLogger(__name__)

_SLACK_API = "https://slack.com/api"
_TIMEOUT = 10.0


async def _fetch_slack_profile(token: str, user_id: str) -> dict:
    """Return ``{"email": str, "email_verified": bool}`` from Slack users.info.

    On any error returns an empty dict.
    """
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(
                f"{_SLACK_API}/users.info",
                params={"user": user_id},
                headers={"Authorization": f"Bearer {token}"},
            )
            data = resp.json()
            if not data.get("ok"):
                logger.warning("Slack users.info error for %s: %s", user_id, data.get("error"))
                return {}
            profile = data.get("user", {}).get("profile", {})
            return {
                "email": profile.get("email", ""),
                "email_verified": bool(profile.get("email_verified", False)),
            }
    except Exception:
        logger.exception("Failed to fetch Slack profile for user %s", user_id)
        return {}


async def _resolve_org_from_slack_team(db: AsyncSession, slack_team_id: str) -> str | None:
    """Return the org_id whose Slack integration has ``team.id == slack_team_id``.

    Looks up active Slack ``OrgIntegration`` rows and parses their
    ``metadata_json`` to find a matching ``team.id``.
    """
    result = await db.execute(
        select(OrgIntegration).where(
            OrgIntegration.provider == "slack",
            OrgIntegration.status == "active",
        )
    )
    integrations = result.scalars().all()
    for integration in integrations:
        if not integration.metadata_json:
            continue
        try:
            meta = json.loads(integration.metadata_json)
        except (json.JSONDecodeError, TypeError):
            continue
        team = meta.get("team") or {}
        if isinstance(team, dict) and team.get("id") == slack_team_id:
            return integration.org_id
    return None


async def resolve_user_id(
    db: AsyncSession,
    slack_team_id: str,
    slack_user_id: str,
    slack_bot_token: str,
) -> str | None:
    """Return the platform ``user_id`` for a Slack user, or None if unresolvable.

    Resolution order:
      1. Existing ``SlackUserLink`` → fast path.
      2. Fetch Slack profile; if email is verified, look up ``User.email``
         within the org mapped from ``slack_team_id``.  On match, persist link.
      3. Return None.
    """
    # 1. Existing link
    link_result = await db.execute(
        select(SlackUserLink).where(
            SlackUserLink.slack_team_id == slack_team_id,
            SlackUserLink.slack_user_id == slack_user_id,
        )
    )
    existing = link_result.scalar_one_or_none()
    if existing is not None:
        return existing.user_id

    # 2. Auto-match via verified email
    profile = await _fetch_slack_profile(slack_bot_token, slack_user_id)
    if not profile.get("email_verified"):
        return None

    email = profile.get("email", "").strip().lower()
    if not email:
        return None

    org_id = await _resolve_org_from_slack_team(db, slack_team_id)
    if org_id is None:
        return None

    # Find user with matching email who belongs to this org
    from ..models.organization import OrgMember

    user_result = await db.execute(
        select(User)
        .join(OrgMember, OrgMember.user_id == User.id)
        .where(OrgMember.org_id == org_id, User.email == email)
    )
    user = user_result.scalar_one_or_none()
    if user is None:
        return None

    # Persist the link
    try:
        link = SlackUserLink(
            slack_team_id=slack_team_id,
            slack_user_id=slack_user_id,
            user_id=user.id,
            verified_via="email_match",
        )
        db.add(link)
        await db.commit()
        logger.info(
            "Auto-linked Slack user %s to platform user %s via email",
            slack_user_id,
            user.id,
        )
        return user.id
    except IntegrityError:
        await db.rollback()
        # Another process beat us to it — re-query
        link_result2 = await db.execute(
            select(SlackUserLink).where(
                SlackUserLink.slack_team_id == slack_team_id,
                SlackUserLink.slack_user_id == slack_user_id,
            )
        )
        existing2 = link_result2.scalar_one_or_none()
        return existing2.user_id if existing2 else None


async def link_user(
    db: AsyncSession,
    slack_team_id: str,
    slack_user_id: str,
    user: User,
    via: str,
) -> SlackUserLink:
    """Explicitly link a Slack user to a platform user.

    ``via`` should describe the mechanism used (e.g. ``"admin"`` or
    ``"email_match"``).  The new ``SlackUserLink`` is committed before return.
    """
    link = SlackUserLink(
        slack_team_id=slack_team_id,
        slack_user_id=slack_user_id,
        user_id=user.id,
        verified_via=via,
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)
    logger.info("Explicitly linked Slack user %s to platform user %s via %s", slack_user_id, user.id, via)
    return link
