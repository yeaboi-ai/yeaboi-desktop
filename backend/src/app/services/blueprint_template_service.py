from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.blueprint_template import BlueprintPersona, BlueprintSection, BlueprintTemplate
from ..models.video_avatar import VideoAvatar
from ..schemas.blueprint import ITERATION_TYPES
from ..services.facilitator import PERSONA_FOCUS_SECTIONS, PERSONA_PROMPTS

logger = logging.getLogger(__name__)

# Per-org seeding locks. The studio page fires 3 parallel requests
# (templates/personas/sections) on load — without this, all 3 see "empty"
# at the same time and each insert a full set of system rows. Process-local
# is fine here since the dev/prod backend runs as a single process per tenant.
_seed_locks: dict[str, asyncio.Lock] = {}

# ─── Human-readable persona metadata ─────────────────────────────────────────

_PERSONA_META: dict[str, dict[str, str]] = {
    "default": {
        "name": "Senior Engineer",
        "description": "Sharp, opinionated senior engineer focused on systems and trade-offs",
    },
    "pm": {"name": "Product Manager", "description": "Experienced PM focused on users, goals, and scope"},
    "architect": {
        "name": "System Architect",
        "description": "Architect focused on components, boundaries, and scalability",
    },
    "mentor": {"name": "Technical Mentor", "description": "Patient mentor who teaches concepts and guides decisions"},
    "challenger": {"name": "Devil's Advocate", "description": "Challenges every assumption and stress-tests ideas"},
}

# Default voice agent (system VideoAvatar) for each system persona slug, keyed by
# VideoAvatar.name. Picks one of the 5 phoenix-3 stock replicas seeded in
# v7w8x9y0z1a2_add_video_avatars so each persona has a distinct face/voice.
_PERSONA_DEFAULT_AVATAR_NAME: dict[str, str] = {
    "default": "Charlie",  # male, studio — sharp senior engineer
    "pm": "Anna",  # friendly female — PM
    "architect": "Benjamin",  # male, well-rounded — architect
    "mentor": "Olivia",  # calm female — mentor
    "challenger": "Luna",  # energetic female — devil's advocate
}


# ─── System sections ─────────────────────────────────────────────────────────

SYSTEM_SECTIONS = [
    ("project_overview", "Project Overview", "What the project does, who it's for, and the core value proposition"),
    ("goals_constraints", "Goals & Constraints", "Success criteria, timeline, budget, and technical constraints"),
    ("users_personas", "Users & Personas", "Target users, their needs, pain points, and usage patterns"),
    ("team_capacity", "Team & Capacity", "Team size, skills, sprint length, and available bandwidth"),
    ("architecture", "Architecture", "System components, how they connect, and data flow"),
    ("tech_stack", "Tech Stack", "Frontend, backend, database, and infrastructure choices"),
    ("api_integrations", "API & Integrations", "External APIs, SDKs, webhooks, and third-party services"),
    ("ui_ux", "UI/UX", "Interface style, key screens, navigation, and design principles"),
    ("security_compliance", "Security & Compliance", "Authentication, authorization, data protection, and compliance"),
    ("infrastructure", "Infrastructure", "Hosting, deployment, CI/CD, monitoring, and scaling approach"),
    ("risks_unknowns", "Risks & Unknowns", "Technical risks, blockers, and unresolved concerns"),
    ("out_of_scope", "Out of Scope", "Features and work explicitly excluded from this release"),
    ("open_questions", "Open Questions", "Decisions that still need to be made"),
]


# ─── Seeding ──────────────────────────────────────────────────────────────────


async def _seed_sections(org_id: str, db: AsyncSession) -> None:
    """Seed default blueprint sections for an org."""
    for sort_order, (slug, label, description) in enumerate(SYSTEM_SECTIONS):
        section = BlueprintSection(
            org_id=org_id,
            slug=slug,
            label=label,
            description=description,
            is_system=True,
            sort_order=sort_order,
        )
        db.add(section)
    await db.flush()
    logger.info("Seeded %d sections for org %s", len(SYSTEM_SECTIONS), org_id)


