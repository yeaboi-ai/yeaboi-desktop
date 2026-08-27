"""Voice config resolution service.

Resolves effective voice settings using a three-tier cascade:
  org defaults (AI Settings)
    → character (video avatar bundle: voice + video are matched)
    → hardcoded defaults

Per-persona voice fields (voice_id, speed, emotion, language, realtime_voice)
were retired when characters became the source of truth for voice.
"""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.blueprint_template import BlueprintPersona
from ..models.org_ai_defaults import OrgAIDefaults
from ..models.video_avatar import VideoAvatar

logger = logging.getLogger(__name__)

VOICE_FIELDS = ("voice_id", "speed", "emotion", "language", "realtime_voice")

HARDCODED_DEFAULTS: dict[str, str | float | None] = {
    "voice_id": None,
    "speed": 1.0,
    "emotion": "neutral",
    "language": "en",
    "realtime_voice": "alloy",
}


async def _get_persona(org_id: str, persona_slug: str, db: AsyncSession) -> BlueprintPersona | None:
    result = await db.execute(
        select(BlueprintPersona).where(
            BlueprintPersona.org_id == org_id,
            BlueprintPersona.slug == persona_slug,
            BlueprintPersona.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def _get_org_defaults(org_id: str, db: AsyncSession) -> OrgAIDefaults | None:
    result = await db.execute(select(OrgAIDefaults).where(OrgAIDefaults.org_id == org_id))
    return result.scalar_one_or_none()


async def resolve_voice_config(
    org_id: str,
    persona_slug: str,
    db: AsyncSession,
    *,
    override_video_avatar_id: str | None = None,
) -> dict:
    """Resolve effective voice settings.

    Cascade (highest priority first):
      1. Org defaults (AI Settings) — users can override during a call
      2. The effective character (video_avatar). The session-level override
         (set via the in-call Settings drawer) wins over the persona's global
         default (set in the Studio).
      3. Hardcoded defaults
    """
    persona = await _get_persona(org_id, persona_slug, db)
    org_defaults = await _get_org_defaults(org_id, db)

    # Effective character: session override → persona default. This must match
    # what get_session_ai_config uses for the avatar payload, otherwise the
    # voice and the on-screen avatar drift apart (different character).
    effective_avatar_id = override_video_avatar_id or (persona.video_avatar_id if persona else None)
    character: VideoAvatar | None = None
    if effective_avatar_id:
        char_result = await db.execute(
            select(VideoAvatar).where(
                VideoAvatar.id == effective_avatar_id,
                VideoAvatar.deleted_at.is_(None),
            )
        )
        character = char_result.scalar_one_or_none()

    result: dict[str, str | float | None] = {}
    for field in VOICE_FIELDS:
        org_val = getattr(org_defaults, field, None) if org_defaults else None
        char_val = getattr(character, field, None) if character else None
        if org_val is not None:
            result[field] = org_val
        elif char_val is not None:
            result[field] = char_val
        else:
            result[field] = HARDCODED_DEFAULTS[field]

    return result


async def get_or_create_org_defaults(org_id: str, db: AsyncSession) -> OrgAIDefaults:
    """Get existing org defaults or create an empty row."""
    defaults = await _get_org_defaults(org_id, db)
    if defaults is None:
        defaults = OrgAIDefaults(org_id=org_id)
        db.add(defaults)
        await db.flush()
    return defaults
