"""Slack scan connector — reads channels and messages via Slack Web API.

Scope:
  - Auth via OAuth (bot token xoxb-*), scopes negotiated at install time.
  - Lists channels the bot is a member of (public + private the bot was invited to).
  - Fetches recent messages per channel.
  - Resolves <@Uxxx> and <#Cxxx> mentions to human-readable names.
  - Filters secrets before AI analysis.
  - Produces:
      * one entry per channel (communication/<team-slug>/<channel-name>)
      * one workspace-level overview entry (communication/<team-slug>)
"""

from __future__ import annotations

import json
import logging
import re

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...models.integration import OrgIntegration
from ...services.ai_provider import get_ai_client
from ...services.crypto import decrypt_api_key
from ...services.secret_filter import redact_secrets
from .prompting import system_prompt
from .scan_runner import ScanRunner, with_retry

logger = logging.getLogger(__name__)

SLACK_API = "https://slack.com/api"

_MESSAGES_PER_CHANNEL = 200
_CHANNEL_CATEGORIES: tuple[str, ...] = (
    "architecture",
    "frontend",
    "backend",
    "infrastructure",
    "security",
    "services",
    "documentation",
)


# ---------------------------------------------------------------------------
# Mention resolution + cleanup
# ---------------------------------------------------------------------------


_MENTION_USER = re.compile(r"<@([UW][A-Z0-9]+)(?:\|[^>]*)?>")
_MENTION_CHANNEL = re.compile(r"<#([CG][A-Z0-9]+)(?:\|([^>]*))?>")
_LINK_WITH_LABEL = re.compile(r"<(https?://[^|>]+)\|([^>]+)>")
_LINK_BARE = re.compile(r"<(https?://[^>]+)>")


def _resolve_mentions(text: str, users: dict[str, str], channels: dict[str, str]) -> str:
    """Replace <@U123>/<#C456>/<http…|label> with readable equivalents."""
    if not text:
        return ""

    text = _MENTION_USER.sub(
        lambda m: f"@{users.get(m.group(1), m.group(1))}",
        text,
    )
    text = _MENTION_CHANNEL.sub(
        lambda m: f"#{m.group(2) or channels.get(m.group(1), m.group(1))}",
        text,
    )
    text = _LINK_WITH_LABEL.sub(r"\2 (\1)", text)
    text = _LINK_BARE.sub(r"\1", text)
    return text