async def _seed_personas(org_id: str, db: AsyncSession) -> dict[str, str]:
    """Seed default personas for an org. Returns {slug: id} mapping."""
    slug_to_id: dict[str, str] = {}

    # Resolve VideoAvatar IDs by name once so every system persona gets a
    # distinct default voice agent.
    result = await db.execute(
        select(VideoAvatar.id, VideoAvatar.name).where(
            VideoAvatar.is_system.is_(True),
            VideoAvatar.deleted_at.is_(None),
        )
    )
    avatar_id_by_name = {row.name: row.id for row in result.all()}

    for sort_order, (slug, prompt) in enumerate(PERSONA_PROMPTS.items()):
        meta = _PERSONA_META.get(slug, {"name": slug.title(), "description": ""})
        focus = PERSONA_FOCUS_SECTIONS.get(slug, [])
        avatar_name = _PERSONA_DEFAULT_AVATAR_NAME.get(slug)
        video_avatar_id = avatar_id_by_name.get(avatar_name) if avatar_name else None

        persona = BlueprintPersona(
            org_id=org_id,
            slug=slug,
            name=meta["name"],
            description=meta["description"],
            system_prompt=prompt,
            focus_sections=focus,
            video_avatar_id=video_avatar_id,
            is_system=True,
            sort_order=sort_order,
        )
        db.add(persona)
        await db.flush()
        slug_to_id[slug] = persona.id

    logger.info("Seeded %d personas for org %s", len(slug_to_id), org_id)
    return slug_to_id


async def _heal_persona_avatar_links(org_id: str, db: AsyncSession) -> bool:
    """Backfill `BlueprintPersona.video_avatar_id` for existing system personas.

    Originally seeded by `_seed_personas`, but in worktrees provisioned by the
    schema-only `pg_dump` path (`scripts/worktree/setup.sh`), persona rows can
    end up materialised before any `video_avatars` rows exist — `_seed_personas`
    then captures an empty `avatar_id_by_name` map and writes NULL for every
    `video_avatar_id`. The seed function only links on INSERT, so once rows
    have NULL they never recover, and the UI's CHARACTER panel loses the
    pre-selected default per persona.

    This runs idempotently every time `ensure_org_blueprints` is called for an
    already-seeded org: zero writes when nothing is broken; otherwise one
    UPDATE per persona slug with a matching system avatar.

    Returns True iff at least one persona was linked (caller decides whether
    to commit). Returning a bool keeps the hot read path free of an
    unconditional `await db.commit()` that would otherwise flush a caller's
    in-flight ORM changes prematurely.
    """
    result = await db.execute(
        select(BlueprintPersona).where(
            BlueprintPersona.org_id == org_id,
            BlueprintPersona.is_system.is_(True),
            BlueprintPersona.video_avatar_id.is_(None),
        )
    )
    broken = result.scalars().all()
    if not broken:
        return False

    result = await db.execute(
        select(VideoAvatar.id, VideoAvatar.name).where(
            VideoAvatar.is_system.is_(True),
            VideoAvatar.deleted_at.is_(None),
        )
    )
    avatar_id_by_name = {row.name: row.id for row in result.all()}
    if not avatar_id_by_name:
        # No system avatars present yet — nothing to link against. The fresh-
        # worktree provision step (setup.sh, commit 2380ef4) copies these
        # before any user-driven seeding, so the absence here is recoverable:
        # next call after the rows land will heal.
        return False

    healed = 0
    for persona in broken:
        expected_avatar_name = _PERSONA_DEFAULT_AVATAR_NAME.get(persona.slug)
        if not expected_avatar_name:
            continue
        av_id = avatar_id_by_name.get(expected_avatar_name)
        if av_id is None:
            continue
        persona.video_avatar_id = av_id
        healed += 1
        logger.info(
            "blueprint_persona_avatar_linked persona=%s avatar=%s org=%s",
            persona.slug,
            expected_avatar_name,
            org_id,
        )

    if healed:
        await db.flush()
        return True
    return False


async def _seed_templates(org_id: str, persona_slug_to_id: dict[str, str], db: AsyncSession) -> None:
    """Seed default templates for an org using ITERATION_TYPES."""
    for sort_order, (slug, cfg) in enumerate(ITERATION_TYPES.items()):
        default_persona_slug = cfg.get("default_persona")
        default_persona_id = persona_slug_to_id.get(default_persona_slug) if default_persona_slug else None

        template = BlueprintTemplate(
            org_id=org_id,
            slug=slug,
            name=cfg["label"],
            description=cfg.get("description"),
            icon=cfg.get("icon", "zap"),
            sections=cfg["sections"],
            default_persona_id=default_persona_id,
            is_system=True,
            sort_order=sort_order,
        )
        db.add(template)

    await db.flush()
    logger.info("Seeded %d templates for org %s", len(ITERATION_TYPES), org_id)


