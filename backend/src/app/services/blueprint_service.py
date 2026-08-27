import logging
from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.blueprint import BlueprintIteration, BlueprintSnapshot, BlueprintSuggestion
from ..schemas.blueprint import EMPTY_BLUEPRINT

logger = logging.getLogger(__name__)


class ConcurrentBlueprintUpdate(Exception):
    """Raised when an optimistic-concurrency update_section call sees a
    version mismatch — the blueprint moved underneath the caller."""


# ─── Iteration Management ───────────────────────────────────────────────────


async def get_or_create_iteration(project_id: str, db: AsyncSession, org_id: str | None = None) -> BlueprintIteration:
    """Get the latest iteration for a project, or create the first one."""
    result = await db.execute(
        select(BlueprintIteration)
        .where(BlueprintIteration.project_id == project_id)
        .order_by(BlueprintIteration.iteration_number.desc())
        .limit(1)
    )
    iteration = result.scalar_one_or_none()

    if not iteration:
        iteration = BlueprintIteration(
            project_id=project_id,
            org_id=org_id,
            iteration_number=1,
            label="v1",
            status="planning",
        )
        db.add(iteration)
        await db.flush()

    return iteration


async def get_active_iteration(project_id: str, db: AsyncSession) -> BlueprintIteration | None:
    """Get the latest unlocked (planning) iteration, or None if all locked."""
    result = await db.execute(
        select(BlueprintIteration)
        .where(
            BlueprintIteration.project_id == project_id,
            BlueprintIteration.status == "planning",
        )
        .order_by(BlueprintIteration.iteration_number.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def list_iterations(project_id: str, db: AsyncSession) -> list[BlueprintIteration]:
    """List all iterations for a project, ordered by number."""
    result = await db.execute(
        select(BlueprintIteration)
        .where(BlueprintIteration.project_id == project_id)
        .order_by(BlueprintIteration.iteration_number.asc())
    )
    return list(result.scalars().all())


async def lock_iteration(iteration_id: str, db: AsyncSession, user_id: str) -> BlueprintIteration:
    """Lock an iteration (mark as completed/frozen)."""
    result = await db.execute(select(BlueprintIteration).where(BlueprintIteration.id == iteration_id))
    iteration = result.scalar_one_or_none()
    if not iteration:
        raise ValueError("Iteration not found")
    if iteration.status == "locked":
        return iteration  # Already locked
    # Accept both "planning" and "ready" as valid source statuses

    iteration.status = "locked"
    iteration.locked_at = datetime.now(UTC)
    iteration.locked_by = user_id
    await db.flush()
    logger.info(
        "Iteration locked: %s (project=%s, v%s)",
        iteration.id,
        iteration.project_id,
        iteration.iteration_number,
    )
    return iteration


async def create_iteration(
    project_id: str,
    db: AsyncSession,
    user_id: str,
    org_id: str | None = None,
    iteration_type: str | None = None,
) -> BlueprintIteration:
    """Create a new iteration by forking from the current one.

    - Locks the current iteration if still planning
    - Copies the latest blueprint content to the new iteration
    - Stores the parent's out_of_scope as context for the new iteration
    """
    current = await get_or_create_iteration(project_id, db, org_id)

    # Lock current if it's still planning
    if current.status == "planning":
        await lock_iteration(current.id, db, user_id)

    # Get current blueprint content
    current_bp = await get_or_create_blueprint(project_id, db, iteration_id=current.id)
    parent_oos = current_bp.content.get("out_of_scope", "")

    # Create new iteration
    new_number = current.iteration_number + 1
    new_iteration = BlueprintIteration(
        project_id=project_id,
        org_id=org_id or current.org_id,
        iteration_number=new_number,
        label=f"v{new_number}",
        status="planning",
        iteration_type=iteration_type,
        forked_from_id=current.id,
        parent_out_of_scope=parent_oos if parent_oos else None,
    )
    db.add(new_iteration)
    await db.flush()

    # Fork blueprint content — copy everything, clear out_of_scope
    forked_content = dict(current_bp.content)
    forked_content["out_of_scope"] = ""

    forked_bullet_sources = dict(current_bp.bullet_sources or {})
    # out_of_scope is cleared above; drop its provenance too.
    forked_bullet_sources.pop("out_of_scope", None)

    snapshot = BlueprintSnapshot(
        project_id=project_id,
        org_id=org_id or current.org_id,
        iteration_id=new_iteration.id,
        version_number=1,
        content=forked_content,
        created_by="system",
        section_sources=dict(current_bp.section_sources or {}),
        bullet_sources=forked_bullet_sources,
    )
    db.add(snapshot)
    await db.flush()

    logger.info(
        "Iteration created: %s v%s (forked from %s)",
        project_id,
        new_number,
        current.id,
    )
    return new_iteration


# ─── Blueprint CRUD (iteration-aware) ───────────────────────────────────────


async def get_or_create_blueprint(
    project_id: str,
    db: AsyncSession,
    iteration_id: str | None = None,
) -> BlueprintSnapshot:
    """Get the latest blueprint snapshot for an iteration.

    If iteration_id is None, uses the latest iteration.
    """
    if not iteration_id:
        iteration = await get_or_create_iteration(project_id, db)
        iteration_id = iteration.id

    result = await db.execute(
        select(BlueprintSnapshot)
        .where(
            BlueprintSnapshot.project_id == project_id,
            BlueprintSnapshot.iteration_id == iteration_id,
        )
        .order_by(BlueprintSnapshot.version_number.desc())
        .limit(1)
    )
    snapshot = result.scalar_one_or_none()

    if not snapshot:
        snapshot = BlueprintSnapshot(
            project_id=project_id,
            iteration_id=iteration_id,
            version_number=1,
            content=EMPTY_BLUEPRINT.copy(),
            created_by="system",
        )
        db.add(snapshot)
        await db.commit()
        await db.refresh(snapshot)

    return snapshot


async def update_section(
    project_id: str,
    section_name: str,
    content: str,
    created_by: str,
    db: AsyncSession,
    session_id: str | None = None,
    source: str | None = None,
    iteration_id: str | None = None,
    mode: str = "replace",
    expected_version: int | None = None,
) -> BlueprintSnapshot:
    """Update a blueprint section, creating a new snapshot.

    mode:
      - "replace" (default, used by user edits): the section becomes exactly
        ``content``. Any bullets dropped from the prior content are recorded
        on the iteration so future agent merges don't re-add them.
      - "merge" (used by the voice agent's extraction): ``content`` is
        unioned with the prior section by bullet (deterministic, in code —
        the LLM only emits NEW bullets and is never asked to re-emit prior
        ones, which removes the under-generation failure mode).

    expected_version: if provided, raises ``ConcurrentBlueprintUpdate`` when
        the current version differs (optimistic concurrency for the agent).
    """
    from .blueprint_merge import compute_bullet_sources, detect_removed, merge_bullets

    if not iteration_id:
        iteration = await get_or_create_iteration(project_id, db)
        iteration_id = iteration.id
    else:
        # Verify iteration is not locked
        result = await db.execute(select(BlueprintIteration).where(BlueprintIteration.id == iteration_id))
        iteration = result.scalar_one_or_none()
        if iteration and iteration.status == "locked":
            raise ValueError(f"Cannot update locked iteration {iteration.label}")

    current = await get_or_create_blueprint(project_id, db, iteration_id=iteration_id)

    if expected_version is not None and current.version_number != expected_version:
        raise ConcurrentBlueprintUpdate(f"Blueprint moved from v{expected_version} to v{current.version_number}")

    prior_content = current.content.get(section_name, "") or ""
    new_content = dict(current.content)

    # Removal memory lives on the iteration. Initialize a fresh dict if missing.
    iteration_removed = dict(iteration.removed_bullets or {}) if iteration else {}
    section_removed_list = iteration_removed.get(section_name, [])
    section_removed_set = set(section_removed_list)

    if mode == "merge":
        merged = merge_bullets(prior_content, content, removed=section_removed_set)
        new_content[section_name] = merged
        final_section_content = merged
    else:
        # User edit (or any non-agent caller): straight replace, but track
        # what got dropped so the agent doesn't re-add it next time.
        newly_removed = detect_removed(prior_content, content)
        if newly_removed:
            section_removed_set |= newly_removed
            iteration_removed[section_name] = sorted(section_removed_set)
            if iteration is not None:
                iteration.removed_bullets = iteration_removed
        new_content[section_name] = content
        final_section_content = content

    # Track per-section sources
    new_sources = dict(current.section_sources or {})
    if source:
        section_source = source
    elif created_by == "user":
        section_source = "user_stated"
    elif created_by in ("ai_facilitator", "ai_extraction"):
        section_source = "ai_inferred"
    else:
        section_source = new_sources.get(section_name, "ai_inferred")
    new_sources[section_name] = section_source

    # Track per-bullet provenance. Existing bullets keep their prior source;
    # new bullets inherit ``section_source``. Removed bullets fall off.
    new_bullet_sources = dict(current.bullet_sources or {})
    prior_section_bullet_sources = new_bullet_sources.get(section_name) or {}
    new_bullet_sources[section_name] = compute_bullet_sources(
        final_section_content,
        prior_section_bullet_sources,
        section_source,
    )

    # Get next version number scoped to this iteration
    result = await db.execute(
        select(func.max(BlueprintSnapshot.version_number)).where(
            BlueprintSnapshot.project_id == project_id,
            BlueprintSnapshot.iteration_id == iteration_id,
        )
    )
    max_version = result.scalar() or 0

    snapshot = BlueprintSnapshot(
        project_id=project_id,
        iteration_id=iteration_id,
        version_number=max_version + 1,
        content=new_content,
        created_by=created_by,
        session_id=session_id,
        section_sources=new_sources,
        bullet_sources=new_bullet_sources,
        diff_from_previous={
            section_name: {
                "old": prior_content,
                "new": final_section_content,
            }
        },
    )
    db.add(snapshot)
    await db.commit()
    logger.info(
        "Blueprint section updated: %s for project %s (iteration %s)",
        section_name,
        project_id,
        iteration_id,
    )
    await db.refresh(snapshot)

    # Check if iteration should transition to "ready" and emit
    # section_completed events for any sections that just crossed the
    # completion threshold (driven from the prior snapshot's content).
    prior_full = dict(current.content) if current else {}
    if iteration:
        await check_readiness(iteration, new_content, db, prior_content=prior_full)

    return snapshot


# Coverage threshold a section must cross (in either direction) for the UI
# to fire its "section just completed" celebration. Matches the readiness
# threshold used for the iteration-level auto-promote in this same fn.
SECTION_COMPLETION_THRESHOLD = 80


async def check_readiness(
    iteration: BlueprintIteration,
    content: dict,
    db: AsyncSession,
    prior_content: dict | None = None,
) -> None:
    """Auto-set iteration status to 'ready' when coverage is sufficient AND
    fan out a ``section_completed`` WS event for every section that just
    crossed the completion threshold.

    Both checks read the same per-section scores, so the readiness flip and
    the celebration broadcast see a consistent view of the new content.
    """
    from ..services.blueprint_template_service import get_template_sections
    from ..services.facilitator import assess_coverage

    sections_filter = None
    if iteration.iteration_type:
        org = iteration.org_id or iteration.project_id
        sections_filter = await get_template_sections(org, iteration.iteration_type, db)

    cov = assess_coverage(content, sections_filter=sections_filter)

    # ── Section-completion celebration ─────────────────────────────────
    # Only fire for sections that were under-threshold in the prior content
    # and crossed it in this update — without prior content we'd re-fire on
    # every snapshot for any section that's currently above the bar.
    if prior_content is not None:
        prior_cov = assess_coverage(prior_content, sections_filter=sections_filter)
        prior_scores = prior_cov["scores"]
        new_scores = cov["scores"]
        newly_completed = [
            slug
            for slug, score in new_scores.items()
            if score >= SECTION_COMPLETION_THRESHOLD
            and prior_scores.get(slug, 0) < SECTION_COMPLETION_THRESHOLD
        ]
        if newly_completed:
            try:
                from sqlalchemy import select as _select

                from ..models.session import Session as _SessionModel
                from ..ws.manager import manager

                result = await db.execute(
                    _select(_SessionModel.id).where(_SessionModel.project_id == iteration.project_id)
                )
                session_ids = [row[0] for row in result.all()]
                for slug in newly_completed:
                    event = {
                        "type": "section_completed",
                        "payload": {
                            "section": slug,
                            "score": new_scores.get(slug, 0),
                        },
                    }
                    for sid in session_ids:
                        await manager.broadcast(sid, event)
                logger.info(
                    "Section(s) crossed completion threshold for iteration %s: %s",
                    iteration.id,
                    ",".join(newly_completed),
                )
            except Exception:
                # Broadcast is best-effort — never let a celebration event
                # break the section update itself.
                logger.debug(
                    "section_completed broadcast failed for iteration %s",
                    iteration.id,
                    exc_info=True,
                )

    if cov["overall"] >= 80 and iteration.status == "planning":
        iteration.status = "ready"
        await db.flush()
        logger.info(
            "Iteration %s auto-set to 'ready' (coverage: %d%%)",
            iteration.id,
            cov["overall"],
        )


async def revert_session_changes(
    project_id: str,
    session_id: str,
    db: AsyncSession,
    iteration_id: str | None = None,
) -> BlueprintSnapshot | None:
    """Revert blueprint to the state before a session made changes."""
    if not iteration_id:
        iteration = await get_or_create_iteration(project_id, db)
        iteration_id = iteration.id

    # Find the latest snapshot NOT created by this session
    result = await db.execute(
        select(BlueprintSnapshot)
        .where(
            BlueprintSnapshot.project_id == project_id,
            BlueprintSnapshot.iteration_id == iteration_id,
            or_(
                BlueprintSnapshot.session_id != session_id,
                BlueprintSnapshot.session_id.is_(None),
            ),
        )
        .order_by(BlueprintSnapshot.version_number.desc())
        .limit(1)
    )
    pre_session = result.scalar_one_or_none()

    if not pre_session:
        return None

    current = await get_or_create_blueprint(project_id, db, iteration_id=iteration_id)
    if current.content == pre_session.content:
        return None

    max_result = await db.execute(
        select(func.max(BlueprintSnapshot.version_number)).where(
            BlueprintSnapshot.project_id == project_id,
            BlueprintSnapshot.iteration_id == iteration_id,
        )
    )
    max_version = max_result.scalar() or 0

    snapshot = BlueprintSnapshot(
        project_id=project_id,
        iteration_id=iteration_id,
        version_number=max_version + 1,
        content=dict(pre_session.content),
        created_by="system_revert",
    )
    db.add(snapshot)
    await db.flush()
    return snapshot


async def restore_snapshot(
    project_id: str,
    snapshot_id: str,
    db: AsyncSession,
    user_id: str | None = None,
) -> tuple[BlueprintSnapshot, BlueprintSnapshot] | None:
    """Restore a previous snapshot by creating a new one with its content.

    Returns ``(new_snapshot, target_snapshot)`` so the caller can audit-log
    both the source version that was restored and the new version created.
    Returns ``None`` if the snapshot doesn't exist.

    Raises ``ValueError`` if the snapshot's iteration is locked — restoration
    must not create new snapshots inside a locked (finalized) iteration,
    matching the existing ``update_section`` behavior at line 209.

    Resets the iteration's ``removed_bullets`` map: restoring is an explicit
    "go back to that state" intent, so the agent's deletion memory should
    not silently re-strip bullets from the restored content on the next
    extraction.
    """
    result = await db.execute(
        select(BlueprintSnapshot).where(
            BlueprintSnapshot.id == snapshot_id,
            BlueprintSnapshot.project_id == project_id,
        )
    )
    target = result.scalar_one_or_none()
    if not target:
        return None

    iteration_id = target.iteration_id

    iteration = None
    if iteration_id:
        it_result = await db.execute(select(BlueprintIteration).where(BlueprintIteration.id == iteration_id))
        iteration = it_result.scalar_one_or_none()
        if iteration and iteration.status == "locked":
            raise ValueError(f"Cannot restore into locked iteration {iteration.label}")

    result = await db.execute(
        select(func.max(BlueprintSnapshot.version_number)).where(
            BlueprintSnapshot.project_id == project_id,
            BlueprintSnapshot.iteration_id == iteration_id,
        )
    )
    max_version = result.scalar() or 0

    snapshot = BlueprintSnapshot(
        project_id=project_id,
        iteration_id=iteration_id,
        version_number=max_version + 1,
        content=dict(target.content),
        created_by=user_id or "system",
        section_sources=dict(target.section_sources or {}) or None,
        bullet_sources=dict(target.bullet_sources or {}) or None,
    )
    db.add(snapshot)

    # Clear deletion memory so the agent's next extraction respects the
    # restored content. If this iteration tracks per-section removed bullets,
    # the user has effectively re-affirmed the prior state — the agent
    # shouldn't silently un-restore those bullets.
    if iteration is not None:
        iteration.removed_bullets = None

    await db.commit()
    logger.info(
        "Blueprint restored to snapshot %s for project %s (v%s -> v%s) by %s",
        snapshot_id,
        project_id,
        target.version_number,
        snapshot.version_number,
        user_id or "system",
    )
    await db.refresh(snapshot)
    return snapshot, target


# ─── Blueprint Suggestions (agent-extracted, pending review) ────────────────


async def create_suggestion(
    project_id: str,
    section: str,
    content: str,
    db: AsyncSession,
    session_id: str | None = None,
    source_message_ids: list[str] | None = None,
    supersedes_bullet: str | None = None,
) -> BlueprintSuggestion:
    """Persist a pending suggestion from the agent. Append-only, so no
    concurrency handling — user review decides whether it lands in the
    blueprint.

    ``supersedes_bullet`` (optional): when set, names the existing bullet
    in this section that the new fact contradicts/updates. The accept
    service surfaces this to the user and supports a 'replace' mode that
    strips the named bullet before merging.
    """
    suggestion = BlueprintSuggestion(
        project_id=project_id,
        session_id=session_id,
        section=section,
        content=content,
        status="pending",
        source_message_ids=source_message_ids,
        supersedes_bullet=supersedes_bullet,
    )
    db.add(suggestion)

    # Flip the session into the post-session review flow the moment a
    # suggestion lands. We only move 'none' → 'pending' here so a user who
    # already completed the review doesn't get re-prompted by a stragglers
    # extraction; 'completed' stays sticky.
    if session_id:
        from ..models.session import Session as SessionModel

        sess_result = await db.execute(select(SessionModel).where(SessionModel.id == session_id))
        sess = sess_result.scalar_one_or_none()
        if sess and sess.blueprint_review_status == "none":
            sess.blueprint_review_status = "pending"

    await db.commit()
    await db.refresh(suggestion)
    logger.info(
        "Blueprint suggestion created: project=%s section=%s session=%s id=%s%s",
        project_id,
        section,
        session_id,
        suggestion.id,
        " (supersedes existing bullet)" if supersedes_bullet else "",
    )
    return suggestion


async def list_pending_suggestions(
    project_id: str,
    db: AsyncSession,
    session_id: str | None = None,
) -> list[BlueprintSuggestion]:
    """List pending suggestions for a project, optionally scoped to one session."""
    stmt = select(BlueprintSuggestion).where(
        BlueprintSuggestion.project_id == project_id,
        BlueprintSuggestion.status == "pending",
    )
    if session_id is not None:
        stmt = stmt.where(BlueprintSuggestion.session_id == session_id)
    stmt = stmt.order_by(BlueprintSuggestion.created_at.asc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def _get_pending_suggestion(
    suggestion_id: str,
    project_id: str,
    db: AsyncSession,
) -> BlueprintSuggestion | None:
    result = await db.execute(
        select(BlueprintSuggestion).where(
            BlueprintSuggestion.id == suggestion_id,
            BlueprintSuggestion.project_id == project_id,
        )
    )
    return result.scalar_one_or_none()


async def accept_suggestion(
    suggestion_id: str,
    project_id: str,
    user_id: str,
    db: AsyncSession,
    edited_content: str | None = None,
    replace: bool = False,
) -> tuple[BlueprintSuggestion, BlueprintSnapshot] | None:
    """Accept a pending suggestion: merge its content into the blueprint and
    flip status to 'accepted'. Reuses ``update_section`` so the existing
    union-by-bullet logic and removed-bullet memory both apply.

    ``replace`` (when True AND the suggestion has a ``supersedes_bullet``):
    strips the superseded bullet from the section content first, then writes
    the result via ``mode='replace'`` so ``detect_removed`` records the old
    bullet in ``iteration.removed_bullets`` (preventing the agent from
    re-emitting it). Falls back to plain merge if there's no bullet to
    supersede.

    Returns ``(suggestion, snapshot)`` on success or ``None`` if the
    suggestion isn't pending or doesn't exist.
    """
    from .blueprint_merge import _normalize, split_bullets

    suggestion = await _get_pending_suggestion(suggestion_id, project_id, db)
    if suggestion is None or suggestion.status != "pending":
        return None

    final_content = edited_content if edited_content is not None else suggestion.content

    if replace and suggestion.supersedes_bullet:
        # Build the replacement content: current section minus the superseded
        # bullet, plus the new bullet. Going through mode='replace' lets
        # update_section's detect_removed catch the dropped bullet and add
        # it to iteration.removed_bullets so the agent won't re-emit it.
        current = await get_or_create_blueprint(project_id, db)
        section_text = current.content.get(suggestion.section) or ""
        target_norm = _normalize(suggestion.supersedes_bullet)
        kept = [raw for raw, norm in split_bullets(section_text) if norm != target_norm]
        # Append the new bullet (split_bullets handles dedup on its own;
        # here we just concatenate and let merge logic deduplicate via the
        # subsequent 'replace' write).
        new_section = "\n".join(kept + [final_content.strip()])
        snapshot = await update_section(
            project_id,
            suggestion.section,
            new_section,
            "ai_extraction",
            db,
            session_id=suggestion.session_id,
            source="ai_inferred",
            mode="replace",
        )
    else:
        snapshot = await update_section(
            project_id,
            suggestion.section,
            final_content,
            "ai_extraction",
            db,
            session_id=suggestion.session_id,
            source="ai_inferred",
            mode="merge",
        )

    suggestion.status = "accepted"
    suggestion.reviewed_at = datetime.now(UTC)
    suggestion.reviewed_by = user_id
    if edited_content is not None:
        suggestion.edited_content = edited_content
    await db.commit()
    await db.refresh(suggestion)
    return suggestion, snapshot


async def reject_suggestion(
    suggestion_id: str,
    project_id: str,
    user_id: str,
    db: AsyncSession,
) -> BlueprintSuggestion | None:
    """Mark a pending suggestion as rejected — no blueprint change."""
    suggestion = await _get_pending_suggestion(suggestion_id, project_id, db)
    if suggestion is None or suggestion.status != "pending":
        return None
    suggestion.status = "rejected"
    suggestion.reviewed_at = datetime.now(UTC)
    suggestion.reviewed_by = user_id
    await db.commit()
    await db.refresh(suggestion)
    return suggestion


async def bulk_accept_section(
    project_id: str,
    section: str,
    user_id: str,
    db: AsyncSession,
    session_id: str | None = None,
) -> tuple[list[BlueprintSuggestion], BlueprintSnapshot | None]:
    """Accept all pending suggestions for one section in a single merged
    update. Cuts down WS noise and snapshot churn when the user clicks
    "Accept all" on a section group.

    Returns ``(accepted_suggestions, snapshot_or_none)``. Snapshot is None
    only if there were zero pending suggestions to accept.
    """
    stmt = select(BlueprintSuggestion).where(
        BlueprintSuggestion.project_id == project_id,
        BlueprintSuggestion.status == "pending",
        BlueprintSuggestion.section == section,
    )
    if session_id is not None:
        stmt = stmt.where(BlueprintSuggestion.session_id == session_id)
    stmt = stmt.order_by(BlueprintSuggestion.created_at.asc())
    result = await db.execute(stmt)
    pending = list(result.scalars().all())

    if not pending:
        return [], None

    # The merge layer unions bullets, so concatenating with a newline before
    # passing it down is enough — duplicates collapse, removed bullets stay
    # removed.
    combined = "\n".join((s.edited_content or s.content) for s in pending)
    snapshot = await update_section(
        project_id,
        section,
        combined,
        "ai_extraction",
        db,
        session_id=session_id,
        source="ai_inferred",
        mode="merge",
    )

    now = datetime.now(UTC)
    for s in pending:
        s.status = "accepted"
        s.reviewed_at = now
        s.reviewed_by = user_id
    await db.commit()
    for s in pending:
        await db.refresh(s)
    return pending, snapshot
