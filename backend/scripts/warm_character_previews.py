"""Pre-render every (system character × system persona) intro video on Tavus.

The studio's character preview is a Tavus-rendered MP4 keyed by
(character_id, persona_name). The first click on any fresh combo waits ~1
minute for Tavus to render. This script kicks off all combos in parallel
once, polls until everything is ready, and saves the results in
character_video_previews so studio clicks are instant from then on.

Run from the backend dir: `uv run python -m scripts.warm_character_previews`
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import sys
import time

import httpx
from sqlalchemy import select

from src.app.db import get_session_factory
from src.app.models.character_video_preview import CharacterVideoPreview
from src.app.models.video_avatar import VideoAvatar

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("warm")

TAVUS_API_BASE = "https://tavusapi.com/v2"

# System personas the studio ships with — slug → display name
SYSTEM_PERSONAS = [
    "Senior Engineer",
    "Product Manager",
    "System Architect",
    "Patient Mentor",
    "Devil's Advocate",
]


def intro_text(character_name: str, persona_name: str) -> str:
    flavour = {
        "senior engineer": "Let's dig into the trade-offs.",
        "product manager": "Let's keep this focused on what users need.",
        "system architect": "Let's design something that scales.",
        "patient mentor": "We'll go through this step by step.",
        "devil's advocate": "I'll stress-test every assumption.",
    }.get(persona_name.lower(), "")
    suffix = (" " + flavour).rstrip() if flavour else ""
    return f"Hi, I'm {character_name}. As your {persona_name}, I'm here to help.{suffix}"


def cache_key(character_id: str, persona_name: str) -> str:
    return hashlib.sha1(f"{character_id}|{persona_name.lower()}".encode()).hexdigest()


async def kick_off(client: httpx.AsyncClient, api_key: str, avatar: VideoAvatar, persona_name: str) -> str | None:
    payload = {
        "replica_id": avatar.replica_id,
        "script": intro_text(avatar.name, persona_name),
        "video_name": f"intro_{avatar.name.lower()}_{persona_name.lower().replace(' ', '_')}",
    }
    r = await client.post(
        f"{TAVUS_API_BASE}/videos",
        headers={"x-api-key": api_key, "Content-Type": "application/json"},
        json=payload,
        timeout=30.0,
    )
    if r.status_code not in (200, 201):
        logger.warning("Create failed for %s/%s: %s %s", avatar.name, persona_name, r.status_code, r.text[:200])
        return None
    return r.json().get("video_id")


async def poll_status(client: httpx.AsyncClient, api_key: str, video_id: str) -> dict:
    r = await client.get(
        f"{TAVUS_API_BASE}/videos/{video_id}",
        headers={"x-api-key": api_key},
        timeout=15.0,
    )
    return r.json() if r.status_code == 200 else {}


async def main() -> int:
    api_key = os.getenv("TAVUS_API_KEY")
    if not api_key:
        logger.error("TAVUS_API_KEY not set")
        return 1

    session_factory = get_session_factory()
    async with session_factory() as db:
        result = await db.execute(
            select(VideoAvatar).where(
                VideoAvatar.is_system.is_(True),
                VideoAvatar.deleted_at.is_(None),
            )
        )
        avatars = list(result.scalars().all())
        if not avatars:
            logger.error("No system video avatars found — nothing to warm")
            return 1

        logger.info(
            "Warming %d × %d = %d combos", len(avatars), len(SYSTEM_PERSONAS), len(avatars) * len(SYSTEM_PERSONAS)
        )

        # Find which combos are already cached so we skip them
        all_keys = {(a.id, p): cache_key(a.id, p) for a in avatars for p in SYSTEM_PERSONAS}
        existing_q = await db.execute(
            select(CharacterVideoPreview).where(CharacterVideoPreview.cache_key.in_(all_keys.values()))
        )
        existing = {row.cache_key: row for row in existing_q.scalars()}

        to_render: list[tuple[VideoAvatar, str, str]] = []  # (avatar, persona, cache_key)
        skipped_ready = 0
        for a in avatars:
            for p in SYSTEM_PERSONAS:
                ck = all_keys[(a.id, p)]
                row = existing.get(ck)
                if row and row.status == "ready" and row.video_url:
                    skipped_ready += 1
                    continue
                to_render.append((a, p, ck))

        logger.info("%d already ready (skipping), %d to render", skipped_ready, len(to_render))

        if not to_render:
            logger.info("Nothing to do.")
            return 0

        async with httpx.AsyncClient() as client:
            # Kick all off (or pick up existing in-flight video_ids)
            in_flight: dict[str, tuple[VideoAvatar, str]] = {}  # video_id → (avatar, persona)
            for a, p, ck in to_render:
                row = existing.get(ck)
                if row and row.tavus_video_id:
                    logger.info("Resuming poll: %s × %s (video_id=%s)", a.name, p, row.tavus_video_id)
                    in_flight[row.tavus_video_id] = (a, p)
                    continue
                vid = await kick_off(client, api_key, a, p)
                if not vid:
                    continue
                logger.info("Started: %s × %s → video_id=%s", a.name, p, vid)
                if row:
                    row.tavus_video_id = vid
                    row.status = "generating"
                else:
                    db.add(
                        CharacterVideoPreview(
                            cache_key=ck,
                            character_id=a.id,
                            persona_name=p,
                            status="generating",
                            tavus_video_id=vid,
                        )
                    )
                in_flight[vid] = (a, p)
            await db.commit()

            # Poll all to completion
            deadline = time.time() + 60 * 15  # 15-min cap
            while in_flight and time.time() < deadline:
                for vid in list(in_flight):
                    try:
                        data = await poll_status(client, api_key, vid)
                    except Exception as e:
                        logger.warning("Poll error %s: %s", vid, e)
                        continue
                    st = data.get("status")
                    a, p = in_flight[vid]
                    if st == "ready":
                        url = data.get("download_url") or data.get("hosted_url")
                        ck = cache_key(a.id, p)
                        row = (
                            await db.execute(select(CharacterVideoPreview).where(CharacterVideoPreview.cache_key == ck))
                        ).scalar_one_or_none()
                        if row:
                            row.status = "ready"
                            row.video_url = url
                            await db.commit()
                        logger.info("READY %s × %s → %s", a.name, p, url[:70] if url else "(no url)")
                        in_flight.pop(vid)
                    elif st == "error":
                        logger.warning("ERROR %s × %s: %s", a.name, p, data.get("status_details"))
                        in_flight.pop(vid)
                    else:
                        progress = data.get("generation_progress") or "?/?"
                        logger.info("%s × %s: %s (%s)", a.name, p, st, progress)
                if in_flight:
                    await asyncio.sleep(15)

        if in_flight:
            logger.warning("Timed out with %d still in flight", len(in_flight))
            return 2
        logger.info("Done. All %d combos cached.", len(to_render))
        return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
