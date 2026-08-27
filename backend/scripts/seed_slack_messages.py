"""Seed a Slack channel with realistic-looking dev team messages.

Uses the bot token stored in the org's Slack integration, so it only works
after the Slack OAuth flow has completed. Posts a mixed bag of messages that
look like a genuine engineering team chat so the scan has useful content to
summarise.

Usage::

    cd backend
    uv run python scripts/seed_slack_messages.py <channel_id>

Where ``<channel_id>`` is a Slack channel id (e.g. C0123ABC) the bot is a
member of. Find it via Slack's "Copy link to channel" on the channel header
(the id is the last segment of the URL).
"""

from __future__ import annotations

import asyncio
import random
import sys
import time

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

# Allow running from the `backend` dir without installing the package
sys.path.insert(0, "src")

from app.config import get_settings  # noqa: E402
from app.models.integration import OrgIntegration  # noqa: E402
from app.services.crypto import decrypt_api_key  # noqa: E402

# ---------------------------------------------------------------------------
# Seed messages — mixed, plausible, with references an AI can pick out
# ---------------------------------------------------------------------------

MESSAGES: list[str] = [
    # Product / planning
    "Quick heads-up: the new onboarding flow spec just landed, happy to walk anyone through it on a call.",
    "Can we align on whether board filters should persist across sessions or reset? My vote is persist.",
    "Design review for the canvas v2 changes is on Thursday — anyone else want to join?",
    "Reminder: the demo with the stripe team is Tuesday next week, pipeline dashboard must be wired up by then.",
    "I think we should move the AI provider picker out of settings into its own screen, it's getting cramped.",
    # Engineering / tech
    "Just merged the facilitator streaming fix (#412). Tokens down ~30% per session from caching prompt prefix.",
    "Heads up: the orchestrator kept retrying a failed GitHub merge earlier. Added a circuit breaker — PR #427.",
    "Can someone review https://github.com/planr/planr/pull/431 ? It's the session-context retrieval tools.",
    "Getting 500s on /api/boards/{id}/cards for a big board (1k+ cards). N+1 on the assignee eager load.",
    "Moved the embeddings index from pgvector to Qdrant — should be ~3x faster on directory search.",
    "WebSocket reconnect logic in session_ws.py was dropping messages under load. Queued writes now buffer.",
    "Spiked Supabase vs Neon for multi-region. Neon wins on branching, Supabase wins on realtime. Leaning Neon.",
    # Incidents / ops
    "Mailpit container was eating 4GB ram last night — restarted, added a memory limit to docker-compose.",
    "Postgres pool exhaustion at ~150 concurrent sessions. Bumped pool_size to 40 but that's a bandaid.",
    "Sentry is flagging a TypeError in harness_generator.py when the repo has no package.json. Easy fix.",
    # Team / social
    "Anyone want to do a lunch walk at 1? :walking:",
    "Congrats to @maria on the release — the new kanban WebSocket sync is so much smoother.",
    "Working from the Shoreditch office tomorrow if anyone wants to pair on the voice agent refactor.",
    # Decisions / links
    "Decision: dropping the custom TTS pipeline for ElevenLabs. https://www.notion.so/planr/decisions/tts",
    "Here's the Q2 roadmap one-pager https://www.notion.so/planr/q2-roadmap — please comment by Friday.",
    "Runbook for the Neon migration is pinned https://www.notion.so/planr/runbooks/neon-migration",
    # Questions / asks
    "Does anyone know why the livekit agent ignores the first turn after reconnect? Seeing it in staging.",
    "What's the story on billing? Have we decided on per-seat vs per-session?",
    "Has anyone looked at the cost of running the embeddings pipeline at scale? AWS bill is creeping up.",
    # Outages / follow-ups
    "Postmortem from Tuesday's outage is drafted — https://www.notion.so/planr/postmortems/2026-04-14",
    "The flaky test in test_orchestrator.py is back. @alex can you take another look this week?",
]


async def _load_bot_token(db_url: str) -> tuple[str, str] | None:
    """Return (bot_token, team_name) for the most recent active Slack integration."""
    engine = create_async_engine(db_url, pool_pre_ping=True)
    async with async_sessionmaker(engine, expire_on_commit=False)() as db:
        result = await db.execute(
            select(OrgIntegration).where(
                OrgIntegration.provider == "slack",
                OrgIntegration.status == "active",
            )
        )
        integration = result.scalars().first()
        if not integration or not integration.access_token:
            print("No active Slack integration found. Connect Slack in Planr first.", file=sys.stderr)
            return None
        token = decrypt_api_key(integration.access_token)
        return token, integration.id
    await engine.dispose()


async def _post_message(client: httpx.AsyncClient, token: str, channel: str, text: str) -> None:
    resp = await client.post(
        "https://slack.com/api/chat.postMessage",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=utf-8",
        },
        json={"channel": channel, "text": text},
    )
    if resp.status_code != 200:
        print(f"[HTTP {resp.status_code}] {resp.text[:200]}", file=sys.stderr)
        return
    data = resp.json()
    if not data.get("ok"):
        print(f"[Slack error] {data.get('error')}", file=sys.stderr)
        return
    print(f"  posted: {text[:80]}{'…' if len(text) > 80 else ''}")


async def _resolve_channel(client: httpx.AsyncClient, token: str, name_or_id: str) -> str | None:
    """Return a channel id, looking up by name if the input isn't already an id."""
    arg = name_or_id.lstrip("#").strip()
    # Slack channel ids start with C (public) or G (private legacy)
    if arg.startswith(("C", "G")) and arg.isupper() and arg[1:].isalnum():
        return arg

    cursor = ""
    for _ in range(5):
        resp = await client.get(
            "https://slack.com/api/conversations.list",
            headers={"Authorization": f"Bearer {token}"},
            params={
                "types": "public_channel,private_channel",
                "exclude_archived": "true",
                "limit": 200,
                "cursor": cursor,
            },
        )
        data = resp.json()
        if not data.get("ok"):
            print(f"[Slack error listing channels] {data.get('error')}", file=sys.stderr)
            return None
        for ch in data.get("channels", []) or []:
            if ch.get("name") == arg:
                return ch.get("id")
        cursor = (data.get("response_metadata") or {}).get("next_cursor", "") or ""
        if not cursor:
            break
    print(f"No channel found named '{arg}'. Is the bot a member?", file=sys.stderr)
    return None


async def main() -> None:
    if len(sys.argv) < 2:
        print(
            "Usage: uv run python scripts/seed_slack_messages.py <channel_name_or_id> [count]",
            file=sys.stderr,
        )
        sys.exit(1)

    channel_arg = sys.argv[1]
    count = int(sys.argv[2]) if len(sys.argv) > 2 else len(MESSAGES)

    settings = get_settings()
    loaded = await _load_bot_token(str(settings.database_url))
    if not loaded:
        sys.exit(1)

    token, integration_id = loaded
    print(f"Using Slack integration {integration_id}")

    async with httpx.AsyncClient(timeout=20.0) as client:
        channel_id = await _resolve_channel(client, token, channel_arg)
        if not channel_id:
            sys.exit(1)

        # Shuffle so the order looks organic rather than canned
        messages = MESSAGES.copy()
        random.shuffle(messages)
        messages = messages[: min(count, len(messages))]

        print(f"Posting {len(messages)} messages to {channel_id} ({channel_arg})…")
        for i, text in enumerate(messages, start=1):
            await _post_message(client, token, channel_id, text)
            # Slack tier-3 rate limit is ~50 rpm; sleep a short jittered delay
            if i < len(messages):
                await asyncio.sleep(0.6 + (time.time() % 0.4))

    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