async def ensure_org_blueprints(org_id: str, db: AsyncSession) -> None:
    """Check if personas/sections exist for org; if not, seed them.

    Guarded by a per-org asyncio lock so concurrent first-load requests
    don't all race past the existence check and seed duplicates.
    """
    lock = _seed_locks.setdefault(org_id, asyncio.Lock())
    async with lock:
        result = await db.execute(select(BlueprintPersona.id).where(BlueprintPersona.org_id == org_id).limit(1))
        has_personas = result.scalar_one_or_none() is not None

        result = await db.execute(select(BlueprintSection.id).where(BlueprintSection.org_id == org_id).limit(1))
        has_sections = result.scalar_one_or_none() is not None

        if has_personas and has_sections:
            # Even for fully-seeded orgs, run the avatar self-heal once: it's
            # a no-op when nothing is broken and the cure-on-next-call path
            # for orgs that were seeded before video_avatars existed. Only
            # commit when something was actually healed — otherwise a hot
            # read path would commit a caller's in-flight ORM changes if
            # this gets composed into a write endpoint.
            if await _heal_persona_avatar_links(org_id, db):
                await db.commit()
            return

        if not has_sections:
            await _seed_sections(org_id, db)

        if not has_personas:
            slug_to_id = await _seed_personas(org_id, db)
            await _seed_templates(org_id, slug_to_id, db)
        else:
            # has_sections was False but personas existed — heal here too.
            # The seeded sections below guarantee we'll commit regardless,
            # so the heal's bool return is informational only here.
            await _heal_persona_avatar_links(org_id, db)

        await db.commit()


# ─── Queries ──────────────────────────────────────────────────────────────────


async def get_org_templates(org_id: str, db: AsyncSession) -> list[BlueprintTemplate]:
    """List non-deleted templates for an org, ordered by sort_order."""
    result = await db.execute(
        select(BlueprintTemplate)
        .where(
            BlueprintTemplate.org_id == org_id,
            BlueprintTemplate.deleted_at.is_(None),
        )
        .order_by(BlueprintTemplate.sort_order)
    )
    return list(result.scalars().all())


async def get_org_personas(org_id: str, db: AsyncSession) -> list[BlueprintPersona]:
    """List non-deleted personas for an org, ordered by sort_order."""
    result = await db.execute(
        select(BlueprintPersona)
        .where(
            BlueprintPersona.org_id == org_id,
            BlueprintPersona.deleted_at.is_(None),
        )
        .order_by(BlueprintPersona.sort_order)
    )
    return list(result.scalars().all())


async def get_org_persona_by_slug(org_id: str, slug: str, db: AsyncSession) -> BlueprintPersona | None:
    """Single persona lookup by org and slug for facilitator use."""
    result = await db.execute(
        select(BlueprintPersona).where(
            BlueprintPersona.org_id == org_id,
            BlueprintPersona.slug == slug,
            BlueprintPersona.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def get_org_section_keys(org_id: str, db: AsyncSession) -> list[str]:
    """Get all section slugs for an org (standard + custom)."""
    await ensure_org_blueprints(org_id, db)
    result = await db.execute(
        select(BlueprintSection.slug)
        .where(
            BlueprintSection.org_id == org_id,
            BlueprintSection.deleted_at.is_(None),
        )
        .order_by(BlueprintSection.sort_order)
    )
    return list(result.scalars().all())


async def get_org_section_labels(org_id: str, db: AsyncSession) -> dict[str, str]:
    """Get section slug -> label mapping for an org."""
    await ensure_org_blueprints(org_id, db)
    result = await db.execute(
        select(BlueprintSection.slug, BlueprintSection.label).where(
            BlueprintSection.org_id == org_id,
            BlueprintSection.deleted_at.is_(None),
        )
    )
    return {row.slug: row.label for row in result.all()}


async def get_template_by_slug(org_id: str, slug: str, db: AsyncSession) -> BlueprintTemplate | None:
    """Single template lookup by org and slug."""
    result = await db.execute(
        select(BlueprintTemplate).where(
            BlueprintTemplate.org_id == org_id,
            BlueprintTemplate.slug == slug,
            BlueprintTemplate.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def get_template_sections(org_id: str, iteration_type: str, db: AsyncSession) -> list[str] | None:
    """Get sections for an iteration type from the DB. Returns None if not found (caller falls back)."""
    tmpl = await get_template_by_slug(org_id, iteration_type, db)
    return tmpl.sections if tmpl else None


async def get_persona_prompt_and_focus(
    org_id: str,
    persona_slug: str,
    db: AsyncSession,
) -> tuple[str | None, list[str] | None]:
    """Get custom persona prompt and focus sections. Returns (None, None) if not found."""
    p = await get_org_persona_by_slug(org_id, persona_slug, db)
    if p:
        return p.system_prompt, p.focus_sections
    return None, None