def _slugify(text: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", (text or "").lower()).strip("-")
    return slug[:80] or "untitled"


# ---------------------------------------------------------------------------
# Prompt builders
# ---------------------------------------------------------------------------


def _build_channel_prompt(channel_name: str, topic: str, purpose: str, messages: list[dict]) -> str:
    """Build an AI prompt summarising a Slack channel.

    Each message is shown as ``@user: text``, truncated to 400 chars each.
    """
    parts = [f"Slack channel: #{channel_name}"]
    if topic:
        parts.append(f"Topic: {topic}")
    if purpose:
        parts.append(f"Purpose: {purpose}")

    parts.append(f"Messages sampled: {len(messages)}")
    parts.append("")
    parts.append("--- Messages (most recent first) ---")

    for msg in messages[:_MESSAGES_PER_CHANNEL]:
        user = msg.get("user_name") or msg.get("user") or "unknown"
        text = (msg.get("text") or "").strip()
        if not text:
            continue
        truncated = text[:400]
        if len(text) > 400:
            truncated += "…"
        parts.append(f"@{user}: {truncated}")

    parts.append("")
    parts.append(
        "Summarise this channel for a team knowledge directory. Cover: what is "
        "actually discussed here (not the channel's stated purpose), key decisions "
        "or open threads, recurring pain points, useful links/references worth "
        "pulling out. 200-400 words, concrete specifics only."
    )
    return "\n".join(parts)


def _build_workspace_prompt(team_name: str, channel_summaries: list[dict]) -> str:
    """Build a workspace-level overview from the per-channel summaries."""
    parts = [
        f"Slack workspace: {team_name}",
        f"Channels scanned: {len(channel_summaries)}",
        "",
        "--- Channel summaries ---",
    ]
    for entry in channel_summaries[:40]:
        name = entry.get("name", "unknown")
        summary = (entry.get("summary") or "")[:1200]
        parts.append(f"\n### #{name}\n{summary}")

    parts.append("")
    parts.append(
        "Write a workspace-level overview for a team knowledge directory. Cover: "
        "main topics the team communicates about, how engineering/product/support "
        "channels are organised, signals about delivery rhythm and ownership, "
        "and anything notable about how they use Slack. 200-400 words."
    )
    return "\n".join(parts)


def _build_classifier_prompt(channel_summaries: list[dict]) -> str:
    """Ask the AI to pick a category for each channel in one batched call."""
    parts = [
        "For EACH Slack channel below, output ONE JSON object with:",
        "  - name: the channel name verbatim",
        f"  - category: one of {list(_CHANNEL_CATEGORIES)} — pick the best fit",
        "",
        "Return ONLY a JSON array, no commentary, no code fences.",
        "",
        "--- Channels ---",
    ]
    for entry in channel_summaries:
        name = entry.get("name", "")
        summary = (entry.get("summary") or "")[:800]
        parts.append(f"\n[name: {name}]\n{summary}")
    return "\n".join(parts)


def _parse_classifier_output(raw: str) -> dict[str, str]:
    text = raw.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        logger.warning("Slack channel classifier output was not valid JSON")
        return {}

    if not isinstance(parsed, list):
        return {}

    out: dict[str, str] = {}
    for item in parsed:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        category = str(item.get("category") or "documentation").strip().lower()
        if category not in _CHANNEL_CATEGORIES:
            category = "documentation"
        out[name] = category
    return out


# ---------------------------------------------------------------------------
# Slack API helpers
# ---------------------------------------------------------------------------


@with_retry
async def _slack_get(client: httpx.AsyncClient, method: str, token: str, **params) -> dict | None:
    """Call a Slack Web API method. Returns parsed JSON or None on ``ok=false``."""
    resp = await client.get(
        f"{SLACK_API}/{method}",
        headers={"Authorization": f"Bearer {token}"},
        params=params,
    )
    resp.raise_for_status()
    data = resp.json()
    if not data.get("ok"):
        logger.warning("Slack %s returned error: %s", method, data.get("error"))
        return None
    return data


async def _build_user_cache(client: httpx.AsyncClient, token: str) -> dict[str, str]:
    """Fetch the workspace user list and return id→display name."""
    cache: dict[str, str] = {}
    cursor = ""
    for _ in range(5):  # safety cap — up to 1000 users
        data = await _slack_get(client, "users.list", token, limit=200, cursor=cursor)
        if not data:
            break
        for member in data.get("members", []) or []:
            uid = member.get("id")
            if not uid:
                continue
            profile = member.get("profile") or {}
            name = (
                profile.get("display_name")
                or profile.get("real_name")
                or member.get("real_name")
                or member.get("name")
                or uid
            )
            cache[uid] = name
        cursor = (data.get("response_metadata") or {}).get("next_cursor", "") or ""
        if not cursor:
            break
    return cache


async def _build_channel_cache(client: httpx.AsyncClient, token: str) -> dict[str, str]:
    """Return channel id→name for the workspace (public + private)."""
    cache: dict[str, str] = {}
    cursor = ""
    for _ in range(5):
        data = await _slack_get(
            client,
            "conversations.list",
            token,
            types="public_channel,private_channel",
            exclude_archived="true",
            limit=200,
            cursor=cursor,
        )
        if not data:
            break
        for ch in data.get("channels", []) or []:
            cid = ch.get("id")
            if cid:
                cache[cid] = ch.get("name") or cid
        cursor = (data.get("response_metadata") or {}).get("next_cursor", "") or ""
        if not cursor:
            break
    return cache


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


async def run(runner: ScanRunner, db: AsyncSession) -> None:
    """Main scan entry point: auth, list joined channels, summarise each."""
    await runner.start(scan_type="full")

    try:
        # 1. Load integration and decrypt OAuth token
        result = await db.execute(select(OrgIntegration).where(OrgIntegration.id == runner.integration_id))
        integration = result.scalar_one_or_none()

        if not integration:
            await runner.fail("Integration not found")
            return

        if not integration.access_token:
            await runner.fail("No Slack OAuth token configured")
            return

        token = decrypt_api_key(integration.access_token)

        async with httpx.AsyncClient(timeout=30) as client:
            # 2. Verify token + resolve team identity
            auth = await _slack_get(client, "auth.test", token)
            if not auth:
                await runner.fail("Slack auth.test failed — token invalid or revoked")
                return

            team_name = auth.get("team") or "Slack"
            team_id = auth.get("team_id") or ""
            team_slug = _slugify(team_name)

            await runner.log_status(f"Connected as {auth.get('user')} in workspace {team_name}")

            # 3. Build user + channel caches for mention resolution
            users = await _build_user_cache(client, token)
            channels_by_id = await _build_channel_cache(client, token)
            logger.info("Slack caches built: users=%d channels=%d", len(users), len(channels_by_id))

            # 4. List channels the bot is a member of
            channels: list[dict] = []
            cursor = ""
            for _ in range(5):
                data = await _slack_get(
                    client,
                    "conversations.list",
                    token,
                    types="public_channel,private_channel",
                    exclude_archived="true",
                    limit=200,
                    cursor=cursor,
                )
                if not data:
                    break
                for ch in data.get("channels", []) or []:
                    if ch.get("is_member"):
                        channels.append(ch)
                cursor = (data.get("response_metadata") or {}).get("next_cursor", "") or ""
                if not cursor:
                    break

            if not channels:
                await runner.log_status(
                    "Bot isn't a member of any channel yet — invite it via `/invite @Planr` "
                    "in the channels you want scanned."
                )
                await runner.complete()
                return

            logger.info("Slack scan: %d channels the bot has access to", len(channels))

            # 5. Summarise each channel
            ai_client = await get_ai_client(runner.org_id, db, task="default")
            workspace_path = f"communication/{team_slug}"
            channel_summaries: list[dict] = []

            for ch in channels:
                cid = ch.get("id")
                cname = ch.get("name", cid or "unknown")
                topic = ((ch.get("topic") or {}).get("value") or "").strip()
                purpose = ((ch.get("purpose") or {}).get("value") or "").strip()

                try:
                    history = await _slack_get(
                        client,
                        "conversations.history",
                        token,
                        channel=cid,
                        limit=_MESSAGES_PER_CHANNEL,
                    )
                    raw_messages = history.get("messages", []) if history else []

                    cleaned: list[dict] = []
                    for msg in raw_messages:
                        if msg.get("subtype") in {"channel_join", "channel_leave"}:
                            continue
                        text = _resolve_mentions(
                            msg.get("text") or "",
                            users,
                            channels_by_id,
                        )
                        text = redact_secrets(text)
                        if not text:
                            continue
                        cleaned.append(
                            {
                                "user_name": users.get(msg.get("user") or "", msg.get("user") or "unknown"),
                                "text": text,
                                "ts": msg.get("ts"),
                            }
                        )

                    if not cleaned:
                        logger.debug("Channel #%s had no usable messages, skipping", cname)
                        await runner.record_item(
                            resource_path=f"slack/{cname}",
                            action="skipped",
                            reason="no message content",
                        )
                        continue

                    prompt = _build_channel_prompt(cname, topic, purpose, cleaned)
                    summary, tokens_used = await ai_client.chat_with_usage(
                        system=system_prompt("Slack", role="team communications analyst"),
                        messages=[{"role": "user", "content": prompt}],
                        max_tokens=1500,
                    )
                    channel_summaries.append(
                        {
                            "id": cid,
                            "name": cname,
                            "summary": summary,
                            "tokens": tokens_used,
                        }
                    )
                    logger.info("Slack channel summarised: %s", cname)

                except Exception:
                    logger.exception("Failed to summarise Slack channel %s", cname)
                    await runner.record_item(
                        resource_path=f"slack/{cname}",
                        action="failed",
                        reason="channel scan error",
                    )

            if not channel_summaries:
                await runner.complete()
                return

            # 6. Classify channels into categories (batched)
            classifier_prompt = _build_classifier_prompt(channel_summaries)
            classifier_raw, classifier_tokens = await ai_client.chat_with_usage(
                system=(
                    "You are a technical knowledge librarian. Classify channels into "
                    "categories as JSON. Never include commentary outside the JSON."
                ),
                messages=[{"role": "user", "content": classifier_prompt}],
                max_tokens=1024,
            )
            classified = _parse_classifier_output(classifier_raw)
            await runner.record_item(
                resource_path=f"slack/{team_slug}/_classifier",
                action="scanned",
                ai_model=ai_client.model,
                tokens_used=classifier_tokens,
            )

            # 7. Workspace overview
            workspace_prompt = _build_workspace_prompt(team_name, channel_summaries)
            overview, overview_tokens = await ai_client.chat_with_usage(
                system=system_prompt("Slack", role="team communications analyst"),
                messages=[{"role": "user", "content": workspace_prompt}],
                max_tokens=1500,
            )
            workspace_entry, workspace_action = await runner.upsert_entry(
                path=workspace_path,
                title=f"Slack — {team_name}",
                content=overview,
                category="documentation",
                source_ref=f"slack:team:{team_id}",
            )
            await runner.record_item(
                resource_path=f"slack/{team_slug}",
                action=workspace_action,
                ai_model=ai_client.model,
                tokens_used=overview_tokens,
                directory_entry_id=workspace_entry.id,
            )

            # 8. Upsert each channel with its classified category and parent it
            for entry_summary in channel_summaries:
                name = entry_summary["name"]
                category = classified.get(name, "documentation")
                channel_path = f"{workspace_path}/{_slugify(name)}"

                try:
                    entry, action = await runner.upsert_entry(
                        path=channel_path,
                        title=f"Slack — #{name}",
                        content=entry_summary["summary"],
                        category=category,
                        source_ref=f"slack:channel:{entry_summary['id']}",
                    )
                    if entry.parent_id != workspace_entry.id:
                        entry.parent_id = workspace_entry.id

                    await runner.record_item(
                        resource_path=f"slack/{name}",
                        action=action,
                        ai_model=ai_client.model,
                        tokens_used=entry_summary.get("tokens"),
                        directory_entry_id=entry.id,
                    )
                except Exception:
                    logger.exception("Failed to upsert Slack channel entry %s", name)
                    await runner.record_item(
                        resource_path=f"slack/{name}",
                        action="failed",
                        reason="channel upsert error",
                    )

            # Ensure parent_id updates are persisted
            await db.commit()

        await runner.complete()

    except Exception as exc:
        logger.exception("Slack scan failed")
        await runner.fail(str(exc))
