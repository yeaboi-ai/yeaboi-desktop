"""Tests for blueprint_template_service.py — focused on the avatar self-heal
added for PR #94 review feedback. Covers the four documented branches of
`_heal_persona_avatar_links` plus the end-to-end `ensure_org_blueprints`
hot-read path that exercises the conditional-commit fix."""

import logging

import pytest
from sqlalchemy import select

from src.app.models.blueprint_template import BlueprintPersona, BlueprintSection
from src.app.models.video_avatar import VideoAvatar
from src.app.services.blueprint_template_service import (
    _heal_persona_avatar_links,
    ensure_org_blueprints,
)


# ── helpers ──────────────────────────────────────────────────────────


def _make_persona(org_id, slug, name, *, video_avatar_id=None, sort_order=0):
    return BlueprintPersona(
        org_id=org_id,
        slug=slug,
        name=name,
        description="",
        system_prompt="",
        focus_sections=[],
        video_avatar_id=video_avatar_id,
        is_system=True,
        sort_order=sort_order,
    )


def _make_avatar(name, *, replica_id="r-x"):
    return VideoAvatar(
        org_id=None,
        name=name,
        description=None,
        provider="tavus",
        replica_id=replica_id,
        preview_url=None,
        gender=None,
        voice_id=None,
        realtime_voice=None,
        voice_sample_url=None,
        is_system=True,
        sort_order=0,
    )


# ── _heal_persona_avatar_links ──────────────────────────────────────


@pytest.mark.asyncio
async def test_heal_no_broken_personas_returns_false(db_session, sample_org):
    """Healthy org: every system persona already linked → heal is a no-op
    returning False so the caller can skip db.commit() entirely."""
    avatar = _make_avatar("Charlie")
    db_session.add(avatar)
    await db_session.flush()
    db_session.add(_make_persona(sample_org.id, "default", "Senior Engineer", video_avatar_id=avatar.id))
    await db_session.commit()

    healed = await _heal_persona_avatar_links(sample_org.id, db_session)

    assert healed is False


@pytest.mark.asyncio
async def test_heal_no_avatars_available_returns_false(db_session, sample_org):
    """Broken personas exist but `video_avatars` is empty (the
    pre-2380ef4 worktree state). Heal must NOT raise and must return
    False so the caller doesn't redundantly commit. Next call after the
    rows finally land will heal."""
    db_session.add(_make_persona(sample_org.id, "default", "Senior Engineer"))
    db_session.add(_make_persona(sample_org.id, "pm", "Product Manager"))
    await db_session.commit()

    healed = await _heal_persona_avatar_links(sample_org.id, db_session)

    assert healed is False
    # Confirm the NULL FKs are still NULL — heal didn't manufacture anything.
    result = await db_session.execute(
        select(BlueprintPersona.video_avatar_id).where(BlueprintPersona.org_id == sample_org.id)
    )
    assert all(row[0] is None for row in result.all())


@pytest.mark.asyncio
async def test_heal_backfills_matching_avatars(db_session, sample_org, caplog):
    """The core fix: broken system personas with matching avatars get
    their `video_avatar_id` populated, and each link emits the
    `blueprint_persona_avatar_linked` log line so future regressions
    are grep-visible. Mapping must match
    `_PERSONA_DEFAULT_AVATAR_NAME` exactly (Charlie/Anna/Benjamin/Olivia/Luna)."""
    charlie = _make_avatar("Charlie", replica_id="r-charlie")
    anna = _make_avatar("Anna", replica_id="r-anna")
    db_session.add_all([charlie, anna])
    await db_session.flush()
    db_session.add(_make_persona(sample_org.id, "default", "Senior Engineer"))
    db_session.add(_make_persona(sample_org.id, "pm", "Product Manager", sort_order=1))
    await db_session.commit()

    with caplog.at_level(logging.INFO):
        healed = await _heal_persona_avatar_links(sample_org.id, db_session)
    await db_session.commit()

    assert healed is True
    result = await db_session.execute(
        select(BlueprintPersona.slug, BlueprintPersona.video_avatar_id)
        .where(BlueprintPersona.org_id == sample_org.id)
        .order_by(BlueprintPersona.slug)
    )
    linked = {slug: avatar_id for slug, avatar_id in result.all()}
    assert linked["default"] == charlie.id
    assert linked["pm"] == anna.id
    assert sum(1 for r in caplog.records if "blueprint_persona_avatar_linked" in r.message) == 2


@pytest.mark.asyncio
async def test_heal_skips_unknown_slug(db_session, sample_org):
    """A persona whose slug isn't in `_PERSONA_DEFAULT_AVATAR_NAME`
    (e.g. an org-defined custom persona that somehow ended up
    is_system=True) must be silently skipped — we don't have a
    canonical avatar for it, and guessing would be wrong."""
    db_session.add(_make_avatar("Charlie"))
    await db_session.flush()
    db_session.add(_make_persona(sample_org.id, "totally_unknown", "Unknown"))
    await db_session.commit()

    healed = await _heal_persona_avatar_links(sample_org.id, db_session)

    assert healed is False
    result = await db_session.execute(
        select(BlueprintPersona.video_avatar_id).where(BlueprintPersona.org_id == sample_org.id)
    )
    assert result.scalar_one() is None


# ── ensure_org_blueprints integration ───────────────────────────────


@pytest.mark.asyncio
async def test_ensure_org_blueprints_heals_already_seeded_org(db_session, sample_org):
    """The actual #94 scenario: org already has personas + sections
    (so the original early-return guard fired), but the persona's
    `video_avatar_id` is NULL because the row was seeded before the
    `video_avatars` row landed. `ensure_org_blueprints` must heal on
    next call without re-seeding."""
    charlie = _make_avatar("Charlie")
    db_session.add(charlie)
    await db_session.flush()
    db_session.add(
        BlueprintSection(
            org_id=sample_org.id,
            slug="project_overview",
            label="Project Overview",
            description="",
            is_system=True,
            sort_order=0,
        )
    )
    db_session.add(_make_persona(sample_org.id, "default", "Senior Engineer"))
    await db_session.commit()

    await ensure_org_blueprints(sample_org.id, db_session)

    persona = (
        await db_session.execute(
            select(BlueprintPersona).where(
                BlueprintPersona.org_id == sample_org.id, BlueprintPersona.slug == "default"
            )
        )
    ).scalar_one()
    assert persona.video_avatar_id == charlie.id


@pytest.mark.asyncio
async def test_ensure_org_blueprints_no_op_when_healthy(db_session, sample_org):
    """Hot read path: already-seeded org with already-linked avatars
    must complete without raising and without touching avatar state.
    Verifies the conditional-commit fix doesn't break the happy path."""
    charlie = _make_avatar("Charlie")
    db_session.add(charlie)
    await db_session.flush()
    db_session.add(
        BlueprintSection(
            org_id=sample_org.id, slug="project_overview", label="Project Overview",
            description="", is_system=True, sort_order=0,
        )
    )
    db_session.add(_make_persona(sample_org.id, "default", "Senior Engineer", video_avatar_id=charlie.id))
    await db_session.commit()

    await ensure_org_blueprints(sample_org.id, db_session)

    persona = (
        await db_session.execute(
            select(BlueprintPersona).where(BlueprintPersona.org_id == sample_org.id)
        )
    ).scalar_one()
    assert persona.video_avatar_id == charlie.id
