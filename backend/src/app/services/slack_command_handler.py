"""Slack slash command dispatcher.

Parses the subcommand from ``fields["text"]`` and routes to the appropriate
handler.  Unknown or missing subcommands fall through to ``/planr help``.
"""

from __future__ import annotations

import logging

from fastapi import BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

HELP_TEXT = """:wave: *yeaboi slash commands*

• `/planr help` — show this message
• `/planr link <your@email>` — link your Slack account to yeaboi
• `/planr ask <question>` — ask yeaboi a question about your projects
• `/planr summarise <session title>` — summarise a planning session
• `/planr session <title>` — create a new planning session

_Need richer interaction? Open the yeaboi web app._
"""


def _ephemeral(text: str) -> dict:
    return {"response_type": "ephemeral", "text": text}


async def handle(db: AsyncSession, fields: dict, background_tasks: BackgroundTasks) -> dict:
    """Handle an incoming Slack slash command.

    ``fields`` is the parsed form-encoded body from Slack.  Returns a dict that
    will be JSON-serialised back to Slack as the immediate response.
    """
    command = fields.get("command", "/planr")
    raw_text = (fields.get("text") or "").strip()

    logger.info("Received Slack slash command: %s text=%r", command, raw_text)

    if not raw_text:
        return _ephemeral(HELP_TEXT)

    parts = raw_text.split(None, 1)
    subcommand = parts[0].lower()
    rest = parts[1] if len(parts) > 1 else ""
    fields = {**fields, "rest": rest}

    if subcommand == "help":
        return _ephemeral(HELP_TEXT)

    if subcommand == "link":
        from .slack_link_flow import handle_link_command

        return await handle_link_command(db, fields, background_tasks)

    if subcommand == "ask":
        from .slack_query_flow import handle_ask

        return await handle_ask(db, fields, background_tasks)

    if subcommand in ("summarise", "summarize"):
        from .slack_query_flow import handle_summarise

        return await handle_summarise(db, fields, background_tasks)

    if subcommand == "session":
        from .slack_query_flow import handle_session_create

        return await handle_session_create(db, fields, background_tasks)

    # Unknown subcommand → fall through to help
    logger.info("Unknown yeaboi subcommand %r — returning help", subcommand)
    return _ephemeral(HELP_TEXT)
