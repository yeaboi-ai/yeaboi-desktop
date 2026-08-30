import json
import logging
import secrets
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_org, get_current_user
from ..models.blueprint import BlueprintIteration, BlueprintSnapshot
from ..models.organization import Organization
from ..models.project import Project
from ..models.user import User
from ..schemas.blueprint import (
    BLUEPRINT_SECTIONS,
    BlueprintIterationResponse,
    BlueprintIterationUpdate,
    BlueprintSectionUpdate,
    BlueprintShareResponse,
    BlueprintSnapshotDetail,
    BlueprintSnapshotDiff,
    BlueprintSnapshotListItem,
    BlueprintSnapshotResponse,
    PublicBlueprintResponse,
    SessionBlueprintDiff,
    SuggestionAccept,
    SuggestionBulkAccept,
    SuggestionRead,
)
from ..services.audit_service import log_audit
from ..services.blueprint_service import (
    accept_suggestion,
    bulk_accept_section,
    create_iteration,
    get_or_create_blueprint,
    list_iterations,
    list_pending_suggestions,
    lock_iteration,
    reject_suggestion,
    restore_snapshot,
    update_section,
)
from ..services.slack_dispatcher import dispatch_event

logger = logging.getLogger(__name__)

router = APIRouter(tags=["blueprints"])


