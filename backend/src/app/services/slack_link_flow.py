"""Handle the `/planr link <email>` sub-command.

Links a Slack user to their Planr account by email.
"""

from __future__ import annotations

import logging

from fastapi import BackgroundTasks
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.user import User
from .slack_user_resolver import link_user

logger = logging.getLogger(__name__)


def _ephemeral(text: str) -> dict:
    return {"response_type": "ephemeral", "text": text}


async def handle_link_command(db: AsyncSession, fields: dict, bt: BackgroundTasks) -> dict:
    """Handle `/planr link [email]`.

    If ``fields["rest"]`` is empty → prompt for email.
    Looks up the User by email; if not found → error.
    On success → creates the link and confirms.
    """
    email = (fields.get("rest") or "").strip().lower()
    if not email:
        return _ephemeral("Please include your Planr email: `/planr link you@company.com`")

    # Look up user by email
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        return _ephemeral(f"No Planr user found for `{email}`.")

    slack_team_id = fields.get("team_id", "")
    slack_user_id = fields.get("user_id", "")

    await link_user(db, slack_team_id, slack_user_id, user, via="explicit")

    logger.info(
        "Linked Slack user %s (team %s) to Planr user %s via /planr link",
        slack_user_id,
        slack_team_id,
        user.id,
    )

    # Optionally notify the user via email in the background
    try:
        from .email_service import send_invite_email

        bt.add_task(
            send_invite_email,
            to_email=user.email,
            inviter_name="Planr",
            inviter_email="noreply@planr.app",
        )
    except Exception:
        # Email notification is best-effort; never fail the command
        pass

    return _ephemeral(f"Linked. You can now use Planr from Slack as `{email}`.")