async def _verify_project_access(project_id: str, user: User, db: AsyncSession) -> Project:
    # All team members can access any project
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("/api/projects/{project_id}/blueprint", response_model=BlueprintSnapshotResponse)
async def get_blueprint(
    project_id: str,
    iteration_id: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BlueprintSnapshot:
    await _verify_project_access(project_id, user, db)
    return await get_or_create_blueprint(project_id, db, iteration_id=iteration_id)


@router.patch("/api/projects/{project_id}/blueprint/sections/{section_name}", response_model=BlueprintSnapshotResponse)
async def edit_blueprint_section(
    project_id: str,
    section_name: str,
    body: BlueprintSectionUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BlueprintSnapshot:
    project = await _verify_project_access(project_id, user, db)

    if section_name not in BLUEPRINT_SECTIONS:
        raise HTTPException(status_code=400, detail=f"Invalid section. Must be one of: {BLUEPRINT_SECTIONS}")

    await log_audit(
        db,
        org_id=project.org_id,
        user_id=user.id,
        action="update",
        resource_type="blueprint",
        resource_id=project_id,
        metadata={"section": section_name},
    )
    bp = await update_section(
        project_id,
        section_name,
        body.content,
        user.id,
        db,
        source="user_stated",
    )

    # Broadcast to every active session for this project so the LiveKit agent
    # (subscribed as an internal watcher) and any other connected clients see
    # the user's manual edit immediately, instead of narrating stale state
    # until the next agent extraction.
    try:
        from ..models.session import Session as SessionModel
        from ..ws.manager import manager

        result = await db.execute(select(SessionModel.id).where(SessionModel.project_id == project_id))
        session_ids = [row[0] for row in result.all()]
        event = {
            "type": "blueprint_update",
            "payload": {
                "section": section_name,
                "content": body.content,
                "version": bp.version_number,
                "source": "user",
            },
        }
        for sid in session_ids:
            await manager.broadcast(sid, event)
    except Exception:
        # Broadcast is best-effort — never let it break the user's save.
        pass

    return bp


@router.get(
    "/api/projects/{project_id}/blueprint/snapshots",
    response_model=list[BlueprintSnapshotListItem],
)
async def list_snapshots(
    project_id: str,
    iteration_id: str | None = None,
    limit: int = 50,
    before_version: int | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[BlueprintSnapshotListItem]:
    """List blueprint snapshots, newest first.

    - ``iteration_id`` filters to a single iteration (the UI scopes by tab).
    - ``before_version`` paginates older entries; pass the smallest version
      number from the previous page.
    - ``limit`` capped at 200.

    ``changed_sections`` reports the section slugs that this version
    introduced relative to its immediate predecessor — the same comparison
    the expanded diff view shows. So v4's chip says "Users & Personas" if
    that's what v4 changed, regardless of whether v4 is also current.
    """
    from ..services.blueprint_authors import changed_sections, resolve_labels

    await _verify_project_access(project_id, user, db)
    limit = max(1, min(limit, 200))

    stmt = select(BlueprintSnapshot).where(BlueprintSnapshot.project_id == project_id)
    if iteration_id:
        stmt = stmt.where(BlueprintSnapshot.iteration_id == iteration_id)
    if before_version is not None:
        stmt = stmt.where(BlueprintSnapshot.version_number < before_version)
    stmt = stmt.order_by(BlueprintSnapshot.version_number.desc()).limit(limit)

    result = await db.execute(stmt)
    rows = list(result.scalars().all())

    labels = await resolve_labels([r.created_by for r in rows], db)
    return [
        BlueprintSnapshotListItem(
            id=r.id,
            version_number=r.version_number,
            iteration_id=r.iteration_id,
            session_id=r.session_id,
            created_by=r.created_by,
            created_by_label=labels.get(r.created_by, "User"),
            changed_sections=changed_sections(r.diff_from_previous),
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.get(
    "/api/projects/{project_id}/blueprint/snapshots/{snapshot_id}",
    response_model=BlueprintSnapshotDetail,
)
async def get_snapshot_detail(
    project_id: str,
    snapshot_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BlueprintSnapshotDetail:
    """Full snapshot — content + diff_from_previous + label."""
    from ..services.blueprint_authors import resolve_labels

    await _verify_project_access(project_id, user, db)

    result = await db.execute(
        select(BlueprintSnapshot).where(
            BlueprintSnapshot.id == snapshot_id,
            BlueprintSnapshot.project_id == project_id,
        )
    )
    snap = result.scalar_one_or_none()
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    labels = await resolve_labels([snap.created_by], db)
    return BlueprintSnapshotDetail(
        id=snap.id,
        project_id=snap.project_id,
        version_number=snap.version_number,
        iteration_id=snap.iteration_id,
        session_id=snap.session_id,
        content=snap.content,
        created_by=snap.created_by,
        created_by_label=labels.get(snap.created_by, "User"),
        diff_from_previous=snap.diff_from_previous,
        section_sources=snap.section_sources,
        bullet_sources=snap.bullet_sources,
        created_at=snap.created_at,
    )


@router.get(
    "/api/projects/{project_id}/blueprint/snapshots/{snapshot_id}/diff",
    response_model=BlueprintSnapshotDiff,
)
async def get_snapshot_diff(
    project_id: str,
    snapshot_id: str,
    against: str = "current",
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BlueprintSnapshotDiff:
    """Section-level diff between this snapshot and another.

    ``against`` accepts:
      - ``"current"`` (default): compare to the latest snapshot in this
        snapshot's iteration.
      - ``"previous"``: compare to the immediately prior snapshot
        (version_number - 1) in the same iteration.
      - ``<snapshot_id>``: compare to a specific snapshot id.
    """
    await _verify_project_access(project_id, user, db)

    src_result = await db.execute(
        select(BlueprintSnapshot).where(
            BlueprintSnapshot.id == snapshot_id,
            BlueprintSnapshot.project_id == project_id,
        )
    )
    src = src_result.scalar_one_or_none()
    if not src:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    if against == "current":
        cur_result = await db.execute(
            select(BlueprintSnapshot)
            .where(
                BlueprintSnapshot.project_id == project_id,
                BlueprintSnapshot.iteration_id == src.iteration_id,
            )
            .order_by(BlueprintSnapshot.version_number.desc())
            .limit(1)
        )
        target = cur_result.scalar_one_or_none()
    elif against == "previous":
        prev_result = await db.execute(
            select(BlueprintSnapshot)
            .where(
                BlueprintSnapshot.project_id == project_id,
                BlueprintSnapshot.iteration_id == src.iteration_id,
                BlueprintSnapshot.version_number < src.version_number,
            )
            .order_by(BlueprintSnapshot.version_number.desc())
            .limit(1)
        )
        target = prev_result.scalar_one_or_none()
    else:
        tgt_result = await db.execute(
            select(BlueprintSnapshot).where(
                BlueprintSnapshot.id == against,
                BlueprintSnapshot.project_id == project_id,
            )
        )
        target = tgt_result.scalar_one_or_none()

    if not target:
        raise HTTPException(status_code=404, detail="Target snapshot not found")

    src_content = src.content or {}
    tgt_content = target.content or {}
    sections: dict[str, dict[str, str]] = {}
    for slug in set(src_content.keys()) | set(tgt_content.keys()):
        old_v = src_content.get(slug, "") or ""
        new_v = tgt_content.get(slug, "") or ""
        if old_v != new_v:
            sections[slug] = {"old": old_v, "new": new_v}

    return BlueprintSnapshotDiff(
        from_snapshot_id=src.id,
        to_snapshot_id=target.id,
        from_version=src.version_number,
        to_version=target.version_number,
        sections=sections,
    )


@router.post("/api/projects/{project_id}/blueprint/restore/{snapshot_id}", response_model=BlueprintSnapshotResponse)
async def restore_blueprint(
    project_id: str,
    snapshot_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BlueprintSnapshot:
    project = await _verify_project_access(project_id, user, db)

    # Capture the prior latest content so we can compute per-section diffs
    # to broadcast — clients need to know which sections actually changed.
    iter_for_target = await db.execute(
        select(BlueprintSnapshot.iteration_id).where(
            BlueprintSnapshot.id == snapshot_id,
            BlueprintSnapshot.project_id == project_id,
        )
    )
    target_iteration_id = iter_for_target.scalar_one_or_none()
    prior_content: dict = {}
    if target_iteration_id:
        latest_result = await db.execute(
            select(BlueprintSnapshot.content)
            .where(
                BlueprintSnapshot.project_id == project_id,
                BlueprintSnapshot.iteration_id == target_iteration_id,
            )
            .order_by(BlueprintSnapshot.version_number.desc())
            .limit(1)
        )
        prior_content = latest_result.scalar_one_or_none() or {}

    try:
        result = await restore_snapshot(project_id, snapshot_id, db, user_id=user.id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not result:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    new_snapshot, source_snapshot = result

    await log_audit(
        db,
        org_id=project.org_id,
        user_id=user.id,
        action="restore",
        resource_type="blueprint",
        resource_id=snapshot_id,
        metadata={
            "project_id": project_id,
            "from_version": source_snapshot.version_number,
            "to_version": new_snapshot.version_number,
        },
    )

    # Broadcast per-section updates so connected clients (frontend + voice
    # agent's WS subscriber) refresh immediately instead of narrating the
    # state we just rolled back over.
    try:
        from ..models.session import Session as SessionModel
        from ..ws.manager import manager

        sess_result = await db.execute(select(SessionModel.id).where(SessionModel.project_id == project_id))
        session_ids = [row[0] for row in sess_result.all()]

        new_content = new_snapshot.content or {}
        changed_slugs = [
            slug
            for slug in set(prior_content.keys()) | set(new_content.keys())
            if (prior_content.get(slug) or "") != (new_content.get(slug) or "")
        ]
        for slug in changed_slugs:
            event = {
                "type": "blueprint_update",
                "payload": {
                    "section": slug,
                    "content": new_content.get(slug, ""),
                    "version": new_snapshot.version_number,
                    "source": "restore",
                },
            }
            for sid in session_ids:
                await manager.broadcast(sid, event)
    except Exception:
        # Broadcast failures must never block the restore response.
        pass

    return new_snapshot


@router.get("/api/projects/{project_id}/blueprint/coverage")
async def get_coverage(
    project_id: str,
    iteration_id: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get coverage scores for each blueprint section."""
    await _verify_project_access(project_id, user, db)
    bp = await get_or_create_blueprint(project_id, db, iteration_id=iteration_id)

    from ..services.blueprint_service import get_or_create_iteration
    from ..services.blueprint_template_service import get_template_sections
    from ..services.facilitator import PERSONA_FOCUS_SECTIONS, SECTION_LABELS, assess_coverage

    # Resolve iteration type to filter sections (from DB templates)
    sections_filter = None
    if iteration_id:
        iter_result = await db.execute(select(BlueprintIteration).where(BlueprintIteration.id == iteration_id))
        iteration = iter_result.scalar_one_or_none()
    else:
        iteration = await get_or_create_iteration(project_id, db)

    if iteration and iteration.iteration_type:
        # Look up project's org_id for template query
        from ..models.project import Project as _Proj

        proj_result = await db.execute(select(_Proj.org_id).where(_Proj.id == project_id))
        proj_org_id = proj_result.scalar_one_or_none()
        if proj_org_id:
            sections_filter = await get_template_sections(proj_org_id, iteration.iteration_type, db)

    result = assess_coverage(bp.content, sections_filter=sections_filter)
    result["section_sources"] = bp.section_sources or {}

    # Recommend personas that cover the biggest gaps
    scores = result["scores"]
    persona_labels = {
        "default": "Senior Engineer",
        "pm": "Product Manager",
        "architect": "System Architect",
        "mentor": "Patient Mentor",
        "challenger": "Devil's Advocate",
    }
    persona_recs = []
    for p_id, p_sections in PERSONA_FOCUS_SECTIONS.items():
        if not p_sections:
            continue
        gap_count = sum(1 for s in p_sections if scores.get(s, 0) < 80)
        if gap_count > 0:
            gap_labels = [SECTION_LABELS.get(s, s) for s in p_sections if scores.get(s, 0) < 80]
            persona_recs.append(
                {
                    "persona": p_id,
                    "label": persona_labels.get(p_id, p_id),
                    "gaps_count": gap_count,
                    "gap_sections": gap_labels,
                }
            )
    persona_recs.sort(key=lambda x: x["gaps_count"], reverse=True)
    result["persona_recommendations"] = persona_recs
    return result


@router.post("/api/projects/{project_id}/blueprint/suggest-defaults")
async def suggest_defaults(
    project_id: str,
    body: dict | None = None,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Generate sensible defaults for blueprint sections based on filled ones.

    Body (optional): {"sections": ["section_a", "section_b"]} — explicit list of
    sections to suggest defaults for. Useful for the wrap-up wizard, which
    treats any section scoring < 80 as a gap (not just empty ones). If omitted,
    falls back to "all completely empty sections".
    """
    await _verify_project_access(project_id, user, db)
    bp = await get_or_create_blueprint(project_id, db)

    requested_sections = (body or {}).get("sections") if isinstance(body, dict) else None
    if requested_sections is not None:
        if not isinstance(requested_sections, list) or not all(isinstance(s, str) for s in requested_sections):
            raise HTTPException(status_code=400, detail="`sections` must be a list of section keys")
        invalid = [s for s in requested_sections if s not in BLUEPRINT_SECTIONS]
        if invalid:
            raise HTTPException(status_code=400, detail=f"Invalid section keys: {invalid}")
        targets = list(requested_sections)
    else:
        targets = [s for s in BLUEPRINT_SECTIONS if not (bp.content.get(s) or "").strip()]

    if not targets:
        return {"suggestions": {}}

    # Filled context excludes the targets (we don't want the model to anchor on
    # whatever thin content the user already wrote in a section we're rewriting).
    target_set = set(targets)
    filled = {
        s: bp.content.get(s, "")
        for s in BLUEPRINT_SECTIONS
        if (bp.content.get(s) or "").strip() and s not in target_set
    }

    from ..services.ai_provider import get_ai_client

    section_labels = {
        "project_overview": "Project Overview",
        "goals_constraints": "Goals & Constraints",
        "users_personas": "Users & Personas",
        "team_capacity": "Team & Capacity",
        "architecture": "Architecture",
        "tech_stack": "Tech Stack",
        "api_integrations": "API & Integrations",
        "ui_ux": "UI/UX",
        "security_compliance": "Security & Compliance",
        "infrastructure": "Infrastructure",
        "risks_unknowns": "Risks & Unknowns",
        "out_of_scope": "Out of Scope",
        "open_questions": "Open Questions",
    }

    filled_context = (
        "\n".join(f"{section_labels.get(s, s)}: {c}" for s, c in filled.items())
        if filled
        else "(no other sections filled in yet — infer from the section names alone)"
    )
    target_labels = ", ".join(section_labels.get(s, s) for s in targets)

    prompt = (
        "Based on the project context below, generate sensible defaults for "
        "the listed sections. Keep each default brief (1-2 sentences), "
        "practical, and consistent with the project context.\n\n"
        f"FILLED SECTIONS:\n{filled_context}\n\n"
        f"SECTIONS TO FILL: {target_labels}\n\n"
        "Output ONLY a valid JSON object mapping section keys to suggested "
        "content. No markdown fences.\n"
        'Example: {"goals_constraints": "Deliver a functional MVP within '
        '2 weeks. Keep scope minimal."}\n\n'
        f"Valid section keys: {', '.join(targets)}"
    )

    try:
        ai = await get_ai_client(org.id, db, task="fast")
        raw = await ai.chat(
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1500,
        )
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()
        suggestions = json.loads(raw)
    except Exception as e:
        logger.error("Failed to generate blueprint defaults: %s", e)
        raise HTTPException(status_code=500, detail="Failed to generate defaults")

    result = {s: suggestions[s] for s in targets if s in suggestions and suggestions[s]}
    return {"suggestions": result}


# ─── Iteration Endpoints ─────────────────────────────────────────────────────


@router.get(
    "/api/projects/{project_id}/iterations",
    response_model=list[BlueprintIterationResponse],
)
async def get_iterations(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[BlueprintIteration]:
    """List all blueprint iterations for a project."""
    await _verify_project_access(project_id, user, db)
    return await list_iterations(project_id, db)


@router.post(
    "/api/projects/{project_id}/iterations",
    status_code=201,
    response_model=BlueprintIterationResponse,
)
async def create_new_iteration(
    project_id: str,
    body: dict | None = None,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> BlueprintIteration:
    """Create a new iteration by forking from the current one."""
    project = await _verify_project_access(project_id, user, db)
    iteration_type = (body or {}).get("iteration_type")
    iteration = await create_iteration(
        project_id,
        db,
        user.id,
        org_id=org.id,
        iteration_type=iteration_type,
    )
    await db.commit()

    # Dispatch Slack event (best-effort)
    try:
        author_name = user.display_name or user.name or user.email
        await dispatch_event(
            db,
            event_type="blueprint_iteration",
            team_id=project.team_id,
            payload={
                "project_id": project_id,
                "iteration_type": iteration_type,
                "author_name": author_name,
            },
        )
    except Exception as _exc:
        logger.warning("dispatch_event blueprint_iteration failed: %s", _exc)

    return iteration


@router.patch(
    "/api/projects/{project_id}/iterations/{iteration_id}",
    response_model=BlueprintIterationResponse,
)
async def update_iteration(
    project_id: str,
    iteration_id: str,
    body: BlueprintIterationUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BlueprintIteration:
    """Update iteration label."""
    await _verify_project_access(project_id, user, db)
    result = await db.execute(
        select(BlueprintIteration).where(
            BlueprintIteration.id == iteration_id,
            BlueprintIteration.project_id == project_id,
        )
    )
    iteration = result.scalar_one_or_none()
    if not iteration:
        raise HTTPException(status_code=404, detail="Iteration not found")

    if body.label is not None:
        iteration.label = body.label
    if body.iteration_type is not None:
        iteration.iteration_type = body.iteration_type
    if body.yeaboi_session_id is not None:
        iteration.yeaboi_session_id = body.yeaboi_session_id
        iteration.plan_generated_at = datetime.now(UTC)
    if body.plan_source_snapshot_id is not None:
        iteration.plan_source_snapshot_id = body.plan_source_snapshot_id
    await db.commit()
    return iteration


@router.post(
    "/api/projects/{project_id}/iterations/{iteration_id}/lock",
    response_model=BlueprintIterationResponse,
)
async def lock_iteration_endpoint(
    project_id: str,
    iteration_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BlueprintIteration:
    """Lock an iteration (freeze it)."""
    project = await _verify_project_access(project_id, user, db)
    try:
        iteration = await lock_iteration(iteration_id, db, user.id)
        await log_audit(
            db,
            org_id=project.org_id,
            user_id=user.id,
            action="lock",
            resource_type="iteration",
            resource_id=iteration_id,
            metadata={"project_id": project_id},
        )
        await db.commit()
        return iteration
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ─── Blueprint Suggestion Endpoints ─────────────────────────────────────────


async def _broadcast_suggestion_event(
    project_id: str,
    db: AsyncSession,
    event: dict,
) -> None:
    """Fan out a suggestion-related event to every active session for the
    project. Best-effort — broadcast failures must never block the user's
    accept/reject."""
    try:
        from ..models.session import Session as SessionModel
        from ..ws.manager import manager

        result = await db.execute(select(SessionModel.id).where(SessionModel.project_id == project_id))
        session_ids = [row[0] for row in result.all()]
        for sid in session_ids:
            await manager.broadcast(sid, event)
    except Exception:
        logger.debug("Suggestion event broadcast failed for project %s", project_id, exc_info=True)


def _serialize_suggestion(s) -> dict:
    return {
        "id": s.id,
        "project_id": s.project_id,
        "session_id": s.session_id,
        "section": s.section,
        "content": s.content,
        "edited_content": s.edited_content,
        "status": s.status,
        "created_at": s.created_at.isoformat() if s.created_at else "",
        "reviewed_at": s.reviewed_at.isoformat() if s.reviewed_at else None,
        "reviewed_by": s.reviewed_by,
    }


@router.get(
    "/api/projects/{project_id}/blueprint-suggestions",
    response_model=list[SuggestionRead],
)
async def list_blueprint_suggestions(
    project_id: str,
    session_id: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List pending suggestions for a project (optionally scoped to a session)."""
    await _verify_project_access(project_id, user, db)
    return await list_pending_suggestions(project_id, db, session_id=session_id)


@router.post(
    "/api/projects/{project_id}/blueprint-suggestions/{suggestion_id}/accept",
    response_model=SuggestionRead,
)
async def accept_blueprint_suggestion(
    project_id: str,
    suggestion_id: str,
    body: SuggestionAccept,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Accept a suggestion: merge into the blueprint, mark accepted."""
    project = await _verify_project_access(project_id, user, db)

    result = await accept_suggestion(
        suggestion_id,
        project_id,
        user.id,
        db,
        edited_content=body.edited_content,
        replace=body.replace,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Suggestion not found or not pending")
    suggestion, snapshot = result

    await log_audit(
        db,
        org_id=project.org_id,
        user_id=user.id,
        action="accept_suggestion",
        resource_type="blueprint",
        resource_id=project_id,
        metadata={"section": suggestion.section, "suggestion_id": suggestion.id},
    )

    stored_content = snapshot.content.get(suggestion.section, "")
    await _broadcast_suggestion_event(
        project_id,
        db,
        {
            "type": "blueprint_update",
            "payload": {
                "section": suggestion.section,
                "content": stored_content,
                "version": snapshot.version_number,
                "source": "user",
            },
        },
    )
    await _broadcast_suggestion_event(
        project_id,
        db,
        {
            "type": "suggestion_resolved",
            "payload": {"id": suggestion.id, "status": "accepted"},
        },
    )

    return suggestion


@router.post(
    "/api/projects/{project_id}/blueprint-suggestions/{suggestion_id}/reject",
    response_model=SuggestionRead,
)
async def reject_blueprint_suggestion(
    project_id: str,
    suggestion_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reject a suggestion: mark rejected, no blueprint change."""
    project = await _verify_project_access(project_id, user, db)

    suggestion = await reject_suggestion(suggestion_id, project_id, user.id, db)
    if suggestion is None:
        raise HTTPException(status_code=404, detail="Suggestion not found or not pending")

    await log_audit(
        db,
        org_id=project.org_id,
        user_id=user.id,
        action="reject_suggestion",
        resource_type="blueprint",
        resource_id=project_id,
        metadata={"section": suggestion.section, "suggestion_id": suggestion.id},
    )

    await _broadcast_suggestion_event(
        project_id,
        db,
        {
            "type": "suggestion_resolved",
            "payload": {"id": suggestion.id, "status": "rejected"},
        },
    )
    return suggestion


@router.post("/api/projects/{project_id}/blueprint-suggestions/bulk-accept")
async def bulk_accept_blueprint_suggestions(
    project_id: str,
    body: SuggestionBulkAccept,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Accept all pending suggestions in a section as one merged update."""
    project = await _verify_project_access(project_id, user, db)

    if body.section not in BLUEPRINT_SECTIONS:
        raise HTTPException(status_code=400, detail=f"Invalid section: {body.section}")

    accepted, snapshot = await bulk_accept_section(project_id, body.section, user.id, db, session_id=body.session_id)

    if not accepted:
        return {"accepted": [], "version_number": None}

    await log_audit(
        db,
        org_id=project.org_id,
        user_id=user.id,
        action="bulk_accept_suggestions",
        resource_type="blueprint",
        resource_id=project_id,
        metadata={
            "section": body.section,
            "count": len(accepted),
            "session_id": body.session_id,
        },
    )

    if snapshot is not None:
        stored_content = snapshot.content.get(body.section, "")
        await _broadcast_suggestion_event(
            project_id,
            db,
            {
                "type": "blueprint_update",
                "payload": {
                    "section": body.section,
                    "content": stored_content,
                    "version": snapshot.version_number,
                    "source": "user",
                },
            },
        )
    for s in accepted:
        await _broadcast_suggestion_event(
            project_id,
            db,
            {
                "type": "suggestion_resolved",
                "payload": {"id": s.id, "status": "accepted"},
            },
        )

    return {
        "accepted": [_serialize_suggestion(s) for s in accepted],
        "version_number": snapshot.version_number if snapshot else None,
    }


# ─── Share + Export Endpoints ───────────────────────────────────────────────


# Labels are duplicated from the suggest-defaults handler above; if you change
# one, change both. (Kept inline rather than re-importing to avoid coupling the
# router to facilitator constants.)
_SECTION_LABELS = {
    "project_overview": "Project Overview",
    "goals_constraints": "Goals & Constraints",
    "users_personas": "Users & Personas",
    "team_capacity": "Team & Capacity",
    "architecture": "Architecture",
    "tech_stack": "Tech Stack",
    "api_integrations": "API & Integrations",
    "ui_ux": "UI / UX",
    "security_compliance": "Security & Compliance",
    "infrastructure": "Infrastructure",
    "risks_unknowns": "Risks & Unknowns",
    "out_of_scope": "Out of Scope",
    "open_questions": "Open Questions",
}


def _render_markdown(project: Project, iteration: BlueprintIteration, snap: BlueprintSnapshot) -> str:
    """Render a blueprint snapshot as Markdown for export.

    Sections without content are skipped to keep the export readable; the
    document-view UI renders them as 'not yet covered' but flat markdown is
    a different medium.
    """
    lines = [
        f"# {project.name or 'Blueprint'} — {iteration.label}",
        "",
        f"_Version {snap.version_number} · status: {iteration.status}_",
        "",
    ]
    content = snap.content or {}
    for slug in BLUEPRINT_SECTIONS:
        body = (content.get(slug) or "").strip()
        if not body:
            continue
        lines.append(f"## {_SECTION_LABELS.get(slug, slug)}")
        lines.append("")
        lines.append(body)
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


async def _resolve_iteration(project_id: str, iteration_id: str, db: AsyncSession) -> BlueprintIteration:
    result = await db.execute(
        select(BlueprintIteration).where(
            BlueprintIteration.id == iteration_id,
            BlueprintIteration.project_id == project_id,
        )
    )
    iteration = result.scalar_one_or_none()
    if not iteration:
        raise HTTPException(status_code=404, detail="Iteration not found")
    return iteration


@router.post(
    "/api/projects/{project_id}/blueprint-iterations/{iteration_id}/share",
    response_model=BlueprintShareResponse,
)
async def enable_iteration_share(
    project_id: str,
    iteration_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BlueprintShareResponse:
    """Issue (or re-enable) a public read-only share link for the iteration.

    Idempotent: re-calling on an already-enabled iteration returns the same
    token. The token is generated lazily on first share, so iterations that
    were never shared have ``share_token=None``.
    """
    project = await _verify_project_access(project_id, user, db)
    iteration = await _resolve_iteration(project_id, iteration_id, db)

    if not iteration.share_token:
        iteration.share_token = secrets.token_urlsafe(32)
    iteration.share_enabled = True

    await log_audit(
        db,
        org_id=project.org_id,
        user_id=user.id,
        action="enable_share",
        resource_type="blueprint_iteration",
        resource_id=iteration_id,
        metadata={"project_id": project_id},
    )
    await db.commit()
    return BlueprintShareResponse(
        iteration_id=iteration.id,
        share_token=iteration.share_token,
        share_enabled=True,
    )


@router.delete(
    "/api/projects/{project_id}/blueprint-iterations/{iteration_id}/share",
    response_model=BlueprintShareResponse,
)
async def disable_iteration_share(
    project_id: str,
    iteration_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BlueprintShareResponse:
    """Revoke a public share link by flipping ``share_enabled`` to False.

    The token is intentionally preserved so re-enabling later returns the
    same URL (less surprising for shared links someone bookmarked).
    """
    project = await _verify_project_access(project_id, user, db)
    iteration = await _resolve_iteration(project_id, iteration_id, db)

    iteration.share_enabled = False

    await log_audit(
        db,
        org_id=project.org_id,
        user_id=user.id,
        action="disable_share",
        resource_type="blueprint_iteration",
        resource_id=iteration_id,
        metadata={"project_id": project_id},
    )
    await db.commit()
    return BlueprintShareResponse(
        iteration_id=iteration.id,
        share_token=iteration.share_token,
        share_enabled=False,
    )


@router.get("/api/projects/{project_id}/blueprint/export.md")
async def export_blueprint_markdown(
    project_id: str,
    iteration_id: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Plain Markdown export of the current (or specified) iteration."""
    project = await _verify_project_access(project_id, user, db)
    snap = await get_or_create_blueprint(project_id, db, iteration_id=iteration_id)
    iter_result = await db.execute(select(BlueprintIteration).where(BlueprintIteration.id == snap.iteration_id))
    iteration = iter_result.scalar_one_or_none()
    if not iteration:
        raise HTTPException(status_code=404, detail="Iteration not found")

    body = _render_markdown(project, iteration, snap)
    filename = f"{(project.name or 'blueprint').lower().replace(' ', '-')}-{iteration.label}.md"
    return Response(
        content=body,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/api/public/blueprint/{token}",
    response_model=PublicBlueprintResponse,
)
async def public_blueprint(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> PublicBlueprintResponse:
    """Read-only blueprint payload for the public /share/blueprint/{token}
    view. Returns 404 if the token is unknown; 410 if the owner has revoked
    sharing (token preserved, ``share_enabled`` flipped off)."""
    result = await db.execute(select(BlueprintIteration).where(BlueprintIteration.share_token == token))
    iteration = result.scalar_one_or_none()
    if not iteration:
        raise HTTPException(status_code=404, detail="Not found")
    if not iteration.share_enabled:
        raise HTTPException(status_code=410, detail="Sharing has been disabled")

    snap_result = await db.execute(
        select(BlueprintSnapshot)
        .where(BlueprintSnapshot.iteration_id == iteration.id)
        .order_by(BlueprintSnapshot.version_number.desc())
        .limit(1)
    )
    snap = snap_result.scalar_one_or_none()
    if not snap:
        raise HTTPException(status_code=404, detail="Blueprint is empty")

    return PublicBlueprintResponse(
        iteration_label=iteration.label,
        iteration_number=iteration.iteration_number,
        iteration_status=iteration.status,
        version_number=snap.version_number,
        content=snap.content or {},
        section_sources=snap.section_sources,
        bullet_sources=snap.bullet_sources,
        updated_at=snap.created_at,
    )


@router.get(
    "/api/projects/{project_id}/sessions/{session_id}/blueprint-diff",
    response_model=SessionBlueprintDiff,
)
async def get_session_blueprint_diff(
    project_id: str,
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SessionBlueprintDiff:
    """Section-level diff between the blueprint state immediately before this
    session started writing and the current state. Powers the post-session
    review screen.

    Baseline = the most recent snapshot in the session's iteration that this
    session did NOT create (or None if the session was the first writer).
    Current = the latest snapshot in the iteration.
    """
    from ..models.blueprint import BlueprintSuggestion
    from ..models.session import Session as SessionModel

    await _verify_project_access(project_id, user, db)

    sess_result = await db.execute(
        select(SessionModel).where(
            SessionModel.id == session_id,
            SessionModel.project_id == project_id,
        )
    )
    sess = sess_result.scalar_one_or_none()
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")

    # Current = latest snapshot in the session's iteration.
    cur_result = await db.execute(
        select(BlueprintSnapshot)
        .where(
            BlueprintSnapshot.project_id == project_id,
            BlueprintSnapshot.iteration_id == sess.iteration_id,
        )
        .order_by(BlueprintSnapshot.version_number.desc())
        .limit(1)
    )
    current = cur_result.scalar_one_or_none()
    if not current:
        raise HTTPException(status_code=404, detail="No blueprint snapshots for this iteration")

    # Baseline = most recent snapshot in this iteration NOT created by this
    # session (mirrors revert_session_changes' "pre-session state" logic).
    base_result = await db.execute(
        select(BlueprintSnapshot)
        .where(
            BlueprintSnapshot.project_id == project_id,
            BlueprintSnapshot.iteration_id == sess.iteration_id,
            or_(
                BlueprintSnapshot.session_id != session_id,
                BlueprintSnapshot.session_id.is_(None),
            ),
        )
        .order_by(BlueprintSnapshot.version_number.desc())
        .limit(1)
    )
    baseline = base_result.scalar_one_or_none()

    base_content = (baseline.content or {}) if baseline else {}
    cur_content = current.content or {}
    sections: dict[str, dict[str, str]] = {}
    for slug in set(base_content.keys()) | set(cur_content.keys()):
        old_v = base_content.get(slug, "") or ""
        new_v = cur_content.get(slug, "") or ""
        if old_v != new_v:
            sections[slug] = {"old": old_v, "new": new_v}

    pending_count = await db.scalar(
        select(func.count(BlueprintSuggestion.id)).where(
            BlueprintSuggestion.project_id == project_id,
            BlueprintSuggestion.session_id == session_id,
            BlueprintSuggestion.status == "pending",
        )
    )

    return SessionBlueprintDiff(
        baseline_snapshot_id=baseline.id if baseline else None,
        baseline_version=baseline.version_number if baseline else None,
        current_snapshot_id=current.id,
        current_version=current.version_number,
        sections=sections,
        pending_suggestions=int(pending_count or 0),
    )
