import asyncio
import base64
import json
import logging
import os
import re
import time
import uuid
from datetime import UTC, datetime, timedelta

import redis.asyncio as aioredis
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..config import get_settings
from ..db import get_db, get_session_factory
from ..deps import get_current_org, get_current_user
from ..middleware.rate_limit import limiter
from ..models.organization import Organization
from ..models.project import Project
from ..models.project_attachment import ProjectAttachment
from ..models.session import ChatMessage, Participant, Session
from ..models.user import User
from ..schemas.session import (
    AIEditElementRequest,
    BlueprintReviewComplete,
    ChatMessageCreate,
    ChatMessageResponse,
    ChatMessageUpdate,
    ExplainTermRequest,
    MessageReactionRequest,
    MessageReactionResponse,
    SessionCreate,
    SessionResponse,
    SessionUpdate,
)
from ..schemas.session_extraction import SessionExtractionOut
from ..schemas.wireframe_plan import (
    GenerateRequest,
    GenerateResponse,
    InferRequest,
    InferResponse,
    PlanPatchRequest,
    PlanPatchResponse,
)
from ..services.audit_service import log_audit
from ..services.blueprint_service import get_or_create_blueprint, update_section
from ..services.facilitator import process_message
from ..services.image_insight import describe_image
from ..services.livekit_service import publish_steering
from ..services.mentions import resolve_mentions
from ..services.project_context import attachment_line, reference_lines
from ..services.slack_dispatcher import dispatch_event
from ..services.tts_service import list_voices, synthesize_speech, synthesize_speech_mp3
from ..services.wireframe_dna import dna_block_for_subscreen, extract_design_dna
from ..services.wireframe_plan_service import (
    get_plan,
    infer_plan,
    mark_screens_status,
    patch_plan,
    screens_to_pipeline_entries,
    select_for_generation,
)
from ..services.wireframe_references import reference_block_for_screen
from ..ws.manager import manager

router = APIRouter(tags=["sessions"])
logger = logging.getLogger(__name__)

# A project is described with a handful of mockups, not an album; past this the
# opening context stops being an opening. These reads are model spend nobody
# pressed a button for, so they are bounded three ways: only screenshots the
# author attached, only the project's first session, and only this many.
MAX_READ_SCREENSHOTS = 4


@router.post("/api/projects/{project_id}/create-from-review")
async def create_from_review(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Generate tasks + scaffold from blueprint after review screen approval."""

    # Verify project exists
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Find the reviewing session and complete it
    session_result = await db.execute(
        select(Session).where(
            Session.project_id == project_id,
            Session.status == "reviewing",
        )
    )
    session_obj = session_result.scalar_one_or_none()
    if session_obj:
        session_obj.status = "completed"

        # Lock the iteration when completing
        if session_obj.iteration_id:
            from ..services.blueprint_service import lock_iteration

            await lock_iteration(session_obj.iteration_id, db, user.id)

        await log_audit(
            db,
            org_id=session_obj.org_id,
            user_id=user.id,
            action="lock",
            resource_type="iteration",
            resource_id=session_obj.iteration_id,
            metadata={"project_id": project_id, "session_id": session_obj.id},
        )
        await db.commit()

    # Generate tasks in background
    session_id = session_obj.id if session_obj else None
    asyncio.create_task(_generate_tasks_on_complete(project_id, session_id=session_id))

    return {"status": "creating", "project_id": project_id}


async def _generate_tasks_on_complete(project_id: str, session_id: str | None = None) -> None:
    """Background task: generate kanban cards from the blueprint when a session completes."""
    try:
        from ..services.task_generator import generate_tasks_from_blueprint

        session_factory = get_session_factory()
        async with session_factory() as db:
            # Get org_id for AI provider routing
            proj_result = await db.execute(select(Project.org_id).where(Project.id == project_id))
            org_id = proj_result.scalar_one_or_none()

            bp = await get_or_create_blueprint(project_id, db)
            board = await generate_tasks_from_blueprint(
                project_id, bp.content, db, org_id=org_id, session_id=session_id
            )
            logger.info("Generated kanban board with %d columns for project %s", len(board.columns), project_id)
    except Exception as e:
        logger.error("Failed to generate tasks on session complete: %s", e, exc_info=True)


# ─── Stories preview / commit (wizard flow) ──────────────────────────────────


class _StoryChildInput(BaseModel):
    title: str
    description: str | None = None
    priority: str = "medium"
    story_points: int | None = None
    labels: list[str] = Field(default_factory=list)
    acceptance_criteria: list[str] = Field(default_factory=list)
    depends_on_indices: list[int] = Field(default_factory=list)
    template_slug: str | None = None
    custom_fields: dict = Field(default_factory=dict)


class _StoryTaskInput(BaseModel):
    title: str
    description: str | None = None
    priority: str = "medium"
    story_points: int | None = None
    labels: list[str] = Field(default_factory=list)
    acceptance_criteria: list[str] = Field(default_factory=list)
    depends_on_indices: list[int] = Field(default_factory=list)
    related_to_indices: list[int] = Field(default_factory=list)
    wave: int | None = None
    sequence: int | None = None
    template_slug: str | None = None
    custom_fields: dict = Field(default_factory=dict)
    children: list[_StoryChildInput] = Field(default_factory=list)


class _CommitStoriesBody(BaseModel):
    tasks: list[_StoryTaskInput]


class _PreviewStoriesBody(BaseModel):
    """Optional regeneration feedback. Empty body == fresh first-time preview."""

    feedback: str | None = None
    disliked_titles: list[str] = Field(default_factory=list)
    # Granularity axis (one of GRANULARITY_SLUGS). Aliased as ``style`` for
    # backwards compat with the original single-axis API; new callers should
    # send ``granularity`` and ``modifiers`` together.
    style: str | None = None
    granularity: str | None = None
    # 0+ functional modifiers (MODIFIER_SLUGS). Validated below.
    modifiers: list[str] = Field(default_factory=list)


class _RegenerateSingleTaskBody(BaseModel):
    """Per-card regenerate from the wizard's expanded view.

    The wizard sends the current task in full so the AI can keep the parts
    the user didn't ask to regenerate. ``context_titles`` is the list of all
    other (live) tasks in the wizard so the model knows what already exists
    and avoids duplication. ``fields`` lists the names to rewrite.
    """

    task: _StoryTaskInput
    fields: list[str]
    feedback: str | None = None
    context_titles: list[str] = Field(default_factory=list)


# ─── DORMANT: the platform's own story generator ─────────────────────────────
# preview_stories / preview_stories_async / the jobs routes / regenerate-task
# are no longer called by the shell — story generation moved to the yeaboi
# engine (the renderer's Generate dialog runs plan_generate and lands cards
# through /stories/commit, which stays). Kept for one release so an older
# shell build against this wheel keeps working; delete with task_generator*,
# task_generation_job and their tables in the follow-up sweep.
@router.post("/api/projects/{project_id}/stories/preview")
async def preview_stories(
    project_id: str,
    body: _PreviewStoriesBody | None = None,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Preview the kanban tasks that would be generated from the current blueprint.

    Calls Claude to generate the task list (with waves, dependencies, related-to
    soft links) but does NOT persist anything. The wizard's StoriesPane shows
    this to the user so they can edit/remove before committing.

    Optional body: ``{feedback: str, disliked_titles: list[str]}`` — when the
    user clicks Regenerate they can tell the model what was wrong with the
    previous attempt. Both fields are optional; an empty body matches the
    original behaviour.
    """
    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    from ..services.task_generator import preview_tasks_from_blueprint

    bp = await get_or_create_blueprint(project_id, db)
    if not bp.content or not any((v or "").strip() for v in bp.content.values()):
        raise HTTPException(
            status_code=422,
            detail="Blueprint is empty — fill in at least one section before previewing tasks.",
        )

    feedback_context = None
    if body and (body.feedback or body.disliked_titles):
        feedback_context = {
            "feedback": (body.feedback or "").strip()[:2000],  # cap at 2K chars
            "disliked_titles": [t.strip() for t in body.disliked_titles if t and t.strip()][:30],
        }

    try:
        tasks = await preview_tasks_from_blueprint(
            bp.content,
            db,
            org_id=org.id,
            feedback_context=feedback_context,
        )
    except Exception as exc:
        logger.exception("Task preview failed for project %s", project_id)
        raise HTTPException(
            status_code=502,
            detail=f"AI provider could not generate tasks: {exc.__class__.__name__}: {exc}",
        ) from exc

    if not tasks:
        # preview_tasks_from_blueprint() returns [] on AI parse failure or empty
        # blueprint; we already checked the blueprint above, so this means the AI
        # returned something we couldn't parse.
        raise HTTPException(
            status_code=502,
            detail="AI returned no usable tasks. Try again, or add more detail to the blueprint.",
        )

    # Surface the org's templates so the wizard can render proper type chips
    # for custom slugs (system slugs have built-in fallbacks in TemplateBadge).
    from ..services.ticket_template_service import get_org_ticket_templates

    org_templates = await get_org_ticket_templates(org.id, db)
    templates_payload = [{"slug": t.slug, "name": t.name} for t in org_templates]

    return {"tasks": tasks, "templates": templates_payload}


@router.post("/api/projects/{project_id}/stories/preview-async")
async def preview_stories_async(
    project_id: str,
    background_tasks: BackgroundTasks,
    body: _PreviewStoriesBody | None = None,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Kick off per-execution-wave task generation as a background job.

    Returns ``{"job_id": str}`` immediately. The frontend polls
    ``GET /api/jobs/{job_id}`` to read incremental progress (each wave's
    tasks land in ``partial_tasks`` as they're generated). Survives any
    HTTP proxy timeout because no request ever holds the full LLM duration.

    Idempotent per session: if a non-terminal job already exists for the
    same session_id, returns that job_id rather than spawning a duplicate.
    """
    from ..logging_config import propagate_context
    from ..models.task_generation_job import TaskGenerationJob
    from ..services.generation_styles import (
        DEFAULT_GRANULARITY,
        GRANULARITY_SLUGS,
        MODIFIER_SLUGS,
        STYLE_SLUGS,
    )
    from ..services.granularity_service import (
        ensure_org_granularities,
        get_org_granularities,
    )
    from ..services.modifier_service import ensure_org_modifiers, get_org_modifiers
    from ..services.repo_conventions_analyzer import RepoAnalysisError, ensure_repo_profile
    from ..services.task_generator_waves import run_wave_generation

    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    bp = await get_or_create_blueprint(project_id, db)
    if not bp.content or not any((v or "").strip() for v in bp.content.values()):
        raise HTTPException(
            status_code=422,
            detail="Blueprint is empty — fill in at least one section before previewing tasks.",
        )

    sess_result = await db.execute(
        select(Session).where(Session.project_id == project_id, Session.status == "reviewing")
    )
    session_obj = sess_result.scalar_one_or_none()
    if not session_obj:
        # Fall back to the most recent live/active session for this project so
        # the wizard's wrap-up flow works even outside the strict "reviewing"
        # status (mirrors how preview_stories tolerates other states).
        sess_result = await db.execute(
            select(Session)
            .where(Session.project_id == project_id)
            .order_by(Session.created_at.desc())
        )
        session_obj = sess_result.scalars().first()
    if not session_obj:
        raise HTTPException(status_code=404, detail="No session found for project")

    feedback_context = None
    if body and (body.feedback or body.disliked_titles):
        feedback_context = {
            "feedback": (body.feedback or "").strip()[:2000],
            "disliked_titles": [t.strip() for t in body.disliked_titles if t and t.strip()][:30],
        }

    # Iteration 6: validate against the org's editable granularity + modifier
    # rows, not the static system enums — admins can add custom slugs that
    # wouldn't appear in STYLE_SLUGS / GRANULARITY_SLUGS / MODIFIER_SLUGS.
    # Seeded on first access if the org hasn't been touched yet.
    await ensure_org_granularities(org.id, db)
    await ensure_org_modifiers(org.id, db)
    org_grans = await get_org_granularities(org.id, db)
    org_mods = await get_org_modifiers(org.id, db)
    org_gran_slugs = {g.slug for g in org_grans}
    org_mod_slugs = {m.slug for m in org_mods}

    # Resolve granularity: explicit `granularity` > legacy `style` > project default > global default.
    # We accept the legacy ``style`` field but only honour it when it names a
    # granularity slug — modifier slugs sent in ``style`` get re-routed into
    # ``modifiers`` so old clients still steer the generation correctly.
    body_granularity = (body.granularity if body else None) or None
    legacy_style = (body.style if body else None) or None
    # An unknown legacy `style` value (not a known system slug) almost always
    # means a typo — surface it rather than silently dropping the user's intent.
    if legacy_style and legacy_style not in STYLE_SLUGS and legacy_style not in (org_gran_slugs | org_mod_slugs):
        raise HTTPException(
            status_code=422,
            detail=f"Unknown style {legacy_style!r}.",
        )
    if body_granularity is None and legacy_style and legacy_style in org_gran_slugs:
        body_granularity = legacy_style
    raw_granularity = body_granularity or project.default_generation_style or DEFAULT_GRANULARITY
    if raw_granularity not in org_gran_slugs:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown granularity {raw_granularity!r}. Valid: {sorted(org_gran_slugs)}",
        )

    # Resolve modifiers: explicit list > legacy ``style`` value if it's a modifier > project defaults.
    raw_modifiers: list[str] = list((body.modifiers if body else None) or [])
    if not raw_modifiers and legacy_style and legacy_style in org_mod_slugs:
        raw_modifiers = [legacy_style]
    if not raw_modifiers and project.default_modifiers:
        raw_modifiers = list(project.default_modifiers)
    bad = [m for m in raw_modifiers if m not in org_mod_slugs]
    if bad:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown modifier(s) {bad}. Valid: {sorted(org_mod_slugs)}",
        )
    # Dedupe while preserving order — duplicates would just bloat the prompt.
    seen: set[str] = set()
    raw_modifiers = [m for m in raw_modifiers if not (m in seen or seen.add(m))]

    # `follow_practices` modifier needs a fresh-or-cached repo profile. Any
    # failure surfaces as a non-fatal warning and we drop the modifier (other
    # modifiers + granularity still apply).
    chosen_granularity = raw_granularity
    chosen_modifiers = list(raw_modifiers)
    repo_profile: dict | None = None
    warning: str | None = None
    if "follow_practices" in chosen_modifiers:
        try:
            repo_profile = await ensure_repo_profile(project=project, db=db)
        except RepoAnalysisError as exc:
            logger.warning(
                "follow_practices dropped for project %s: %s", project_id, exc
            )
            chosen_modifiers = [m for m in chosen_modifiers if m != "follow_practices"]
            warning = (
                f"Couldn't read your repo's conventions ({exc}). "
                "Generated tickets without the follow-practices guidance."
            )

    # Idempotent: reuse an in-flight job for the same session — BUT only if
    # the granularity + modifier set + feedback context all match. Switching
    # any axis must spawn a fresh job since the in-flight one is committed
    # to its own style block.
    existing = (
        await db.execute(
            select(TaskGenerationJob).where(
                TaskGenerationJob.session_id == session_obj.id,
                TaskGenerationJob.status.in_(("pending", "running")),
            )
        )
    ).scalars().first()
    existing_modifiers = sorted(list(existing.modifiers or [])) if existing else []
    if (
        existing
        and feedback_context is None
        and existing.style == chosen_granularity
        and existing_modifiers == sorted(chosen_modifiers)
    ):
        resp: dict = {"job_id": existing.id}
        if warning:
            resp["warning"] = warning
        return resp

    # If there's an in-flight job and we're starting a new one (regenerate,
    # different granularity, or different modifiers), cancel the old one first.
    if existing:
        existing.status = "cancelled"
        await db.commit()

    job = TaskGenerationJob(
        project_id=project_id,
        session_id=session_obj.id,
        org_id=org.id,
        status="pending",
        current_wave=0,
        waves_complete=0,
        partial_tasks=[],
        feedback_context=feedback_context,
        style=chosen_granularity,
        modifiers=chosen_modifiers,
        repo_profile_json=repo_profile,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    background_tasks.add_task(propagate_context(run_wave_generation, job.id))
    resp = {"job_id": job.id}
    if warning:
        resp["warning"] = warning
    return resp


@router.get("/api/jobs/{job_id}")
async def get_job_status(
    job_id: str,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Read current state of a task-generation job.

    Returns the accumulated task list as it grows so the wizard can render
    each wave's cards as they land. ``waves_complete`` indicates how many
    waves have finished — useful for the loader to know which skeleton wave
    blocks to keep showing.
    """
    from ..models.task_generation_job import TaskGenerationJob

    job = (
        await db.execute(select(TaskGenerationJob).where(TaskGenerationJob.id == job_id))
    ).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.org_id != org.id:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "id": job.id,
        "status": job.status,
        "current_wave": job.current_wave,
        "waves_complete": job.waves_complete,
        "partial_tasks": job.partial_tasks or [],
        "templates": job.templates_payload or [],
        "error": job.error,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
    }


@router.post("/api/jobs/{job_id}/cancel")
async def cancel_job(
    job_id: str,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Mark a running job as cancelled.

    The worker checks status at the top of each wave loop iteration and
    bails cleanly. Already-generated waves remain in ``partial_tasks`` so
    the wizard can still proceed with what's there if desired.
    """
    from ..models.task_generation_job import TaskGenerationJob

    job = (
        await db.execute(select(TaskGenerationJob).where(TaskGenerationJob.id == job_id))
    ).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.org_id != org.id:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status in ("complete", "failed", "cancelled"):
        return {"id": job.id, "status": job.status}
    job.status = "cancelled"
    await db.commit()
    return {"id": job.id, "status": job.status}


@router.post("/api/projects/{project_id}/stories/commit")
async def commit_stories(
    project_id: str,
    body: _CommitStoriesBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Persist user-approved tasks as Cards, complete the reviewing session, lock the iteration.

    The wizard calls this after the user has accepted defaults, previewed stories,
    and optionally edited the task list. Replaces the legacy create-from-review
    flow which would re-call Claude and ignore the user's edits.
    """
    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    tasks_dicts = [t.model_dump() for t in body.tasks]
    n = len(tasks_dicts)
    for i, t in enumerate(tasks_dicts):
        for j in t.get("depends_on_indices", []):
            if not (isinstance(j, int) and 0 <= j < i):
                raise HTTPException(
                    status_code=400,
                    detail=f"Task {i} depends_on_indices contains invalid index {j} (must be < {i})",
                )
        for j in t.get("related_to_indices", []):
            if not (isinstance(j, int) and 0 <= j < n and j != i):
                raise HTTPException(
                    status_code=400,
                    detail=f"Task {i} related_to_indices contains invalid index {j}",
                )

    sess_result = await db.execute(
        select(Session).where(Session.project_id == project_id, Session.status == "reviewing")
    )
    session_obj = sess_result.scalar_one_or_none()
    session_id = session_obj.id if session_obj else None

    from ..services.task_generator import persist_tasks_to_board

    _board, task_count = await persist_tasks_to_board(project_id, tasks_dicts, db, session_id=session_id)

    if session_obj:
        from ..services.blueprint_service import lock_iteration

        session_obj.status = "completed"
        if session_obj.iteration_id:
            await lock_iteration(session_obj.iteration_id, db, user.id)
        await log_audit(
            db,
            org_id=session_obj.org_id,
            user_id=user.id,
            action="lock",
            resource_type="iteration",
            resource_id=session_obj.iteration_id,
            metadata={"project_id": project_id, "session_id": session_obj.id, "task_count": task_count},
        )
        await db.commit()

    return {"task_count": task_count, "session_id": session_id, "project_id": project_id}


@router.post("/api/projects/{project_id}/stories/preview/regenerate-task")
async def regenerate_single_story(
    project_id: str,
    body: _RegenerateSingleTaskBody,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Regenerate selected fields of one task in the wizard preview.

    Backs the wizard's per-card "Regenerate this ticket" button. The user
    picks which fields to rewrite (description / acceptance_criteria / labels
    / etc) and optionally adds free-form feedback. System-managed fields
    (depends_on_indices, related_to_indices, wave, sequence) are preserved
    so the dep graph stays intact.
    """
    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    from ..services.task_generator import REGEN_FIELDS_ALLOWED, regenerate_single_task

    invalid = [f for f in body.fields if f not in REGEN_FIELDS_ALLOWED]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid fields {invalid}. Allowed: {sorted(REGEN_FIELDS_ALLOWED)}",
        )
    if not body.fields:
        raise HTTPException(status_code=400, detail="`fields` must be a non-empty list")

    bp = await get_or_create_blueprint(project_id, db)

    try:
        new_task = await regenerate_single_task(
            existing_task=body.task.model_dump(),
            fields_to_regenerate=body.fields,
            blueprint_content=bp.content,
            context_titles=list(body.context_titles),
            feedback=body.feedback,
            db=db,
            org_id=org.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Single-task regen failed for project %s", project_id)
        raise HTTPException(
            status_code=502,
            detail=f"AI provider could not regenerate task: {exc.__class__.__name__}: {exc}",
        ) from exc

    return {"task": new_task}


BLUEPRINT_SECTIONS_LIST = [
    "project_overview",
    "goals_constraints",
    "users_personas",
    "team_capacity",
    "architecture",
    "tech_stack",
    "api_integrations",
    "ui_ux",
    "security_compliance",
    "infrastructure",
    "risks_unknowns",
    "out_of_scope",
    "open_questions",
]

EXTRACT_PROMPT = (
    "You are analyzing a planning conversation to extract ONLY facts "
    "that were explicitly stated or confirmed by a user.\n\n"
    "CONVERSATION:\n{conversation}\n\n"
    "CURRENT BLUEPRINT STATE:\n{blueprint_state}\n\n"
    "INSTRUCTIONS:\n"
    "1. Extract ONLY concrete facts explicitly stated or confirmed "
    "by a user in the conversation.\n"
    "2. NEVER infer, guess, or fill in defaults for any section "
    "— not even for simple projects.\n"
    "3. If a section has no direct evidence from the conversation, "
    "DO NOT include it. Return an empty array if nothing new was discussed.\n"
    "4. Only update sections where a user has directly provided "
    "information or confirmed an AI recommendation.\n"
    "5. Your update REPLACES the entire section. Always include the "
    "existing content from CURRENT BLUEPRINT STATE and ADD new facts to it. "
    "Never drop existing content when adding new information.\n"
    '6. Each update must include a "source" field: '
    '"user_stated" if the user said it directly.\n\n'
    "Output ONLY valid JSON array, no markdown fences:\n"
    "[\n"
    '  {{"section": "section_name", '
    '"content": "Content from explicit user statements.", '
    '"source": "user_stated"}}\n'
    "]\n\n"
    "If there is nothing new to extract, output: []\n\n"
    "Valid sections: {sections}"
)


# Wake patterns mirrored from the voice worker's `_is_addressed`. When a
# session is in `responsive` mode the chat path uses these to decide whether
# to spin up the facilitator at all — same heuristic the voice agent uses
# when listening to live audio, so the two surfaces respond to the same
# kinds of nudges.
_CHAT_WAKE_RE = __import__("re").compile(
    r"\b(@?ai|agent|facilitator|hey\s+ai|senior\s+engineer|product\s+manager|"
    r"system\s+architect|patient\s+mentor|devil['’]s\s+advocate)\b",
    __import__("re").IGNORECASE,
)


def _should_run_chat_facilitator(
    ai_config: dict | None,
    latest_user_message: str | None,
) -> tuple[bool, str | None, bool]:
    """Chat-side analog of voice worker's `should_respond`.

    Returns (run, skip_reason, consumed_one_shot). When `run` is False,
    `skip_reason` is a short machine-readable string the WS broadcasts so
    the panel can show a hint. `consumed_one_shot` is True when the
    decision used a non-expired `pending_one_shot`; the caller is expected
    to clear it from `ai_config` so subsequent turns don't keep firing.

    A `pending_one_shot` set by `/ask` always wins regardless of mode — it
    is an explicit summon, matching how the voice worker treats `/ask`.
    """
    cfg = ai_config or {}
    one_shot = cfg.get("pending_one_shot") or {}
    if one_shot:
        import time as _t

        expires = one_shot.get("expires")
        if isinstance(expires, (int, float)) and expires >= _t.time():
            return True, None, True
        # Expired — fall through to mode-based gating.

    mode = (cfg.get("involvement") or "facilitator").lower()
    msg = (latest_user_message or "").strip()

    if mode in ("facilitator", "driver"):
        return True, None, False
    if mode == "observer":
        return False, "observer", False
    if mode == "responsive":
        if not msg:
            return False, "responsive_no_message", False
        if _CHAT_WAKE_RE.search(msg) or "?" in msg:
            return True, None, False
        return False, "responsive_not_addressed", False
    # Unknown mode — default to running so a typo doesn't silence the bot.
    return True, None, False


async def _extract_blueprint_background(
    *,
    session_id: str,
    project_id: str,
    messages_history: list[dict],
    blueprint_content: dict,
    org_id: str | None,
) -> None:
    """Run extraction in its own DB session so it doesn't block the facilitator turn.

    Mirrors the voice worker's async-extraction pattern. Failures are swallowed
    here — the user already saw the assistant reply and the next 4-message
    window will retry naturally.
    """
    try:
        session_factory = get_session_factory()
    except Exception as e:
        logger.error("Background extractor: session factory unavailable: %s", e)
        return
    async with session_factory() as db:
        try:
            applied = await _extract_blueprint_inline(
                project_id,
                messages_history,
                blueprint_content,
                db,
                org_id=org_id,
                session_id=session_id,
            )
            if applied:
                latest_bp = await get_or_create_blueprint(project_id, db)
                for bp_update in applied:
                    await manager.send_to(
                        session_id,
                        {
                            "type": "blueprint_update",
                            "payload": {
                                "section": bp_update["section"],
                                "content": bp_update["content"],
                                "version": latest_bp.version_number,
                                "source": bp_update.get("source", "user_stated"),
                            },
                        },
                    )
        except Exception as extract_err:
            logger.error(
                "facilitator.extract_failed",
                extra={"session_id": session_id, "project_id": project_id, "err": str(extract_err)},
                exc_info=True,
            )


async def _extract_blueprint_inline(
    project_id: str,
    messages: list[dict],
    current_bp: dict,
    db: AsyncSession,
    org_id: str | None = None,
    session_id: str | None = None,
) -> list[dict]:
    """Extract blueprint info from conversation using AI. Runs inline with same DB session."""
    from ..services.ai_provider import get_ai_client, get_ai_client_for_role  # noqa: F401

    logger.info("[EXTRACT] Starting extraction for project %s, %s messages", project_id, len(messages))

    # Chat-only: this fallback extraction runs after the facilitator handles a
    # *typed* chat message and is meant to catch blueprint-relevant facts the
    # inline `blueprint_update` JSON blocks missed. Voice transcripts have
    # their own AI Suggestions queue (see `passive_extraction.py`) and must
    # not be silently committed to the blueprint here.
    chat_only = [m for m in messages if m.get("message_type") in ("chat", "ai")]
    if not chat_only:
        logger.debug("No chat messages in slice — aborting extraction")
        return

    conv_lines = []
    for msg in chat_only[-15:]:
        speaker = (
            msg.get("user_name") or msg.get("speaker_name") or ("User" if msg.get("message_type") == "chat" else "AI")
        )
        conv_lines.append(f"{speaker}: {msg.get('content', '')}")

    if not conv_lines:
        logger.debug("No conversation lines — aborting extraction")
        return

    logger.debug("Conversation (%d lines)", len(conv_lines))
    for line in conv_lines[-5:]:
        logger.debug("  %s", line[:100])

    bp_lines = []
    section_labels = {
        "project_overview": "Project Overview",
        "goals_constraints": "Goals & Constraints",
        "users_personas": "Users & Personas",
        "architecture": "Architecture",
        "tech_stack": "Tech Stack",
        "api_integrations": "API & Integrations",
        "ui_ux": "UI/UX",
        "security_compliance": "Security & Compliance",
        "infrastructure": "Infrastructure",
        "open_questions": "Open Questions",
    }
    for key, label in section_labels.items():
        val = (current_bp.get(key) or "").strip()
        bp_lines.append(f"{label}: {val if val else 'EMPTY'}")

    prompt = EXTRACT_PROMPT.format(
        conversation="\n".join(conv_lines),
        blueprint_state="\n".join(bp_lines),
        sections=", ".join(BLUEPRINT_SECTIONS_LIST),
    )

    try:
        ai = await get_ai_client(org_id, db, task="fast")
        logger.info("[EXTRACT] Calling AI (%s/%s)", ai.provider, ai.model)
        raw = await ai.chat(
            messages=[{"role": "user", "content": prompt}],
            max_tokens=2048,
        )
        raw = raw.strip()
        logger.info("[EXTRACT] AI responded, length: %s", len(raw))
    except Exception as api_err:
        logger.error("[EXTRACT] API FAILED: %s", api_err, exc_info=True)
        raise

    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

    try:
        updates = json.loads(raw)
    except json.JSONDecodeError as je:
        logger.error("Extraction JSON parse failed: %s", je)
        logger.debug("Raw extraction response: %s", raw[:500])
        return

    if not isinstance(updates, list) or not updates:
        logger.debug("No updates in response (type=%s)", type(updates).__name__)
        return

    logger.info("Found %d updates to apply", len(updates))
    applied = []
    for item in updates:
        section = item.get("section", "")
        content = item.get("content", "").strip()
        source = item.get("source", "user_stated")
        if section in BLUEPRINT_SECTIONS_LIST and content:
            logger.info("Updating %s (source=%s): %s", section, source, content[:80])
            # Tag as ai_facilitator so the history label reflects the actual
            # source (chat extraction). "ai_extraction" maps to "Voice Agent"
            # in `blueprint_authors.py` and would mislabel typed-chat-derived
            # writes as voice-derived.
            await update_section(project_id, section, content, "ai_facilitator", db, session_id=session_id)
            applied.append({"section": section, "content": content, "source": source})
        else:
            logger.debug("Skipping invalid: section=%r", section)

    logger.info("Extraction complete (%d applied)", len(applied))
    return applied


def _serialize_session(session: Session) -> dict:
    """Serialize a session with participant user info."""
    return {
        "id": session.id,
        "project_id": session.project_id,
        "org_id": session.org_id,
        "status": session.status,
        "title": session.title,
        "initial_idea": session.initial_idea,
        "join_code": session.join_code,
        "ai_config": session.ai_config,
        "iteration_id": session.iteration_id,
        "canvas_elements": session.canvas_elements,
        "focus_sections": session.focus_sections,
        "focus_target": session.focus_target,
        "blueprint_review_status": session.blueprint_review_status,
        "blueprint_review_completed_at": session.blueprint_review_completed_at,
        "created_at": session.created_at,
        "updated_at": session.updated_at,
        "participants": [
            {
                "id": p.id,
                "user_id": p.user_id,
                "role": p.role,
                "user_name": p.user.name if p.user else None,
                "user_email": p.user.email if p.user else None,
                "recording_consent": p.recording_consent,
                "created_at": p.created_at,
            }
            for p in session.participants
        ],
    }


@router.post("/api/projects/{project_id}/sessions/check-relevance")
async def check_session_relevance(
    project_id: str,
    body: SessionCreate,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Check if a session idea is relevant to the project scope."""
    if not body.initial_idea or not body.initial_idea.strip():
        return {"relevant": True, "reason": ""}

    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    from ..services.ai_provider import get_ai_client, get_ai_client_for_role  # noqa: F401

    ai = await get_ai_client(org.id, db, task="fast")

    prompt = (
        f"Project name: {project.name}\n"
        f"Project description: {project.description or 'No description'}\n\n"
        f"Proposed session idea: {body.initial_idea}\n\n"
        "Is this session idea related to this project? "
        "Be lenient — refinements, new features, pivots within scope, "
        "and technical deep-dives all count as relevant. "
        "Only flag as irrelevant if the idea is clearly about a "
        "completely different product or domain.\n\n"
        'Reply with ONLY valid JSON: {"relevant": true/false, "reason": "one sentence max, 10 words or fewer"}'
    )

    try:
        raw = await ai.chat(
            messages=[{"role": "user", "content": prompt}],
            max_tokens=150,
        )
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()
        parsed = json.loads(raw)
        return {
            "relevant": bool(parsed.get("relevant", True)),
            "reason": str(parsed.get("reason", "")),
        }
    except Exception as e:
        logger.warning("Relevance check failed: %s", e)
        return {"relevant": True, "reason": ""}  # Fail open


@router.get("/api/projects/{project_id}/session-suggestions")
async def session_suggestions(
    project_id: str,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Suggest what the next session should focus on, based on blueprint gaps."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    bp = await get_or_create_blueprint(project_id, db)
    from ..schemas.blueprint import ITERATION_TYPES as _ITER_TYPES_MAP
    from ..services.blueprint_service import get_active_iteration as _get_active_iter
    from ..services.facilitator import PERSONA_FOCUS_SECTIONS, SECTION_LABELS, assess_coverage

    # Resolve iteration type sections for scoped coverage
    _active = await _get_active_iter(project_id, db)
    _sections_filter = None
    if _active and _active.iteration_type and _active.iteration_type in _ITER_TYPES_MAP:
        _sections_filter = _ITER_TYPES_MAP[_active.iteration_type]["sections"]

    cov = assess_coverage(bp.content, sections_filter=_sections_filter)
    scores = cov["scores"]
    gaps = [s for s in scores if scores[s] < 80]

    # Build suggested session focus areas
    suggestions: list[dict] = []
    has_blueprint = any(v for v in bp.content.values() if v and str(v).strip())

    if not gaps:
        # Blueprint is complete — suggest refinement
        suggestions.append(
            {
                "label": "Refine & stress-test",
                "description": (
                    f"Review the blueprint with Devil's Advocate to find "
                    f"weaknesses in {project.name or 'your project'}."
                ),
                "persona": "challenger",
                "type": "refinement",
            }
        )
    elif not has_blueprint:
        # No blueprint yet — just show a general start option
        suggestions.append(
            {
                "label": "General planning session",
                "description": "Outline the full project — goals, users, tech stack, architecture, and more.",
                "persona": "default",
                "type": "general",
            }
        )
    else:
        # Has blueprint with gaps — show persona-focused suggestions
        persona_gaps: dict[str, list[str]] = {}
        for s in gaps:
            best_persona = "default"
            for p_id, p_sections in PERSONA_FOCUS_SECTIONS.items():
                if s in p_sections:
                    best_persona = p_id
                    break
            persona_gaps.setdefault(best_persona, []).append(s)

        persona_labels_map = {
            "default": "Senior Engineer",
            "pm": "Product Manager",
            "architect": "System Architect",
            "challenger": "Devil's Advocate",
            "mentor": "Patient Mentor",
        }

        for p_id, section_keys in persona_gaps.items():
            section_names = [SECTION_LABELS.get(s, s) for s in section_keys[:3]]
            suffix = f" +{len(section_keys) - 3} more" if len(section_keys) > 3 else ""
            suggestions.append(
                {
                    "label": f"Focus on {', '.join(section_names)}{suffix}",
                    "description": (
                        f"Use {persona_labels_map.get(p_id, p_id)} to cover "
                        f"{len(section_keys)} gap{'s' if len(section_keys) != 1 else ''}."
                    ),
                    "persona": p_id,
                    "sections": section_keys,
                    "type": "focused",
                }
            )

        suggestions.sort(key=lambda x: len(x.get("sections", [])), reverse=True)

    # Return iteration types from DB (org-customizable templates)
    from ..services.blueprint_service import get_active_iteration, list_iterations
    from ..services.blueprint_template_service import ensure_org_blueprints, get_org_personas, get_org_templates

    await ensure_org_blueprints(org.id, db)
    active_iter = await get_active_iteration(project_id, db)
    parent_oos = None

    # Build types list from DB templates
    db_templates = await get_org_templates(org.id, db)
    db_personas = await get_org_personas(org.id, db)
    persona_map = {p.id: p for p in db_personas}

    iteration_types_list = []
    for tmpl in db_templates:
        default_persona_slug = "default"
        if tmpl.default_persona_id and tmpl.default_persona_id in persona_map:
            default_persona_slug = persona_map[tmpl.default_persona_id].slug
        iteration_types_list.append(
            {
                "id": tmpl.slug,
                "label": tmpl.name,
                "icon": tmpl.icon,
                "description": tmpl.description or "",
                "default_persona": default_persona_slug,
                "sections_count": len(tmpl.sections),
                "sections": tmpl.sections,
            }
        )

    if active_iter and active_iter.forked_from_id:
        parent_oos = active_iter.parent_out_of_scope or ""
        # Replace generic suggestions with release-aware ones
        if parent_oos.strip():
            release_label = active_iter.display_name or f"Release {active_iter.iteration_number}"
            suggestions = [
                {
                    "label": f"Plan {release_label}",
                    "description": (
                        "Decide which features from the previous release's excluded list to bring into scope."
                    ),
                    "persona": "pm",
                    "type": "general",
                },
            ]

    # Check if first release is complete (v1 locked)
    all_iters = await list_iterations(project_id, db)
    first_release_complete = bool(all_iters and all_iters[0].status == "locked")

    # Find active (live/paused) sessions for warnings
    active_sess_result = await db.execute(
        select(Session).where(
            Session.project_id == project_id,
            Session.status.in_(["live", "paused"]),
        )
    )
    active_sess_list = []
    for s in active_sess_result.scalars().all():
        s_iter = next((i for i in all_iters if i.id == s.iteration_id), None)
        active_sess_list.append(
            {
                "id": s.id,
                "title": s.title,
                "release_name": (s_iter.display_name or f"Release {s_iter.iteration_number}") if s_iter else None,
            }
        )

    return {
        "project_description": project.description or "",
        "overall_coverage": cov["overall"],
        "grade": cov["grade"],
        "suggestions": suggestions[:5],
        "has_blueprint": has_blueprint,
        "iteration_types": iteration_types_list,
        "parent_out_of_scope": parent_oos,
        "first_release_complete": first_release_complete,
        "active_sessions": active_sess_list,
        "active_iteration": {
            "id": active_iter.id,
            "label": active_iter.label,
            "display_name": active_iter.display_name,
            "iteration_type": active_iter.iteration_type,
            "status": active_iter.status,
        }
        if active_iter
        else None,
    }


@router.get("/api/sessions/{session_id}/resume-info")
async def get_resume_info(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get coverage gaps and persona recommendations for resuming a session."""
    result = await db.execute(select(Session).where(Session.id == session_id))
    session_obj = result.scalar_one_or_none()
    if not session_obj:
        raise HTTPException(status_code=404, detail="Session not found")

    from ..services.blueprint_service import get_or_create_blueprint
    from ..services.blueprint_template_service import get_org_personas, get_template_sections
    from ..services.facilitator import SECTION_LABELS, assess_coverage

    bp = await get_or_create_blueprint(session_obj.project_id, db, iteration_id=session_obj.iteration_id)

    # Get iteration type sections filter from DB
    sections_filter = None
    if session_obj.iteration_id:
        from ..models.blueprint import BlueprintIteration

        iter_result = await db.execute(
            select(BlueprintIteration).where(BlueprintIteration.id == session_obj.iteration_id)
        )
        iteration = iter_result.scalar_one_or_none()
        if iteration and iteration.iteration_type:
            sections_filter = await get_template_sections(session_obj.org_id, iteration.iteration_type, db)

    cov = assess_coverage(bp.content, sections_filter=sections_filter)
    scores = cov["scores"]

    # Build persona recommendations from DB personas
    db_personas = await get_org_personas(session_obj.org_id, db)
    persona_recs = []
    for p in db_personas:
        focus = p.focus_sections or []
        if not focus:
            continue
        gap_sections = [s for s in focus if scores.get(s, 0) < 80]
        if gap_sections:
            persona_recs.append(
                {
                    "persona": p.slug,
                    "label": p.name,
                    "gaps_count": len(gap_sections),
                    "gap_sections": [SECTION_LABELS.get(s, s) for s in gap_sections],
                }
            )
    persona_recs.sort(key=lambda x: x["gaps_count"], reverse=True)

    # Mark the best persona as "recommended" if it clearly covers the most unique gaps
    if len(persona_recs) >= 2:
        top = persona_recs[0]
        second = persona_recs[1]
        # Recommend if the top persona has more gaps than the second, or all have similar gaps
        # but one covers sections others don't
        if top["gaps_count"] > second["gaps_count"]:
            top["recommended"] = True
        else:
            # Same gap count — check unique coverage
            top_sections = set(top["gap_sections"])
            others = set()
            for r in persona_recs[1:]:
                others.update(r["gap_sections"])
            unique = top_sections - others
            if len(unique) >= 2:
                top["recommended"] = True

    ai_config = session_obj.ai_config or {}

    # Count sections with any content (score > 0)
    filled = len([s for s in scores if scores[s] > 0])
    # Convert gaps to objects with label + score for color coding
    gap_items = [{"label": SECTION_LABELS.get(s, s), "key": s, "score": scores.get(s, 0)} for s in cov["gaps"]]

    return {
        "coverage": {**cov, "gaps": gap_items},
        "current_persona": ai_config.get("persona", "default"),
        "persona_recommendations": persona_recs,
        "title": session_obj.title,
        "filled_count": filled,
        "total_count": len(scores),
    }


@router.post("/api/projects/{project_id}/detect-iteration-type")
async def detect_iteration_type(
    project_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Auto-detect iteration type from a description."""
    text = (body.get("text") or "").strip()
    if not text:
        return {"type": "large_feature", "confidence": 0.5}

    from ..schemas.blueprint import ITERATION_TYPES as _ITER_TYPES
    from ..services.ai_provider import get_ai_client, get_ai_client_for_role  # noqa: F401

    try:
        ai = await get_ai_client(org.id, db, task="fast")
        raw = await ai.chat(
            system=(
                "Classify this planning description into exactly one type. "
                "Return ONLY the type key, nothing else.\n\n"
                "Types:\n"
                "- large_feature: Full new feature needing architecture + UX\n"
                "- small_win: Quick enhancement or minor addition\n"
                "- bug_fix: Fix a known issue or error\n"
                "- spike: Research, evaluate options, or prototype\n"
                "- refactor: Restructure code or architecture\n"
                "- maintenance: Dependencies, CI/CD, security, infra\n"
            ),
            messages=[{"role": "user", "content": text}],
            max_tokens=10,
        )
        detected = raw.strip().lower().replace(" ", "_")
        valid_types = set(_ITER_TYPES.keys())
        if detected not in valid_types:
            detected = "large_feature"
        return {"type": detected, "confidence": 0.9}
    except Exception:
        return {"type": "large_feature", "confidence": 0.5}


@router.post("/api/projects/{project_id}/sessions", status_code=201, response_model=SessionResponse)
async def create_session(
    project_id: str,
    body: SessionCreate,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> Session:
    # Verify project exists and get its details
    result = await db.execute(select(Project).where(Project.id == project_id, Project.id.isnot(None)))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Asked before this session exists: only the first one reads the project's
    # screenshots, because what it finds stays in the blueprint for the rest.
    is_first_session = not (
        await db.execute(select(Session.id).where(Session.project_id == project_id).limit(1))
    ).scalar_one_or_none()

    # Auto-generate a short title from initial_idea if no title provided
    title = body.title
    if (not title or not title.strip()) and body.initial_idea and body.initial_idea.strip():
        try:
            from ..services.ai_provider import get_ai_client, get_ai_client_for_role  # noqa: F401

            ai = await get_ai_client(org.id, db, task="fast")
            title = await ai.chat(
                system=(
                    "Generate a short session title (3-5 words) from a planning idea. "
                    "Return ONLY the title, nothing else. No quotes, no punctuation at the end. "
                    "Capitalize first letter of each word. "
                    "Examples: 'User Authentication Flow', 'Payment Integration', 'Mobile App Redesign'"
                ),
                messages=[{"role": "user", "content": body.initial_idea.strip()[:500]}],
                max_tokens=20,
            )
            title = title.strip().strip('"').strip("'").rstrip(".")
        except Exception:
            logger.debug("AI session title generation failed, using default")
            title = "Planning Session"
    elif not title or not title.strip():
        title = "Planning Session"

    # Set initial persona from suggestion if provided
    ai_config = {}
    if body.persona:
        valid_personas = {"default", "engineer", "pm", "architect", "mentor", "challenger"}
        persona_key = body.persona if body.persona in valid_personas else None
        if persona_key == "engineer":
            persona_key = "default"
        if persona_key:
            ai_config["persona"] = persona_key

    # Per-session pace control (services/pace.py). Stored alongside persona so
    # the facilitator and voice worker can read both from the same place.
    # Invalid values fall back to "balanced" — matching today's behaviour.
    from ..services.pace import normalise_pace

    ai_config["pace"] = normalise_pace(body.pace)

    # Technical comfort level — adapts AI explanation depth. See
    # services.facilitator.TECHNICAL_COMFORT_PROMPTS.
    from ..services.facilitator import normalise_technical_comfort

    ai_config["technical_comfort"] = normalise_technical_comfort(body.technical_comfort)

    # Each session gets its own iteration (1 session = 1 release)
    from ..services.blueprint_service import (
        create_iteration,
        get_or_create_iteration,
        list_iterations,
    )

    existing_iters = await list_iterations(project_id, db)

    if not existing_iters:
        # First session ever — create v1
        new_iter = await get_or_create_iteration(project_id, db, org_id=org.id)
        if body.iteration_type:
            new_iter.iteration_type = body.iteration_type
            await db.flush()
    else:
        v1 = existing_iters[0]
        # Check if v1 already has a session (i.e., first release is in progress)
        from sqlalchemy import func as _func

        v1_session_count = (
            await db.execute(
                select(_func.count())
                .select_from(Session)
                .where(
                    Session.iteration_id == v1.id,
                )
            )
        ).scalar() or 0

        if v1.status != "locked" and v1_session_count > 0:
            # First release in progress — block new sessions
            raise HTTPException(
                status_code=400,
                detail="Complete your first release before starting new ones.",
            )

        if v1.status != "locked" and v1_session_count == 0:
            # v1 exists but no session yet — this IS the first session, bind to v1
            new_iter = v1
            if body.iteration_type:
                new_iter.iteration_type = body.iteration_type
                await db.flush()
        else:
            # v1 is locked — create a new iteration forked from the latest locked
            new_iter = await create_iteration(
                project_id,
                db,
                user.id,
                org_id=org.id,
                iteration_type=body.iteration_type,
            )

    # Coverage-aware launcher: if the caller only sends focus_target, derive
    # focus_sections from focus_target.sections so the existing facilitator
    # scoping path (and every downstream consumer of focus_sections) keeps
    # working. Explicit focus_sections still wins.
    effective_focus_sections = body.focus_sections
    if effective_focus_sections is None and body.focus_target:
        target_sections = body.focus_target.get("sections")
        if isinstance(target_sections, list) and target_sections:
            effective_focus_sections = [str(s) for s in target_sections]

    session = Session(
        project_id=project_id,
        org_id=org.id,
        title=title,
        initial_idea=body.initial_idea,
        status="live",
        ai_config=ai_config if ai_config else {},
        iteration_id=new_iter.id,
        focus_sections=effective_focus_sections or None,
        focus_target=body.focus_target or None,
    )
    db.add(session)
    await db.flush()

    # Auto-add creator as host
    participant = Participant(session_id=session.id, user_id=user.id, role="host")
    db.add(participant)

    # Seed blueprint — distribute project context across appropriate sections.
    # What the project points at goes in too: the reader chose those tickets and
    # repos while describing it, so the first session should not start blind to them.
    context_parts = []
    if project.description:
        context_parts.append(project.description.strip())
    if body.initial_idea:
        context_parts.append(body.initial_idea.strip())
    project_references = reference_lines(project.references)
    context_parts.extend(project_references)
    attachment_rows = (
        (
            await db.execute(
                select(ProjectAttachment)
                .where(ProjectAttachment.project_id == project_id)
                .order_by(ProjectAttachment.created_at.asc(), ProjectAttachment.id.asc())
            )
        )
        .scalars()
        .all()
    )
    shots_line = attachment_line([row.filename for row in attachment_rows[:MAX_READ_SCREENSHOTS]])
    if shots_line:
        context_parts.append(shots_line)
    if context_parts:
        await get_or_create_blueprint(project_id, db, iteration_id=new_iter.id)
        combined = "\n".join(context_parts)
        # Use AI to distribute info across sections
        try:
            from ..services.ai_provider import get_ai_client, get_ai_client_for_role  # noqa: F401

            ai = await get_ai_client(org.id, db, task="fast")
            raw = await ai.chat(
                messages=[
                    {
                        "role": "user",
                        "content": (
                            f"Distribute this project description into blueprint sections. "
                            f"Only include sections where the description provides clear info. "
                            f"Do NOT infer or add details not in the text.\n\n"
                            f"Description: {combined}\n\n"
                            f"Valid sections: {', '.join(BLUEPRINT_SECTIONS_LIST)}\n\n"
                            f"Reply with ONLY valid JSON object mapping section keys to content. "
                            f'Example: {{"project_overview": "...", "tech_stack": "..."}}'
                        ),
                    }
                ],
                max_tokens=500,
            )
            raw = raw.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
                if raw.endswith("```"):
                    raw = raw[:-3]
                raw = raw.strip()
            sections = json.loads(raw)
            for section, content in sections.items():
                if section in BLUEPRINT_SECTIONS_LIST and content and isinstance(content, str):
                    await update_section(
                        project_id,
                        section,
                        content.strip(),
                        "intake",
                        db,
                        session_id=session.id,
                        iteration_id=new_iter.id,
                    )
        except Exception as e:
            logger.warning("Failed to distribute blueprint seed: %s", e)
            # Fallback: dump everything into project_overview
            await update_section(
                project_id,
                "project_overview",
                combined,
                "intake",
                db,
                session_id=session.id,
                iteration_id=new_iter.id,
            )

    await log_audit(
        db,
        org_id=org.id,
        user_id=user.id,
        action="create",
        resource_type="session",
        resource_id=session.id,
        metadata={"project_id": project_id, "title": title},
    )
    await db.commit()
    logger.info("Session created: %s (project=%s, host=%s)", session.id, project_id, user.id)
    # Slack session_created notification removed by design — was too noisy
    # for active users iterating on multiple sessions.

    # Fire background task to generate an AI intro message
    user_name = user.display_name or user.name or user.email.split("@")[0]
    project_context = [*project_references, shots_line] if shots_line else list(project_references)
    asyncio.create_task(
        _generate_intro_safe(
            session.id,
            project.name,
            project.description,
            body.initial_idea,
            org.id,
            user_name,
            persona=ai_config.get("persona", "default"),
            project_context=project_context,
        )
    )

    # The first session reads the mockups the project was described with, down
    # the same vision path the manual analyze-image route uses. Later sessions
    # do not: the reading is already in the blueprint by then.
    if is_first_session and attachment_rows:
        asyncio.create_task(
            _read_project_screenshots_safe(session.id, project_id, org.id, new_iter.id)
        )

    # Reload with participants and user info
    result = await db.execute(
        select(Session)
        .where(Session.id == session.id)
        .options(selectinload(Session.participants).selectinload(Participant.user))
    )
    return _serialize_session(result.scalar_one())


@router.get("/api/projects/{project_id}/sessions", response_model=list[SessionResponse])
async def list_sessions(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Session]:
    # Verify project access
    result = await db.execute(select(Project).where(Project.id == project_id, Project.id.isnot(None)))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(
        select(Session)
        .where(Session.project_id == project_id)
        .options(selectinload(Session.participants).selectinload(Participant.user))
        .order_by(Session.created_at.desc())
    )
    return [_serialize_session(s) for s in result.scalars().all()]


@router.get("/api/sessions/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Session:
    result = await db.execute(
        select(Session)
        .where(Session.id == session_id)
        .options(selectinload(Session.participants).selectinload(Participant.user))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Check user is participant or project owner
    is_participant = any(p.user_id == user.id for p in session.participants)
    if not is_participant:
        result = await db.execute(select(Project).where(Project.id == session.project_id, Project.id.isnot(None)))
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Session not found")

    return _serialize_session(session)


@router.post(
    "/api/sessions/{session_id}/blueprint-review/complete",
    response_model=SessionResponse,
)
async def complete_blueprint_review(
    session_id: str,
    body: BlueprintReviewComplete,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Session:
    """Mark the post-session blueprint review as completed.

    By default, rejects the request if pending suggestions remain — the
    user should resolve them through the review UI. Pass ``skip_remaining``
    to override (used by the explicit "skip for now" path)."""
    from datetime import UTC, datetime

    from sqlalchemy import func

    from ..models.blueprint import BlueprintSuggestion

    result = await db.execute(
        select(Session)
        .where(Session.id == session_id)
        .options(selectinload(Session.participants).selectinload(Participant.user))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    is_participant = any(p.user_id == user.id for p in session.participants)
    if not is_participant:
        proj_check = await db.execute(select(Project).where(Project.id == session.project_id))
        if not proj_check.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Session not found")

    if session.blueprint_review_status == "none":
        # Nothing to review — refuse rather than silently mark complete so
        # the caller knows the UI shouldn't have routed here.
        raise HTTPException(status_code=400, detail="No blueprint review pending for this session")

    if session.blueprint_review_status == "completed":
        return _serialize_session(session)  # idempotent

    if not body.skip_remaining:
        pending = await db.scalar(
            select(func.count(BlueprintSuggestion.id)).where(
                BlueprintSuggestion.session_id == session_id,
                BlueprintSuggestion.status == "pending",
            )
        )
        if pending and pending > 0:
            raise HTTPException(
                status_code=409,
                detail=f"{pending} pending suggestions remain — accept, reject, or pass skip_remaining=true",
            )

    session.blueprint_review_status = "completed"
    session.blueprint_review_completed_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(session)
    return _serialize_session(session)


@router.patch("/api/sessions/{session_id}", response_model=SessionResponse)
async def update_session(
    session_id: str,
    body: SessionUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Session:
    result = await db.execute(
        select(Session)
        .where(Session.id == session_id)
        .options(selectinload(Session.participants).selectinload(Participant.user))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Host or co_host can update (W4.3.5).
    privileged = next(
        (p for p in session.participants if p.user_id == user.id and p.role in ("host", "co_host")),
        None,
    )
    if not privileged:
        raise HTTPException(status_code=403, detail="Only the host or a co-host can update the session")

    VALID_TRANSITIONS = {
        "created": {"lobby", "live"},
        "lobby": {"live"},
        "live": {"paused", "completed", "reviewing"},
        "reviewing": {"completed", "live"},  # "live" lets the wizard cancel back to filling
        "paused": {"live", "completed"},
        "completed": {"archived"},
        "archived": set(),
    }
    update_data = body.model_dump(exclude_unset=True)
    if "status" in update_data:
        allowed = VALID_TRANSITIONS.get(session.status, set())
        if update_data["status"] not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot transition from '{session.status}' to '{update_data['status']}'. Allowed: {allowed}",
            )

    # Strip voice fields from ai_config — these are managed via Studio personas now
    if "ai_config" in update_data and isinstance(update_data["ai_config"], dict):
        _VOICE_FIELDS = {"voice_id", "speed", "emotion", "language", "realtime_voice"}
        incoming = {k: v for k, v in update_data["ai_config"].items() if k not in _VOICE_FIELDS}
        # Merge into existing ai_config so mid-session toggles (e.g. technical_comfort)
        # don't clobber persona/pace/assertiveness/etc. Callers can still pass the
        # full dict if they want to overwrite everything explicitly.
        existing = dict(session.ai_config or {})
        if "technical_comfort" in incoming:
            from ..services.facilitator import normalise_technical_comfort

            incoming["technical_comfort"] = normalise_technical_comfort(incoming["technical_comfort"])
        existing.update(incoming)
        update_data["ai_config"] = existing

    old_status = session.status
    transitioning_to_completed = (
        "status" in update_data
        and update_data["status"] == "completed"
        and session.status != "completed"
        and session.status != "reviewing"  # Don't auto-generate when coming from review
    )

    for key, value in update_data.items():
        setattr(session, key, value)

    await log_audit(
        db,
        org_id=session.org_id,
        user_id=user.id,
        action="update",
        resource_type="session",
        resource_id=session_id,
        metadata={"old_status": old_status, "new_status": session.status},
    )
    await db.commit()
    logger.info("Session status updated: %s -> %s", session_id, update_data.get("status", session.status))

    # Dispatch Slack event when session is completed (best-effort)
    if session.status == "completed" and old_status != "completed":
        try:
            _proj_result = await db.execute(select(Project).where(Project.id == session.project_id))
            _proj = _proj_result.scalar_one_or_none()
            if _proj:
                await dispatch_event(
                    db,
                    event_type="session_completed",
                    team_id=_proj.team_id,
                    payload={
                        "session_id": session.id,
                        "title": session.title,
                        "project_id": session.project_id,
                        "summary": None,
                    },
                )
        except Exception as _exc:
            logger.warning("dispatch_event session_completed failed: %s", _exc)

    # When session is completed, generate kanban tasks from the blueprint
    if transitioning_to_completed:
        import asyncio

        asyncio.create_task(_generate_tasks_on_complete(session.project_id, session_id=session.id))

        # W6.6.3 — also run the extraction pass. Use a fresh DB session because
        # the request-scoped `db` will be closed by the time the task runs.
        async def _run_extraction(session_id: str) -> None:
            from ..services.session_extraction import extract_session_artifacts

            sf = get_session_factory()
            async with sf() as task_db:
                try:
                    await extract_session_artifacts(session_id, task_db)
                except Exception:
                    logger.exception("Session extraction failed for %s", session_id)

        asyncio.create_task(_run_extraction(session.id))

    # Re-query to get fresh data with user relations
    result = await db.execute(
        select(Session)
        .where(Session.id == session_id)
        .options(selectinload(Session.participants).selectinload(Participant.user))
    )
    return _serialize_session(result.scalar_one())


@router.post("/api/sessions/join/{join_code}", response_model=SessionResponse)
async def join_session(
    join_code: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Session:
    result = await db.execute(
        select(Session)
        .where(Session.join_code == join_code)
        .options(selectinload(Session.participants).selectinload(Participant.user))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status in ("completed", "archived"):
        raise HTTPException(status_code=400, detail="Session is no longer accepting participants")

    # Check if already joined
    already_joined = any(p.user_id == user.id for p in session.participants)
    if not already_joined:
        participant = Participant(session_id=session.id, user_id=user.id, role="member")
        db.add(participant)
        await db.commit()
        logger.info("Participant joined session %s: user=%s", session.id, user.id)
        # Reload with user relations
        result = await db.execute(
            select(Session)
            .where(Session.id == session.id)
            .options(selectinload(Session.participants).selectinload(Participant.user))
        )
        session = result.scalar_one()

    return _serialize_session(session)


@router.delete("/api/sessions/{session_id}", status_code=204)
async def delete_session(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    # Verify ownership via project
    result = await db.execute(select(Project).where(Project.id == session.project_id, Project.id.isnot(None)))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Only the project owner can delete sessions")

    from sqlalchemy import delete as sa_delete
    from sqlalchemy import func as sa_func

    from ..models.blueprint import BlueprintIteration, BlueprintSnapshot
    from ..models.board import Board, BoardColumn, Card
    from ..models.feedback import Feedback
    from ..models.session import TranscriptEntry
    from ..models.session_event import SessionContext, SessionEvent
    from ..models.vocabulary import TranscriptionCorrection
    from ..schemas.blueprint import EMPTY_BLUEPRINT

    async def _purge_session_children(session_ids: list[str]) -> None:
        """Remove or null out all rows referencing sessions.id for the given ids.

        These tables have FK → sessions.id without DB-level cascade; the bulk
        Session delete (or ORM delete without ORM cascade coverage) will fail
        unless we clear them first.
        """
        if not session_ids:
            return
        await db.execute(sa_delete(ChatMessage).where(ChatMessage.session_id.in_(session_ids)))
        await db.execute(sa_delete(Participant).where(Participant.session_id.in_(session_ids)))
        await db.execute(sa_delete(TranscriptEntry).where(TranscriptEntry.session_id.in_(session_ids)))
        await db.execute(sa_delete(SessionEvent).where(SessionEvent.session_id.in_(session_ids)))
        await db.execute(sa_delete(SessionContext).where(SessionContext.session_id.in_(session_ids)))
        await db.execute(
            TranscriptionCorrection.__table__.update()
            .where(TranscriptionCorrection.session_id.in_(session_ids))
            .values(session_id=None)
        )
        await db.execute(
            Feedback.__table__.update().where(Feedback.session_id.in_(session_ids)).values(session_id=None)
        )
        await db.execute(Card.__table__.update().where(Card.session_id.in_(session_ids)).values(session_id=None))

    # Check if this session is bound to a locked iteration
    bound_to_locked = False
    if session.iteration_id:
        iter_result = await db.execute(
            select(BlueprintIteration).where(
                BlueprintIteration.id == session.iteration_id,
                BlueprintIteration.status == "locked",
            )
        )
        bound_locked_iter = iter_result.scalar_one_or_none()
        if bound_locked_iter:
            bound_to_locked = True
            # Detach session from iteration before any deletions
            session.iteration_id = None
            await db.flush()

    # If this is the completing session, cascade-delete the iteration and descendants
    if bound_to_locked and session.status == "completed":
        locked_iter = bound_locked_iter

        # Collect this iteration and all descendants (BFS)
        iter_ids_to_delete = [locked_iter.id]
        queue = [locked_iter.id]
        while queue:
            parent_id = queue.pop()
            child_result = await db.execute(
                select(BlueprintIteration.id).where(BlueprintIteration.forked_from_id == parent_id)
            )
            child_ids = list(child_result.scalars().all())
            iter_ids_to_delete.extend(child_ids)
            queue.extend(child_ids)

        # 1. Delete child sessions bound to these iterations (except current)
        child_sess_result = await db.execute(
            select(Session.id).where(
                Session.iteration_id.in_(iter_ids_to_delete),
                Session.id != session_id,
            )
        )
        child_session_ids = list(child_sess_result.scalars().all())

        if child_session_ids:
            # Null out snapshot references to these sessions (SET NULL doesn't fire on bulk delete)
            await db.execute(
                BlueprintSnapshot.__table__.update()
                .where(BlueprintSnapshot.session_id.in_(child_session_ids))
                .values(session_id=None)
            )
            await _purge_session_children(child_session_ids)
            await db.execute(sa_delete(Session).where(Session.id.in_(child_session_ids)))

        # 2. Delete boards scoped to these iterations
        board_ids_result = await db.execute(select(Board.id).where(Board.iteration_id.in_(iter_ids_to_delete)))
        board_ids = list(board_ids_result.scalars().all())
        if board_ids:
            col_ids_result = await db.execute(select(BoardColumn.id).where(BoardColumn.board_id.in_(board_ids)))
            col_ids = list(col_ids_result.scalars().all())
            if col_ids:
                await db.execute(sa_delete(Card).where(Card.column_id.in_(col_ids)))
            await db.execute(sa_delete(BoardColumn).where(BoardColumn.board_id.in_(board_ids)))
            await db.execute(sa_delete(Board).where(Board.id.in_(board_ids)))

        # 3. Delete snapshots
        await db.execute(sa_delete(BlueprintSnapshot).where(BlueprintSnapshot.iteration_id.in_(iter_ids_to_delete)))

        # 4. Delete iterations in reverse order (children before parents for self-FK)
        for iter_id in reversed(iter_ids_to_delete):
            await db.execute(sa_delete(BlueprintIteration).where(BlueprintIteration.id == iter_id))

        logger.info(
            "Cascade-deleted %d iterations for session %s",
            len(iter_ids_to_delete),
            session_id,
        )

    # Check if this is the last session for the project
    count_result = await db.execute(
        select(sa_func.count())
        .select_from(Session)
        .where(
            Session.project_id == session.project_id,
            Session.id != session_id,
        )
    )
    remaining_sessions = count_result.scalar() or 0

    if remaining_sessions == 0:
        # Last session — delete ALL remaining blueprint data and start fresh
        # The current session still holds sessions.iteration_id → one of the iterations
        # we're about to delete; detach it first so the bulk iteration delete is unblocked.
        if session.iteration_id is not None:
            session.iteration_id = None
            await db.flush()
        # Null out session_id references on snapshots (avoid FK issues)
        await db.execute(
            BlueprintSnapshot.__table__.update()
            .where(BlueprintSnapshot.project_id == session.project_id)
            .values(session_id=None)
        )
        await db.execute(sa_delete(BlueprintSnapshot).where(BlueprintSnapshot.project_id == session.project_id))
        # Clear self-FK references first, then delete remaining iterations
        await db.execute(
            BlueprintIteration.__table__.update()
            .where(BlueprintIteration.project_id == session.project_id)
            .values(forked_from_id=None)
        )
        await db.execute(sa_delete(BlueprintIteration).where(BlueprintIteration.project_id == session.project_id))
        reset = BlueprintSnapshot(
            project_id=session.project_id,
            version_number=1,
            content=EMPTY_BLUEPRINT.copy(),
            created_by="system_reset",
        )
        db.add(reset)
    elif not bound_to_locked:
        # Not the last session, and not bound to a locked iteration — revert changes
        # (Skip revert for sessions on locked iterations — blueprint is frozen)
        from ..services.blueprint_service import revert_session_changes

        await revert_session_changes(session.project_id, session_id, db)

    await log_audit(
        db,
        org_id=session.org_id,
        user_id=user.id,
        action="delete",
        resource_type="session",
        resource_id=session_id,
        metadata={"project_id": session.project_id, "title": session.title},
    )
    # Capture fields before session is deleted
    _session_title = session.title
    _session_project_id = session.project_id

    # Clear child-row references to this session (tables without DB-level cascade).
    await _purge_session_children([session_id])
    # Remove any Slack "session created" messages for this session BEFORE the
    # FK CASCADE wipes the announcement rows (we need those rows to know which
    # messages to delete).
    try:
        from ..services.slack_session_announcements import delete_announcements_for_session

        await delete_announcements_for_session(db, session_id)
    except Exception:
        logger.exception("Slack session-announcement cleanup failed for %s", session_id)
    await db.delete(session)
    await db.commit()
    logger.info("Session deleted: %s (remaining: %d)", session_id, remaining_sessions)

    # Dispatch Slack event (best-effort)
    # Slack session_deleted notification removed by design — too noisy
    # alongside session_created, which was also removed.
    _ = (_session_project_id, _session_title)  # silence unused locals


SECTION_MAP = {
    "overview": "project_overview",
    "goals": "goals_constraints",
    "users": "users_personas",
    "architecture": "architecture",
    "tech": "tech_stack",
    "api": "api_integrations",
    "ui": "ui_ux",
    "security": "security_compliance",
    "infrastructure": "infrastructure",
    "questions": "open_questions",
}


async def _handle_slash_command(
    cmd: str,
    arg: str,
    session_id: str,
    session: Session,
    user: User,
    db: AsyncSession,
) -> ChatMessage:
    """Process a slash command and return a system/AI message."""
    from ..models.project import Project
    from ..services.ai_provider import get_ai_client, get_ai_client_for_role  # noqa: F401

    proj_result = await db.execute(select(Project).where(Project.id == session.project_id))
    project = proj_result.scalar_one_or_none()
    org_id = project.org_id if project else None

    response_text = ""

    if cmd == "persona" and not arg:
        response_text = "Usage: `/persona <type>`\n\nOptions: engineer, pm, architect, mentor, challenger"

    elif cmd == "persona" and arg:
        # Alias map — both the slug ("default") and the friendly name
        # ("engineer") resolve to the same persona. Frontend sends the slug
        # when the user picks via the AI Settings drawer; humans typing
        # `/persona engineer` go through the same handler.
        from ..services.facilitator import PERSONA_LABELS

        aliases = {
            "default": "default",
            "engineer": "default",
            "pm": "pm",
            "architect": "architect",
            "mentor": "mentor",
            "challenger": "challenger",
        }
        persona_key = aliases.get(arg.lower())
        if not persona_key:
            response_text = f"Unknown persona: {arg}. Options: engineer, pm, architect, mentor, challenger"
        else:
            config = dict(session.ai_config or {})
            config["persona"] = persona_key
            session.ai_config = config
            await db.commit()
            logger.debug("Session AI config updated: %s", session_id)
            label = PERSONA_LABELS.get(persona_key, persona_key)
            response_text = f"Switched to **{label}**"

            # Fire a welcome message from the new persona in the background
            async def _persona_welcome(sid: str, oid: str, persona_name: str, pk: str):
                try:
                    from ..services.ai_provider import get_ai_client as _get_ai
                    from ..services.facilitator import PERSONA_FOCUS_SECTIONS, SECTION_LABELS, assess_coverage

                    # Send "reviewing blueprint" message first
                    await manager.send_to(sid, {"type": "ai_thinking", "thinking": True})

                    async with get_session_factory()() as bg_db:
                        ai = await _get_ai(oid, bg_db, task="fast")
                        bp = await get_or_create_blueprint(session.project_id, bg_db)
                        cov = assess_coverage(bp.content)
                        scores = cov["scores"]

                        # Find gaps within this persona's focus areas (95% threshold for own areas)
                        focus = PERSONA_FOCUS_SECTIONS.get(pk, [])
                        my_gaps = [s for s in focus if scores.get(s, 0) < 95] if focus else [s for s in cov["gaps"]]
                        my_covered = [s for s in focus if scores.get(s, 0) >= 95] if focus else []

                        # Build context for the welcome
                        gap_labels = [SECTION_LABELS.get(s, s) for s in my_gaps]
                        covered_labels = [SECTION_LABELS.get(s, s) for s in my_covered]

                        # Also get existing blueprint content for covered sections so AI knows what's there
                        existing_info = []
                        for s in focus or list(scores.keys()):
                            val = bp.content.get(s, "")
                            if val and str(val).strip():
                                existing_info.append(f"{SECTION_LABELS.get(s, s)}: {str(val).strip()[:150]}")

                        blueprint_summary = "\n".join(existing_info) if existing_info else "Blueprint is empty."

                        if not my_gaps:
                            prompt = (
                                f"You are a {persona_name}. You just reviewed the blueprint and "
                                f"all your focus areas are well covered: {', '.join(covered_labels)}. "
                                f"Write 1-2 sentences acknowledging this and asking if they want to "
                                f"go deeper on anything or if you should hand off to another persona. "
                                f"Be casual. No markdown."
                            )
                        else:
                            prompt = (
                                f"You are a {persona_name}. You just reviewed the blueprint.\n\n"
                                f"What's already captured:\n{blueprint_summary}\n\n"
                                f"Areas that need work (your focus): {', '.join(gap_labels)}\n"
                                f"Areas already solid: "
                                f"{', '.join(covered_labels) if covered_labels else 'none yet'}\n\n"
                                f"Write a short intro (2-3 sentences): acknowledge what's already "
                                f"been captured (don't re-ask things already in the blueprint), then "
                                f"ask ONE specific question about the most important gap. "
                                f"Be casual. No markdown, no bullet points."
                            )

                        welcome = await ai.chat(
                            system=prompt,
                            messages=[{"role": "user", "content": "introduce yourself and start"}],
                            max_tokens=200,
                        )

                        await manager.send_to(sid, {"type": "ai_thinking", "thinking": False})

                        welcome_msg = ChatMessage(
                            session_id=sid,
                            user_id=None,
                            content=welcome.strip(),
                            message_type="ai",
                            speaker_name=persona_name,
                        )
                        bg_db.add(welcome_msg)
                        await bg_db.commit()
                        await bg_db.refresh(welcome_msg)
                        await manager.send_to(
                            sid,
                            {
                                "type": "chat_message",
                                "payload": {
                                    "id": welcome_msg.id,
                                    "content": welcome_msg.content,
                                    "message_type": "ai",
                                    "user_id": None,
                                    "speaker_name": persona_name,
                                    "created_at": welcome_msg.created_at.isoformat() if welcome_msg.created_at else "",
                                },
                            },
                        )
                except Exception as e:
                    logger.warning("Persona welcome failed: %s", e)
                    await manager.send_to(sid, {"type": "ai_thinking", "thinking": False})

            asyncio.create_task(_persona_welcome(session_id, org_id, label, persona_key))

    elif cmd == "assertiveness" and not arg:
        response_text = "Usage: `/assertiveness <level>`\n\nOptions: passive, balanced, active"

    elif cmd == "assertiveness" and arg:
        level = arg.lower()
        if level not in ("passive", "balanced", "active"):
            response_text = f"Unknown level: {arg}. Options: passive, balanced, active"
        else:
            config = dict(session.ai_config or {})
            config["assertiveness"] = level
            session.ai_config = config
            await db.commit()
            logger.debug("Session AI config updated: %s", session_id)
            response_text = f"Assertiveness set to **{level}**."

    elif cmd == "involvement" and not arg:
        response_text = "Usage: `/involvement <mode>`\n\nOptions: observer, responsive, facilitator, driver"

    elif cmd == "involvement" and arg:
        mode = arg.lower()
        valid_modes = ("observer", "responsive", "facilitator", "driver")
        if mode not in valid_modes:
            response_text = f"Unknown mode: {arg}. Options: {', '.join(valid_modes)}"
        else:
            config = dict(session.ai_config or {})
            config["involvement"] = mode
            session.ai_config = config
            await db.commit()
            logger.info("Involvement mode set to %s for session %s", mode, session_id)
            await manager.broadcast(session_id, {"type": "involvement_state", "mode": mode})
            response_text = f"Involvement set to **{mode}**."

    elif cmd == "pause-agent":
        # /pause-agent [minutes] — default 5; bare /pause-agent 0 clears.
        try:
            minutes = int(arg) if arg else 5
        except ValueError:
            minutes = 5
        config = dict(session.ai_config or {})
        if minutes <= 0:
            config["paused_until"] = None
            response_text = "Agent un-paused."
            paused_until_iso = None
        else:
            paused_until = datetime.now(UTC) + timedelta(minutes=minutes)
            paused_until_iso = paused_until.isoformat()
            config["paused_until"] = paused_until_iso
            response_text = f"Agent paused for **{minutes} minute(s)**."
        session.ai_config = config
        await db.commit()
        await manager.broadcast(
            session_id,
            {"type": "involvement_state", "paused_until": paused_until_iso},
        )

    elif cmd == "resume-agent":
        config = dict(session.ai_config or {})
        config["paused_until"] = None
        session.ai_config = config
        await db.commit()
        await manager.broadcast(session_id, {"type": "involvement_state", "paused_until": None})
        response_text = "Agent resumed."

    elif cmd in ("interrupt", "wait", "dig"):
        # Mirror the in-call chip behavior so chat-typed steering reaches the
        # voice agent instantly via the agent_steering data channel. The agent
        # worker will also post its own system note when it actually applies
        # the action, so this response is just immediate acknowledgement.
        try:
            await publish_steering(session_id, cmd, source_identity=user.id)
        except Exception as e:
            logger.warning("publish_steering failed for /%s in %s: %s", cmd, session_id, e)
        response_text = {
            "interrupt": "Interrupting agent.",
            "wait": "Asked agent to wait.",
            "dig": "Asking agent to go deeper.",
        }[cmd]

    elif cmd == "ask" and not arg:
        response_text = "Usage: `/ask <question>` — summon the agent for one reply."

    elif cmd == "ask" and arg:
        config = dict(session.ai_config or {})
        token = uuid.uuid4().hex
        config["pending_one_shot"] = {
            "id": token,
            "prompt": arg,
            "expires": (datetime.now(UTC) + timedelta(seconds=60)).timestamp(),
        }
        session.ai_config = config
        await db.commit()
        await manager.broadcast(session_id, {"type": "agent_summoned", "id": token})
        response_text = "Asking the agent..."

    elif cmd == "summarize":
        result = await db.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at.desc())
            .limit(20)
        )
        msgs = list(reversed(result.scalars().all()))
        if not msgs:
            response_text = "No messages to summarize yet."
        else:
            convo = "\n".join([f"{'AI' if not m.user_id else 'User'}: {m.content[:200]}" for m in msgs])
            try:
                ai = await get_ai_client(
                    org_id,
                    db,
                    task="fast",
                    session_id=session_id,
                    project_id=session.project_id,
                )
                response_text = await ai.chat(
                    system=(
                        "Summarize this planning conversation in 3-5 concise bullet points. "
                        "Focus on decisions made, open questions, and next steps."
                    ),
                    messages=[{"role": "user", "content": convo}],
                    max_tokens=400,
                )
            except Exception:
                response_text = "Failed to generate summary. Please try again."

    elif cmd == "focus":
        if not arg:
            sections = ", ".join(SECTION_MAP.keys())
            response_text = f"Usage: `/focus <section>`\n\nAvailable sections: {sections}"
        else:
            response_text = f"Let's focus on **{arg}**. What are your thoughts on this area of the project?"
            asyncio.create_task(_run_facilitator_safe(session_id, f"FOCUS: Discuss the {arg} section in depth."))

    elif cmd == "blueprint":
        blueprint = await get_or_create_blueprint(session.project_id, db)
        filled = [k for k, v in blueprint.content.items() if v and v.strip()]
        empty = [k for k, v in blueprint.content.items() if not v or not v.strip()]
        response_text = f"**Blueprint status: {len(filled)}/{len(filled) + len(empty)} sections filled**\n\n"
        if filled:
            response_text += "Filled: " + ", ".join(k.replace("_", " ") for k in filled) + "\n\n"
        if empty:
            response_text += "Empty: " + ", ".join(k.replace("_", " ") for k in empty)

    elif cmd == "diagram":
        dtype = arg.lower() if arg else "architecture"
        if dtype not in ("architecture", "flow", "erd", "wireframe"):
            response_text = f"Unknown type: {arg}. Options: architecture, flow, erd, wireframe"
        else:
            response_text = f"Generating **{dtype}** diagram..."
            asyncio.create_task(
                _run_facilitator_safe(
                    session_id,
                    (
                        f"GENERATE A {dtype.upper()} DIAGRAM NOW based on the conversation so far. "
                        "Output a ```diagram block immediately."
                    ),
                )
            )

    elif cmd == "extract":
        response_text = "Extracting blueprint from conversation..."
        from ..models.project import Project as P

        proj_row = await db.execute(select(P.org_id).where(P.id == session.project_id))
        row = proj_row.one_or_none()
        if row:
            result = await db.execute(
                select(ChatMessage)
                .where(ChatMessage.session_id == session_id)
                .order_by(ChatMessage.created_at.desc())
                .limit(15)
            )
            msgs = [{"content": m.content, "message_type": m.message_type} for m in reversed(result.scalars().all())]
            blueprint = await get_or_create_blueprint(session.project_id, db)
            asyncio.create_task(_extract_safe(session.project_id, msgs, blueprint.content, db, row.org_id))

    elif cmd in ("design-system", "wireframe", "generate-tasks", "estimate"):
        # These send the command as a prompt to the facilitator
        prompts = {
            "design-system": (
                "Generate a complete design system (colors, typography, spacing) for this project "
                "based on what we've discussed. Output it in detail."
            ),
            "wireframe": (
                f"Generate a wireframe layout{' for: ' + arg if arg else ' for the main page'} "
                "based on the project discussion."
            ),
            "generate-tasks": (
                "Based on the current blueprint, break down the project into actionable "
                "development tasks with story points and priorities."
            ),
            "estimate": (
                "Based on the blueprint, estimate the total effort: number of story points, "
                "recommended sprint count, team size, and timeline."
            ),
        }
        response_text = f"Running **/{cmd}**..."
        asyncio.create_task(_run_facilitator_safe(session_id, prompts[cmd]))

    elif cmd == "help":
        response_text = (
            "**Available commands:**\n\n"
            "*Facilitator:*\n"
            "`/persona <engineer|pm|architect|mentor|challenger>` — Switch AI persona\n"
            "`/assertiveness <passive|balanced|active>` — Adjust AI energy\n"
            "`/involvement <observer|responsive|facilitator|driver>` — How often the agent speaks\n"
            "`/pause-agent [minutes]` — Mute agent for N minutes (default 5; 0 to clear)\n"
            "`/resume-agent` — Resume the agent immediately\n"
            "`/ask <question>` — Summon the agent for one reply (bypasses involvement gate)\n"
            "`/interrupt` — Cut the voice agent off mid-sentence\n"
            "`/wait` — Tell the voice agent to stay silent for ~15s while you finish\n"
            "`/dig` — Ask the voice agent to go deeper on the most recent topic\n"
            "`/summarize` — Summarize discussion so far\n"
            "`/focus <section>` — Focus on a blueprint topic\n\n"
            "*Blueprint:*\n"
            "`/blueprint` — Show blueprint fill status\n"
            "`/diagram <architecture|flow|erd|wireframe>` — Generate a diagram\n"
            "`/extract` — Extract blueprint from chat\n\n"
            "*Design:*\n"
            "`/design-system` — Generate design system\n"
            "`/wireframe [description]` — Generate wireframe layout\n\n"
            "*Tasks:*\n"
            "`/generate-tasks` — Create kanban cards from blueprint\n"
            "`/estimate` — Estimate effort and sprints\n\n"
            "*Session:*\n"
            "`/export` — Export blueprint as markdown"
        )

    elif cmd == "export":
        blueprint = await get_or_create_blueprint(session.project_id, db)
        lines = ["# Project Blueprint\n"]
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
        for key, label in section_labels.items():
            content = (blueprint.content.get(key) or "").strip()
            lines.append(f"## {label}\n{content if content else '*Not yet defined*'}\n")
        response_text = "\n".join(lines)

    elif cmd == "clear":
        response_text = "Chat display cleared. Messages are still saved."

    else:
        response_text = f"Unknown command: /{cmd}. Type /help to see available commands."

    # Save as system/AI message
    msg = ChatMessage(
        session_id=session_id,
        user_id=None,
        content=response_text,
        message_type="ai" if cmd in ("summarize", "estimate") else "system",
        speaker_name="AI Facilitator" if cmd in ("summarize", "estimate") else None,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    # Broadcast to room
    await manager.send_to(
        session_id,
        {
            "type": "chat_message",
            "payload": {
                "id": msg.id,
                "content": msg.content,
                "message_type": msg.message_type,
                "user_id": None,
                "speaker_name": msg.speaker_name,
                "created_at": msg.created_at.isoformat() if msg.created_at else "",
            },
        },
    )

    return msg


async def _extract_safe(project_id, messages, content, db, org_id):
    try:
        await _extract_blueprint_inline(project_id, messages, content, db, org_id)
    except Exception as e:
        logger.error("Extraction error: %s", e, exc_info=True)


@router.post("/api/sessions/{session_id}/messages", status_code=201, response_model=ChatMessageResponse)
@limiter.limit("60/minute")
async def send_message(
    request: Request,
    session_id: str,
    body: ChatMessageCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChatMessage:
    result = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.participants))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status != "live":
        raise HTTPException(status_code=400, detail="Session is not live")

    # Verify user is participant
    if not any(p.user_id == user.id for p in session.participants):
        raise HTTPException(status_code=403, detail="Not a participant")

    # Handle slash commands
    if body.content.startswith("/"):
        parts = body.content[1:].split(" ", 1)
        cmd = parts[0].lower()
        arg = parts[1].strip() if len(parts) > 1 else ""

        return await _handle_slash_command(cmd, arg, session_id, session, user, db)

    # Input guardrails (length, injection, profanity)
    from ..services.input_guardrails import validate_input

    input_error = validate_input(body.content)
    if input_error:
        raise HTTPException(status_code=400, detail=input_error)

    # Parse @mentions from the message body. Matches `@token` where token is
    # the first whitespace-separated word of a participant's display name
    # (case-insensitive). Self-mentions are ignored. Mentioned users get a
    # Notification row + the message attachments include `_mentions:[user_id]`.
    mention_attachment: list[dict] = []
    mentioned_user_ids: list[str] = []
    if "@" in body.content:
        import re as _re

        from ..models.user import User as _UserModel

        tokens = {m.group(1).lower() for m in _re.finditer(r"@([A-Za-z][\w.-]*)", body.content)}
        if tokens:
            participant_ids = [p.user_id for p in session.participants if p.user_id != user.id]
            if participant_ids:
                participant_rows = await db.execute(
                    select(_UserModel).where(_UserModel.id.in_(participant_ids))
                )
                for u in participant_rows.scalars().all():
                    name = (u.display_name or u.name or u.email or "").strip()
                    first = name.split(" ", 1)[0].lower() if name else ""
                    if first and first in tokens and u.id not in mentioned_user_ids:
                        mentioned_user_ids.append(u.id)
            if mentioned_user_ids:
                mention_attachment = [{"_mentions": mentioned_user_ids}]

    message = ChatMessage(
        session_id=session_id,
        user_id=user.id,
        content=body.content,
        message_type="chat",
        speaker_name=user.display_name or user.name or user.email,
        attachments=mention_attachment or None,
    )
    db.add(message)
    await db.commit()
    logger.info("Chat message created in session %s by %s", session_id, user.id)
    await db.refresh(message)

    # Create notifications for mentioned users. Fire-and-forget — if the
    # notify call fails we still want the message to go through.
    if mentioned_user_ids:
        try:
            from ..services.notification_service import notify

            sender_name = user.display_name or user.name or user.email or "Someone"
            preview = body.content if len(body.content) <= 140 else body.content[:137] + "…"
            link = f"/projects/{session.project_id}/sessions/{session_id}"
            for uid in mentioned_user_ids:
                await notify(
                    user_id=uid,
                    title=f"{sender_name} mentioned you",
                    body=preview,
                    type="mention",
                    link=link,
                    project_id=session.project_id,
                    db=db,
                )
            await db.commit()
        except Exception:
            logger.warning("Failed to create mention notifications for %s", message.id, exc_info=True)

    # Emoji-only messages: skip the heavy facilitator/intent path. Broadcast
    # the user's message and queue a short chat-side AI acknowledgement.
    # Independent from the LiveKit voice agent.
    from ..services.chat_responder import is_emoji_only, maybe_generate_emoji_message_reply

    if is_emoji_only(body.content):
        await manager.broadcast(
            session_id,
            {
                "type": "chat_message",
                "payload": {
                    "id": message.id,
                    "content": message.content,
                    "message_type": message.message_type,
                    "user_id": message.user_id,
                    "speaker_name": message.speaker_name,
                    "created_at": message.created_at.isoformat() if message.created_at else "",
                },
            },
        )
        background_tasks.add_task(
            maybe_generate_emoji_message_reply,
            session_id=session_id,
            emoji_content=body.content.strip(),
            from_user_name=user.display_name or user.name or user.email,
        )
        return message

    # Sync the canvas wirescreens to session.diagram_state if the frontend
    # sent them along. The DB row often lags behind React state (progressive
    # broadcast didn't commit, session was rehydrated, etc.) — without this,
    # "rework these screens" can't see the screens it should rework.
    # Trust the frontend as truth: ALWAYS overwrite when a non-empty sidecar
    # arrives. Build a brand-new state dict (instead of mutating in place)
    # so SQLAlchemy reliably detects the JSON column change.
    if body.current_wireframe and isinstance(body.current_wireframe, dict):
        try:
            screens = body.current_wireframe.get("screens")
            if isinstance(screens, list) and screens:
                merged = dict(session.diagram_state or {})
                # Preserve sibling sub-keys on `wireframe` (notably `plan`,
                # which holds the inferred screen plan). Earlier code blew
                # away the entire wireframe object on every chat message,
                # so the plan tab silently emptied between turns.
                prior_wf = dict(merged.get("wireframe") or {})
                prior_wf["type"] = "wireframe"
                prior_wf["title"] = body.current_wireframe.get("title") or session.title or "Wireframes"
                prior_wf["fidelity"] = body.current_wireframe.get("fidelity") or "high"
                prior_wf["screens"] = screens
                merged["wireframe"] = prior_wf
                session.diagram_state = merged
                await db.commit()
                # Verify the write landed (catches silent SQLAlchemy mutation-detection issues).
                await db.refresh(session)
                landed = ((session.diagram_state or {}).get("wireframe") or {}).get("screens") or []
                logger.info(
                    "[CHAT] Synced %d wirescreens from frontend canvas state (DB now has %d)",
                    len(screens),
                    len(landed),
                )
        except Exception as sync_err:
            logger.warning("[CHAT] Failed to sync current_wireframe: %s", sync_err)

    # Resolve @mentions and dispatch Slack notifications (best-effort)
    try:
        _proj_result = await db.execute(select(Project).where(Project.id == session.project_id))
        _proj = _proj_result.scalar_one_or_none()
        if _proj and session.org_id:
            _mentioned_ids = await resolve_mentions(db, session.org_id, body.content)
            for _uid in _mentioned_ids:
                await dispatch_event(
                    db,
                    event_type="mention",
                    team_id=_proj.team_id,
                    payload={
                        "mentioned_user_id": _uid,
                        "source_type": "session_message",
                        "source_title": session.title,
                        "source_url": f"/sessions/{session.id}",
                    },
                )
    except Exception as _exc:
        logger.warning("mention dispatch failed for session message: %s", _exc)

    # Dual-write to session event log
    try:
        from ..services.event_writer import write_message_event

        await write_message_event(
            session_id=session_id,
            content=body.content,
            message_type="chat",
            speaker_name=user.display_name or user.name or user.email,
            source="chat",
            db=db,
            message_id=message.id,
            user_id=user.id,
        )
    except Exception:
        logger.warning("Failed to write session event for message %s", message.id, exc_info=True)

    # Pre-facilitator intent classification — decides whether the new
    # message is a token edit, a scope shift (cancel running pipeline), a
    # surgical edit, an additive ask, or just conversation. The result
    # threads into the facilitator so each route gets its own dispatch.
    intent = None
    try:
        from ..services import pipeline_runs
        from ..services.intent_classifier import classify_intent

        # Project's org_id is what the AI client routes through.
        proj_r2 = await db.execute(select(Project.org_id).where(Project.id == session.project_id))
        intent_oid = proj_r2.scalar_one_or_none()
        # `has_active_pipeline` covers both runs already registered AND
        # runs the previous turn has asked for but hasn't yet wired up
        # (race window between message receipt and task registration).
        # Without this, multiple messages sent in quick succession all see
        # "empty canvas + no active pipeline" and the empty-canvas rule
        # misfires repeatedly.
        has_active = bool(pipeline_runs.get_main_run(session_id)) or pipeline_runs.has_pending_pipeline(session_id)
        intent = await classify_intent(
            body.content,
            session.diagram_state,
            db=db,
            has_active_pipeline=has_active,
            org_id=intent_oid,
        )

        # Broadcast intent so the Debug drawer surfaces classifier output
        # to the user (route, reason, target screen, tokens patch, etc.).
        try:
            await manager.send_to(
                session_id,
                {
                    "type": "intent_classified",
                    "payload": {
                        "user_message": body.content,
                        "route": intent.route,
                        "reason": intent.reason,
                        "tokens_patch": intent.tokens_patch,
                        "target_screen_id": intent.target_screen_id,
                        "target_screen_name": intent.target_screen_name,
                        "instruction": intent.instruction,
                        "new_screens": intent.new_screens,
                        "had_active_pipeline": has_active,
                        "ts": _uuid_mod.uuid1().time,
                    },
                },
            )
        except Exception:
            logger.warning("[INTENT] broadcast failed", exc_info=True)

        # NOTE: There is no `cancel` route any more. The classifier prompt
        # explicitly forbids it — every user message is treated as additive
        # / edit / tokens / none, never as a request to wipe the canvas.
        # If a stale model response somehow returns `cancel`, fall through
        # to the additive path (treat it as `add`) instead of clearing.
        if intent.route == "cancel":
            logger.warning(
                "[INTENT] received deprecated route=cancel — coercing to 'add' (canvas-preserving). Reason was: %r",
                intent.reason,
            )
            intent.route = "add"  # type: ignore[assignment]

        # Tokens route — broadcast the patch so the iframe restyles
        # immediately. Do NOT skip the facilitator (we still want a chat
        # ack) but the facilitator will skip running the wireframe pipeline.
        if intent.route == "tokens" and intent.tokens_patch:
            try:
                await manager.send_to(
                    session_id,
                    {
                        "type": "design_tokens_update",
                        "payload": {
                            "patch": intent.tokens_patch,
                            "reason": intent.reason,
                        },
                    },
                )
            except Exception:
                logger.warning(
                    "[INTENT] tokens broadcast failed",
                    exc_info=True,
                )
    except Exception as classifier_err:
        # Classifier never blocks the facilitator — on any failure we just
        # fall back to the legacy "none" path (current behaviour).
        logger.warning("[INTENT] classifier path failed: %s", classifier_err)
        intent = None

    # If this turn will spawn a pipeline (add/none), mark the session as
    # having a pending pipeline so the NEXT message's classifier sees
    # `has_active_pipeline=True` even before the run registers.
    if intent and getattr(intent, "route", "none") in ("add", "none"):
        try:
            from ..services import pipeline_runs as _pr2

            _pr2.mark_pending_pipeline(session_id)
        except Exception:
            pass

    # Run AI facilitator in background — returns message immediately, AI responds async
    asyncio.create_task(_run_facilitator_safe(session_id, session.initial_idea, intent=intent))

    return message


@router.post("/api/sessions/{session_id}/resume", status_code=200)
async def resume_session(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Send a welcome-back message when a user resumes an existing session."""
    result = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.participants))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not any(p.user_id == user.id for p in session.participants):
        raise HTTPException(status_code=403, detail="Not a participant")

    # Only send welcome back if the session already has messages (i.e. it's a real resume)
    msg_count = (
        await db.execute(select(ChatMessage).where(ChatMessage.session_id == session_id).limit(1))
    ).scalar_one_or_none()
    if not msg_count:
        return {"status": "no_messages"}

    # Get project context
    proj_result = await db.execute(select(Project).where(Project.id == session.project_id))
    project = proj_result.scalar_one_or_none()

    user_name = user.display_name or user.name or user.email.split("@")[0]
    asyncio.create_task(
        _generate_welcome_back_safe(
            session_id,
            project.name if project else "your project",
            session.initial_idea,
            session.org_id,
            user_name,
        )
    )
    return {"status": "welcome_back_sent"}


async def _generate_welcome_back_safe(
    session_id: str,
    project_name: str,
    initial_idea: str | None,
    org_id: str,
    user_name: str,
):
    try:
        await _generate_welcome_back(session_id, project_name, initial_idea, org_id, user_name)
    except Exception as e:
        logger.error("Welcome back generation error: %s", e, exc_info=True)


async def _generate_welcome_back(
    session_id: str,
    project_name: str,
    initial_idea: str | None,
    org_id: str,
    user_name: str,
):
    from ..services.ai_provider import get_ai_client, get_ai_client_for_role  # noqa: F401

    session_factory = get_session_factory()
    async with session_factory() as db:
        # Get the last few messages for context
        result = await db.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at.desc())
            .limit(5)
        )
        recent = list(reversed(result.scalars().all()))
        last_topic = recent[-1].content[:200] if recent else "the project"

        ai = await get_ai_client(org_id, db, task="fast")
        msg_text = await ai.chat(
            system=(
                "You are an AI planning facilitator. The user just came back to a planning session "
                "they started earlier. "
                "Greet them with a short, sassy welcome-back using their name. "
                "Reference what was last discussed to show continuity. "
                "End with a quick nudge to pick up where they left off. "
                "Keep it to 1-2 sentences. Be playful and confident — like a friend who's been waiting for them."
            ),
            messages=[
                {
                    "role": "user",
                    "content": f"User: {user_name}\nProject: {project_name}\nLast message in chat: {last_topic}",
                }
            ],
            max_tokens=150,
        )

        if msg_text and msg_text.strip():
            msg = ChatMessage(
                session_id=session_id,
                user_id=None,
                content=msg_text.strip(),
                message_type="ai",
                speaker_name="AI Facilitator",
            )
            db.add(msg)
            await db.commit()

            await manager.send_to(
                session_id,
                {
                    "type": "chat_message",
                    "payload": {
                        "id": msg.id,
                        "content": msg.content,
                        "message_type": "ai",
                        "user_id": None,
                        "speaker_name": "AI Facilitator",
                        "created_at": msg.created_at.isoformat() if msg.created_at else "",
                    },
                },
            )


async def _read_project_screenshots_safe(
    session_id: str, project_id: str, org_id: str, iteration_id: str
) -> None:
    """Background: read the project's screenshots into the blueprint's UI/UX section.

    One unreadable image must never cost the session its opening, so every
    failure here is logged and dropped.
    """
    try:
        from ..services.ai_provider import get_ai_client
        from ..services.attachment_storage import get_storage

        session_factory = get_session_factory()
        async with session_factory() as db:
            rows = (
                (
                    await db.execute(
                        select(ProjectAttachment)
                        .where(ProjectAttachment.project_id == project_id)
                        .order_by(ProjectAttachment.created_at.asc(), ProjectAttachment.id.asc())
                        .limit(MAX_READ_SCREENSHOTS)
                    )
                )
                .scalars()
                .all()
            )
            if not rows:
                return
            storage = get_storage()
            ai = await get_ai_client(org_id, db, task="fast")
            readings: list[str] = []
            for row in rows:
                try:
                    data = await storage.get(row.storage_key)
                    analysis = await describe_image(ai, data, row.mime_type)
                except Exception as exc:  # noqa: BLE001 — one image, not the session
                    logger.warning("Could not read project screenshot %s: %s", row.id, exc)
                    continue
                readings.append(f"From {row.filename}:\n{analysis}")
            if not readings:
                return
            # One snapshot for the lot, on top of whatever the seeding left —
            # update_section only replaces or merges bullets, and these are prose.
            blueprint = await get_or_create_blueprint(project_id, db, iteration_id=iteration_id)
            existing = (blueprint.content or {}).get("ui_ux") or ""
            await update_section(
                project_id,
                "ui_ux",
                "\n\n".join([existing.strip(), *readings]).strip(),
                "ai-vision",
                db,
                session_id=session_id,
                iteration_id=iteration_id,
            )
            logger.info("Read %d project screenshots into ui_ux for session %s", len(readings), session_id)
    except Exception as e:  # noqa: BLE001 — background task
        logger.error("Project screenshot reading error: %s", e, exc_info=True)


async def _generate_intro_safe(
    session_id: str,
    project_name: str,
    project_desc: str | None,
    initial_idea: str | None,
    org_id: str,
    user_name: str,
    persona: str = "default",
    project_context: list[str] | None = None,
):
    """Background: generate an AI intro message when a session starts."""
    try:
        await _generate_intro(
            session_id,
            project_name,
            project_desc,
            initial_idea,
            org_id,
            user_name,
            persona=persona,
            project_context=project_context,
        )
    except Exception as e:
        logger.error("Intro generation error: %s", e, exc_info=True)


async def _generate_intro(
    session_id: str,
    project_name: str,
    project_desc: str | None,
    initial_idea: str | None,
    org_id: str,
    user_name: str,
    persona: str = "default",
    project_context: list[str] | None = None,
):
    """Generate and save an AI greeting that acknowledges what the user wants to build."""
    from ..services.ai_provider import get_ai_client, get_ai_client_for_role  # noqa: F401

    session_factory = get_session_factory()
    async with session_factory() as db:
        # Guard: don't generate intro if one already exists
        existing = await db.execute(
            select(ChatMessage)
            .where(
                ChatMessage.session_id == session_id,
                ChatMessage.message_type == "ai",
            )
            .limit(1)
        )
        if existing.scalar_one_or_none():
            logger.info("Intro already exists for session %s, skipping", session_id)
            return

        # Build context from project name + description + session idea
        context_parts = [f"Project name: {project_name}"]
        if project_desc:
            context_parts.append(f"Project description: {project_desc}")
        if initial_idea:
            context_parts.append(f"Session idea: {initial_idea}")
        # What the project points at, and the screenshots it was described with,
        # so the greeting can name them instead of asking what this is about.
        context_parts.extend(project_context or [])
        context_parts.append(f"User's name: {user_name}")

        # Check existing blueprint state to personalise the greeting
        session_result = await db.execute(select(Session).where(Session.id == session_id))
        session_obj = session_result.scalar_one_or_none()
        blueprint_context = ""
        if session_obj:
            # The blueprint is seeded from the project description at session
            # creation, so "filled sections" alone can't tell us whether prior
            # sessions exist. Count sessions on this project to disambiguate.
            from sqlalchemy import func as _func

            prior_sessions_count = (
                await db.execute(
                    select(_func.count())
                    .select_from(Session)
                    .where(Session.project_id == session_obj.project_id)
                )
            ).scalar() or 0
            is_first_session = prior_sessions_count <= 1

            bp = await get_or_create_blueprint(session_obj.project_id, db)
            # If session has a focus scope, only consider those sections when
            # picking "empty" and "filled" — we shouldn't nag the user about
            # sections they've explicitly scoped out.
            scope = session_obj.focus_sections or BLUEPRINT_SECTIONS_LIST
            filled = {k: v for k, v in bp.content.items() if k in scope and (v or "").strip()}
            empty = [k for k in scope if k not in filled]
            # Whole-project emptiness (ignores scope) drives whether this is a
            # fresh-start scenario vs a scoped session on an existing project.
            any_project_content = any((v or "").strip() for v in bp.content.values())
            if filled and not is_first_session:
                context_parts.append(
                    f"\nExisting blueprint has {len(filled)} sections filled: {', '.join(filled.keys())}"
                )
                for k, v in filled.items():
                    context_parts.append(f"  {k}: {v[:100]}")
                if empty:
                    context_parts.append(f"Still empty: {', '.join(empty)}")
                blueprint_context = (
                    "This is a RETURNING session — the project already has blueprint data from previous sessions. "
                    "Acknowledge the existing progress and pick up where they left off. "
                    "Reference specific details from the blueprint to show you know the project. "
                    "Ask about the FIRST empty section to move the planning forward."
                )
            elif filled and is_first_session:
                # First session for this project. The blueprint was just
                # auto-seeded from the project description / initial idea, so
                # the model must NOT greet the user as returning.
                context_parts.append(
                    f"\nBlueprint was auto-seeded from the user's intake into {len(filled)} sections: "
                    f"{', '.join(filled.keys())}"
                )
                for k, v in filled.items():
                    context_parts.append(f"  {k}: {v[:100]}")
                if empty:
                    context_parts.append(f"Still empty: {', '.join(empty)}")
                blueprint_context = (
                    "This is the user's FIRST session for this brand-new project — they have NOT been here before. "
                    "The blueprint content above was auto-extracted from the project description and initial idea "
                    "they just entered; it is NOT prior session work. "
                    "Do NOT use welcome-back framing — no 'great to see you back', 'welcome back', or 'again'. "
                    "Greet them for the first time, briefly acknowledge what they want to build to show you understood "
                    "their intake, then end with ONE focused question about the FIRST empty section."
                )
            elif session_obj.focus_sections and any_project_content:
                # Scoped session, in-scope sections empty, but project has content elsewhere.
                context_parts.append(f"\nThis session is scoped to: {', '.join(session_obj.focus_sections)}.")
                blueprint_context = (
                    "This session is SCOPED to a specific focus area (listed above). "
                    "Only ask about those sections. Do NOT mention or suggest other blueprint areas. "
                    "Kick off by asking about the first scoped section."
                )
            elif session_obj.focus_sections:
                # Scoped session on a brand-new project (nothing in the blueprint yet).
                # Ease in with a warm-up rather than diving into specifics.
                context_parts.append(f"\nThis session is scoped to: {', '.join(session_obj.focus_sections)}.")
                blueprint_context = (
                    "This is a BRAND-NEW project with nothing in the blueprint yet, scoped to the focus above. "
                    "Open with a warm, short greeting. "
                    "Ask ONE light orienting question about what they're building overall — do NOT "
                    "dive into specifics of the scoped area yet. Stay within the focus when they answer, "
                    "but the first exchange should be a gentle warm-up, not a detailed probe."
                )

        context = "\n".join(context_parts)

        persona_labels = {
            "default": "Senior Engineer",
            "pm": "Product Manager",
            "architect": "System Architect",
            "mentor": "Patient Mentor",
            "challenger": "Devil's Advocate",
        }
        persona_label = persona_labels.get(persona, "AI Facilitator")
        persona_intros = {
            "default": "You are a sharp, opinionated Senior Engineer.",
            "pm": "You are an experienced Product Manager focused on users and goals.",
            "architect": "You are a System Architect focused on components and scalability.",
            "mentor": "You are a patient Technical Mentor who explains things clearly.",
            "challenger": "You are a Devil's Advocate who stress-tests every assumption.",
        }

        system_prompt = (
            f"{persona_intros.get(persona, 'You are an AI planning facilitator.')} "
            f"Greet the user at the start of a planning session. "
            "Start with a short greeting using their name. "
        )
        if blueprint_context:
            system_prompt += blueprint_context
        else:
            system_prompt += (
                "Then in 1-2 sentences acknowledge what they want to build — show you get it "
                "and add a bit of personality. "
                "End with ONE focused question to kick off the planning."
            )
        system_prompt += " Keep the whole thing to 2-3 sentences max. Be fun and confident, not corporate."

        ai = await get_ai_client(org_id, db, task="fast")
        intro = await ai.chat(
            system=system_prompt,
            messages=[{"role": "user", "content": context}],
            max_tokens=250,
        )

        if intro and intro.strip():
            msg = ChatMessage(
                session_id=session_id,
                user_id=None,
                content=intro.strip(),
                message_type="ai",
                speaker_name=persona_label,
            )
            db.add(msg)
            await db.commit()

            # Broadcast to any connected clients
            await manager.send_to(
                session_id,
                {
                    "type": "chat_message",
                    "payload": {
                        "id": msg.id,
                        "content": msg.content,
                        "message_type": "ai",
                        "user_id": None,
                        "speaker_name": persona_label,
                        "created_at": msg.created_at.isoformat() if msg.created_at else "",
                    },
                },
            )


async def _run_facilitator_safe(session_id: str, initial_idea: str | None, intent: object | None = None):
    """Wrapper that catches all errors so the background task never crashes silently.

    `intent`: optional `IntentResult` from the pre-classifier. If provided, the
    facilitator dispatches diagram-extraction behaviour based on `intent.route`
    (tokens skips extract, edit goes through edit-screen, add runs additive
    pipeline alongside, cancel/none run main pipeline).
    """
    try:
        await _run_facilitator(session_id, initial_idea, intent=intent)
    except Exception as e:
        logger.error("Facilitator error: %s", e, exc_info=True)


@router.get("/api/sessions/{session_id}/messages", response_model=list[ChatMessageResponse])
async def list_messages(
    session_id: str,
    limit: int = 50,
    before: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ChatMessage]:
    """List messages in a session, paginated newest-first.

    - ``limit``: max messages per call (1–200, default 50). Default keeps the
      initial page small so opening a long session doesn't ship hundreds of
      rows over the wire.
    - ``before``: a message id; returns messages strictly older than that
      one. Used by the chat panel's "Load older" affordance.

    Returns messages in ascending chronological order regardless of how the
    page was sliced, so callers can append the result to the head of their
    list without re-sorting.
    """
    limit = max(1, min(limit, 200))

    result = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.participants))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not any(p.user_id == user.id for p in session.participants):
        raise HTTPException(status_code=403, detail="Not a participant")

    stmt = select(ChatMessage).where(ChatMessage.session_id == session_id)
    if before:
        ref_result = await db.execute(
            select(ChatMessage.created_at).where(
                ChatMessage.id == before,
                ChatMessage.session_id == session_id,
            )
        )
        ref_ts = ref_result.scalar_one_or_none()
        if ref_ts is not None:
            stmt = stmt.where(ChatMessage.created_at < ref_ts)

    # Take the most recent `limit` rows, then return chronological so the
    # frontend's flatlist can append them in-order.
    stmt = stmt.order_by(ChatMessage.created_at.desc()).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return list(reversed(rows))


@router.patch("/api/sessions/{session_id}/messages/{message_id}", response_model=ChatMessageResponse)
async def update_message(
    session_id: str,
    message_id: str,
    body: ChatMessageUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChatMessage:
    """Edit a message's content. Detects corrections and learns vocabulary."""
    from ..services.vocabulary_service import apply_corrections_to_vocabulary, detect_corrections

    # Validate session + participant
    result = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.participants))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not any(p.user_id == user.id for p in session.participants):
        raise HTTPException(status_code=403, detail="Not a participant")

    # Fetch the message
    result = await db.execute(select(ChatMessage).where(ChatMessage.id == message_id))
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.session_id != session_id:
        raise HTTPException(status_code=400, detail="Message does not belong to this session")

    # Only allow editing own messages (or voice_chat from agent transcription)
    if msg.user_id and msg.user_id != user.id:
        raise HTTPException(status_code=403, detail="Can only edit your own messages")
    if msg.message_type in ("ai", "system"):
        raise HTTPException(status_code=400, detail="Cannot edit AI or system messages")

    # Preserve original on first edit
    original_text = msg.original_content or msg.content
    if not msg.original_content:
        msg.original_content = msg.content

    # Redact short-circuit (W5.7.5): never learn from redactions, never echo PII.
    if body.redact:
        msg.content = "[redacted]"
        await db.commit()
        await db.refresh(msg)
        await manager.broadcast(
            session_id,
            {
                "type": "message_updated",
                "payload": {
                    "id": msg.id,
                    "content": msg.content,
                    "original_content": msg.original_content,
                    "redacted": True,
                },
            },
        )
        logger.info("Message %s redacted by user %s", message_id, user.id)
        return msg

    if body.content is None:
        raise HTTPException(status_code=400, detail="content is required when redact=false")

    # Detect corrections and learn vocabulary
    new_content = body.content.strip()
    corrections = detect_corrections(original_text, new_content)
    vocabulary_updated = False
    if corrections:
        vocabulary_updated = await apply_corrections_to_vocabulary(
            org_id=session.org_id,
            user_id=user.id,
            corrections=corrections,
            db=db,
            session_id=session_id,
            message_id=message_id,
            original_text=original_text,
            corrected_text=new_content,
        )

    msg.content = new_content
    await db.commit()
    await db.refresh(msg)

    # Broadcast update via WebSocket
    await manager.broadcast(
        session_id,
        {
            "type": "message_updated",
            "payload": {
                "id": msg.id,
                "content": msg.content,
                "original_content": msg.original_content,
                "vocabulary_updated": vocabulary_updated,
            },
        },
    )

    logger.info(
        "Message %s edited by user %s, corrections=%d, vocab_updated=%s",
        message_id,
        user.id,
        len(corrections),
        vocabulary_updated,
    )
    return msg


@router.delete("/api/sessions/{session_id}/messages", status_code=204)
async def delete_messages(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete all messages in a session."""
    result = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.participants))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not any(p.user_id == user.id for p in session.participants):
        raise HTTPException(status_code=403, detail="Not a participant")
    await db.execute(ChatMessage.__table__.delete().where(ChatMessage.session_id == session_id))
    await db.commit()


@router.post("/api/sessions/{session_id}/typing", status_code=204)
@limiter.limit("60/minute")
async def signal_typing(
    request: Request,
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Fire-and-forget typing signal. Broadcasts a `user_typing` WS event to
    everyone in the session room (the sender's client filters themselves
    out). Debounced client-side; rate-limited here as a safety net.

    Carries the user's display name + color so each receiving client can
    render "Omar is typing…" without an extra lookup. Auto-clears on the
    client after ~3 s without renewal — no explicit stop signal needed.
    """
    result = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.participants))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not any(p.user_id == user.id for p in session.participants):
        raise HTTPException(status_code=403, detail="Not a participant")

    await manager.broadcast(
        session_id,
        {
            "type": "user_typing",
            "payload": {
                "user_id": user.id,
                "name": user.name or user.email,
            },
        },
    )


@router.post(
    "/api/sessions/{session_id}/messages/{message_id}/reactions",
    response_model=MessageReactionResponse,
)
@limiter.limit("120/minute")
async def toggle_message_reaction(
    request: Request,
    session_id: str,
    message_id: str,
    body: MessageReactionRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageReactionResponse:
    """Toggle a user's emoji reaction on a chat message. Broadcasts via WS
    and may trigger a chat-side AI acknowledgement (throttled per session)."""
    from ..services.chat_responder import maybe_generate_reaction_reply

    emoji = (body.emoji or "").strip()
    if not emoji or len(emoji) > 16:
        raise HTTPException(status_code=400, detail="Invalid emoji")

    result = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.participants))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not any(p.user_id == user.id for p in session.participants):
        raise HTTPException(status_code=403, detail="Not a participant")

    msg_result = await db.execute(select(ChatMessage).where(ChatMessage.id == message_id))
    msg = msg_result.scalar_one_or_none()
    if not msg or msg.session_id != session_id:
        raise HTTPException(status_code=404, detail="Message not found")

    reactions = dict(msg.reactions or {})
    users_for_emoji = list(reactions.get(emoji, []))
    added = False
    if user.id in users_for_emoji:
        users_for_emoji.remove(user.id)
    else:
        users_for_emoji.append(user.id)
        added = True
    if users_for_emoji:
        reactions[emoji] = users_for_emoji
    else:
        reactions.pop(emoji, None)
    msg.reactions = reactions
    await db.commit()

    await manager.broadcast(
        session_id,
        {
            "type": "message_reaction",
            "payload": {"message_id": msg.id, "reactions": reactions},
        },
    )

    if added:
        background_tasks.add_task(
            maybe_generate_reaction_reply,
            session_id=session_id,
            message_id=msg.id,
            emoji=emoji,
            from_user_name=user.display_name or user.name or user.email,
        )

    return MessageReactionResponse(message_id=msg.id, reactions=reactions)


@router.get("/api/sessions/{session_id}/vocabulary-keywords")
async def get_vocabulary_keywords(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return vocabulary keyterms for browser-side Deepgram STT."""
    from ..services.vocabulary_service import get_vocabulary_for_transcription

    result = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.participants))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not any(p.user_id == user.id for p in session.participants):
        raise HTTPException(status_code=403, detail="Not a participant")

    vocabulary = await get_vocabulary_for_transcription(session.org_id, user.id, db)
    return {"keyterms": vocabulary.to_enhancement_context()}


@router.get("/api/voices")
async def get_voices() -> list[dict]:
    return list_voices()


@router.post("/api/tts")
async def text_to_speech(
    body: dict,
    user: User = Depends(get_current_user),
) -> Response:
    """Generate browser-playable MP3 audio from text via ElevenLabs."""
    text = body.get("text", "").strip()
    voice_id = body.get("voice_id")
    if not text:
        raise HTTPException(status_code=400, detail="No text provided")

    audio = await synthesize_speech_mp3(text, voice_id=voice_id)
    if not audio:
        raise HTTPException(status_code=503, detail="TTS unavailable")

    return Response(content=audio, media_type="audio/mpeg")


@router.get("/api/sessions/{session_id}/extraction", response_model=SessionExtractionOut)
async def get_session_extraction(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """W6.6.3 — Return the recap extraction (summary, highlights, decisions,
    action_items, open_questions, chapter_summaries) captured at
    session-complete time. Empty payload when not yet extracted.

    Older rows that lack the newer keys (summary/highlights/chapter_summaries)
    are filled in with empty defaults by the response model.
    """
    from ..services.session_extraction import empty_extraction

    result = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.participants))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not any(p.user_id == user.id for p in session.participants):
        raise HTTPException(status_code=403, detail="Not a participant")
    payload = session.session_extraction or {}
    # Merge over the canonical empty shape so the response always carries all
    # six keys, even for sessions whose extraction predates the W6.6.3 redesign.
    merged = {**empty_extraction(), **payload}
    return merged


@router.post("/api/sessions/{session_id}/extraction/regenerate", response_model=SessionExtractionOut)
async def regenerate_session_extraction(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Force a fresh extraction pass — useful for completed sessions whose
    extraction failed or was empty. Host or co-host only."""
    from ..services.session_extraction import extract_session_artifacts

    result = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.participants))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    privileged = next(
        (p for p in session.participants if p.user_id == user.id and p.role in ("host", "co_host")),
        None,
    )
    if not privileged:
        raise HTTPException(status_code=403, detail="Only the host or a co-host can regenerate extractions")
    return await extract_session_artifacts(session_id, db)


@router.patch("/api/sessions/{session_id}/participants/{participant_id}/role")
async def update_participant_role(
    session_id: str,
    participant_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """W4.3.5 — Host promotes/demotes a participant to/from co_host.
    Only the host can change roles; the host's own role can't be changed
    through this endpoint (use a separate transfer-host flow if needed).
    """
    new_role = body.get("role")
    if new_role not in ("co_host", "member"):
        raise HTTPException(status_code=422, detail="role must be 'co_host' or 'member'")

    result = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.participants))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    me = next((p for p in session.participants if p.user_id == user.id), None)
    if not me or me.role != "host":
        raise HTTPException(status_code=403, detail="Only the host can change participant roles")

    target = next((p for p in session.participants if p.id == participant_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Participant not found")
    if target.role == "host":
        raise HTTPException(status_code=400, detail="Cannot change the host's role")

    target.role = new_role
    await db.commit()
    await db.refresh(target)

    await manager.broadcast(
        session_id,
        {
            "type": "role_changed",
            "payload": {"participant_id": target.id, "user_id": target.user_id, "role": target.role},
        },
    )
    logger.info("Participant %s role set to %s by host %s", target.id, new_role, user.id)
    return {"id": target.id, "user_id": target.user_id, "role": target.role}


@router.patch("/api/sessions/{session_id}/recording-consent")
async def set_recording_consent(
    session_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """W5.7.4 — Each participant declares whether they consent to AI
    transcription. NULL = not yet decided (prompt on join).
    """
    consent = body.get("consent")
    if consent is not None and not isinstance(consent, bool):
        raise HTTPException(status_code=422, detail="consent must be a boolean or null")

    result = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.participants))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    me = next((p for p in session.participants if p.user_id == user.id), None)
    if not me:
        raise HTTPException(status_code=403, detail="Not a participant")

    me.recording_consent = consent
    await db.commit()
    await db.refresh(me)

    # Broadcast so other participants can update the consent chip on tile.
    await manager.broadcast(
        session_id,
        {"type": "consent_changed", "payload": {"user_id": me.user_id, "consent": me.recording_consent}},
    )
    logger.info("Participant %s consent set to %s", me.id, me.recording_consent)
    return {"user_id": me.user_id, "consent": me.recording_consent}


@router.post("/api/sessions/{session_id}/summarize-recent")
async def summarize_recent(
    session_id: str,
    minutes: int = 5,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """W4.3.3 — Generate a short summary of the last `minutes` of conversation
    so a late joiner can be brought up to speed.

    Returns a 1-3 sentence plain-text summary. Falls back to a deterministic
    "no AI configured" message when no provider is wired up.
    """
    from ..services.ai_provider import get_ai_client

    if minutes < 1 or minutes > 60:
        raise HTTPException(status_code=422, detail="minutes must be between 1 and 60")

    result = await db.execute(
        select(Session)
        .where(Session.id == session_id)
        .options(selectinload(Session.participants))
        .options(selectinload(Session.chat_messages))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not any(p.user_id == user.id for p in session.participants):
        raise HTTPException(status_code=403, detail="Not a participant")

    # SQLAlchemy returns tz-naive datetimes from SQLite; postgres can return
    # aware. Normalize both sides to naive UTC for comparison.
    cutoff = (datetime.now(UTC) - timedelta(minutes=minutes)).replace(tzinfo=None)

    def _naive(dt: datetime) -> datetime:
        return dt.replace(tzinfo=None) if dt.tzinfo is not None else dt

    recent = sorted(
        [
            m
            for m in session.chat_messages
            if m.created_at and _naive(m.created_at) >= cutoff and m.message_type != "system"
        ],
        key=lambda m: m.created_at,
    )
    if not recent:
        return {"summary": "Nothing said in the last few minutes.", "message_count": 0, "minutes": minutes}

    transcript = "\n".join(f"{m.speaker_name or 'Unknown'}: {m.content}" for m in recent if m.content)

    client = await get_ai_client(session.org_id, db)
    if client is None:
        # Graceful fallback — surface the most recent speakers + topic anchor.
        speakers = sorted({m.speaker_name for m in recent if m.speaker_name})
        return {
            "summary": (
                f"Last {minutes} min: {len(recent)} messages from {', '.join(speakers) or 'participants'}. "
                "AI summarization isn't configured for this org."
            ),
            "message_count": len(recent),
            "minutes": minutes,
        }

    summary_text = await client.chat(
        system=(
            "You are catching a late participant up to speed in a planning meeting. "
            "Summarize the most recent conversation in 2-3 short sentences. "
            "Lead with the current topic. Avoid filler. Don't list speakers."
        ),
        messages=[{"role": "user", "content": f"Conversation so far:\n\n{transcript}"}],
        max_tokens=200,
    )

    return {
        "summary": summary_text.strip(),
        "message_count": len(recent),
        "minutes": minutes,
    }


@router.post("/api/sessions/{session_id}/explain-term")
async def explain_term(
    session_id: str,
    body: ExplainTermRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Generate a plain-English explanation for a technical term the user
    clicked on in chat. Used as the fallback when the term isn't in the
    static frontend glossary (frontend/lib/glossary.ts). Returns the same
    JSON shape as a static GlossaryEntry so the popover renders it
    identically.

    Cheap (Haiku, max 350 tokens) and called on demand — not on every
    streamed message — so there's no per-message latency cost.
    """
    from ..services.ai_provider import get_ai_client

    term = (body.term or "").strip()
    if not term or len(term) > 80:
        raise HTTPException(status_code=422, detail="term must be 1-80 characters")

    result = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.participants))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not any(p.user_id == user.id for p in session.participants):
        raise HTTPException(status_code=403, detail="Not a participant")

    client = await get_ai_client(session.org_id, db, task="fast")
    if client is None:
        # Graceful degrade — frontend still gets a renderable payload.
        return {
            "slug": term.lower().replace(" ", "-"),
            "term": term,
            "definition": "We couldn't fetch a definition right now — AI lookups aren't configured for this workspace.",
            "contextHint": "",
            "examples": [],
            "learnMore": [],
        }

    system = (
        "You are a teaching assistant inside a planning tool. The user clicked on "
        "a word in a chat message and wants to learn what it means. Reply with a "
        "STRICT JSON object — no prose, no markdown — matching this shape:\n"
        '{"definition": str (1-2 plain-English sentences, no jargon-in-definition), '
        '"contextHint": str (what it usually means in a planning/engineering setting, '
        "1 sentence), "
        '"examples": list[str] (1-2 concrete real-world examples, each one short '
        "sentence)}\n"
        "No keys other than definition / contextHint / examples. No links. No code."
    )
    user_prompt = f'Term: "{term}"'
    if body.context and body.context.strip():
        user_prompt += f'\nSentence the term appeared in: "{body.context.strip()[:400]}"'

    import json as _json

    try:
        raw = await client.chat(
            system=system,
            messages=[{"role": "user", "content": user_prompt}],
            max_tokens=350,
        )
        stripped = raw.strip()
        if stripped.startswith("```"):
            stripped = stripped.strip("`")
            if stripped.lower().startswith("json"):
                stripped = stripped[4:].lstrip()
        parsed = _json.loads(stripped)
    except Exception as exc:
        logger.warning("explain_term: failed to parse AI response for %r: %s", term, exc)
        parsed = {}

    definition = str(parsed.get("definition") or "").strip()
    context_hint = str(parsed.get("contextHint") or "").strip()
    examples_raw = parsed.get("examples") or []
    examples = [str(e).strip() for e in examples_raw if str(e).strip()][:3]

    if not definition:
        definition = (
            f"'{term}' is a technical term — we don't have a built-in explainer "
            "for it yet. Ask the assistant in chat for more detail."
        )

    return {
        "slug": term.lower().replace(" ", "-"),
        "term": term,
        "definition": definition,
        "contextHint": context_hint,
        "examples": examples,
        "learnMore": [],
    }


@router.post("/api/sessions/{session_id}/recap-email", status_code=202)
async def send_recap_email(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """W6.6.5 — Email a transcript recap to all session participants.

    The caller (typically the host) chose this opt-in via the rating dialog.
    Sends asynchronously via Resend; returns the count attempted so the
    frontend can show "sent to N participants".
    """
    from ..services.email_service import send_session_recap_email

    result = await db.execute(
        select(Session)
        .where(Session.id == session_id)
        .options(selectinload(Session.participants).selectinload(Participant.user))
        .options(selectinload(Session.chat_messages))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Permission: must be a participant of the session.
    if not any(p.user_id == user.id for p in session.participants):
        raise HTTPException(status_code=403, detail="Not a participant")

    recipients: list[str] = []
    seen: set[str] = set()
    for p in session.participants:
        email = p.user.email if p.user else None
        if email and email not in seen:
            recipients.append(email)
            seen.add(email)
    if not recipients:
        raise HTTPException(status_code=400, detail="No participants with email addresses")

    # Build transcript lines from voice + chat messages, in order. Skip
    # AI-system rows; include redacted entries verbatim (they already say
    # [redacted]).
    transcript_lines: list[str] = []
    for msg in sorted(session.chat_messages, key=lambda m: m.created_at):
        if msg.message_type in ("system",):
            continue
        ts = msg.created_at.strftime("%H:%M") if msg.created_at else ""
        speaker = msg.speaker_name or ("Agent" if msg.message_type == "voice_ai" else "Unknown")
        transcript_lines.append(f"{ts}  {speaker}: {msg.content}")

    duration = None
    if session.created_at:
        # Best-effort: time from session creation to last message.
        if session.chat_messages:
            last = max(m.created_at for m in session.chat_messages if m.created_at)
            duration = int((last - session.created_at).total_seconds())

    sent = await send_session_recap_email(
        to_emails=recipients,
        session_title=session.title or "Planning Session",
        duration_seconds=duration,
        transcript_lines=transcript_lines,
        org_id=session.org_id,
        session_id=session.id,
        project_id=session.project_id,
    )
    return {"recipients": len(recipients), "sent": sent}


@router.post("/api/sessions/{session_id}/analyze-image")
async def analyze_image(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    file: UploadFile = File(...),
) -> dict:
    """Analyze an uploaded image using AI Vision and extract UI insights."""
    from ..services.ai_provider import get_ai_client, get_ai_client_for_role  # noqa: F401

    image_data = await file.read()
    media_type = file.content_type or "image/png"

    # Get org_id for provider routing
    session_result_pre = await db.execute(select(Session).where(Session.id == session_id))
    s = session_result_pre.scalar_one_or_none()
    proj_r = await db.execute(select(Project.org_id).where(Project.id == s.project_id)) if s else None
    oid = proj_r.scalar_one_or_none() if proj_r else None

    ai = await get_ai_client(oid, db, task="fast")
    analysis = await describe_image(ai, image_data, media_type)

    # Auto-update the UI/UX blueprint section
    session_result = await db.execute(select(Session).where(Session.id == session_id))
    session_obj = session_result.scalar_one_or_none()
    if session_obj:
        await update_section(session_obj.project_id, "ui_ux", analysis, "ai-vision", db, session_id=session_id)

    return {"analysis": analysis}


@router.post("/api/sessions/{session_id}/generate-design-system")
@limiter.limit("3/minute")
async def generate_design_system(
    request: Request,
    session_id: str,
    body: dict | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Generate a design system via the design-library router.

    Rate-limited to 3/minute per client IP. The Sonnet 4.6 design call
    is ~$0.13 per regen (27.8k input tokens, no caching pre-fix) — a
    double-click or `useEffect`-fired retry can multiply that fast.
    The 2026-05-17 incident saw 108 calls in 60 seconds; 3/minute caps
    the worst case at ~$0.40/min from a single client.

    Body (all optional):
      - seed: int — deterministic variation picks
      - forbid_list: list[dict] — prior variation picks to avoid
      - brief_override: str — skip conversation-derived brief, use this instead
    """
    body = body or {}
    seed = body.get("seed")
    forbid_list = body.get("forbid_list") or []
    brief_override = body.get("brief_override")

    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(20)
    )
    messages = list(reversed(result.scalars().all()))

    session_result = await db.execute(select(Session).where(Session.id == session_id))
    session_obj = session_result.scalar_one_or_none()
    if not session_obj:
        raise HTTPException(status_code=404)

    blueprint = await get_or_create_blueprint(session_obj.project_id, db)

    conv = "\n".join([f"{'User' if m.user_id else 'AI'}: {m.content}" for m in messages[-15:]])

    from ..services import design_library_service as dls
    from ..services.ai_provider import get_ai_client, get_ai_client_for_role  # noqa: F401

    proj_r = await db.execute(select(Project.org_id).where(Project.id == session_obj.project_id))
    oid = proj_r.scalar_one_or_none()

    initial_idea = (blueprint.content or {}).get("initial_idea") or ""
    brief = brief_override or f"{initial_idea}\n\nCONVERSATION:\n{conv}".strip()

    classifier_ai = await get_ai_client_for_role(oid, db, "design_classify")
    bundle = await dls.build_design_bundle(brief, classifier_ai, forbid_list=forbid_list, seed=seed)

    library_block = "\n\n".join(f"=== {path} ===\n{content}" for path, content in bundle.file_contents.items())

    generator_prompt = """You are a design systems generator. You have been given:
1. A design library (below) with a HARNESS, a recipe, supporting guides, variation constraints,
   and the anti-similarity pool.
2. A routing block that has already classified this brief and picked variation constraints you MUST honour.
3. The user's brief + blueprint.

Your job: emit TWO JSON objects in order, separated by `---MEMO---`.

FIRST — the design system tokens, exactly this shape:

{
  "colors": {
    "primary": {"hex": "#...", "name": "Primary", "usage": "..."},
    "secondary": {"hex": "#...", "name": "Secondary", "usage": "..."},
    "accent": {"hex": "#...", "name": "Accent", "usage": "..."},
    "background": {"hex": "#...", "name": "Background", "usage": "..."},
    "surface": {"hex": "#...", "name": "Surface", "usage": "..."},
    "text": {"hex": "#...", "name": "Text", "usage": "..."},
    "muted": {"hex": "#...", "name": "Muted", "usage": "..."},
    "success": {"hex": "#...", "name": "Success", "usage": "..."},
    "warning": {"hex": "#...", "name": "Warning", "usage": "..."},
    "error": {"hex": "#...", "name": "Error", "usage": "..."}
  },
  "typography": {"headingFont": "...", "bodyFont": "...", "scale": ["..."], "lineHeight": 1.5, "style": "..."},
  "spacing": {"unit": 4, "scale": [4, 8, 12, 16, 24, 32, 48, 64], "note": "..."},
  "borderRadius": {"sm": "...", "md": "...", "lg": "...", "full": "9999px"},
  "shadows": {"sm": "...", "md": "...", "lg": "..."},
  "style": "one-sentence direction",
  "components": {
    "button-primary":         {"background": "{colors.accent.hex}", "color": "{colors.foreground.hex}", "padding": "10px 18px", "rounded": "{borderRadius.sm}", "fontWeight": 600, "fontSize": "14px", "border": "none"},
    "button-primary-hover":   {"background": "{colors.accent.hex}", "color": "{colors.foreground.hex}", "opacity": "0.9"},
    "button-secondary":       {"background": "{colors.surface.hex}", "color": "{colors.text.hex}", "padding": "10px 18px", "rounded": "{borderRadius.sm}", "border": "1px solid {colors.border.hex}", "fontWeight": 500, "fontSize": "14px"},
    "button-ghost":           {"background": "transparent", "color": "{colors.muted.hex}", "padding": "8px 12px", "rounded": "{borderRadius.sm}", "border": "none", "fontWeight": 500, "fontSize": "13px"},
    "button-ghost-hover":     {"background": "{colors.raised.hex}", "color": "{colors.text.hex}"},
    "button-danger":          {"background": "transparent", "color": "{colors.negative.hex}", "padding": "10px 18px", "rounded": "{borderRadius.sm}", "border": "1px solid {colors.negative.hex}", "fontWeight": 500, "fontSize": "14px"},
    "button-icon":            {"background": "transparent", "color": "{colors.muted.hex}", "padding": "6px", "rounded": "{borderRadius.sm}", "border": "none", "width": "32px", "height": "32px", "display": "inline-flex", "alignItems": "center", "justifyContent": "center"},
    "filter-tab":             {"color": "{colors.muted.hex}", "fontSize": "13px", "fontWeight": 500, "padding": "6px 14px", "rounded": "{borderRadius.full}", "background": "transparent", "border": "1px solid transparent"},
    "filter-tab-active":      {"color": "{colors.text.hex}", "fontSize": "13px", "fontWeight": 600, "padding": "6px 14px", "rounded": "{borderRadius.full}", "background": "{colors.raised.hex}", "border": "1px solid {colors.border.hex}"},
    "pagination-button":      {"color": "{colors.muted.hex}", "fontSize": "13px", "fontWeight": 500, "padding": "6px 12px", "rounded": "{borderRadius.sm}", "background": "transparent", "border": "1px solid {colors.border.hex}"},
    "link-action":            {"color": "{colors.accent.hex}", "fontSize": "13px", "fontWeight": 500, "padding": "0", "background": "transparent", "border": "none", "textDecoration": "none"},
    "card-priority":          {"background": "{colors.surface.hex}", "color": "{colors.text.hex}", "padding": "20px", "rounded": "{borderRadius.md}", "border": "1px solid {colors.accent.hex}"},
    "card-secondary":         {"background": "{colors.surface.hex}", "color": "{colors.text.hex}", "padding": "16px", "rounded": "{borderRadius.md}", "border": "1px solid {colors.muted.hex}"},
    "section-eyebrow":        {"color": "{colors.muted.hex}", "fontSize": "11px", "letterSpacing": "0.14em", "textTransform": "uppercase", "fontWeight": 500},
    "section-header":         {"color": "{colors.text.hex}", "fontSize": "20px", "fontWeight": 600, "letterSpacing": "-0.01em"},
    "tab-bar-item":           {"color": "{colors.muted.hex}", "fontSize": "10px", "fontWeight": 500, "padding": "8px 4px"},
    "tab-bar-item-active":    {"color": "{colors.accent.hex}", "fontSize": "10px", "fontWeight": 600, "padding": "8px 4px"},
    "input-field":            {"background": "{colors.surface.hex}", "color": "{colors.text.hex}", "padding": "12px 14px", "rounded": "{borderRadius.sm}", "border": "1px solid {colors.muted.hex}", "fontSize": "14px"},
    "badge":                  {"background": "{colors.accent.hex}", "color": "{colors.background.hex}", "padding": "2px 8px", "rounded": "{borderRadius.sm}", "fontSize": "10px", "fontWeight": 600, "letterSpacing": "0.04em", "textTransform": "uppercase"}
  }
}

The "components" object defines a small library that wireframes will COMPOSE FROM (button-primary, card-priority, etc). Use it to encode the recipe's specific visual treatment of each component — that's what makes screens of this design feel like siblings instead of strangers. Tweak the values per recipe (e.g. brutalist recipe = sharp corners + thick borders; calm recipe = soft radii + ample padding). Use TOKEN REFERENCES `{colors.accent.hex}`, `{borderRadius.md}`, etc. so palette tweaks propagate automatically. Padding/font-size literals are fine.

DASHBOARD PALETTE LOCK (recipe G ONLY): if the chosen recipe is G, you MUST pick exactly one named palette from `08a-dashboard-palettes.md` and copy its `colors` block VERBATIM — same hex values, no improvisation, no LCH conversion, no tinting backgrounds with the accent. Backgrounds stay neutral gray regardless of accent (a violet accent does NOT make `surface` `#14101a`). Component-level hex codes must use token references (`{colors.surface.hex}`, etc.) so they stay consistent with the chosen palette. Record the palette name in `design_memo.variation_picks.color` (e.g. `"palette: indigo-pro"`).

Then a line with exactly: ---MEMO---

SECOND — the design memo, this shape:

{
  "recipe": "<letter> — <name>",
  "personality": "<personality>",
  "modifiers": {"density": "...", "energy": "...", "era": "..."},
  "variation_picks": {"layout": "...", "type": "...", "color": "...",
                       "motion": "...", "micro": "...", "density": "..."},
  "why_this_fits": "2–3 sentences explaining why this recipe + personality + modifiers suit the brief",
  "anti_patterns_avoided": ["pattern 1", "pattern 2"],
  "subversions": ["any deliberate rule-breaks, or empty list"]
}

No extra prose. No markdown fences.
"""

    # Dynamic per-call content lives outside the cached prefix above.
    # Splitting here lets Anthropic's ephemeral prompt cache reuse the
    # ~2k-token schema/instructions prefix on repeat regens within 5 min.
    # See max_retries / rate-limit fixes from the 2026-05-17 incident: even
    # bounded retry storms get ~90% cheaper when the static prefix caches.
    generator_dynamic = f"""====== ROUTING ======
{bundle.prompt_block}

====== DESIGN LIBRARY ======
{library_block}

====== BRIEF ======
{brief}

====== BLUEPRINT ======
{json.dumps(blueprint.content)[:4000]}
"""

    generator_ai = await get_ai_client_for_role(oid, db, "design")
    raw = await generator_ai.chat(
        # Anthropic content blocks — cache_control marks the static prefix
        # as ephemeral (5-min TTL). Safe here because the `design` role is
        # pinned to anthropic in _ROLE_DEFAULTS and has no failover chain;
        # if you re-introduce non-Anthropic failover for this role, gate
        # cache_control on isinstance/model check first.
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": generator_prompt,
                        "cache_control": {"type": "ephemeral"},
                    },
                    {"type": "text", "text": generator_dynamic},
                ],
            }
        ],
        # 8192 (was 4096) — the design system spec is large (10 colour
        # tokens + typography + spacing + ~15 components, each fully
        # described, plus the memo). Flash-tier models truncated JSON
        # mid-string at 4096 → "Unterminated string" parse failures.
        max_tokens=8192,
    )

    design_system, design_memo = _parse_design_system_and_memo(raw)

    logger.info(
        "Design system generated: recipe=%s personality=%s tokens~=%d files=%d",
        bundle.classification.recipe_letter,
        bundle.classification.personality,
        bundle.token_estimate,
        len(bundle.files_loaded),
    )

    # Persist the design output on the session so per-screen wireframe
    # generation can consume the variation constraints + memo + the SAME
    # recipe-specific file bundle that informed the design system. Without
    # the classification, the per-screen step would fall back to a
    # hardcoded generic 5-file subset and ignore the recipe entirely.
    try:
        diag_state = session_obj.diagram_state or {}
        diag_state["design"] = {
            "design_system": design_system,
            "design_memo": design_memo,
            "variation": bundle.variation.to_dict(),
            "personality": bundle.classification.personality,
            "classification": {
                "recipe_letter": bundle.classification.recipe_letter,
                "recipe_name": bundle.classification.recipe_name,
                "personality": bundle.classification.personality,
                "density": bundle.classification.density,
                "energy": bundle.classification.energy,
                "era": bundle.classification.era,
                "subvert": bundle.classification.subvert,
                "admin": bundle.classification.admin,
                "rationale": bundle.classification.rationale,
            },
            "files_loaded": bundle.files_loaded,
        }
        session_obj.diagram_state = diag_state
        await db.commit()
    except Exception as persist_err:
        logger.warning("Failed to persist design system on session: %s", persist_err)

    return {
        "design_system": design_system,
        "design_memo": design_memo,
        "routing": {
            "recipe_letter": bundle.classification.recipe_letter,
            "recipe_name": bundle.classification.recipe_name,
            "personality": bundle.classification.personality,
            "density": bundle.classification.density,
            "energy": bundle.classification.energy,
            "era": bundle.classification.era,
            "subvert": bundle.classification.subvert,
            "admin": bundle.classification.admin,
            "rationale": bundle.classification.rationale,
        },
        "variation": bundle.variation.to_dict(),
        "files_loaded": bundle.files_loaded,
        "token_estimate": bundle.token_estimate,
        "seed": seed,
    }


def _parse_design_system_and_memo(raw: str) -> tuple[dict, dict]:
    """Split the model response into tokens JSON + memo JSON.

    Models (especially gemini-flash) occasionally emit JSON with stray
    unescaped backslashes ("var(--color-bg)\\") or trailing commas that
    break json.loads. Sanitise once before parsing instead of failing
    the whole pipeline on a recoverable formatting issue.
    """
    text = raw.strip()
    # Strip top-level code fence if present
    if text.startswith("```"):
        first_nl = text.find("\n")
        if first_nl != -1:
            text = text[first_nl + 1 :]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

    def _sanitise_json(s: str) -> str:
        # Normalise backslash escapes — anything not a valid JSON escape
        # ("/bfnrtu) gets doubled so the parser sees a literal backslash.
        s = re.sub(r'(?<!\\)\\(?!["\\/bfnrtu])', r"\\\\", s)
        # Trim trailing comma before } or ] (common LLM mistake).
        s = re.sub(r",(\s*[}\]])", r"\1", s)
        return s

    def _strip_fences(s: str) -> str:
        s = s.strip()
        if s.startswith("```"):
            s = s.split("\n", 1)[1] if "\n" in s else s[3:]
            if s.endswith("```"):
                s = s[:-3]
        return s.strip()

    def _safe_loads(label: str, s: str) -> dict | None:
        cleaned = _sanitise_json(_strip_fences(s))
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as exc:
            logger.warning(
                "Design %s JSON parse failed even after sanitisation (%s); raw head=%r",
                label,
                exc,
                cleaned[:200],
            )
            return None

    if "---MEMO---" not in text:
        logger.warning("Design response missing ---MEMO--- separator; returning empty memo")
        ds = _safe_loads("tokens (no-memo path)", text)
        if ds is None:
            raise HTTPException(
                status_code=502,
                detail="Design generator returned invalid tokens JSON (no memo separator)",
            )
        return ds, {}

    tokens_raw, memo_raw = text.split("---MEMO---", 1)

    design_system = _safe_loads("tokens", tokens_raw)
    if design_system is None:
        raise HTTPException(
            status_code=502,
            detail="Design generator returned invalid tokens JSON",
        )

    design_memo = _safe_loads("memo", memo_raw) or {}

    return design_system, design_memo


@router.post("/api/sessions/{session_id}/design-handoff")
async def build_design_handoff(
    session_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Build the code hand-off bundle for a generated design.

    Body (required):
      - design_system: dict — the `design_system` shape returned by
        `generate-design-system`
      - design_memo: dict — the `design_memo` from that response
      - routing: dict — the `routing` from that response
      - variation: dict — the `variation` from that response

    Body (optional):
      - project_name: str — defaults to the session's project name
      - as_files: bool — if true, return `{files: {path: content}}`; else
        return `{design_md, tokens_json, tokens_css, tailwind_preset, meta}`

    The caller is expected to have just called generate-design-system; the
    hand-off builder is stateless so the frontend / orchestrator can cache
    the tokens and request the bundle only when needed.
    """
    design_system = body.get("design_system")
    if not isinstance(design_system, dict):
        raise HTTPException(status_code=422, detail="design_system is required and must be a JSON object")

    session_result = await db.execute(select(Session).where(Session.id == session_id))
    session_obj = session_result.scalar_one_or_none()
    if not session_obj:
        raise HTTPException(status_code=404)

    project_name = body.get("project_name")
    if not project_name:
        proj_r = await db.execute(select(Project.name).where(Project.id == session_obj.project_id))
        project_name = proj_r.scalar_one_or_none() or "Untitled"

    from ..services.design_handoff_service import build_handoff

    bundle = build_handoff(
        project_name=project_name,
        design_system=design_system,
        design_memo=body.get("design_memo") or {},
        routing=body.get("routing") or {},
        variation=body.get("variation"),
    )

    if body.get("as_files"):
        return {"files": bundle.to_files(), "meta": bundle.meta}

    return {
        "design_md": bundle.design_md,
        "tokens_json": bundle.tokens_json,
        "tokens_css": bundle.tokens_css,
        "tailwind_preset": bundle.tailwind_preset,
        "meta": bundle.meta,
    }


@router.post("/api/sessions/{session_id}/generate-wireframe")
async def generate_wireframe(
    session_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Generate a wireframe layout from conversation or description."""
    description = body.get("description", "")

    if not description:
        # Get from conversation
        result = await db.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at.desc())
            .limit(15)
        )
        messages = list(reversed(result.scalars().all()))
        description = "\n".join([m.content for m in messages if m.content])

    from ..services.ai_provider import get_ai_client, get_ai_client_for_role  # noqa: F401

    session_r = await db.execute(select(Session).where(Session.id == session_id))
    s_obj = session_r.scalar_one_or_none()
    proj_r2 = await db.execute(select(Project.org_id).where(Project.id == s_obj.project_id)) if s_obj else None
    oid2 = proj_r2.scalar_one_or_none() if proj_r2 else None

    ai = await get_ai_client(oid2, db, task="fast")
    raw = await ai.chat(
        messages=[
            {
                "role": "user",
                "content": f"""Based on this project description, generate a wireframe layout.

DESCRIPTION:
{description[:3000]}

Output ONLY valid JSON describing the wireframe:
{{
  "title": "Page name",
  "layout": "sidebar-left" | "sidebar-right" | "top-nav" | "centered" | "dashboard",
  "sections": [
    {{
      "id": "header",
      "type": "header",
      "position": {{"row": 1, "col": 1, "colSpan": 12}},
      "children": [
        {{"type": "logo", "text": "Logo"}},
        {{"type": "nav", "items": ["Home", "About", "Contact"]}},
        {{"type": "button", "text": "Sign Up", "variant": "primary"}}
      ]
    }},
    {{
      "id": "hero",
      "type": "hero",
      "position": {{"row": 2, "col": 1, "colSpan": 12}},
      "children": [
        {{"type": "heading", "text": "Welcome", "level": 1}},
        {{"type": "text", "text": "Subtitle description"}},
        {{"type": "button", "text": "Get Started", "variant": "primary"}}
      ]
    }},
    {{
      "id": "content",
      "type": "grid",
      "position": {{"row": 3, "col": 1, "colSpan": 12}},
      "columns": 3,
      "children": [
        {{"type": "card", "title": "Feature 1", "text": "Description"}},
        {{"type": "card", "title": "Feature 2", "text": "Description"}},
        {{"type": "card", "title": "Feature 3", "text": "Description"}}
      ]
    }}
  ]
}}

Create realistic sections based on the project type. Include: headers, hero sections, """
                "content grids, sidebars, forms, footers as appropriate.",
            }
        ],
        max_tokens=2048,
    )
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

    wireframe = json.loads(raw)
    return {"wireframe": wireframe}


@router.post("/api/sessions/{session_id}/wireframe/enhance")
async def enhance_wireframe(
    session_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Promote the stored low-fi wireframe to hi-fi by injecting design tokens
    into a regeneration pass. Body: { design_system: {...}, design_memo?: {...} }."""
    design_system = body.get("design_system")
    if not design_system or not isinstance(design_system, dict):
        raise HTTPException(status_code=400, detail="design_system required in request body")

    session_r = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.participants))
    )
    sess = session_r.scalar_one_or_none()
    if sess is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if not any(p.user_id == user.id for p in sess.participants):
        raise HTTPException(status_code=403, detail="Not a participant in this session")

    current = (sess.diagram_state or {}).get("wireframe")
    # Fallback: client can pass the current diagram if DB persistence is stale
    # (early-session race where progressive broadcast committed to React state
    # but the DB row hadn't been updated yet, etc.).
    if not current:
        client_diagram = body.get("current_diagram")
        if isinstance(client_diagram, dict) and client_diagram.get("screens"):
            current = client_diagram
            # Repair DB state so future enhance/render reads work.
            state_repair = sess.diagram_state or {}
            state_repair["wireframe"] = current
            sess.diagram_state = state_repair
            await db.commit()
    if not current:
        raise HTTPException(status_code=404, detail="No wireframe to enhance")

    # Build the regeneration prompt
    from ..services.ai_provider import get_ai_client, get_ai_client_for_role  # noqa: F401

    proj_r = await db.execute(select(Project.org_id).where(Project.id == sess.project_id))
    oid = proj_r.scalar_one_or_none()
    ai = await get_ai_client(oid, db, task="fast")

    tokens_blob = json.dumps(design_system, indent=2)
    screens_blob = json.dumps(current.get("screens", []), indent=2)
    memo_blob = json.dumps(body.get("design_memo") or {}, indent=2)

    # Build a compact { id, name, device } table the AI MUST round-trip exactly.
    expected_screens = [
        {"id": s.get("id"), "name": s.get("name"), "device": s.get("device", "desktop")}
        for s in (current.get("screens") or [])
        if isinstance(s, dict) and s.get("id")
    ]
    pinned_blob = json.dumps(expected_screens, indent=2)
    prompt = (
        "You are upgrading the visual treatment of an existing wireframe by applying "
        "the design system tokens below. Preserve everything except style — colours, "
        "typography, spacing, and accents are the only things that change.\n\n"
        "STRICT RULES:\n"
        "- Return EXACTLY these screens, with the SAME id and SAME device for each. "
        f"Do not add, drop, or rename any screen:\n{pinned_blob}\n"
        "- Do not switch a desktop screen to mobile or vice versa.\n"
        "- Each screen's html must use ONLY CSS variables for colour/typography "
        "(var(--color-bg), var(--color-text), var(--color-accent), "
        "var(--color-on-accent), var(--color-border), var(--font-family)). "
        "No hex literals, no rgba(). The renderer injects the tokens at render time.\n\n"
        f"DESIGN SYSTEM TOKENS (for reference — DO NOT inline these as hex):\n{tokens_blob}\n\n"
        f"DESIGN MEMO:\n{memo_blob}\n\n"
        f"CURRENT SCREENS HTML:\n{screens_blob}\n\n"
        "Output ONLY valid JSON (no markdown, no prose):\n"
        '{"type":"wireframe","title":"...","fidelity":"high","screens":[{"id":"...",'
        '"name":"...","device":"mobile|tablet|desktop","html":"<div style=\'...\'>...</div>"}],'
        '"flows":[{"from":"...","to":"...","trigger":"..."}]}'
    )
    # Scale tokens with screen count — multi-screen hi-fi HTML is long.
    n_screens = max(1, len(current.get("screens", [])))
    max_tokens = min(8192, 1500 * n_screens + 1500)
    raw = await ai.chat(messages=[{"role": "user", "content": prompt}], max_tokens=max_tokens)
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

    try:
        new_diagram = json.loads(raw)
    except json.JSONDecodeError as exc:
        # AI commonly emits unescaped `"` inside the html field (e.g.
        # <svg viewBox="0 0 24 24">), which kills strict parsing. Find each
        # html string boundary and escape every internal `"`, then retry.
        logger.warning("Wireframe enhance JSON parse failed (%s) — attempting lenient repair", exc)
        try:

            def _escape_html_field(blob: str) -> str:
                out: list[str] = []
                i = 0
                while True:
                    j = blob.find('"html":"', i)
                    if j == -1:
                        out.append(blob[i:])
                        break
                    body_start = j + len('"html":"')
                    out.append(blob[i:body_start])
                    # Walk forward until we find the closing `"` followed by
                    # `}` or `,` (with optional whitespace) — that's the real
                    # end of the html string. Inner `"` get escaped.
                    k = body_start
                    while k < len(blob):
                        if blob[k] == '"' and (k == 0 or blob[k - 1] != "\\"):
                            m = k + 1
                            while m < len(blob) and blob[m] in (" ", "\t", "\n", "\r"):
                                m += 1
                            if m < len(blob) and blob[m] in ("}", ","):
                                out.append(blob[body_start:k])
                                out.append('"')
                                i = k + 1
                                break
                            out.append(blob[body_start:k])
                            out.append('\\"')
                            body_start = k + 1
                            k += 1
                            continue
                        k += 1
                    else:
                        out.append(blob[body_start:])
                        i = len(blob)
                        break
                return "".join(out)

            repaired = _escape_html_field(raw)
            new_diagram = json.loads(repaired)
            logger.info("Wireframe enhance: lenient repair succeeded")
        except Exception as repair_err:
            logger.error(
                "Wireframe enhance returned invalid JSON: %s (repair also failed: %s) (first 500 chars: %r)",
                exc,
                repair_err,
                raw[:500],
            )
            raise HTTPException(status_code=502, detail="Enhancer returned invalid JSON") from exc
    if not isinstance(new_diagram, dict):
        raise HTTPException(status_code=502, detail="Enhancer returned non-object JSON")
    new_diagram.setdefault("fidelity", "high")

    # Tokenise inline colours on every screen so future token swaps work
    # without another /wireframe/enhance roundtrip.
    try:
        from ..services.wireframe_sanitizer import sanitize_wireframe_html

        screens = new_diagram.get("screens")
        if isinstance(screens, list):
            sanitised_count = 0
            for s in screens:
                if not isinstance(s, dict):
                    continue
                original = s.get("html") or ""
                s["html"] = sanitize_wireframe_html(original, design_system)
                if s["html"] != original:
                    sanitised_count += 1
            if sanitised_count:
                logger.info("Wireframe enhance: sanitised inline colours on %d screens", sanitised_count)
    except Exception as san_err:
        logger.warning("Enhance sanitiser failed: %s", san_err)

    # Persist
    state = sess.diagram_state or {}
    state["wireframe"] = new_diagram
    sess.diagram_state = state
    await db.commit()

    # Broadcast
    await manager.send_to(
        session_id,
        {"type": "diagram_update", "payload": new_diagram},
    )

    return {"wireframe": new_diagram}


@router.post(
    "/api/sessions/{session_id}/wireframe/infer",
    response_model=InferResponse,
)
async def infer_wireframe_plan(
    session_id: str,
    body: InferRequest,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> InferResponse:
    """Classify the brief into archetypes + extract domain screens, assemble
    a tiered plan, persist it under `diagram_state.wireframe.plan`, and
    broadcast `plan_inferred` so connected clients can render the plan card.
    """
    session_r = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.participants))
    )
    sess = session_r.scalar_one_or_none()
    if sess is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if not any(p.user_id == user.id for p in sess.participants):
        raise HTTPException(status_code=403, detail="Not a participant in this session")

    plan = await infer_plan(body.brief, body.device, org_id=org.id, db=db)

    state = dict(sess.diagram_state or {})
    wf = dict(state.get("wireframe") or {})
    wf["plan"] = json.loads(plan.model_dump_json())
    state["wireframe"] = wf
    sess.diagram_state = state
    await db.commit()

    await manager.send_to(
        session_id,
        {"type": "plan_inferred", "payload": wf["plan"]},
    )
    return InferResponse(plan=plan)


@router.get("/api/sessions/{session_id}/wireframe/plan", response_model=InferResponse)
async def get_wireframe_plan(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InferResponse:
    session_r = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.participants))
    )
    sess = session_r.scalar_one_or_none()
    if sess is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if not any(p.user_id == user.id for p in sess.participants):
        raise HTTPException(status_code=403, detail="Not a participant in this session")
    plan = get_plan(sess.diagram_state)
    if plan is None:
        raise HTTPException(status_code=404, detail="No plan inferred for this session yet")
    return InferResponse(plan=plan)


@router.patch(
    "/api/sessions/{session_id}/wireframe/plan",
    response_model=PlanPatchResponse,
)
async def patch_wireframe_plan(
    session_id: str,
    body: PlanPatchRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PlanPatchResponse:
    """Apply rename / retier / add / remove edits to the stored plan."""
    session_r = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.participants))
    )
    sess = session_r.scalar_one_or_none()
    if sess is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if not any(p.user_id == user.id for p in sess.participants):
        raise HTTPException(status_code=403, detail="Not a participant in this session")

    current = get_plan(sess.diagram_state)
    if current is None:
        raise HTTPException(
            status_code=409,
            detail="No plan to patch — call /wireframe/infer first",
        )
    new_plan = patch_plan(current, body)
    state = dict(sess.diagram_state or {})
    wf = dict(state.get("wireframe") or {})
    wf["plan"] = json.loads(new_plan.model_dump_json())
    state["wireframe"] = wf
    sess.diagram_state = state
    await db.commit()
    await manager.send_to(
        session_id,
        {"type": "plan_updated", "payload": wf["plan"]},
    )
    return PlanPatchResponse(plan=new_plan)


@router.post(
    "/api/sessions/{session_id}/wireframe/generate",
    response_model=GenerateResponse,
)
async def generate_planned_wireframes(
    session_id: str,
    body: GenerateRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GenerateResponse:
    """Kick off wireframe generation for the planned screens at a tier
    (or for an explicit screen_ids list). Marks chosen screens as
    `status="approved"` synchronously, dispatches the generation pipeline
    in the background, and broadcasts `plan_updated`. The frontend's
    existing skeleton + `screen_thinking` + `diagram_update` events render
    progress as screens land.
    """
    session_r = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.participants))
    )
    sess = session_r.scalar_one_or_none()
    if sess is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if not any(p.user_id == user.id for p in sess.participants):
        raise HTTPException(status_code=403, detail="Not a participant in this session")

    plan = get_plan(sess.diagram_state)
    if plan is None:
        raise HTTPException(
            status_code=409,
            detail="No plan to generate from — call /wireframe/infer first",
        )

    selected = select_for_generation(plan, tier=body.tier, screen_ids=body.screen_ids)
    if not selected:
        raise HTTPException(status_code=400, detail="No screens match the requested tier/ids")

    # Mark approved BEFORE generation kicks off so the plan card reflects
    # the targeted set immediately.
    new_plan = mark_screens_status(plan, [s.id for s in selected], "approved")
    state = dict(sess.diagram_state or {})
    wf = dict(state.get("wireframe") or {})
    wf["plan"] = json.loads(new_plan.model_dump_json())
    state["wireframe"] = wf
    sess.diagram_state = state
    await db.commit()
    await manager.send_to(
        session_id,
        {"type": "plan_updated", "payload": wf["plan"]},
    )

    pipeline_entries = screens_to_pipeline_entries(selected)
    synthetic_response = (
        f"Generating {len(selected)} planned wireframe screens: " + ", ".join(s.name for s in selected) + "."
    )

    async def _kick_off() -> None:
        # Fresh DB session — the request's session is closed by now.
        # The pipeline transitions screens via diagram_update / screen_thinking
        # broadcasts; the frontend is responsible for flipping plan status
        # to "generated" optimistically as those events land. Keeping
        # status-flipping out of the BG task avoids a second DB session
        # and keeps this endpoint a clean fire-and-forget.
        factory = get_session_factory()
        async with factory() as bg_db:
            sess_r = await bg_db.execute(select(Session).where(Session.id == session_id))
            sess_bg = sess_r.scalar_one_or_none()
            if sess_bg is None:
                return
            try:
                await _extract_diagram_inline(
                    session_id,
                    sess_bg,
                    [],
                    synthetic_response,
                    bg_db,
                    kind="main",
                    screen_plan_override=pipeline_entries,
                )
            except Exception:
                logger.warning(
                    "[plan-generate] pipeline failed for session=%s",
                    session_id,
                    exc_info=True,
                )

    background_tasks.add_task(_kick_off)

    return GenerateResponse(started=True, screens=selected, plan=new_plan)


@router.post("/api/sessions/{session_id}/wireframe/redesign-screen")
async def redesign_single_screen(
    session_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Regenerate ONE screen using the same component manifest + design
    library as its siblings, so the redesigned screen stays consistent
    with the rest of the set.

    Body: { screen_id: str, current_diagram?: dict (optional fallback) }
    """
    screen_id = body.get("screen_id")
    if not screen_id or not isinstance(screen_id, str):
        raise HTTPException(status_code=400, detail="screen_id required")

    session_r = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.participants))
    )
    sess = session_r.scalar_one_or_none()
    if sess is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if not any(p.user_id == user.id for p in sess.participants):
        raise HTTPException(status_code=403, detail="Not a participant in this session")

    state = sess.diagram_state or {}
    wireframe = state.get("wireframe")
    # Fallback: client may pass current_diagram if DB persistence is stale.
    if not wireframe:
        client_diagram = body.get("current_diagram")
        if isinstance(client_diagram, dict) and client_diagram.get("screens"):
            wireframe = client_diagram
            state["wireframe"] = wireframe
            sess.diagram_state = state
    if not wireframe:
        raise HTTPException(status_code=404, detail="No wireframe to redesign")

    screens = wireframe.get("screens") or []
    target = next((s for s in screens if isinstance(s, dict) and s.get("id") == screen_id), None)
    if not target:
        raise HTTPException(status_code=404, detail=f"Screen '{screen_id}' not found")

    target_device = target.get("device") or "desktop"
    screen_name = target.get("name") or screen_id
    target_kind = (target.get("kind") or "screen").lower()
    if target_kind not in ("screen", "modal", "drawer", "popover"):
        target_kind = "screen"

    # Load harness + design context (same path as the per-screen pipeline).
    import pathlib

    harness_dir = pathlib.Path(__file__).resolve().parent.parent / "diagram_harness"
    try:
        harness_files = ["HARNESS.md", "wireframe-ui-patterns.md"]
        harness_text = "\n\n".join((harness_dir / f).read_text() for f in harness_files if (harness_dir / f).exists())
    except Exception:
        harness_text = ""

    # Pull design library context onto the prompt — recipe, variation
    # constraints, component manifest. Same logic as the per-screen path.
    design_data = (state.get("design") or {}) if isinstance(state, dict) else {}
    ds = design_data.get("design_system") or {}
    memo = design_data.get("design_memo") or {}
    variation = design_data.get("variation") or {}
    personality = design_data.get("personality") or ""
    design_block_lines: list[str] = []
    if personality:
        design_block_lines.append(f"DESIGN PERSONALITY: {personality}")
    if memo.get("why_this_fits"):
        design_block_lines.append(f"WHY THIS DESIGN FITS:\n{memo['why_this_fits']}")
    vc = memo.get("variation_constraints") or variation
    if vc:
        vc_str = "\n".join(f"  - {k}: {v}" for k, v in vc.items() if v)
        if vc_str:
            design_block_lines.append(
                f"VARIATION CONSTRAINTS (you MUST honour these — they make the wireframe distinctive, not generic):\n{vc_str}"
            )
    components = ds.get("components") or {}
    if isinstance(components, dict) and components:
        descriptions = {
            "button-primary": "Primary CTA. Filled.",
            "button-secondary": "Secondary action. Outlined.",
            "card-priority": "Foregrounded card.",
            "card-secondary": "Standard card.",
            "section-eyebrow": "Small-caps section kicker.",
            "section-header": "Section title.",
            "tab-bar-item": "Bottom-nav slot on mobile.",
            "tab-bar-item-active": "Selected tab-bar slot.",
            "input-field": "Text input.",
            "badge": "Status pill.",
        }
        manifest_lines = [f"  - {name}: {descriptions.get(name, '(custom)')}" for name in components.keys()]
        design_block_lines.append(
            "COMPONENT MANIFEST (use these — match siblings):\n"
            + "\n".join(manifest_lines)
            + "\n\nUSAGE: `<button data-component='button-primary'>Start</button>` etc. Don't inline component-level styling."
        )
    design_block = (
        "\n\n=== DESIGN LIBRARY OUTPUT (apply these to the screen) ===\n"
        + "\n\n".join(design_block_lines)
        + "\n=== END DESIGN LIBRARY ===\n"
        if design_block_lines
        else ""
    )

    # Sibling-screen summary so the AI keeps continuity
    sibling_summary = (
        "\n".join(
            f"  - {s.get('name')} ({s.get('device', 'desktop')}, id={s.get('id')})"
            for s in screens
            if isinstance(s, dict) and s.get("id") != screen_id
        )
        or "(none)"
    )

    from ..services.ai_provider import get_ai_client, get_ai_client_for_role  # noqa: F401

    proj_r = await db.execute(select(Project.org_id).where(Project.id == sess.project_id))
    oid = proj_r.scalar_one_or_none()
    ai = await get_ai_client_for_role(oid, db, "wireframe")

    device_specs = {
        "mobile": "390x844, single column, bottom tab bar, top header",
        "tablet": "820x1180, two-column where useful, tab bar or sidebar",
        "desktop": "1440x900, top nav + sidebar + content area, multi-column grid",
    }
    device_rule = device_specs.get(target_device, device_specs["desktop"])

    # Kind-aware framing — modals/drawers/popovers must NOT use 100vh,
    # otherwise a full-page layout gets crammed into the overlay viewport.
    # Sizes scale with target_device so a mobile modal isn't bigger than
    # the phone it overlays.
    overlay_sizes = {
        "modal": {"mobile": "340x480", "tablet": "560x600", "desktop": "640x480"},
        "drawer": {"mobile": "320x844", "tablet": "380x1180", "desktop": "420x900"},
        "popover": {"mobile": "240x200", "tablet": "280x240", "desktop": "320x280"},
    }
    kind_size_rule = {
        "screen": f"{target_device.title()} sizing: {device_rule}.",
        "modal": f"Modal sizing: {overlay_sizes['modal'][target_device]} card. NO header / sidebar / tab-bar — modals overlay a parent {target_device} screen.",
        "drawer": f"Drawer sizing: {overlay_sizes['drawer'][target_device]} side panel. NO header / sidebar — slides over the parent {target_device} screen.",
        "popover": f"Popover sizing: {overlay_sizes['popover'][target_device]} compact card. Single column, no headers.",
    }[target_kind]
    kind_frame_rule = {
        "screen": (
            "FILL THE FULL VIEWPORT HEIGHT — root div uses "
            "`width:100%;min-height:100vh;display:flex;flex-direction:column`. "
            "Primary content region uses `flex:1`."
        ),
        "modal": (
            "Self-contained card. Root div: "
            "`width:100%;height:100%;display:flex;flex-direction:column;"
            "background:var(--color-surface);border:1px solid var(--color-border);"
            "border-radius:12px;padding:24px;gap:16px;"
            "box-shadow:0 24px 64px -12px rgba(0,0,0,0.4)`. "
            "Title row + close (×) + content body + action row."
        ),
        "drawer": (
            "Tall side panel. Root div: "
            "`width:100%;height:100%;display:flex;flex-direction:column;"
            "background:var(--color-surface);border-left:1px solid var(--color-border);"
            "padding:20px;gap:14px;overflow:hidden`. "
            "Top row title + close, scrollable content."
        ),
        "popover": (
            "Compact card. Root div: "
            "`width:100%;height:100%;display:flex;flex-direction:column;"
            "background:var(--color-surface);border:1px solid var(--color-border);"
            "border-radius:8px;padding:12px;gap:8px;"
            "box-shadow:0 12px 32px -8px rgba(0,0,0,0.4)`. "
            "Tight, single column."
        ),
    }[target_kind]

    system_prompt = (
        f"You generate a single wireframe surface as JSON for a planning tool. "
        f"You are REDESIGNING this {target_kind} — the user wants a fresh take "
        f"while keeping it consistent with its siblings.\n\n{harness_text}"
    )
    user_prompt = f"""Generate a fresh wireframe for ONE {target_kind} as a SINGLE JSON object.

Surface to redesign: "{screen_name}" (id={screen_id}, kind={target_kind}, device={target_device})
Sibling screens (already designed — match their visual vocabulary):
{sibling_summary}
{design_block}
Return ONLY this JSON, no narration, no code fence:
{{"id":"{screen_id}","name":"{screen_name}","kind":"{target_kind}","device":"{target_device}","html":"<div style='...'> ... </div>"}}

Rules:
- "id" MUST be exactly "{screen_id}" — do not rename.
- "kind" MUST be exactly "{target_kind}".
- "device" MUST be exactly "{target_device}".
- The new {target_kind} must use the SAME component manifest as its siblings (same `data-component` names, same colour/typography references). Different LAYOUT and CONTENT are fine — that's the point of redesign — but the visual vocabulary stays.
- Every colour MUST be a CSS variable. Allowed: var(--color-bg), var(--color-surface), var(--color-text), var(--color-text-muted), var(--color-accent), var(--color-on-accent), var(--color-border). FORBIDDEN: #hex, rgb(), rgba(), named colours.
- Apply components via `data-component="<name>"` attributes — do NOT inline component-level styles. Layout styles (display, grid, flex, position) inline are fine.
- {kind_size_rule}
- {kind_frame_rule}
- HTML attribute values use SINGLE quotes (style='...').
- INTERACTIVITY (mandatory): Embed inline `<script>` blocks that wire up
  every interactive element — buttons (press feedback), tabs (active
  switching), checkboxes/radios (toggle), dropdowns (open + select),
  table rows (hover + select), filter chips (× dismiss), forms (focus
  states + typing). Plain vanilla JS, no libraries. Use CSS transitions
  (200–300ms) for state changes. Wireframes are working prototypes, not
  static mockups.
{("- DO NOT render an iOS status bar (no 9:41 / signal / battery / notch). The renderer provides the device chrome." if target_kind == "screen" and target_device in ("mobile", "tablet") else "")}
- Return ONLY the JSON object. No prose, no explanations, no code fences.
"""

    # Stream Opus + thinking — broadcast thinking deltas to that one screen.
    await manager.send_to(
        session_id,
        {"type": "screen_thinking", "payload": {"screen_id": screen_id, "reset": True}},
    )
    text_buf: list[str] = []
    thinking_buf: list[str] = []
    last_thinking_flush = 0
    try:
        async for chunk in ai.chat_stream(
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
            max_tokens=16384,
            enable_thinking=True,
            thinking_budget=6144,
        ):
            if isinstance(chunk, tuple) and chunk[0] == "thinking":
                thinking_buf.append(chunk[1])
                joined_len = sum(len(t) for t in thinking_buf)
                if joined_len - last_thinking_flush > 120:
                    last_thinking_flush = joined_len
                    await manager.send_to(
                        session_id,
                        {
                            "type": "screen_thinking",
                            "payload": {
                                "screen_id": screen_id,
                                "replace": True,
                                "text": "".join(thinking_buf),
                            },
                        },
                    )
            elif isinstance(chunk, str):
                text_buf.append(chunk)
        if thinking_buf:
            await manager.send_to(
                session_id,
                {
                    "type": "screen_thinking",
                    "payload": {
                        "screen_id": screen_id,
                        "replace": True,
                        "text": "".join(thinking_buf),
                    },
                },
            )
    except Exception as gen_err:
        logger.error("[REDESIGN] AI call failed for screen %s: %s", screen_id, gen_err)
        raise HTTPException(status_code=502, detail=f"Redesign generation failed: {gen_err}") from gen_err

    raw = "".join(text_buf).strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

    import re as _re_redesign

    raw = _re_redesign.sub(r'(?<!\\)\\(?!["\\/bfnrtu])', r"\\\\", raw)
    try:
        new_screen = json.loads(raw)
    except json.JSONDecodeError as parse_err:
        # Lenient fallback — same approach as per-screen pipeline
        logger.warning(
            "[REDESIGN] Strict JSON parse failed (%s); attempting lenient extract. raw[:200]=%r",
            parse_err,
            raw[:200],
        )

        def _grab(field: str) -> str | None:
            mm = _re_redesign.search(rf'"{field}"\s*:\s*"([^"]*)"', raw)
            return mm.group(1) if mm else None

        sid = _grab("id") or screen_id
        sname = _grab("name") or screen_name
        sdevice = _grab("device") or target_device
        html_open = raw.find('"html"')
        if html_open == -1:
            raise HTTPException(status_code=502, detail="Redesign returned malformed JSON") from parse_err
        colon = raw.find(":", html_open)
        first_quote = raw.find('"', colon + 1)
        last_quote = raw.rfind('"')
        if first_quote == -1 or last_quote <= first_quote:
            raise HTTPException(status_code=502, detail="Redesign returned malformed JSON") from parse_err
        html_value = raw[first_quote + 1 : last_quote]
        new_screen = {"id": sid, "name": sname, "device": sdevice, "html": html_value}

    if not isinstance(new_screen, dict) or not new_screen.get("html"):
        raise HTTPException(status_code=502, detail="Redesign returned no html")
    # Pin id + device + kind so the merge logic finds the right slot and
    # the canvas keeps rendering the surface as the same kind (otherwise a
    # modal would briefly snap back to a full-page screen on refresh).
    new_screen["id"] = screen_id
    new_screen["device"] = target_device
    new_screen["kind"] = target_kind
    new_screen["name"] = new_screen.get("name") or screen_name

    # Sanitise inline colours → var(--color-*) refs.
    try:
        from ..services.wireframe_sanitizer import sanitize_wireframe_html

        new_screen["html"] = sanitize_wireframe_html(new_screen["html"], ds)
    except Exception as san_err:
        logger.warning("[REDESIGN] Sanitiser failed for %s: %s", screen_id, san_err)

    # Replace in place + persist
    updated_screens = [new_screen if (isinstance(s, dict) and s.get("id") == screen_id) else s for s in screens]
    wireframe["screens"] = updated_screens
    state["wireframe"] = wireframe
    sess.diagram_state = state
    await db.commit()

    # Broadcast the FULL wireframe so the existing diagram_update handler
    # picks up the new screen via its id-match path. Setting fidelity=high
    # lands the hi-fi replacement code path, not the progressive merge.
    payload = {**wireframe, "fidelity": "high"}
    await manager.send_to(
        session_id,
        {"type": "diagram_update", "payload": payload},
    )
    logger.info("[REDESIGN] Screen %s redesigned (html_len=%d)", screen_id, len(new_screen["html"]))

    return {"screen": new_screen}


@router.post("/api/sessions/{session_id}/wireframe/edit-screen")
async def edit_single_screen(
    session_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Apply a TARGETED edit to one screen — preserve everything except the
    specific aspect requested. Different from /redesign-screen which does a
    fresh ground-up rebuild.

    Body: { screen_id: str, instruction: str, current_diagram?: dict }
    """
    screen_id = body.get("screen_id")
    instruction = body.get("instruction")
    if not screen_id or not isinstance(screen_id, str):
        raise HTTPException(status_code=400, detail="screen_id required")
    if not instruction or not isinstance(instruction, str) or not instruction.strip():
        raise HTTPException(status_code=400, detail="instruction required")
    instruction = instruction.strip()

    session_r = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.participants))
    )
    sess = session_r.scalar_one_or_none()
    if sess is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if not any(p.user_id == user.id for p in sess.participants):
        raise HTTPException(status_code=403, detail="Not a participant in this session")

    state = sess.diagram_state or {}
    wireframe = state.get("wireframe")
    if not wireframe:
        client_diagram = body.get("current_diagram")
        if isinstance(client_diagram, dict) and client_diagram.get("screens"):
            wireframe = client_diagram
            state["wireframe"] = wireframe
            sess.diagram_state = state
    if not wireframe:
        raise HTTPException(status_code=404, detail="No wireframe to edit")

    screens = wireframe.get("screens") or []
    target = next((s for s in screens if isinstance(s, dict) and s.get("id") == screen_id), None)
    if not target:
        raise HTTPException(status_code=404, detail=f"Screen '{screen_id}' not found")

    target_device = target.get("device") or "desktop"
    target_kind = (target.get("kind") or "screen").lower()
    if target_kind not in ("screen", "modal", "drawer", "popover"):
        target_kind = "screen"
    screen_name = target.get("name") or screen_id
    existing_html = target.get("html") or ""
    if not existing_html:
        raise HTTPException(status_code=400, detail="Screen has no existing HTML to edit")

    # Pull design system context (same shape as the redesign endpoint).
    design_data = (state.get("design") or {}) if isinstance(state, dict) else {}
    ds = design_data.get("design_system") or {}
    components = ds.get("components") or {}
    component_hint = ""
    if isinstance(components, dict) and components:
        names = sorted(list(components.keys()))[:24]
        component_hint = "\nCOMPONENT MANIFEST (reuse these — match siblings):\n" + "\n".join(f"  - {n}" for n in names)

    from ..services.ai_provider import get_ai_client, get_ai_client_for_role  # noqa: F401

    proj_r = await db.execute(select(Project.org_id).where(Project.id == sess.project_id))
    oid = proj_r.scalar_one_or_none()
    ai = await get_ai_client_for_role(oid, db, "edit")

    system_prompt = (
        "You apply a SURGICAL edit to one wireframe surface. Read the existing "
        "HTML carefully, then return updated HTML that PRESERVES every part of "
        "the layout, every component, every section that wasn't explicitly "
        "mentioned in the edit instruction. Do NOT redesign. Do NOT reorganise. "
        "Modify only what the instruction asks for."
    )
    user_prompt = f"""Apply this edit to ONE wireframe surface:

EDIT INSTRUCTION:
{instruction}

SURFACE: "{screen_name}" (id={screen_id}, kind={target_kind}, device={target_device})

EXISTING HTML (preserve everything that isn't part of the edit):
```
{existing_html}
```
{component_hint}

Return ONLY this JSON, no narration, no code fence:
{{"id":"{screen_id}","name":"{screen_name}","kind":"{target_kind}","device":"{target_device}","html":"<modified html — same structure, edit applied>"}}

Rules:
- "id" MUST be exactly "{screen_id}".
- "kind" MUST be exactly "{target_kind}".
- "device" MUST be exactly "{target_device}".
- Apply ONLY the requested edit. Every other part of the existing HTML stays as-is — same sections, same components, same layout, same content.
- Use ONLY the components in the manifest above (data-component='...'). No new component names.
- Every colour MUST be a CSS variable (var(--color-bg), var(--color-surface), var(--color-text), var(--color-text-muted), var(--color-accent), var(--color-on-accent), var(--color-border)). NO hex / rgb / named.
- HTML attribute values use SINGLE quotes (style='...').
- Return ONLY the JSON. No prose, no explanations, no code fences.
"""

    await manager.send_to(
        session_id,
        {"type": "screen_thinking", "payload": {"screen_id": screen_id, "reset": True}},
    )

    text_buf: list[str] = []
    try:
        async for chunk in ai.chat_stream(
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
            max_tokens=16384,
            enable_thinking=True,
            thinking_budget=4096,
        ):
            if isinstance(chunk, tuple) and chunk[0] == "thinking":
                # No-op for now — could broadcast thinking here.
                continue
            if isinstance(chunk, str):
                text_buf.append(chunk)
    except Exception as stream_err:
        logger.error("[EDIT] Stream failed for %s: %s", screen_id, stream_err, exc_info=True)
        raise HTTPException(status_code=502, detail="Edit stream failed") from stream_err

    raw = ("".join(text_buf)).strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

    new_screen: dict
    try:
        new_screen = json.loads(raw)
    except Exception as parse_err:
        # Lenient salvage: pull "html" out of the raw text.
        def _grab(field: str) -> str | None:
            i = raw.find(f'"{field}"')
            if i == -1:
                return None
            colon = raw.find(":", i)
            quote = raw.find('"', colon + 1)
            end = raw.find('"', quote + 1)
            if quote == -1 or end == -1:
                return None
            return raw[quote + 1 : end]

        sid = _grab("id") or screen_id
        sname = _grab("name") or screen_name
        sdevice = _grab("device") or target_device
        html_open = raw.find('"html"')
        if html_open == -1:
            raise HTTPException(status_code=502, detail="Edit returned malformed JSON") from parse_err
        colon = raw.find(":", html_open)
        first_quote = raw.find('"', colon + 1)
        last_quote = raw.rfind('"')
        if first_quote == -1 or last_quote <= first_quote:
            raise HTTPException(status_code=502, detail="Edit returned malformed JSON") from parse_err
        html_value = raw[first_quote + 1 : last_quote]
        new_screen = {"id": sid, "name": sname, "device": sdevice, "html": html_value}

    if not isinstance(new_screen, dict) or not new_screen.get("html"):
        raise HTTPException(status_code=502, detail="Edit returned no html")

    # Pin id, kind, device, name so the merge logic finds the right slot.
    new_screen["id"] = screen_id
    new_screen["device"] = target_device
    new_screen["kind"] = target_kind
    new_screen["name"] = new_screen.get("name") or screen_name
    if target.get("trigger_from"):
        new_screen.setdefault("trigger_from", target["trigger_from"])

    # Sanitise inline colours.
    try:
        from ..services.wireframe_sanitizer import sanitize_wireframe_html

        new_screen["html"] = sanitize_wireframe_html(new_screen["html"], ds)
    except Exception as san_err:
        logger.warning("[EDIT] Sanitiser failed for %s: %s", screen_id, san_err)

    # Replace in place + persist.
    updated_screens = [new_screen if (isinstance(s, dict) and s.get("id") == screen_id) else s for s in screens]
    wireframe["screens"] = updated_screens
    state["wireframe"] = wireframe
    sess.diagram_state = state
    await db.commit()

    payload = {**wireframe, "fidelity": "high"}
    await manager.send_to(
        session_id,
        {"type": "diagram_update", "payload": payload},
    )
    logger.info(
        "[EDIT] Screen %s edited (instruction='%s', html_len=%d)",
        screen_id,
        instruction[:60],
        len(new_screen["html"]),
    )

    return {"screen": new_screen}


@router.get("/api/sessions/{session_id}/personaplex-config")
async def get_personaplex_config(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Return PersonaPlex WebSocket URL + prompt for direct browser connection."""
    settings = get_settings()
    ws_url = settings.personaplex_ws_url
    if not ws_url:
        raise HTTPException(status_code=503, detail="PersonaPlex not configured")

    result = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.participants))
    )
    session_obj = result.scalar_one_or_none()
    if not session_obj:
        raise HTTPException(status_code=404, detail="Session not found")

    # Verify user is participant
    if not any(p.user_id == user.id for p in session_obj.participants):
        raise HTTPException(status_code=403, detail="Not a participant")

    # Build prompt from ai_config
    from ..services.facilitator import _build_system_prompt

    ai_config = session_obj.ai_config or {}
    prompt = _build_system_prompt(
        assertiveness=ai_config.get("assertiveness", "balanced"),
        persona=ai_config.get("persona", "default"),
    )
    # Truncate for PersonaPlex (max 500 chars for text_prompt)
    if len(prompt) > 500:
        prompt = prompt[:500]

    return {"ws_url": ws_url, "text_prompt": prompt}


@router.get("/api/sessions/{session_id}/resolved-voice-config")
async def get_resolved_voice_config(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Return resolved voice config for this session (persona > org defaults > hardcoded)."""
    from ..services.voice_config_service import resolve_voice_config as _resolve_vc

    result = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.participants))
    )
    session_obj = result.scalar_one_or_none()
    if not session_obj:
        raise HTTPException(status_code=404, detail="Session not found")
    if not any(p.user_id == user.id for p in session_obj.participants):
        raise HTTPException(status_code=403, detail="Not a participant")

    ai_config = session_obj.ai_config or {}
    persona_slug = ai_config.get("persona", "default")
    resolved = await _resolve_vc(session_obj.org_id, persona_slug, db)
    return resolved


@router.get("/api/sessions/{session_id}/realtime-config")
async def get_realtime_config(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Return OpenAI Realtime API config: ephemeral token + instructions + voice."""
    settings = get_settings()
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="OpenAI not configured")

    result = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.participants))
    )
    session_obj = result.scalar_one_or_none()
    if not session_obj:
        raise HTTPException(status_code=404, detail="Session not found")

    if not any(p.user_id == user.id for p in session_obj.participants):
        raise HTTPException(status_code=403, detail="Not a participant")

    ai_config = session_obj.ai_config or {}

    # Resolve voice config from persona > org defaults > hardcoded
    from ..services.voice_config_service import resolve_voice_config as _resolve_vc

    persona_slug = ai_config.get("persona", "default")
    try:
        rt_voice_cfg = await _resolve_vc(session_obj.org_id, persona_slug, db)
    except Exception:
        rt_voice_cfg = {}

    # Voice-specific instructions (shorter than text facilitator — no diagram format rules)
    persona_prompts = {
        "default": "You are a sharp, opinionated senior engineer.",
        "pm": "You are an experienced product manager focused on user needs and market fit.",
        "architect": "You are a system architect focused on scalability and technical decisions.",
        "mentor": "You are a patient technical mentor who explains clearly.",
        "challenger": "You are a devil's advocate who questions every assumption.",
    }
    persona = persona_prompts.get(persona_slug, persona_prompts["default"])
    instructions = (
        f"{persona} You are an AI planning facilitator in a voice conversation. "
        "Guide the team through building a project blueprint. "
        "Be concise — 1-2 sentences per response. Be opinionated. "
        "Ask about: what they're building, who it's for, tech stack, key features, architecture. "
        "For simple projects, wrap up fast. For complex ones, dig into data models, auth, scaling. "
        "If they say 'sounds good' or 'figure it out', make the call and move on."
    )

    # Create ephemeral token via OpenAI API (token expires in 60s!)
    import httpx

    voice = rt_voice_cfg.get("realtime_voice") or ai_config.get("realtime_voice", "alloy")
    model = "gpt-4o-mini-realtime-preview"

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.openai.com/v1/realtime/sessions",
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "type": "realtime",
                "output_modalities": ["audio"],
                "instructions": instructions,
                "audio": {
                    "output": {
                        "voice": voice,
                    },
                },
            },
            timeout=10,
        )
        if resp.status_code != 200:
            logger.error("OpenAI Realtime session failed: %s %s", resp.status_code, resp.text)
            raise HTTPException(status_code=502, detail="Failed to create realtime session")
        data = resp.json()

    token = data.get("client_secret", {}).get("value", "")
    if not token:
        logger.error("No client_secret in response: %s", data)
        raise HTTPException(status_code=502, detail="No ephemeral token returned")

    return {
        "ws_url": f"wss://api.openai.com/v1/realtime?model={model}",
        "token": token,
        "instructions": instructions,
        "voice": voice,
    }


@router.get("/api/sessions/{session_id}/diagram")
async def get_diagram(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get the current diagram state for a session."""
    result = await db.execute(select(Session).where(Session.id == session_id))
    session_obj = result.scalar_one_or_none()
    if not session_obj:
        raise HTTPException(status_code=404)
    state = session_obj.diagram_state or {}
    # Legacy: single diagram with "type" at root
    if "type" in state:
        return {"diagram": state, "diagrams": {state["type"]: state}}
    # Multi-diagram: dict keyed by type
    return {"diagram": None, "diagrams": state}


@router.delete("/api/sessions/{session_id}/diagram", status_code=204)
async def delete_diagram(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Clear the diagram state for a session."""
    result = await db.execute(select(Session).where(Session.id == session_id))
    session_obj = result.scalar_one_or_none()
    if not session_obj:
        raise HTTPException(status_code=404)
    session_obj.diagram_state = None
    await db.commit()


@router.patch("/api/sessions/{session_id}/diagram")
async def update_diagram(
    session_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update the diagram state (from user canvas edits)."""
    result = await db.execute(select(Session).where(Session.id == session_id))
    session_obj = result.scalar_one_or_none()
    if not session_obj:
        raise HTTPException(status_code=404)
    session_obj.diagram_state = body.get("diagram", session_obj.diagram_state)
    await db.commit()
    return {"diagram": session_obj.diagram_state}


@router.put("/api/sessions/{session_id}/canvas")
async def save_canvas(
    session_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save the React Flow canvas state (nodes + edges)."""
    result = await db.execute(select(Session).where(Session.id == session_id))
    session_obj = result.scalar_one_or_none()
    if not session_obj:
        raise HTTPException(status_code=404, detail="Session not found")

    session_obj.canvas_elements = {"nodes": body.get("nodes", []), "edges": body.get("edges", [])}
    await db.commit()
    return {"ok": True}


@router.delete("/api/sessions/{session_id}/canvas")
async def clear_canvas(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Clear the canvas state for a session (fixes corrupted data)."""
    result = await db.execute(select(Session).where(Session.id == session_id))
    session_obj = result.scalar_one_or_none()
    if not session_obj:
        raise HTTPException(status_code=404, detail="Session not found")
    session_obj.canvas_elements = None
    await db.commit()
    return {"ok": True}


async def _run_facilitator(session_id: str, initial_idea: str | None, intent: object | None = None):
    """Background task: run AI facilitator and broadcast responses.
    Creates its own DB session — the request's session is closed by the time this runs.

    `intent`: optional `IntentResult` from the pre-classifier — see
    `_run_facilitator_safe` doc.
    """
    import time as _time_mod

    _turn_started = _time_mod.monotonic()
    intent_route = getattr(intent, "route", None) if intent is not None else None
    logger.info(
        "facilitator.turn_start",
        extra={"session_id": session_id, "intent_route": intent_route},
    )
    try:
        session_factory = get_session_factory()
    except Exception as e:
        logger.error("Facilitator failed to create session factory: %s", e)
        return
    async with session_factory() as db:
        try:
            # Check if AI is muted — skip response entirely
            session_check = await db.execute(select(Session).where(Session.id == session_id))
            session_obj_check = session_check.scalar_one_or_none()
            if session_obj_check and session_obj_check.ai_config and session_obj_check.ai_config.get("muted"):
                logger.info("Facilitator skipped — AI is muted for session %s", session_id)
                # Clear the "AI is thinking…" indicator so the chat UI doesn't
                # hang on the typing dots when the facilitator silently bails.
                # Without this, the frontend keeps showing the thinking spinner
                # and the user thinks chat is broken.
                try:
                    await manager.send_to(session_id, {"type": "ai_thinking", "thinking": False})
                except Exception:
                    logger.debug("Failed to clear ai_thinking on muted-skip", exc_info=True)
                return

            # Skip chat facilitator while a voice/video call is active for
            # this session — even if the AI voice agent itself hasn't been
            # invited yet. The user is meeting-mode and any chat reply
            # would either ride over their voice or duplicate the (yet-to-
            # arrive) voice response. Resumes once the room is empty.
            try:
                from ..services.livekit_service import check_agent_in_room

                room_state = await check_agent_in_room(session_id)
                if room_state.get("room_exists") and (room_state.get("participants") or 0) > 0:
                    logger.info(
                        "Facilitator skipped — call active for session %s (participants=%s, agent=%s)",
                        session_id,
                        room_state.get("participants"),
                        room_state.get("agent_connected"),
                    )
                    try:
                        await manager.send_to(session_id, {"type": "ai_thinking", "thinking": False})
                    except Exception:
                        logger.debug("Failed to clear ai_thinking on call-active skip", exc_info=True)
                    return
            except Exception as e:
                # Don't strand chat if the LiveKit API is unreachable — just
                # log and let the chat facilitator run as a fallback.
                logger.warning("Facilitator: call-active check failed, allowing reply: %s", e)

            # NOTE: involvement-mode gating ("observer" / "responsive") is a
            # *voice agent* concept — it controls when the LiveKit agent
            # speaks during a call. Typed chat is a separate channel and the
            # user expects every message they type to get a reply. The old
            # gate here would broadcast `chat_message_skipped` ("AI is
            # listening — waiting for more context") and silently drop the
            # response, which made chat feel broken whenever the user had
            # set involvement to anything other than facilitator/driver.
            #
            # Voice involvement gating still lives in `agent/worker.py:should_respond`.
            # We still consume `pending_one_shot` if it's set so /ask continues
            # to work as a voice-only override without leaving stale state.
            if session_obj_check and (session_obj_check.ai_config or {}).get("pending_one_shot"):
                new_cfg = dict(session_obj_check.ai_config or {})
                new_cfg.pop("pending_one_shot", None)
                session_obj_check.ai_config = new_cfg
                await db.commit()

            # Notify clients AI is thinking
            await manager.send_to(session_id, {"type": "ai_thinking", "thinking": True})

            # Check session context feature flag
            from ..config import get_settings as _gs

            settings_use_ctx = _gs().use_session_context
            msg_limit = _gs().context_recent_messages if settings_use_ctx else 20

            # Get recent messages
            logger.info("Facilitator: querying messages for session %s", session_id)
            result = await db.execute(
                select(ChatMessage)
                .where(ChatMessage.session_id == session_id)
                .order_by(ChatMessage.created_at.desc())
                .limit(msg_limit)
            )
            messages = list(reversed(result.scalars().all()))
            logger.info("Facilitator: found %s messages for session %s", len(messages), session_id)

            messages_history = []
            for m in messages:
                entry = {
                    "content": m.content,
                    "message_type": m.message_type,
                    "user_name": "AI" if not m.user_id else "User",
                }
                messages_history.append(entry)

            # Get session's project blueprint
            logger.info("Facilitator: fetching session object %s", session_id)
            session_result = await db.execute(select(Session).where(Session.id == session_id))
            session_obj = session_result.scalar_one_or_none()
            if not session_obj:
                logger.error("Facilitator: session %s not found in DB — aborting", session_id)
                return

            logger.info("Facilitator: fetching blueprint for project %s", session_obj.project_id)
            blueprint = await get_or_create_blueprint(
                session_obj.project_id,
                db,
                iteration_id=session_obj.iteration_id,
            )
            logger.info(
                "Facilitator: got blueprint (version %s), calling process_message with %s messages",
                blueprint.version_number,
                len(messages_history),
            )

            # Build iteration context for v2+ sessions
            iter_context = None
            sections_for_type = None
            if session_obj.iteration_id:
                from ..models.blueprint import BlueprintIteration
                from ..services.blueprint_template_service import get_template_sections
                from ..services.facilitator import SECTION_LABELS

                iter_result = await db.execute(
                    select(BlueprintIteration).where(BlueprintIteration.id == session_obj.iteration_id)
                )
                iteration = iter_result.scalar_one_or_none()

                # Resolve iteration type sections from DB templates
                if iteration and iteration.iteration_type:
                    sections_for_type = await get_template_sections(session_obj.org_id, iteration.iteration_type, db)

                if iteration and iteration.forked_from_id:
                    parts = [f"VERSION CONTEXT:\nThis is {iteration.label} planning, building on the previous version."]

                    # Add type-specific guidance
                    if sections_for_type:
                        section_names = ", ".join(SECTION_LABELS.get(s, s) for s in sections_for_type)
                        type_label = iteration.iteration_type.replace("_", " ").title()
                        parts.append(
                            f"\nIteration type: {type_label}\n"
                            f"Focus ONLY on these sections: "
                            f"{section_names}.\n"
                            f"Do NOT ask about sections outside "
                            f"this scope."
                        )

                    if iteration.parent_out_of_scope:
                        parts.append(
                            f"\nPreviously excluded features "
                            f"(candidates for this version):\n"
                            f"{iteration.parent_out_of_scope}\n\n"
                            f"Guide the conversation to decide "
                            f"which of these to include."
                        )

                    iter_context = "\n".join(parts)

            # Call facilitator with assertiveness and persona from ai_config
            ai_config = session_obj.ai_config if session_obj.ai_config else {}
            assertiveness = ai_config.get("assertiveness", "balanced")
            persona = ai_config.get("persona", "default")
            pace = ai_config.get("pace")
            technical_comfort = ai_config.get("technical_comfort", "comfortable")

            # Pace runtime state — reset the new persona's counters whenever
            # the active persona changes (user clicked the chip or swapped
            # personas in the drawer). Without this, counters from a previous
            # active period would leak into the new one and the budget would
            # appear pre-spent.
            #
            # record_active_persona also appends to persona_history so the
            # smart-handoff guards (in pace.next_persona_for_handoff and
            # facilitator.compute_persona_suggestion) never re-recommend a
            # persona the user already cycled through.
            from ..services.pace import record_active_persona as _record_active_persona
            from ..services.pace import reset_persona_stats as _reset_pace_stats

            runtime_state = dict(session_obj.agent_runtime_state or {})
            if runtime_state.get("active_persona") != persona:
                runtime_state = _reset_pace_stats(runtime_state, persona)
                runtime_state = _record_active_persona(runtime_state, persona)
            elif "persona_history" not in runtime_state:
                # First message in a fresh session — seed the history with the
                # starting persona so they count as "used" once we move on.
                runtime_state = _record_active_persona(runtime_state, persona)
            # Get org_id + team_id from the project for AI provider routing + directory context
            from ..models.project import Project

            proj_result = await db.execute(
                select(Project.org_id, Project.team_id).where(Project.id == session_obj.project_id)
            )
            proj_row = proj_result.one_or_none()
            org_id = proj_row.org_id if proj_row else None

            # Resolve voice config from persona > org defaults > hardcoded
            from ..services.voice_config_service import resolve_voice_config as _resolve_vc

            resolved_vc = {}
            if org_id:
                try:
                    resolved_vc = await _resolve_vc(org_id, persona, db)
                    logger.info(
                        "Resolved voice config: language=%s, emotion=%s",
                        resolved_vc.get("language"),
                        resolved_vc.get("emotion"),
                    )
                except Exception:
                    logger.warning("Failed to resolve voice config, using ai_config fallback")
            team_id = proj_row.team_id if proj_row else None

            from ..services.facilitator import PERSONA_LABELS

            speaker = PERSONA_LABELS.get(persona, "AI Facilitator")

            import time as _time

            stream_msg_id = f"stream-{session_id[:8]}-{int(_time.time() * 1000)}"
            stream_started = False
            token_buffer = ""
            last_flush = _time.monotonic()
            FLUSH_INTERVAL = 0.04

            async def _flush_buffer():
                nonlocal token_buffer, last_flush
                if not token_buffer:
                    return
                await manager.send_to(
                    session_id,
                    {
                        "type": "ai_stream_token",
                        "payload": {"id": stream_msg_id, "token": token_buffer},
                    },
                )
                token_buffer = ""
                last_flush = _time.monotonic()

            async def _stream_token(token: str):
                nonlocal stream_started, token_buffer, last_flush
                if not stream_started:
                    stream_started = True
                    await manager.send_to(
                        session_id,
                        {
                            "type": "ai_stream_start",
                            "payload": {"id": stream_msg_id, "speaker_name": speaker},
                        },
                    )
                token_buffer += token
                now = _time.monotonic()
                if now - last_flush >= FLUSH_INTERVAL or "\n" in token:
                    await _flush_buffer()

            # session.focus_sections overrides iteration-type template when set.
            # - non-empty list: use as override
            # - empty list: explicit reset → None (full scope, overriding iteration template)
            # - None: leave sections_for_type as-is
            if session_obj.focus_sections is not None:
                sections_for_type = session_obj.focus_sections or None

            # Coverage-aware launcher hint: when the user picked specific
            # bullets to deep-dive into, pass them so the facilitator scopes
            # questions to that content. Empty / missing focus_target falls
            # back to the existing section-level behaviour.
            bullet_focus_list: list[str] | None = None
            if isinstance(session_obj.focus_target, dict):
                ids = session_obj.focus_target.get("bullet_ids")
                if isinstance(ids, list) and ids:
                    bullet_focus_list = [str(b) for b in ids if b]

            result = await process_message(
                messages_history,
                blueprint.content,
                initial_idea,
                assertiveness=assertiveness,
                persona=persona,
                org_id=org_id,
                db=db,
                team_id=team_id,
                iteration_context=iter_context,
                sections_override=sections_for_type,
                stream_callback=_stream_token,
                language=resolved_vc.get("language", ai_config.get("language", "en")),
                session_id=session_id,
                bullet_focus=bullet_focus_list,
                # Emotion follows voice agent's behavior (worker.py): read directly
                # from ai_config so chat and voice pick up the same TONE block when
                # the user changes emotion in the AI settings drawer. The voice
                # config service returns a "neutral" default, which would silently
                # override an explicit ai_config.emotion if consulted first.
                emotion=ai_config.get("emotion"),
                pace=pace,
                runtime_state=runtime_state,
                technical_comfort=technical_comfort,
            )
            await _flush_buffer()
            response_preview = (result.get("response") or "")[:120]
            logger.info(
                "Facilitator: process_message returned — response preview: %r, blueprint_updates: %s",
                response_preview,
                len(result.get("blueprint_updates", [])),
            )

            # Notify if AI chose not to respond
            if not result["response"]:
                await manager.send_to(session_id, {"type": "ai_thinking", "thinking": False})
                await manager.send_to(
                    session_id,
                    {
                        "type": "chat_message",
                        "payload": {
                            "id": "system-" + session_id[:8],
                            "content": "AI is listening — waiting for more context before contributing.",
                            "message_type": "system",
                            "user_id": None,
                            "created_at": "",
                        },
                    },
                )
                return

            # Save and broadcast AI response.
            #
            # The LLM is instructed to split each reply into 1-2 segments tagged
            # [ack] / [next]. parse_segments in facilitator.py turns that into a
            # list; we save one ChatMessage and emit one chat_message WS event
            # per segment so each renders as its own scannable bubble.
            #
            # Legacy fallback: if the LLM didn't tag segments, parse_segments
            # returns a single 'next' segment containing the full response, so
            # this loop still produces exactly one bubble — same as before.
            # Track the last AI message id from this turn so we can stamp it
            # onto any blueprint_update events that follow. The frontend uses
            # this to render an "AI just updated X" cue under the right bubble.
            last_ai_msg_id: str | None = None

            if result["response"]:
                meta = result.get("meta")
                segments = result.get("segments") or [{"type": "next", "content": result["response"]}]

                for idx, seg in enumerate(segments):
                    is_last = idx == len(segments) - 1
                    # Stash the segment type so the frontend can style the
                    # bubble (ack → small/dim, next → prominent). Only the
                    # LAST bubble also carries _ai_meta so the reasoning peek
                    # doesn't render on every segment.
                    seg_attachments: list[dict] = [{"_segment_type": seg["type"]}]
                    if is_last and meta:
                        seg_attachments.append({"_ai_meta": meta})
                    attachments = seg_attachments
                    ai_msg = ChatMessage(
                        session_id=session_id,
                        user_id=None,
                        content=seg["content"],
                        message_type="ai",
                        speaker_name=speaker,
                        attachments=attachments,
                    )
                    db.add(ai_msg)
                    await db.commit()
                    await db.refresh(ai_msg)
                    last_ai_msg_id = ai_msg.id

                    await manager.send_to(
                        session_id,
                        {
                            "type": "chat_message",
                            "payload": {
                                "id": ai_msg.id,
                                "content": seg["content"],
                                "message_type": "ai",
                                "user_id": None,
                                "speaker_name": speaker,
                                "created_at": ai_msg.created_at.isoformat(),
                                "attachments": attachments,
                            },
                        },
                    )
                    # Stagger so the bubbles visibly pop in sequence instead of
                    # all landing in one frame. Skip after the final bubble.
                    if not is_last:
                        await asyncio.sleep(0.35)

                # chat_message events don't auto-flip the "AI thinking…"
                # indicator the way ai_stream_end did, so flip it explicitly.
                await manager.send_to(session_id, {"type": "ai_thinking", "thinking": False})

            # Persist the updated pace counters back to the session so the
            # NEXT facilitator turn sees the new question count. Without this,
            # the budget would reset to 0 every turn and the persona-switch
            # chip would never fire.
            new_runtime_state = result.get("runtime_state")
            if new_runtime_state is not None and new_runtime_state != session_obj.agent_runtime_state:
                session_obj.agent_runtime_state = new_runtime_state
                await db.commit()

            # Capture the snapshot id BEFORE this turn's updates so we can
            # stamp each blueprint_update event with an "undo target". The
            # frontend renders an "Undo" button under the AI bubble that
            # POSTs /api/projects/{id}/blueprint/restore/{this_id} to revert
            # the whole turn in one click.
            pre_turn_snapshot_id: str | None = None
            if result["blueprint_updates"]:
                pre_turn_blueprint = await get_or_create_blueprint(
                    session_obj.project_id,
                    db,
                    iteration_id=session_obj.iteration_id,
                )
                pre_turn_snapshot_id = pre_turn_blueprint.id

            # Apply blueprint updates (BEFORE TTS — TTS can fail without blocking this).
            # mode="merge" routes through merge_bullets() so chat updates union with
            # existing bullets instead of overwriting — matches the voice agent's
            # append-only contract and protects against LLM under-generation.
            for bp_update in result["blueprint_updates"]:
                source = bp_update.get("source", "user_stated")
                snapshot = await update_section(
                    session_obj.project_id,
                    bp_update["section"],
                    bp_update["content"],
                    "ai_facilitator",
                    db,
                    session_id=session_id,
                    source=source,
                    mode="merge",
                )
                # Broadcast the MERGED section (from the snapshot), not the LLM's
                # raw emit. With mode="merge" the emit is only the new bullets;
                # sending it would briefly overwrite the panel with the delta
                # until the next poll. Same pattern voice/accept uses
                # (blueprints.py: stored_content = snapshot.content.get(...)).
                merged_content = snapshot.content.get(bp_update["section"], "")
                await manager.send_to(
                    session_id,
                    {
                        "type": "blueprint_update",
                        "payload": {
                            "section": bp_update["section"],
                            "content": merged_content,
                            "version": snapshot.version_number,
                            "source": source,
                            # Stamp the originating AI message so the frontend
                            # can render an "AI updated X" cue under the
                            # specific bubble that drove the change.
                            "triggered_by_message_id": last_ai_msg_id,
                            # Snapshot id from BEFORE this turn — restoring to
                            # it reverts the whole turn's section edits.
                            "undo_target_snapshot_id": pre_turn_snapshot_id,
                        },
                    },
                )

            # Surface a structured persona-switch suggestion if the
            # facilitator's coverage scoring concluded the user would benefit
            # from changing personas. Same payload shape voice writes via
            # POST /api/internal/suggest-persona, so the frontend's existing
            # PersonaHintToast listener handles both surfaces uniformly.
            persona_suggestion = result.get("persona_suggestion")
            if persona_suggestion:
                await manager.broadcast(
                    session_id,
                    {
                        "type": "suggest_persona",
                        "payload": {
                            "persona": persona_suggestion["persona"],
                            "label": persona_suggestion["label"],
                            "reason": persona_suggestion["reason"],
                        },
                    },
                )
                logger.info(
                    "facilitator.persona_suggested",
                    extra={
                        "session_id": session_id,
                        "from": persona,
                        "to": persona_suggestion["persona"],
                    },
                )

            # Output-artifact suggestion chips — once a blueprint has enough
            # signal for code_scaffold / design_bundle / terraform / decision_doc,
            # surface a small chip the user can click to generate. Replaces the
            # old "you could generate a scaffold now" prose nag.
            output_suggestions = result.get("output_suggestions") or []
            for suggestion in output_suggestions:
                await manager.broadcast(
                    session_id,
                    {
                        "type": "suggest_output",
                        "payload": {
                            "output_type": suggestion["output_type"],
                            "label": suggestion["label"],
                            "reason": suggestion["reason"],
                            "maturity": suggestion["maturity"],
                        },
                    },
                )

            # Apply session_focus update if the facilitator emitted one.
            # None means "no change"; [] means "reset to full scope".
            new_focus = result.get("session_focus")
            if new_focus is not None:
                session_obj.focus_sections = new_focus
                await db.commit()
                await manager.send_to(
                    session_id,
                    {
                        "type": "session_focus_update",
                        "payload": {"focus_sections": new_focus},
                    },
                )

            # Trigger context summariser if using session context
            if settings_use_ctx:
                try:
                    from ..services.context_summariser import maybe_summarise

                    _s = _gs()
                    await maybe_summarise(session_id, db, trigger_threshold=_s.context_summary_trigger)
                except Exception:
                    logger.warning("Summary trigger failed for session %s", session_id, exc_info=True)

            # Notify clients AI is done thinking
            await manager.send_to(session_id, {"type": "ai_thinking", "thinking": False})

            # Extract blueprint info from conversation — gated to every 4th user message.
            # Runs as a separate background task with its own DB session so the
            # facilitator response cycle returns immediately, matching the voice
            # worker's async-extraction pattern.
            if not result["blueprint_updates"]:
                user_msg_count = sum(1 for m in messages_history if m.get("message_type") != "ai")
                if user_msg_count > 0 and user_msg_count % 4 == 0:
                    asyncio.create_task(
                        _extract_blueprint_background(
                            session_id=session_id,
                            project_id=session_obj.project_id,
                            messages_history=messages_history,
                            blueprint_content=blueprint.content,
                            org_id=org_id,
                        )
                    )

            # Extract diagram updates from AI response — dispatch by intent.
            #
            #   tokens: design-token-only change. Tokens have already been
            #           broadcast from the message handler before we got here;
            #           the pipeline would just regenerate identical screens
            #           with new vars, which the iframe restyles for free.
            #           Skip the pipeline.
            #   edit:   surgical edit to one screen — go through the
            #           single-screen edit helper. No full pipeline.
            #   add:    additive screens — run the pipeline as kind="additive"
            #           so it's NOT cancellable by the next direction shift.
            #   cancel: the previous main pipeline was already cancelled in
            #           the message handler; this turn starts a fresh main run.
            #   none:   default — main pipeline.
            logger.debug("About to extract diagram. response exists: %s", bool(result.get("response")))
            intent_route = getattr(intent, "route", "none") if intent else "none"
            if intent_route in ("tokens", "edit"):
                logger.info(
                    "[FACIL] skipping pipeline run=intent route=%s",
                    intent_route,
                )
                # Edit route — apply the surgical edit inline using whatever
                # the classifier handed us.
                if intent_route == "edit":
                    target_id = getattr(intent, "target_screen_id", None)
                    instruction = getattr(intent, "instruction", "") or ""
                    if target_id and instruction:
                        try:
                            diag_result = await db.execute(select(Session).where(Session.id == session_id))
                            diag_session = diag_result.scalar_one_or_none()
                            if diag_session:
                                proj_r = await db.execute(
                                    select(Project.org_id).where(Project.id == diag_session.project_id)
                                )
                                edit_oid = proj_r.scalar_one_or_none()
                                await _apply_edit_intent_inline(
                                    session_id,
                                    diag_session,
                                    target_id,
                                    instruction,
                                    db,
                                    edit_oid,
                                )
                        except Exception as edit_err:
                            logger.error(
                                "Edit-route apply failed: %s",
                                edit_err,
                                exc_info=True,
                            )
            elif result["response"]:
                try:
                    # Re-fetch session to avoid stale/expired state
                    diag_result = await db.execute(select(Session).where(Session.id == session_id))
                    diag_session = diag_result.scalar_one_or_none()
                    if diag_session and intent_route == "none":
                        # Conversational acknowledgement / clarifying question —
                        # the intent classifier explicitly defines `none` as
                        # "no canvas mutation" (see intent_classifier.py:18).
                        # Each diagram regen is an Opus 4.7 call worth ~$0.14;
                        # firing it on every "ok"/"yes"/"what's X?" reply is
                        # what burnt $3+/session before this gate landed.
                        # `flow` / `arch` routes are explicit diagram requests
                        # and bypass this gate intentionally.
                        logger.info(
                            "[FACIL] skipping diagram regen — intent_route=none for session %s",
                            session_id,
                        )
                        diag_session = None
                    if diag_session:
                        kind = "additive" if intent_route == "add" else "main"
                        # Don't spawn a SECOND main pipeline alongside an
                        # already-running one — two main runs writing
                        # diagram_update events into the same canvas
                        # produces interleaved skeletons / re-layouts and
                        # is exactly the layout chaos we keep hitting.
                        # (Note: the `intent_route == "none"` case is now
                        # short-circuited above, so this guard only handles
                        # legitimate-intent races.)
                        if kind == "main":
                            from ..services import pipeline_runs as _pr

                            if _pr.get_main_run(session_id) is not None:
                                logger.info(
                                    "[FACIL] skipping pipeline — main run already active for session %s",
                                    session_id,
                                )
                                diag_session = None
                        if diag_session:
                            await _extract_diagram_inline(
                                session_id,
                                diag_session,
                                messages_history,
                                result["response"],
                                db,
                                kind=kind,
                            )
                except Exception as diag_err:
                    logger.error("Diagram extraction error: %s", diag_err, exc_info=True)

            # TTS (non-critical — wrapped in try/except so it never blocks blueprint)
            if result["response"]:
                try:
                    tts_ai_config = session_obj.ai_config if session_obj.ai_config else {}
                    if not tts_ai_config.get("muted", False):
                        audio_bytes = await synthesize_speech(
                            result["response"],
                            voice_id=resolved_vc.get("voice_id") or tts_ai_config.get("voice_id"),
                        )
                        if audio_bytes:
                            settings = get_settings()
                            if settings.redis_url:
                                redis_client = aioredis.from_url(settings.redis_url)
                                try:
                                    await redis_client.publish(
                                        f"tts:session-{session_id}",
                                        json.dumps(
                                            {
                                                "audio_base64": base64.b64encode(audio_bytes).decode(),
                                                "text": result["response"],
                                                "format": "pcm_24000",
                                            }
                                        ),
                                    )
                                finally:
                                    await redis_client.aclose()

                                await manager.send_to(
                                    session_id,
                                    {
                                        "type": "ai_speaking",
                                        "payload": {"text": result["response"]},
                                    },
                                )
                except Exception as tts_err:
                    logger.warning("TTS failed (non-fatal): %s", tts_err)

            logger.info(
                "facilitator.turn_done",
                extra={
                    "session_id": session_id,
                    "latency_ms": int((_time_mod.monotonic() - _turn_started) * 1000),
                    "had_response": bool(result.get("response")),
                    "blueprint_updates": len(result.get("blueprint_updates", [])),
                    "intent_route": intent_route,
                },
            )

        except Exception as e:
            logger.error(
                "facilitator.turn_failed",
                extra={
                    "session_id": session_id,
                    "latency_ms": int((_time_mod.monotonic() - _turn_started) * 1000),
                    "intent_route": intent_route,
                    "err_type": type(e).__name__,
                },
                exc_info=True,
            )
            await manager.send_to(session_id, {"type": "ai_thinking", "thinking": False})
            # Surface the failure so the user isn't left staring at silence.
            await manager.send_to(
                session_id,
                {
                    "type": "chat_message",
                    "payload": {
                        "id": f"error-{session_id[:8]}-{int(time.time() * 1000)}",
                        "content": f"⚠️ Facilitator failed: {type(e).__name__}: {e}",
                        "message_type": "system",
                        "user_id": None,
                        "speaker_name": "System",
                        "created_at": "",
                    },
                },
            )


import uuid as _uuid_mod

# Legacy — kept so existing references keep importing, but the new pipeline
# scheduling goes through `pipeline_runs` (cancellable tasks per session).
_diagram_locks: dict[str, asyncio.Lock] = {}


def _pick_target_device(diagram_state: dict | None, latest_user_msg: str) -> str:
    """Decide which device subsequent wireframe screens should target.

    Order:
      1. Explicit ask in the latest message ("desktop", "phone", "tablet").
         An explicit ask ALWAYS wins — otherwise asking "now show me desktop"
         after building mobile screens stays stuck on mobile.
      2. Pin to majority of existing screens (keeps continuity within a flow).
      3. Default to desktop.
    """
    msg = (latest_user_msg or "").lower()
    desktop_kw = ("desktop", "web app", "web view", "laptop", "browser", "macbook", "windows pc")
    tablet_kw = ("ipad", "tablet")
    mobile_kw = ("iphone", "android phone", "phone", "mobile")
    if any(w in msg for w in desktop_kw):
        return "desktop"
    if any(w in msg for w in tablet_kw):
        return "tablet"
    if any(w in msg for w in mobile_kw):
        return "mobile"
    screens = ((diagram_state or {}).get("wireframe") or {}).get("screens") or []
    if screens:
        # Only count full screens (not modal/drawer/popover overlays) so a
        # mobile session doesn't get pinned by overlays that happen to be
        # mobile-sized.
        counts: dict[str, int] = {}
        for s in screens:
            if not isinstance(s, dict):
                continue
            if (s.get("kind") or "screen") != "screen":
                continue
            d = s.get("device") or "desktop"
            counts[d] = counts.get(d, 0) + 1
        if counts:
            return max(counts, key=counts.get)
    return "desktop"


_SHELL_SLOT_RE = re.compile(
    r"(<main\b[^>]*data-slot\s*=\s*[\"']content[\"'][^>]*>)(.*?)(</main>)",
    re.DOTALL | re.IGNORECASE,
)


def _swap_shell_in_screen_html(screen_html: str, new_shell_html: str) -> str | None:
    """Replace the embedded shell wrapper in `screen_html` with `new_shell_html`,
    preserving the screen's content (everything inside <main data-slot='content'>...</main>).

    Returns the rewritten html, or None when the swap can't be performed (no
    shell slot in the source, or no slot in the new shell). Caller leaves the
    screen alone in that case rather than corrupting it.
    """
    if not isinstance(screen_html, str) or not isinstance(new_shell_html, str):
        return None
    m_screen = _SHELL_SLOT_RE.search(screen_html)
    if not m_screen:
        return None
    content = m_screen.group(2)

    def _inject(m: re.Match[str]) -> str:
        return f"{m.group(1)}{content}{m.group(3)}"

    new_html, n = _SHELL_SLOT_RE.subn(_inject, new_shell_html, count=1)
    if n == 0:
        return None
    return new_html


def _format_wireframe_summary(diagram_state: dict | None) -> str | None:
    """Build a wireframe summary for the facilitator prompt.

    Why: without this the facilitator answered "improve the screens" with
    "I don't see any wireframes". Now we also surface kind (screen / modal /
    drawer / popover) and trigger_from so the facilitator can reference
    overlays specifically ("the Task Detail modal opens from Dashboard")
    instead of treating every surface as a generic screen.
    """
    screens = ((diagram_state or {}).get("wireframe") or {}).get("screens") or []
    if not screens:
        return None
    n = len(screens)
    full_screens: list[str] = []
    overlays: list[str] = []
    devices: dict[str, int] = {}
    for s in screens:
        if not isinstance(s, dict):
            continue
        name = s.get("name") or s.get("id") or "?"
        kind = (s.get("kind") or "screen").lower()
        device = s.get("device") or "desktop"
        devices[device] = devices.get(device, 0) + 1
        if kind == "screen":
            full_screens.append(f"{name} ({device})")
        else:
            trigger = s.get("trigger_from")
            label = f"{name} · {kind} ({device})"
            if trigger:
                label += f" — opens from {trigger}"
            overlays.append(label)
    # Device aggregation — gives the facilitator a one-liner ("2 mobile
    # screens, 1 desktop screen") it can paraphrase without re-counting from
    # the per-screen list.
    device_parts: list[str] = []
    for device, count in sorted(devices.items()):
        device_parts.append(f"{count} {device} screen{'' if count == 1 else 's'}")

    header = f"Existing surfaces: {n} total"
    if device_parts:
        header += f" ({', '.join(device_parts)})"
    parts = [header]
    if full_screens:
        parts.append(f"Screens: {'; '.join(full_screens)}")
    if overlays:
        parts.append(f"Overlays: {'; '.join(overlays)}")
    return "\n".join(parts)


async def _apply_edit_intent_inline(
    session_id: str,
    session_obj: Session,
    target_screen_id: str,
    instruction: str,
    db: AsyncSession,
    oid: str | None,
    metrics: object | None = None,
) -> None:
    """Apply a surgical edit to one existing wirescreen, mirroring the
    /wireframe/edit-screen endpoint logic but running inline as part of
    the diagram pipeline. Persists + broadcasts diagram_update on success.
    """
    state = dict(session_obj.diagram_state or {})
    wireframe = state.get("wireframe") or {}
    screens = wireframe.get("screens") or []
    target = next((s for s in screens if isinstance(s, dict) and s.get("id") == target_screen_id), None)
    if not target or not target.get("html"):
        raise ValueError(f"target screen {target_screen_id} not found or has no html")

    target_device = target.get("device") or "desktop"
    target_kind = (target.get("kind") or "screen").lower()
    if target_kind not in ("screen", "modal", "drawer", "popover"):
        target_kind = "screen"
    screen_name = target.get("name") or target_screen_id
    existing_html = target["html"]

    design_data = (state.get("design") or {}) if isinstance(state, dict) else {}
    ds = design_data.get("design_system") or {}
    components = ds.get("components") or {}
    component_hint = ""
    if isinstance(components, dict) and components:
        names = sorted(list(components.keys()))[:24]
        component_hint = "\nCOMPONENT MANIFEST (reuse these — match siblings):\n" + "\n".join(f"  - {n}" for n in names)

    from ..services.ai_provider import get_ai_client, get_ai_client_for_role  # noqa: F401

    ai = await get_ai_client_for_role(oid, db, "edit")

    system_prompt = (
        "You apply a SURGICAL edit to one wireframe surface. Read the existing "
        "HTML carefully, then return updated HTML that PRESERVES every part of "
        "the layout, every component, every section that wasn't explicitly "
        "mentioned in the edit instruction. Do NOT redesign. Do NOT reorganise. "
        "Modify only what the instruction asks for."
    )
    user_prompt = f"""Apply this edit to ONE wireframe surface:

EDIT INSTRUCTION:
{instruction}

SURFACE: "{screen_name}" (id={target_screen_id}, kind={target_kind}, device={target_device})

EXISTING HTML (preserve everything that isn't part of the edit):
```
{existing_html}
```
{component_hint}

Return ONLY this JSON, no narration, no code fence:
{{"id":"{target_screen_id}","name":"{screen_name}","kind":"{target_kind}","device":"{target_device}","html":"<modified html — same structure, edit applied>"}}

Rules:
- "id" MUST be exactly "{target_screen_id}".
- "kind" MUST be exactly "{target_kind}".
- "device" MUST be exactly "{target_device}".
- Apply ONLY the requested edit. Every other part of the existing HTML stays as-is — same sections, same components, same layout, same content.
- Use ONLY the components in the manifest above (data-component='...'). No new component names.
- Every colour MUST be a CSS variable (var(--color-bg), var(--color-surface), var(--color-text), var(--color-text-muted), var(--color-accent), var(--color-on-accent), var(--color-border)). NO hex / rgb / named.
- HTML attribute values use SINGLE quotes (style='...').
- Return ONLY the JSON. No prose, no explanations, no code fences.
"""

    await manager.send_to(
        session_id,
        {"type": "screen_thinking", "payload": {"screen_id": target_screen_id, "reset": True}},
    )

    # Edits are focused patches, not full redesigns — extended thinking
    # is wasted budget here. Run a tighter, faster pass.
    text_buf: list[str] = []
    async for chunk in ai.chat_stream(
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
        max_tokens=12288,
        enable_thinking=False,
    ):
        if isinstance(chunk, tuple) and chunk[0] == "thinking":
            continue
        if isinstance(chunk, tuple) and chunk[0] == "usage" and metrics is not None:
            usage = chunk[1]
            metrics.record_ai_call(
                model=usage.get("model", "unknown"),
                purpose="screen_edit",
                input_tokens=int(usage.get("input_tokens", 0)),
                output_tokens=int(usage.get("output_tokens", 0)),
            )
            continue
        if isinstance(chunk, str):
            text_buf.append(chunk)

    raw = ("".join(text_buf)).strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

    new_screen: dict
    try:
        new_screen = json.loads(raw)
    except Exception:
        # Lenient salvage.
        html_open = raw.find('"html"')
        if html_open == -1:
            raise ValueError("edit returned malformed JSON, no html field")
        colon = raw.find(":", html_open)
        first_quote = raw.find('"', colon + 1)
        last_quote = raw.rfind('"')
        if first_quote == -1 or last_quote <= first_quote:
            raise ValueError("edit returned malformed JSON, html unparseable")
        html_value = raw[first_quote + 1 : last_quote]
        new_screen = {
            "id": target_screen_id,
            "name": screen_name,
            "kind": target_kind,
            "device": target_device,
            "html": html_value,
        }

    if not isinstance(new_screen, dict) or not new_screen.get("html"):
        raise ValueError("edit returned no html")

    new_screen["id"] = target_screen_id
    new_screen["device"] = target_device
    new_screen["kind"] = target_kind
    new_screen["name"] = new_screen.get("name") or screen_name
    if target.get("trigger_from"):
        new_screen.setdefault("trigger_from", target["trigger_from"])

    try:
        from ..services.wireframe_sanitizer import sanitize_wireframe_html

        new_screen["html"] = sanitize_wireframe_html(new_screen["html"], ds)
    except Exception as san_err:
        logger.warning("[EDIT] Sanitiser failed for %s: %s", target_screen_id, san_err)

    updated_screens = [new_screen if (isinstance(s, dict) and s.get("id") == target_screen_id) else s for s in screens]
    wireframe["screens"] = updated_screens
    state["wireframe"] = wireframe
    session_obj.diagram_state = state
    await db.commit()

    payload = {**wireframe, "fidelity": "high"}
    await manager.send_to(
        session_id,
        {"type": "diagram_update", "payload": payload},
    )
    logger.info(
        "[EDIT-INLINE] Screen %s edited (instruction='%s', html_len=%d)",
        target_screen_id,
        instruction[:60],
        len(new_screen["html"]),
    )


async def _extract_diagram_inline(
    session_id: str,
    session_obj: Session,
    messages_history: list[dict],
    ai_response: str,
    db: AsyncSession,
    *,
    kind: str = "main",
    screen_plan_override: list[dict] | None = None,
) -> None:
    """Run the wireframe pipeline as a tracked, cancellable sub-task.

    `kind`:
      - "main"     — primary pipeline. Cancellable by a later message whose
                     intent classifies as `cancel` (scope/direction shift).
      - "additive" — runs alongside a main pipeline; never auto-cancelled.
      - "edit"     — single-screen edit; never auto-cancelled.

    On cancellation, the sub-task's CancelledError is caught here and a
    `pipeline_cancelled` event is broadcast so the frontend can drop the
    leftover skeletons. The cancellation does NOT propagate to the calling
    facilitator task — its chat reply has already been sent by the time the
    pipeline starts, so we want a clean wind-down.
    """
    from ..services import pipeline_runs

    run_id = _uuid_mod.uuid4().hex[:12]

    async def _runner() -> None:
        try:
            await _extract_diagram_inline_inner(
                session_id,
                session_obj,
                messages_history,
                ai_response,
                db,
                run_id=run_id,
                kind=kind,
                screen_plan_override=screen_plan_override,
            )
        except asyncio.CancelledError:
            logger.info(
                "[DIAGRAM] cancelled run=%s session=%s kind=%s",
                run_id,
                session_id,
                kind,
            )
            # Best-effort broadcast — never raise here, the cancellation has
            # to keep propagating so the runner unwinds.
            try:
                await manager.send_to(
                    session_id,
                    {
                        "type": "pipeline_cancelled",
                        "payload": {"run_id": run_id, "kind": kind, "reason": "cancelled"},
                    },
                )
            except Exception:
                logger.warning("[DIAGRAM] cancellation broadcast failed", exc_info=True)
            raise

    task = asyncio.create_task(_runner())
    pipeline_runs.register_run(session_id, task, run_id, kind)
    try:
        await task
    except asyncio.CancelledError:
        # Sub-task was cancelled by a later classifier turn. The outer
        # facilitator task is not itself being cancelled — swallow so the
        # facilitator finishes normally.
        logger.info("[DIAGRAM] await saw cancel for run=%s, swallowing", run_id)
        return
    finally:
        pipeline_runs.unregister_run(session_id, run_id)


async def _extract_diagram_inline_inner(
    session_id: str,
    session_obj: Session,
    messages_history: list[dict],
    ai_response: str,
    db: AsyncSession,
    *,
    run_id: str | None = None,
    kind: str = "main",
    screen_plan_override: list[dict] | None = None,
) -> None:
    logger.info(
        "[DIAGRAM] ── ENTRY session=%s messages=%d ai_response_len=%d",
        session_id,
        len(messages_history),
        len(ai_response or ""),
    )
    from ..services.ai_provider import get_ai_client, get_ai_client_for_role  # noqa: F401
    from ..services.pipeline_metrics import PipelineMetrics

    metrics = PipelineMetrics(session_id=session_id)
    if run_id:
        metrics.run_id = run_id
    metrics.set("ai_response_len", len(ai_response or ""))

    # Live progress broadcaster — fires after every AI call so the Debug
    # drawer reflects token/cost/phase progress in real time, not just at
    # the final metrics.emit(). The callback hops back onto the running
    # event loop because record_ai_call may be invoked from a sync context.
    try:
        _running_loop = asyncio.get_running_loop()
    except RuntimeError:
        _running_loop = None

    def _broadcast_progress(snapshot: dict) -> None:
        if _running_loop is None:
            return
        try:
            _running_loop.create_task(
                manager.send_to(
                    session_id,
                    {"type": "pipeline_progress", "payload": snapshot},
                )
            )
        except Exception:  # noqa: BLE001
            # Progress is best-effort — never break the pipeline.
            pass

    metrics.on_call_recorded = _broadcast_progress

    # diagram_state stores either a single diagram (legacy) or a dict keyed by type
    all_diagrams = session_obj.diagram_state or {}
    # Legacy migration: if it has a "type" key at root, it's a single diagram
    if "type" in all_diagrams:
        legacy_type = all_diagrams["type"]
        all_diagrams = {legacy_type: all_diagrams}
    # current_diagram is set after _likely_type is determined (below)
    recent = messages_history[-10:]
    conv = "\n".join(f"[{m.get('message_type', 'user')}]: {m['content']}" for m in recent)

    # Get org_id for provider routing
    proj_r = await db.execute(select(Project.org_id).where(Project.id == session_obj.project_id))
    oid = proj_r.scalar_one_or_none()

    # Load diagram harness for the AI
    import pathlib

    # Harness docs live inside the backend package — always available
    harness_dir = pathlib.Path(__file__).resolve().parent.parent / "diagram_harness"
    harness_text = ""
    try:
        harness_text = (harness_dir / "HARNESS.md").read_text()[:800]
        harness_text += "\n\n" + (harness_dir / "00-layout-rules.md").read_text()[:600]
        # Detect which type file to include based on conversation
        conv_lower = (conv + " " + ai_response).lower()
        type_files = []
        if any(w in conv_lower for w in ["aws", "gcp", "azure", "deploy", "infra", "vpc", "subnet", "cloud"]):
            type_files.append("cloud.md")
        if any(w in conv_lower for w in ["table", "column", "schema", "database", "model", "foreign key"]):
            type_files.append("data.md")
        if any(
            w in conv_lower
            for w in [
                "screen",
                "wireframe",
                "ui",
                "mockup",
                "page",
                "navigation",
                "mobile",
                "tablet",
                "desktop",
                "button",
                "card",
                "layout",
            ]
        ):
            type_files.append("wireframe-ui-patterns.md")
        if any(w in conv_lower for w in ["flow", "process", "pipeline", "ci/cd", "deploy"]):
            type_files.append("process.md")
        if any(w in conv_lower for w in ["service", "api", "microservice", "gateway", "backend", "frontend"]):
            type_files.append("architecture.md")
        if any(w in conv_lower for w in ["auth", "login", "oauth", "sso", "security"]):
            type_files.append("security.md")
        if not type_files:
            type_files = ["architecture.md"]

        # Detect likely diagram type from the user's LATEST message (not full conversation)
        latest_user_msg = next((m["content"].lower() for m in reversed(recent) if m.get("message_type") != "ai"), "")
        # Wireframe signals — explicit keywords OR auto-trigger when ui_ux section
        # has substantive content and no wireframe has been produced yet.
        # Use a regex for "mockup"-ish words so typos ("mockuip", "mockups",
        # "mock-ups") still register. Same for "wireframe(s)".
        import re as _re_wf_kw

        _explicit_wireframe_rx = _re_wf_kw.compile(
            r"\b(wireframes?|mock[ -]?u(?:i?p)s?|ui ?mockup|spin ?up ?mock|draw the screens?|design the screens?)\b"
        )
        explicit_wireframe = bool(_explicit_wireframe_rx.search(latest_user_msg))
        # Auto-trigger conditions:
        # 1. ui_ux blueprint content ≥ 80 chars (and either no wireframe yet OR the
        #    latest user message mentions UI/screens — so follow-up turns can ADD
        #    more screens which the downstream store-site merges by id), OR
        # 2. session is UI-scoped (focus_sections includes "ui_ux") AND the message
        #    has UI signals OR no wireframe yet.
        auto_wireframe = False
        try:
            from ..services.blueprint_service import get_or_create_blueprint

            bp = await get_or_create_blueprint(session_obj.project_id, db, iteration_id=session_obj.iteration_id)
            ui_ux_content = (bp.content or {}).get("ui_ux", "") or ""
            has_substantive_ui = len(ui_ux_content.strip()) >= 80
            has_existing_wireframe = "wireframe" in all_diagrams and bool(
                all_diagrams.get("wireframe", {}).get("screens")
            )
            is_ui_scoped = bool(session_obj.focus_sections and "ui_ux" in session_obj.focus_sections)
            # UI signal in the latest user message — surface words AND device
            # words (because "make a desktop version" should fire wireframe).
            ui_signal_in_msg = any(
                w in latest_user_msg
                for w in [
                    "screen",
                    "page",
                    "view",
                    "layout",
                    "dashboard",
                    "form",
                    "modal",
                    "drawer",
                    "menu",
                    "nav",
                    "desktop",
                    "mobile",
                    "phone",
                    "tablet",
                ]
            )
            if not has_existing_wireframe:
                auto_wireframe = has_substantive_ui or is_ui_scoped
            else:
                # Wireframe already exists — only regenerate if the latest turn is
                # about UI, and only in a UI-scoped or substantive context.
                auto_wireframe = ui_signal_in_msg and (is_ui_scoped or has_substantive_ui)
        except Exception as bp_err:
            logger.warning("[DIAGRAM] Could not read blueprint for auto-wireframe gate: %s", bp_err)
        logger.info(
            "[DIAGRAM] latest_user_msg: %s, explicit_wireframe: %s, auto_wireframe: %s",
            latest_user_msg[:100],
            explicit_wireframe,
            auto_wireframe,
        )
        # Use word-boundary matching to keep substring noise out (e.g. "rendered"
        # used to fire "erd"). Explicit flow / architecture wins over the
        # auto-wireframe trigger so users can switch to those views; explicit
        # ERD does NOT outrank wireframe in a UI session — the user has to
        # leave the UI scope to discuss data models.
        import re as _re_likely

        def _has_word(msg: str, words: list[str]) -> bool:
            return bool(_re_likely.search(r"\b(" + "|".join(_re_likely.escape(w) for w in words) + r")\b", msg))

        explicit_flow = _has_word(latest_user_msg, ["flow", "user flow", "user journey", "flow diagram", "journey"])
        explicit_arch = _has_word(latest_user_msg, ["architecture", "system design", "infra"])
        explicit_erd = _has_word(latest_user_msg, ["erd", "database", "schema", "data model"])

        _likely_type = "flow"  # default to flow for auto-generation
        if explicit_flow:
            _likely_type = "flow"
        elif explicit_arch:
            _likely_type = "architecture"
        elif explicit_wireframe or auto_wireframe:
            _likely_type = "wireframe"
        elif explicit_erd:
            _likely_type = "erd"

        # Skip wireframe generation entirely unless explicit OR auto-triggered
        if _likely_type == "wireframe" and not explicit_wireframe and not auto_wireframe:
            _likely_type = "flow"

        # When the caller passes an explicit screen plan (Phase 3 plan-driven
        # generation), force the wireframe path and bypass classifier
        # heuristics. The plan supplies the screens directly — no preflight
        # LLM call is needed.
        if screen_plan_override:
            _likely_type = "wireframe"
            explicit_wireframe = True

        # Now we know the type — get the current diagram for this type
        current_diagram = all_diagrams.get(_likely_type, {"nodes": [], "edges": [], "title": "", "type": _likely_type})

        # For wireframe sessions, skip the early "type only" diagram_generating
        # broadcast — the flow companion + skeleton broadcast will fire their
        # own diagram_generating events with full payloads. Sending one here
        # makes the frontend create a wireframe zone header reading
        # "GENERATING SCREEN 1 OF 0…" before the flow has even rendered.
        if _likely_type != "wireframe":
            await manager.send_to(
                session_id,
                {
                    "type": "diagram_generating",
                    "payload": {"type": _likely_type},
                },
            )

        for tf in type_files[:2]:
            fp = harness_dir / tf
            if fp.exists():
                max_chars = 3000 if "wireframe" in tf else 800
                harness_text += f"\n\n## {tf}\n" + fp.read_text()[:max_chars]

        # Load design library for UI/wireframe generation.
        # Prefer the SAME recipe-specific bundle that the design system
        # generator picked for this session — that's the whole point of
        # the library (different recipe = different patterns). Falls back
        # to a generic 5-file subset only if no design has been generated.
        design_dir = harness_dir / "design-library"
        wants_design = design_dir.exists() and any(
            w in conv_lower
            for w in [
                "screen",
                "wireframe",
                "ui",
                "mockup",
                "design",
                "mobile",
                "tablet",
                "desktop",
                "dashboard",
                "button",
                "card",
                "layout",
            ]
        )
        if wants_design:
            recipe_files: list[str] = []
            try:
                _design_payload = (all_diagrams.get("design") or {}) if isinstance(all_diagrams, dict) else {}
                recipe_files = list(_design_payload.get("files_loaded") or [])
            except Exception:
                recipe_files = []

            if not recipe_files:
                # The design system is pre-generated at session-page level
                # whenever ui_ux content becomes substantive, so this should
                # already be on session by the time we generate wireframes.
                # If we hit this branch, the design never ran (no ui_ux
                # content yet, or generation failed). Inline-generate it
                # NOW so wireframes still get a recipe-specific bundle
                # rather than a generic fallback.
                try:
                    from ..services import design_library_service as dls

                    bp = await get_or_create_blueprint(
                        session_obj.project_id, db, iteration_id=session_obj.iteration_id
                    )
                    initial_idea = (bp.content or {}).get("initial_idea") or ""
                    inline_brief = f"{initial_idea}\n\nCONVERSATION:\n{conv[-1500:]}".strip()
                    classifier_ai = await get_ai_client_for_role(oid, db, "design_classify")
                    inline_bundle = await dls.build_design_bundle(
                        inline_brief, classifier_ai, forbid_list=[], seed=None
                    )
                    recipe_files = list(inline_bundle.files_loaded)
                    logger.info(
                        "[DIAGRAM] Inline-built design bundle (recipe=%s): %s",
                        inline_bundle.classification.recipe_letter,
                        recipe_files,
                    )
                except Exception as inline_err:
                    logger.error("[DIAGRAM] Inline bundle failed: %s", inline_err, exc_info=True)
                    recipe_files = []

            # Load every file the recipe declared. Each file gets up to
            # 1500 chars; recipes typically pull 5-10 files = ~10-15 KB.
            logger.info("[DIAGRAM] Loading recipe-specific design bundle: %s", recipe_files)
            for rel in recipe_files:
                dfp = design_dir / rel
                if dfp.exists():
                    try:
                        harness_text += f"\n\n## Design: {rel}\n" + dfp.read_text()[:1500]
                    except Exception:
                        pass

        print(f"[DIAGRAM] Loaded harness ({len(harness_text)} chars), type files: {type_files[:2]}", flush=True)
    except Exception as e:
        logger.warning("[DIAGRAM] Could not load harness: %s", e)
        harness_text = ""

    logger.debug("Harness loaded: %d chars, dir exists: %s", len(harness_text), harness_dir.exists())
    # Hero wireframe generation uses the `wireframe` role (DeepSeek V4 by
    # default) to draft cheaply; the draft is then lifted by the
    # critique → enrich refinement loop (see the hero-first phase below /
    # services/wireframe_refine.py) before it sets the design DNA.
    # Sub-screens — every screen after the hero — use the cheaper
    # `wireframe_subscreen` role (Sonnet 4.6, no thinking) because once
    # DNA is locked they're pattern-matching, not creating. See the role
    # definitions in ai_provider.py for the rationale.
    ai = await get_ai_client_for_role(oid, db, "wireframe")
    subscreen_ai = await get_ai_client_for_role(oid, db, "wireframe_subscreen")
    logger.debug("AI client ready, calling chat...")
    system_prompt = (
        f"You generate diagram JSON for a planning tool. Follow these reference docs:\n\n{harness_text}"
        if harness_text
        else "You generate diagram JSON for a planning tool."
    )
    arch_example = (
        '{"type":"architecture","title":"...","zones":['
        '{"id":"region","label":"us-east-1","style":"solid"},'
        '{"id":"vpc","label":"VPC","style":"dashed","parentId":"region"},'
        '{"id":"pub","label":"Public Subnet","style":"dashed","parentId":"vpc"},'
        '{"id":"priv","label":"Private Subnet","style":"dashed","parentId":"vpc"}],'
        '"nodes":[{"id":"s1","label":"ALB","service":"alb","provider":"aws","zoneId":"pub"},'
        '{"id":"s2","label":"ECS","service":"ecs","provider":"aws","zoneId":"priv"}],'
        '"edges":[{"from":"s1","to":"s2","label":"routes"}]}'
    )
    arch_critical = (
        'CRITICAL: Zones MUST nest using "parentId" '
        "(subnets inside VPCs, VPCs inside regions). "
        'Every node MUST have "zoneId". '
        'Zones MUST have "label" not "name".'
    )
    erd_example = (
        '{"type":"erd","title":"...","tables":[{"id":"..","name":"..",'
        '"columns":[{"name":"..","type":"..","isPrimaryKey":true}]}],'
        '"relationships":[{"from":"..","to":"..","type":"one-to-many"}]}'
    )
    flow_example = (
        '{"type":"flow","title":"...","nodes":[{"id":"..","label":"..",'
        '"shape":"process|decision|start|end"}],'
        '"edges":[{"from":"..","to":"..","label":".."}]}'
    )
    wireframe_example = (
        '{"type":"wireframe","title":"...","screens":[{"id":"..","name":"..",'
        '"device":"mobile|tablet|desktop",'
        '"html":"<div style=\'width:100%;min-height:100%\'>...</div>"}]}'
    )

    # Pin device for this generation: reuse whatever existing screens use, else
    # infer from the user's latest message, else default desktop. Stops the
    # facilitator from flipping device between turns.
    latest_user_for_device = next((m["content"] for m in reversed(recent) if m.get("message_type") != "ai"), "")
    target_device = _pick_target_device(all_diagrams, latest_user_for_device)
    existing_screens_state = ((all_diagrams or {}).get("wireframe") or {}).get("screens") or []
    logger.info(
        "[DIAGRAM] target_device=%s existing_screens=%d (%s) likely_type=%s explicit=%s auto=%s",
        target_device,
        len(existing_screens_state),
        ",".join(sorted({(s or {}).get("device", "?") for s in existing_screens_state})) or "-",
        _likely_type,
        explicit_wireframe,
        auto_wireframe,
    )

    # "Rework existing" intent — if the user message implies regenerating
    # the screens that ARE already on canvas (rather than asking for new
    # ones), skip preflight and reuse existing screen names. Same for
    # device — pin to whatever the existing screens use. This stops the
    # bug where "rework them" would spawn 4 new desktop skeletons next to
    # the existing mobile ones instead of replacing them in place.
    latest_user = next((m["content"] for m in reversed(recent) if m.get("message_type") != "ai"), "")

    # ── Edit-intent classifier ──
    # If the user/facilitator is asking to MODIFY a specific existing screen
    # ("add a filter chip bar to the dashboard"), short-circuit the full
    # screen-planning pipeline and route through /wireframe/edit-screen
    # instead — surgical patch of one screen, not a fresh rebuild.
    if existing_screens_state and len(existing_screens_state) > 0:
        try:
            edit_classifier_ai = await get_ai_client_for_role(oid, db, "intent")
            screens_brief = "\n".join(
                f"  - id={s.get('id')!r}, name={s.get('name')!r} ({(s.get('kind') or 'screen')})"
                for s in existing_screens_state
                if isinstance(s, dict) and s.get("id")
            )
            edit_classifier_resp, _ec_in, _ec_out = await edit_classifier_ai.chat_with_full_usage(
                system=(
                    "You classify user/facilitator turns into wireframe operations. "
                    "Return ONLY a single JSON object: "
                    '{"mode": "edit"|"add"|"none", "target_screen_id"?: str, "instruction"?: str}. '
                    "\n\n"
                    'mode="edit" when the turn modifies a SPECIFIC existing screen '
                    "('add a filter chip bar to the dashboard', 'change the table to "
                    "show team column', 'make the invite modal smaller'). target_screen_id "
                    "is the id of the existing screen to patch; instruction is a "
                    "concise one-line description of the change to apply.\n\n"
                    "mode=\"add\" when the turn adds a NEW surface ('I'll need a "
                    "settings screen too', 'show me the role editor').\n\n"
                    'mode="none" when the turn is conversational (clarifying questions, '
                    "discussion, agreement) without committing to build or edit anything.\n\n"
                    'Be conservative with "edit" — only if the turn names or clearly '
                    "implies a single existing screen and a concrete change."
                ),
                messages=[
                    {
                        "role": "user",
                        "content": (
                            f'User said: "{latest_user}"\n\n'
                            f'Facilitator replied:\n"""\n{(ai_response or "").strip()[:1500]}\n"""\n\n'
                            f"Existing screens:\n{screens_brief}\n\n"
                            "Return the JSON classification."
                        ),
                    }
                ],
                max_tokens=300,
            )
            metrics.record_ai_call(
                model=edit_classifier_ai.model,
                purpose="edit_classifier",
                input_tokens=_ec_in,
                output_tokens=_ec_out,
            )
            cleaned = (edit_classifier_resp or "").strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
                if cleaned.endswith("```"):
                    cleaned = cleaned[:-3]
                cleaned = cleaned.strip()
            try:
                cls = json.loads(cleaned)
            except Exception:
                cls = None
            if isinstance(cls, dict) and cls.get("mode") == "edit":
                tid = cls.get("target_screen_id")
                inst = cls.get("instruction")
                if (
                    isinstance(tid, str)
                    and tid
                    and isinstance(inst, str)
                    and inst.strip()
                    and any(isinstance(s, dict) and s.get("id") == tid for s in existing_screens_state)
                ):
                    logger.info(
                        "[DIAGRAM] EDIT intent detected — target=%s instruction=%r",
                        tid,
                        inst[:80],
                    )
                    # Run the edit inline using the same helper logic as
                    # the /wireframe/edit-screen endpoint. Build the prompt,
                    # stream Opus, persist, broadcast — then return.
                    try:
                        await _apply_edit_intent_inline(
                            session_id=session_id,
                            session_obj=session_obj,
                            target_screen_id=tid,
                            instruction=inst.strip(),
                            db=db,
                            oid=oid,
                            metrics=metrics,
                        )
                        logger.info("[DIAGRAM] EDIT applied — pipeline short-circuited")
                        metrics.set("mode", "edit")
                        metrics.set("target_screen_id", tid)
                        metrics.emit(logger)
                        return
                    except Exception as edit_err:
                        logger.warning(
                            "[DIAGRAM] Edit intent failed (%s) — falling back to full pipeline",
                            edit_err,
                        )
        except Exception as cls_err:
            logger.warning("[DIAGRAM] Edit-intent classifier error (continuing to full pipeline): %s", cls_err)

    # Normalize: collapse "re do" / "re-do" / "re  do" → "redo" so the keyword
    # match catches typos and hyphenations. Same for re-design / re design.
    import re as _re_rework

    _rework_norm = _re_rework.sub(r"re[-\s]+(do|design|draw|work|make|fresh|try)", r"re\1", (latest_user or "").lower())
    rework_keywords = (
        "rework",
        "redo",
        "redesign",
        "redraw",
        "remake",
        "retry",
        "improve",
        "rewrite",
        "polish",
        "do over",
        "do them again",
        "do it again",
        "start over",
        "another go",
        "fresh take",
        "refresh these",
        "refresh the",
        "try again",
    )
    rework_intent = len(existing_screens_state) > 0 and any(kw in _rework_norm for kw in rework_keywords)
    if rework_intent:
        # Pin device to majority of existing screens
        # Only pin to existing-screen majority if the user did NOT also
        # explicitly ask for a different device. _pick_target_device above
        # already honours explicit asks; re-pinning here would clobber that.
        _msg_lower = (latest_user or "").lower()
        _explicit_device_ask = any(
            w in _msg_lower
            for w in (
                "desktop",
                "web app",
                "web view",
                "laptop",
                "browser",
                "macbook",
                "windows pc",
                "ipad",
                "tablet",
                "iphone",
                "android phone",
                "phone",
                "mobile",
            )
        )
        if not _explicit_device_ask:
            dev_counts: dict[str, int] = {}
            for s in existing_screens_state:
                d = (s or {}).get("device") or target_device
                dev_counts[d] = dev_counts.get(d, 0) + 1
            if dev_counts:
                target_device = max(dev_counts, key=dev_counts.get)
        logger.info(
            "[DIAGRAM] Rework intent detected — pinning device=%s and reusing %d existing screen names",
            target_device,
            len(existing_screens_state),
        )

    # Preflight: plan which screens to generate for wireframes (explicit request OR auto-trigger).
    # Skipped on rework intent — we reuse the existing screen names.
    screen_plan_hint = ""
    # Read by the skeleton broadcast + per-screen-loop caps below to know
    # whether to use the higher plan-driven cap. Set inside the preflight
    # branch when auto-infer fires; stays False for rework / override paths
    # (which already get the higher cap via screen_plan_override anyway).
    _fresh_plan_inferred = False
    if screen_plan_override:
        # Plan-driven generation (Phase 3). Skip preflight entirely — the
        # caller already filtered the planned screens by tier and passed
        # them in. Format must match preflight output: list of
        # {name, kind, trigger_from?} dicts.
        screen_plan = json.dumps(screen_plan_override)
        screen_plan_hint = (
            f"\n\nPLAN-DRIVEN SCREEN GENERATION: Build wireframes for these planned screens "
            f"(do not add/remove screens): {screen_plan}\n"
        )
        logger.info(
            "[DIAGRAM] Plan-driven generation: %d screens %s",
            len(screen_plan_override),
            screen_plan,
        )
    elif rework_intent and existing_screens_state:
        # Carry forward each existing surface's name AND kind so a modal stays
        # a modal across rework (downstream renders by kind). Also pull
        # tier/id/nav_visible from the persisted plan when available so
        # hero detection still works across rework turns.
        _persisted_plan = (all_diagrams.get("wireframe") or {}).get("plan") if isinstance(all_diagrams, dict) else None
        _plan_by_id: dict[str, dict] = {}
        _plan_by_name: dict[str, dict] = {}
        if isinstance(_persisted_plan, dict):
            for _ps in _persisted_plan.get("screens") or []:
                if not isinstance(_ps, dict):
                    continue
                if _ps.get("id"):
                    _plan_by_id[str(_ps["id"]).lower()] = _ps
                if _ps.get("name"):
                    _plan_by_name[str(_ps["name"]).lower()] = _ps
        existing_plan_entries = []
        for s in existing_screens_state:
            if not isinstance(s, dict):
                continue
            _name = s.get("name") or s.get("id") or "Screen"
            _id = s.get("id")
            _entry = {
                "name": _name,
                "kind": (s.get("kind") or "screen").lower(),
            }
            _match = (_plan_by_id.get(str(_id).lower()) if _id else None) or _plan_by_name.get(str(_name).lower())
            if isinstance(_match, dict):
                if _match.get("id"):
                    _entry["id"] = _match["id"]
                if _match.get("intent"):
                    _entry["intent"] = _match["intent"]
                if _match.get("tier") in ("hero", "secondary", "optional"):
                    _entry["tier"] = _match["tier"]
                if isinstance(_match.get("nav_visible"), bool):
                    _entry["nav_visible"] = _match["nav_visible"]
            existing_plan_entries.append(_entry)
        screen_plan = json.dumps(existing_plan_entries)
        screen_plan_hint = (
            f"\n\nPREFLIGHT SCREEN PLAN: Regenerate wireframes for these EXACT screens "
            f"(replace, do not add new ones): {screen_plan}\n"
        )
        logger.info("[DIAGRAM] Reusing existing screen names for rework: %s", screen_plan)
    elif "wireframe-ui-patterns.md" in type_files and (explicit_wireframe or auto_wireframe):
        try:
            preflight_ai = await get_ai_client_for_role(oid, db, "preflight")
            screen_plan, _pf_in, _pf_out = await preflight_ai.chat_with_full_usage(
                system=(
                    "You translate the facilitator's chat reply into a structured "
                    "build plan. The facilitator (the persona the user is talking "
                    "to) just replied — your job is to figure out what UI surfaces "
                    "the facilitator is about to build, so the canvas matches the "
                    "facilitator's voice instead of contradicting it. "
                    "\n\nReturn ONLY a JSON array of 3-4 entries. "
                    'Each entry: {"name": str, "kind": str, "trigger_from"?: str}. '
                    'kind ∈ {"screen", "modal", "drawer", "popover"}. '
                    'Use "modal" for ephemeral detail/confirm/edit views; "drawer" '
                    'for side-sliding panels; "popover" for small contextual menus. '
                    'Reserve "screen" for full-page surfaces with their own URL/route. '
                    "If the facilitator explicitly described a surface ('I'll spin up "
                    "a settings drawer for you'), MIRROR that wording — same name, "
                    "same kind. Do not override the facilitator. "
                    "If the facilitator was vague, infer the most natural kind for the "
                    "context (e.g. a 'settings menu' in a productivity app reads as "
                    "a drawer; in a marketing site it reads as a screen). "
                    "For overlays, set trigger_from to a SHORT declarative hint of "
                    "WHERE it opens from — 'ParentName · trigger element' "
                    "(e.g. 'Dashboard · task card'). AVOID 'tap', 'click', 'press' — "
                    "these imply interactivity that doesn't exist in static mockups. "
                    "No explanation."
                ),
                messages=[
                    {
                        "role": "user",
                        "content": f"""The user asked: "{latest_user}"

The facilitator (Sonnet, persona-driven) replied:
\"\"\"
{(ai_response or "").strip()[:1500]}
\"\"\"

Based on what the facilitator JUST PROMISED to build, list the surfaces to design.
- Mirror the facilitator's wording — same names, same kinds (screen / modal / drawer / popover).
- If the facilitator named a surface but didn't specify kind, pick the kind that fits the app context.
- For overlays, set trigger_from to the parent screen name + the trigger element.

CONVERSATION CONTEXT:\n{conv[-800:]}\n\nReturn JSON like: [{{"name":"Dashboard","kind":"screen"}},{{"name":"Task Detail","kind":"modal","trigger_from":"Dashboard · task card"}}]""",
                    }
                ],
                max_tokens=200,
            )
            metrics.record_ai_call(
                model=preflight_ai.model,
                purpose="preflight_plan",
                input_tokens=_pf_in,
                output_tokens=_pf_out,
            )
            # Strip markdown code fences from preflight response
            screen_plan = screen_plan.strip()
            if screen_plan.startswith("```"):
                screen_plan = screen_plan.split("\n", 1)[1] if "\n" in screen_plan else screen_plan[3:]
                if screen_plan.endswith("```"):
                    screen_plan = screen_plan[:-3]
                screen_plan = screen_plan.strip()
            screen_plan_hint = f"\n\nPREFLIGHT SCREEN PLAN: Generate wireframes for these screens: {screen_plan}\n"
            logger.info("[DIAGRAM] Preflight screen plan: %s", screen_plan)
            # _fresh_plan_inferred lives at function scope (initialised
            # before the elif chain) so all later cap logic can read it
            # safely even when the override / rework branches run instead.
            # Phase 4 — when a plan card exists, merge the preflight's
            # entries into it so chat-driven additions show up there too.
            # Existing entries get bumped to status="approved"; new ones
            # land as domain_source w/ tier="secondary". Broadcast
            # plan_updated so the card refreshes inline.
            try:
                from ..services.wireframe_plan_service import (
                    get_plan as _get_plan,
                )
                from ..services.wireframe_plan_service import (
                    infer_plan as _infer_plan,
                )
                from ..services.wireframe_plan_service import (
                    merge_pipeline_entries as _merge_pipeline_entries,
                )

                _existing_plan = _get_plan(session_obj.diagram_state)
                # Auto-infer on the first wireframe-creation chat message.
                # Without this the plan card never populates from chat — the
                # preflight only ever gives us the 3-4 surfaces the
                # facilitator promised, never the archetype's full base set.
                # Chat-driven users were therefore missing the plan card
                # entirely. Inference produces the full screen set; the
                # subsequent merge_pipeline_entries call below marks the
                # surfaces we're about to generate as `approved`.
                # _fresh_plan_inferred already initialised above the try
                # so it survives import / auto-infer failures.
                if _existing_plan is None:
                    _brief = (latest_user or "").strip()
                    if not _brief:
                        _brief = (getattr(session_obj, "initial_idea", "") or "").strip()
                    if _brief and len(_brief) >= 8:
                        try:
                            _inferred = await _infer_plan(
                                _brief,
                                target_device,
                                org_id=oid,
                                db=db,
                            )
                            _state = dict(session_obj.diagram_state or {})
                            _wf = dict(_state.get("wireframe") or {})
                            _wf["plan"] = json.loads(_inferred.model_dump_json())
                            _state["wireframe"] = _wf
                            session_obj.diagram_state = _state
                            await db.commit()
                            await manager.send_to(
                                session_id,
                                {"type": "plan_inferred", "payload": _wf["plan"]},
                            )
                            _existing_plan = _inferred
                            _fresh_plan_inferred = True
                            logger.info(
                                "[DIAGRAM] Auto-inferred plan from chat brief (%d screens, archetypes=%s)",
                                len(_inferred.screens),
                                [a[0] for a in _inferred.archetypes],
                            )
                        except Exception:
                            logger.warning(
                                "[DIAGRAM] Auto-infer plan failed (continuing with preflight only)",
                                exc_info=True,
                            )

                # When inference fired this turn, expand the screen plan
                # from the preflight's 1–3 facilitator-promised surfaces to
                # the plan's full screen list. The principle: if the
                # inferrer thought a surface belonged in this app, it
                # should be built — no PLANNED entries left sitting in
                # the queue waiting for the user to click "generate".
                # Optional-tier screens (onboarding, empty states) used
                # to be excluded for cost; on DeepSeek wireframes the
                # cost delta is negligible (~$0.005 per screen).
                if _fresh_plan_inferred and _existing_plan is not None:
                    from ..services.wireframe_plan_service import (
                        screens_to_pipeline_entries as _to_entries,
                    )

                    _auto_screens = [s for s in _existing_plan.screens if s.status not in ("removed", "generated")]
                    if _auto_screens:
                        _auto_entries = _to_entries(_auto_screens)
                        screen_plan = json.dumps(_auto_entries)
                        screen_plan_hint = (
                            "\n\nPLAN-DRIVEN SCREEN GENERATION: Build wireframes "
                            f"for these planned screens: {screen_plan}\n"
                        )
                        logger.info(
                            "[DIAGRAM] Auto-expanded chat preflight to plan hero+secondary (%d screens)",
                            len(_auto_screens),
                        )
                if _existing_plan is not None:
                    _entries_for_merge = json.loads(screen_plan) if screen_plan else []
                    if isinstance(_entries_for_merge, list):
                        _new_plan, _added_ids = _merge_pipeline_entries(
                            _existing_plan,
                            _entries_for_merge,
                        )
                        if _new_plan is not _existing_plan:
                            _state = dict(session_obj.diagram_state or {})
                            _wf = dict(_state.get("wireframe") or {})
                            _wf["plan"] = json.loads(_new_plan.model_dump_json())
                            _state["wireframe"] = _wf
                            session_obj.diagram_state = _state
                            await db.commit()
                            await manager.send_to(
                                session_id,
                                {"type": "plan_updated", "payload": _wf["plan"]},
                            )
                            if _added_ids:
                                logger.info(
                                    "[DIAGRAM] Plan merged %d new screens from chat: %s",
                                    len(_added_ids),
                                    _added_ids,
                                )
            except Exception:
                logger.warning(
                    "[DIAGRAM] Plan merge after preflight failed (continuing pipeline)",
                    exc_info=True,
                )
            # Refresh `all_diagrams` from the now-updated session state so
            # the per-screen loop below can see the freshly-inferred plan
            # under wireframe.plan. Without this refresh, `all_diagrams`
            # still holds the pre-infer snapshot and the plan-status
            # mark-as-generated step finds no plan dict to mutate, leaving
            # the plan card stuck on QUEUED forever.
            all_diagrams = session_obj.diagram_state or {}
            if isinstance(all_diagrams, dict) and "type" in all_diagrams:
                _legacy = all_diagrams["type"]
                all_diagrams = {_legacy: all_diagrams}
            # Broadcast pipeline-start context to the Debug drawer so the
            # user can see exactly what's going into mockup generation:
            # device, recipe, screen plan, kind/run details, etc.
            try:
                _parsed_for_debug: list = []
                try:
                    _parsed_for_debug = json.loads(screen_plan)
                    if not isinstance(_parsed_for_debug, list):
                        _parsed_for_debug = []
                except Exception:
                    _parsed_for_debug = []
                await manager.send_to(
                    session_id,
                    {
                        "type": "pipeline_started",
                        "payload": {
                            "run_id": run_id,
                            "kind": kind,
                            "target_device": target_device,
                            "recipe_files": recipe_files if "recipe_files" in dir() else None,
                            "existing_screens_count": len(
                                ((session_obj.diagram_state or {}).get("wireframe") or {}).get("screens") or []
                            ),
                            "screen_plan": _parsed_for_debug,
                            "ai_response_preview": (ai_response or "")[:500],
                        },
                    },
                )
            except Exception:
                logger.warning("[DIAGRAM] pipeline_started broadcast failed", exc_info=True)
            # Validate that we got the structured form. If the AI ignored the
            # schema and returned ["Dashboard","Settings"] we wrap each entry
            # as a screen kind so downstream code stays uniform.
            try:
                _parsed_plan = json.loads(screen_plan)
                if isinstance(_parsed_plan, list):
                    _normalised = []
                    for _entry in _parsed_plan:
                        if isinstance(_entry, str):
                            _normalised.append({"name": _entry, "kind": "screen"})
                        elif isinstance(_entry, dict) and _entry.get("name"):
                            _kind = (_entry.get("kind") or "screen").lower()
                            if _kind not in ("screen", "modal", "drawer", "popover"):
                                _kind = "screen"
                            _norm_entry = {"name": _entry["name"], "kind": _kind}
                            _trigger = _entry.get("trigger_from")
                            if _kind != "screen" and isinstance(_trigger, str) and _trigger.strip():
                                _norm_entry["trigger_from"] = _trigger.strip()
                            # Carry forward plan metadata. Without these the
                            # per-screen loop loses tier/id/nav_visible —
                            # which broke hero detection (every screen had
                            # tier=None and fell through to LEGACY mode,
                            # causing the cross-screen typography drift).
                            _eid = _entry.get("id")
                            if isinstance(_eid, str) and _eid.strip():
                                _norm_entry["id"] = _eid.strip()
                            _intent = _entry.get("intent")
                            if isinstance(_intent, str) and _intent.strip():
                                _norm_entry["intent"] = _intent.strip()
                            _tier = _entry.get("tier")
                            if isinstance(_tier, str) and _tier in ("hero", "secondary", "optional"):
                                _norm_entry["tier"] = _tier
                            _nv = _entry.get("nav_visible")
                            if isinstance(_nv, bool):
                                _norm_entry["nav_visible"] = _nv
                            _normalised.append(_norm_entry)
                    screen_plan = json.dumps(_normalised)
            except Exception:
                pass
            # NB: skeleton broadcast was here before; deferred until AFTER the
            # flow companion runs so the user sees the flow render first.
        except Exception as preflight_err:
            logger.warning("[DIAGRAM] Preflight screen plan failed: %s", preflight_err)

    # ── Flow-first companion: when we're about to spend ~30s generating
    # wireframes, do a quick (~5s) flow pass FIRST. Run on every wireframe
    # turn so the flow stays current with the wireframes — when the user
    # adds new screens, the flow updates to reflect them.
    if _likely_type == "wireframe" and screen_plan_hint:
        logger.info("[DIAGRAM] FLOW companion START")
        try:
            flow_ai = await get_ai_client_for_role(oid, db, "flow")
            await manager.send_to(
                session_id,
                {"type": "diagram_generating", "payload": {"type": "flow"}},
            )
            existing_flow_str = json.dumps(all_diagrams.get("flow", {})) if "flow" in all_diagrams else "(none yet)"
            # Build the brief from BOTH already-stored wireframe screens AND
            # the screens this turn is about to generate (from preflight). The
            # flow runs BEFORE the wireframe per-screen loop, so without the
            # planned ids there's nothing to link to on first turn.
            wf_screens = all_diagrams.get("wireframe", {}).get("screens") or []
            wf_screens_brief = [
                {"id": s.get("id"), "name": s.get("name")} for s in wf_screens if isinstance(s, dict) and s.get("id")
            ]
            try:
                planned_names = json.loads(screen_plan) if screen_plan_hint else []
            except Exception:
                planned_names = []
            for pn in planned_names:
                if not isinstance(pn, str):
                    continue
                pid = pn.lower().replace(" ", "_").replace("/", "_")
                if any(s.get("id") == pid for s in wf_screens_brief):
                    continue
                wf_screens_brief.append({"id": pid, "name": pn})
            wf_brief_str = json.dumps(wf_screens_brief) if wf_screens_brief else "(none yet)"
            flow_raw, _fl_in, _fl_out = await flow_ai.chat_with_full_usage(
                system="You generate compact user-flow diagram JSON. Return ONLY JSON, no prose.",
                messages=[
                    {
                        "role": "user",
                        "content": f"""Generate or UPDATE a USER FLOW diagram for this product.

EXISTING FLOW (preserve / extend, do not start from scratch unless empty):
{existing_flow_str}

WIREFRAME SCREENS that already exist in this session (link flow nodes to them via screenId when the node represents arriving at one of these screens):
{wf_brief_str}

CONVERSATION:
{conv[-1500:]}

Return ONLY this JSON shape:
{{"type":"flow","title":"User Flow","nodes":[{{"id":"n1","label":"User opens app","shape":"start"}},{{"id":"n2","label":"View dashboard","shape":"process","screenId":"dashboard"}}],"edges":[{{"from":"n1","to":"n2","label":"optional"}}]}}

Rules:
- Structure the diagram as a HIGH-LEVEL SPINE plus SUB-FLOWS, not one giant graph.
  The main spine = entry → auth → onboarding → home → (one parent node per feature area) → sign out.
  Each feature area gets pulled OUT into its own sub-flow, regardless of how many total nodes the product has. Don't choose by size — choose by topic.
- Canonical sub-flow areas (emit each one that genuinely applies to this product, skip those that don't): `auth` (sign up / sign in / forgot / email verify / expired link), `onboarding`, `create` (the item-creation flow), `edit`, `delete` (with confirm + undo), `share`, `search_filter` (search + filter + sort), `bulk` (multi-select actions), `settings`, `notifications` (permission prompt + due-fire + deep-link), `offline` (queue + sync + conflict resolution), `errors` (retry banners + validation failures), `sign_out`. Add product-specific sub-flows when the domain calls for them (e.g. `underwriting`, `payment_post`, `delinquency_queue`).
- For each sub-flow, emit a PARENT node on the main spine with `subflowIds: ["sub_<area>_1", "sub_<area>_2", ...]` pointing at the cluster's internal nodes.
- Internal sub-flow node ids MUST be prefixed `sub_<area>_<n>` (e.g. `sub_auth_1`, `sub_auth_2`, `sub_create_1`). Sub-flow nodes form their own internal chain — connect them with edges to each other; do NOT connect them back to the main spine.
- Use shape "decision" liberally for every branch (yes/no, valid?, retry?, confirm?, online?).
- Reuse existing node ids when the meaning is the same; only add NEW ids for new branches/screens.
- For nodes that represent the user landing on a wireframe screen, set "screenId" to the matching wireframe screen id from the list above.
- Shape "start" for entry, "end" for terminal, "decision" for branches, otherwise "process".
- Edge labels mark branch outcomes ("yes" / "no" / "retry" / "cancel" / "<5s" / "timeout").
- No markdown. Compact JSON.""",
                    }
                ],
                max_tokens=4000,
            )
            metrics.record_ai_call(
                model=flow_ai.model,
                purpose="flow_companion",
                input_tokens=_fl_in,
                output_tokens=_fl_out,
            )
            flow_raw = flow_raw.strip()
            if flow_raw.startswith("```"):
                flow_raw = flow_raw.split("\n", 1)[1] if "\n" in flow_raw else flow_raw[3:]
                if flow_raw.endswith("```"):
                    flow_raw = flow_raw[:-3]
                flow_raw = flow_raw.strip()
            flow_diagram = json.loads(flow_raw)
            if (
                isinstance(flow_diagram, dict)
                and flow_diagram.get("type") == "flow"
                and isinstance(flow_diagram.get("nodes"), list)
            ):
                all_diagrams["flow"] = flow_diagram
                session_obj.diagram_state = all_diagrams
                await db.commit()
                await manager.send_to(
                    session_id,
                    {"type": "diagram_update", "payload": flow_diagram},
                )
                logger.info("[DIAGRAM] Flow companion generated: %d nodes", len(flow_diagram["nodes"]))
        except Exception as flow_err:
            logger.warning("[DIAGRAM] Flow companion failed (continuing to wireframes): %s", flow_err, exc_info=True)

        # Now that the flow has rendered, broadcast the wireframe skeletons —
        # this is what makes the wireframe zone appear AFTER the flow on the
        # canvas. Done here (not earlier inside the preflight) deliberately.
        try:
            import json as _json

            _raw_skel = _json.loads(screen_plan)
            # Skeleton broadcast carries name + kind so the frontend can
            # render small skeletons for modals/drawers/popovers. Apply
            # the SAME cap as the per-screen loop below — otherwise we'd
            # place skeletons that never get filled.
            skel_entries: list[dict] = []
            _seen_skel: set[str] = set()
            _idx_skel = 0
            if isinstance(_raw_skel, list):
                for _e in _raw_skel:
                    if isinstance(_e, str):
                        _name, _k, _id = _e, "screen", None
                    elif isinstance(_e, dict) and _e.get("name"):
                        _name = _e["name"]
                        _k = (_e.get("kind") or "screen").lower()
                        if _k not in ("screen", "modal", "drawer", "popover"):
                            _k = "screen"
                        _id = (_e.get("id") or "").strip().lower() or None
                    else:
                        continue
                    # Dedupe by id — the preflight / inference can emit
                    # the same id twice but legitimately distinct screens
                    # share names ("Loan Detail" screen + "Loan Detail"
                    # drawer-after-coerce), and dedup by (name, kind) was
                    # silently chopping the 4-screen tail of bigger plans
                    # ("17 screens / 13 skeletons" complaint). Use id when
                    # present; fall back to (name, kind) only when id is
                    # missing (legacy string-array input).
                    _key = _id or f"~{_idx_skel}|{_name.strip().lower()}|{_k}"
                    _idx_skel += 1
                    if _key in _seen_skel:
                        continue
                    _seen_skel.add(_key)
                    skel_entries.append({"name": _name, "kind": _k})
            # Match the per-screen-loop cap so skeletons line up with what
            # actually gets generated. Plan-driven runs (explicit
            # /wireframe/generate POST OR a chat turn that auto-expanded
            # into hero+secondary) build EXACTLY the plan — no cap, no
            # silent truncation. Chat-only flows still cap at 6 so a
            # runaway preflight can't dump a dozen skeletons that never
            # fill. Cap of 14 used to chop off the tail of bigger plans
            # ("17 screens / 13 skeletons" — user complaint).
            _plan_driven_skel = bool(screen_plan_override) or _fresh_plan_inferred
            if not _plan_driven_skel:
                skel_entries = skel_entries[:6]
            if skel_entries:
                logger.info(
                    "[DIAGRAM] SKELETON broadcast type=wireframe device=%s entries=%s",
                    target_device,
                    skel_entries,
                )
                await manager.send_to(
                    session_id,
                    {
                        "type": "diagram_generating",
                        "payload": {
                            "type": "wireframe",
                            # Backwards-compat: keep `screens` as a name list
                            # for older frontends; new frontends read `entries`.
                            "screens": [e["name"] for e in skel_entries],
                            "entries": skel_entries,
                            "device": target_device,
                            # Additive runs MUST NOT trigger band re-layout on
                            # the frontend — they only ever append new screens
                            # next to existing same-kind without touching the
                            # rest of the canvas.
                            "additive": kind == "additive",
                            "run_id": run_id,
                        },
                    },
                )
        except Exception as skel_err:
            logger.warning("[DIAGRAM] Skeleton broadcast failed: %s", skel_err, exc_info=True)

    # ── Wireframe: generate each screen separately for reliability ──
    if _likely_type == "wireframe" and screen_plan_hint:
        try:
            _raw_plan = json.loads(screen_plan) if screen_plan_hint else []
        except Exception:
            _raw_plan = []

        # Normalise to a list of {name, kind, trigger_from?} dicts. Accepts
        # both the old string-array form ("Dashboard") and the new object form.
        plan_entries: list[dict] = []
        if isinstance(_raw_plan, list):
            for _entry in _raw_plan:
                if isinstance(_entry, str):
                    plan_entries.append({"name": _entry, "kind": "screen"})
                elif isinstance(_entry, dict) and _entry.get("name"):
                    _kind = (_entry.get("kind") or "screen").lower()
                    if _kind not in ("screen", "modal", "drawer", "popover"):
                        _kind = "screen"
                    _new_entry = {"name": _entry["name"], "kind": _kind}
                    _t = _entry.get("trigger_from")
                    if _kind != "screen" and isinstance(_t, str) and _t.strip():
                        _new_entry["trigger_from"] = _t.strip()
                    _intent = _entry.get("intent")
                    if isinstance(_intent, str) and _intent.strip():
                        _new_entry["intent"] = _intent.strip()
                    _eid = _entry.get("id")
                    if isinstance(_eid, str) and _eid.strip():
                        _new_entry["id"] = _eid.strip()
                    _nv = _entry.get("nav_visible")
                    if isinstance(_nv, bool):
                        _new_entry["nav_visible"] = _nv
                    _tier = _entry.get("tier")
                    if isinstance(_tier, str) and _tier in ("hero", "secondary", "optional"):
                        _new_entry["tier"] = _tier
                    plan_entries.append(_new_entry)
        screen_names = [e["name"] for e in plan_entries]

        if isinstance(screen_names, list) and len(screen_names) > 0:
            # Cap surface count. The chat preflight ships 3–6 entries, but
            # plan-driven runs (Generate Hero on the plan card OR the
            # auto-expansion that fires when chat first triggers
            # inference) deliberately send the full tier. Use the higher
            # cap whenever we know the source is plan-derived; keep the
            # lower cap for chat-only flows so a runaway preflight can't
            # dump a dozen skeletons that never fill.
            _plan_driven = bool(screen_plan_override) or _fresh_plan_inferred
            # Plan-driven runs build the WHOLE plan — uncapped. Chat-only
            # preflights still cap at 6 so we don't burn opus calls on
            # runaway expansions. Was previously capped at 14 in both
            # branches and quietly dropped tail screens for any plan > 14.
            if not _plan_driven:
                plan_entries = plan_entries[:6]
            screen_names = [e["name"] for e in plan_entries]
            title = current_diagram.get("title", "UI Wireframes")
            # Carry forward existing screens that are NOT being regenerated this
            # turn. Without this, every progressive broadcast wipes the previous
            # wireframe state — so adding "settings page" after a Dashboard run
            # would delete the Dashboard from the DB and the canvas.
            #
            # Skip rework intent: that path INTENDS to replace existing screens
            # by name, so we want a clean slate for those names (they'll be
            # regenerated below).
            _names_lower = {(n or "").lower() for n in screen_names}
            all_screens: list[dict] = []
            if not rework_intent:
                for _exist in existing_screens_state or []:
                    if not isinstance(_exist, dict):
                        continue
                    _en = (_exist.get("name") or "").lower()
                    _eid = (_exist.get("id") or "").lower()
                    # Drop any existing screen whose name/id matches one we're
                    # about to regenerate — the new version replaces it.
                    if _en in _names_lower or _eid in _names_lower:
                        continue
                    if _exist.get("html"):
                        all_screens.append(_exist)
            existing_summary = _format_wireframe_summary(all_diagrams) or "(none yet — first generation)"
            device_specs = {
                "mobile": "390x844, single column, bottom tab bar, top header",
                "tablet": "820x1180, two-column where useful, tab bar or sidebar",
                "desktop": "1440x900, top nav + sidebar + content area, multi-column grid",
            }
            device_rule = device_specs.get(target_device, device_specs["desktop"])

            # Pull the design library output saved on the session by the
            # design-system endpoint. Without this, the per-screen prompt
            # only sees colour tokens via CSS vars — the actual variation
            # constraints (asymmetric-split, off-grid-drop-caps, etc.) and
            # the design memo's "why this fits" prose never reach the AI,
            # so every wireframe defaults to Claude's training prior.
            design_block = ""
            try:
                design_data = (all_diagrams.get("design") or {}) if isinstance(all_diagrams, dict) else {}
                ds = design_data.get("design_system") or {}
                memo = design_data.get("design_memo") or {}
                variation = design_data.get("variation") or {}
                personality = design_data.get("personality") or ""
                lines: list[str] = []
                if personality:
                    lines.append(f"DESIGN PERSONALITY: {personality}")
                if memo.get("why_this_fits"):
                    lines.append(f"WHY THIS DESIGN FITS:\n{memo['why_this_fits']}")
                vc = memo.get("variation_constraints") or variation
                if vc:
                    vc_str = "\n".join(f"  - {k}: {v}" for k, v in vc.items() if v)
                    if vc_str:
                        lines.append(
                            f"VARIATION CONSTRAINTS (you MUST honour these — they make the wireframe distinctive, not generic):\n{vc_str}"
                        )
                anti = memo.get("anti_patterns_avoided") or memo.get("anti_patterns") or []
                if anti:
                    anti_str = "\n".join(f"  - {a}" for a in anti)
                    lines.append(f"ANTI-PATTERNS — DO NOT DO ANY OF THESE:\n{anti_str}")
                if ds.get("type") or ds.get("typography"):
                    typ = ds.get("typography") or ds.get("type") or {}
                    if isinstance(typ, dict) and typ:
                        lines.append("TYPOGRAPHY TOKENS: " + json.dumps(typ))
                if ds.get("layout"):
                    lines.append("LAYOUT TOKENS: " + json.dumps(ds.get("layout")))
                # Component manifest — the visual contract for this design.
                # Every wireframe in this set must compose from these names so
                # sibling screens look like they belong to the same product.
                components = ds.get("components") or {}
                if isinstance(components, dict) and components:
                    manifest_lines = []
                    descriptions = {
                        "button-primary": "Primary call-to-action. Filled. Use for the main action on a screen.",
                        "button-secondary": "Secondary action. Outlined.",
                        "card-priority": "Foregrounded card for a featured / top-ranked item.",
                        "card-secondary": "Standard card for the rest of the list.",
                        "section-eyebrow": "Small-caps kicker label above a section. Use for ALL section labels (TODAY, PRIORITIES, etc).",
                        "section-header": "Larger section title.",
                        "tab-bar-item": "Bottom-nav slot on mobile.",
                        "tab-bar-item-active": "The selected tab-bar slot.",
                        "input-field": "Text input.",
                        "badge": "Small status pill (NEW, ACTIVE, DUE, etc).",
                    }
                    for name in components.keys():
                        desc = descriptions.get(name, "(custom component)")
                        manifest_lines.append(f"  - {name}: {desc}")
                    manifest_block = (
                        "\n=== COMPONENT MANIFEST (use these in your html — do NOT invent new component shapes) ===\n"
                        + "\n".join(manifest_lines)
                        + '\n\nUSAGE: Apply a component by adding `data-component="<name>"` to the element. '
                        "Example: `<button data-component='button-primary'>Start</button>`. "
                        "The renderer resolves the component's styles from the design system's `components` map at render time. "
                        "DO NOT inline component-level styling (background, border, padding, border-radius, font weight) — let the data-component attribute carry it. "
                        "Inline styles ARE allowed for layout (display, grid, flex, position, width, height, margin between elements)."
                        "\n=== END COMPONENT MANIFEST ===\n"
                    )
                    lines.append(manifest_block)
                if lines:
                    design_block = (
                        "\n\n=== DESIGN LIBRARY OUTPUT (apply these to the screen) ===\n"
                        + "\n\n".join(lines)
                        + "\n=== END DESIGN LIBRARY ===\n"
                    )
                    logger.info("[DIAGRAM] Design library context injected (%d chars)", len(design_block))
                else:
                    logger.info("[DIAGRAM] No design library output on session — wireframes will use generic defaults")
            except Exception as design_err:
                logger.warning("[DIAGRAM] Failed to load design library context: %s", design_err)

            # ─── Shell synthesis ───────────────────────────────────────
            # The "shell" is the app chrome (header / sidebar / tab-bar /
            # nav list / footer) that every screen of this app shares. We
            # generate it ONCE per recipe+device and persist it at
            # session.diagram_state.wireframe_shell. Per-screen calls below
            # receive the shell verbatim and only fill the content slot,
            # which kills cross-screen drift (different sidebars / nav
            # patterns / card shapes between siblings).
            shell_state = (all_diagrams.get("wireframe_shell") or {}) if isinstance(all_diagrams, dict) else {}
            cached_shell_html = shell_state.get("shell_html") if isinstance(shell_state, dict) else None
            cached_shell_device = shell_state.get("device") if isinstance(shell_state, dict) else None
            cached_shell_recipe = shell_state.get("recipe") if isinstance(shell_state, dict) else None
            cached_shell_nav_fp = shell_state.get("nav_fingerprint") if isinstance(shell_state, dict) else None
            current_recipe_letter = (
                ((all_diagrams.get("design") or {}).get("classification") or {}).get("recipe_letter")
                if isinstance(all_diagrams, dict)
                else None
            )

            # Canonical nav = existing carried-forward screens + this turn's
            # screen-kind entries (deduped by case-insensitive name). The shell
            # has to know about EVERY navigable surface, not just what's being
            # generated this turn — otherwise a chat-add of "Reports" would
            # build a shell whose nav only contains Reports.
            #
            # Filter by `nav_visible`: drill-in screens (User Detail accessed
            # from a row), auth (Login), onboarding, and profile (accessed
            # via avatar) shouldn't clutter the sidebar even though they're
            # full screens. Default True when missing — keeps legacy
            # behaviour for plans inferred before nav_visible existed.
            def _is_nav_visible(item: dict) -> bool:
                v = item.get("nav_visible") if isinstance(item, dict) else None
                if isinstance(v, bool):
                    return v
                return True

            _existing_screen_names = [
                s.get("name")
                for s in (all_screens or [])
                if isinstance(s, dict)
                and (s.get("kind") or "screen") == "screen"
                and s.get("name")
                and _is_nav_visible(s)
            ]
            _new_screen_names = [
                e["name"] for e in plan_entries if (e.get("kind") or "screen") == "screen" and _is_nav_visible(e)
            ]
            _seen_lower: set[str] = set()
            nav_screen_names: list[str] = []
            for _n in _existing_screen_names + _new_screen_names:
                _nl = (_n or "").lower()
                if _nl and _nl not in _seen_lower:
                    _seen_lower.add(_nl)
                    nav_screen_names.append(_n)
            current_nav_fp = "|".join(n.lower() for n in nav_screen_names)
            shell_valid = (
                isinstance(cached_shell_html, str)
                and len(cached_shell_html) > 100
                and cached_shell_device == target_device
                and (cached_shell_recipe is None or cached_shell_recipe == current_recipe_letter)
                and cached_shell_nav_fp == current_nav_fp
            )
            shell_html: str = cached_shell_html if shell_valid else ""

            if not shell_valid:
                logger.info(
                    "[DIAGRAM] Generating shell (device=%s, recipe=%s) — none cached or stale",
                    target_device,
                    current_recipe_letter,
                )
                try:
                    shell_ai = await get_ai_client_for_role(oid, db, "wireframe")
                    shell_system = (
                        "You design the SHELL of a multi-screen app — the chrome that wraps EVERY screen "
                        "(header, sidebar / tab-bar, nav list, footer / status). The same shell is then "
                        "used verbatim by every screen of this app, so its design is critical for "
                        "cross-screen consistency.\n\n" + harness_text
                    )
                    # Only full screens belong in the shell's navigation —
                    # modals/drawers/popovers are triggered FROM screens, not
                    # navigated to. Including them in the sidebar makes them
                    # look like top-level pages, which is wrong.
                    # `nav_screen_names` was computed above (canonical nav set
                    # = existing screens + this turn's new screens, deduped).
                    nav_hint = (
                        "NAV CONTENT — this is the COMPLETE, CANONICAL list of nav items. "
                        "Render EXACTLY these labels in the primary nav, in this order, AND NO OTHERS:\n"
                        + "\n".join(f"  - {n}" for n in nav_screen_names)
                        + "\nDo NOT add 'Reports', 'Help', 'Profile', 'Analytics', 'Activity', or any "
                        "item not in the list above. Every nav item must correspond to a real screen "
                        "in this app — phantom entries break navigation."
                        if nav_screen_names
                        else ""
                    )
                    shell_user_prompt = f"""Design the app SHELL for "{title}" on {target_device}.
Device sizing: {device_rule}.
{design_block}
{nav_hint}

Output ONE JSON object, exactly this shape:
{{"device":"{target_device}","shell_html":"<div data-component='app-shell' style='...'>...HEADER + SIDEBAR/TAB-BAR + <main data-slot=\\\"content\\\" style=\\\"flex:1\\\"></main> + FOOTER...</div>"}}

Rules:
- The shell HTML is a complete frame: header at top, primary nav (sidebar on desktop, bottom tab-bar on mobile), and a SINGLE empty <main> with `data-slot='content'` where each screen will inject its own UI.
- NAV: include ONLY the labels listed in NAV CONTENT above. No invented "Reports" / "Help" / "Analytics" extras. If the list is empty, render no primary nav items.
- Use ONLY CSS variables for colour: var(--color-bg), var(--color-surface), var(--color-text), var(--color-text-muted), var(--color-accent), var(--color-on-accent), var(--color-border). NO hex literals.
- Apply components via `data-component="<name>"` (button-primary, tab-bar-item, section-eyebrow, etc.) — don't inline component-level styles.
- Inline LAYOUT styles (display:flex, grid, position, padding, width, height) are fine.
- Root: width:100%; min-height:100vh; display:flex; flex-direction:column.
- HTML attribute values use SINGLE quotes (style='...').
- Do NOT render an iOS status bar — the renderer adds the device chrome.
- ICON RULE (mandatory): NEVER use emoji glyphs (👥 👤 📋 ⚙️ 🔑 📊 🏠 🔍 ⭐ 🔔 etc.) anywhere in the UI. Emoji make B2B / institutional tools look like consumer toys. Two acceptable patterns, in this order of preference:
  1. NO icon at all — just the text label with strong typographic hierarchy (font-weight, size, colour). Linear and Stripe Dashboard do this for most nav items.
  2. Inline `<svg>` (12–16px, stroke-based, currentColor) for genuinely functional glyphs only — search 🔍 → magnifier svg, close × → svg or the literal `×` Unicode, chevron ▾ → svg or the literal `▾`. Keep paths minimal (one `<path>`, single stroke).
  Acceptable Unicode shapes (sparingly): `× ✕ ✓ → ← ▾ ▴ ▸ • ◯ ◆`. Forbidden: any emoji codepoint (U+1F300–1F9FF range), any colourful pictograph.
- INTERACTIVITY: include an inline `<script>` that wires up the shell's
  interactive bits — nav items get hover and active states (active synced
  to the current page), the avatar / user menu opens a small popover with
  smooth open/close, search input accepts focus/typing, notification icon
  pulses on hover, mobile tab-bar items toggle active. Plain vanilla JS,
  no libraries. Keep it small.
- Return ONLY the JSON object. No prose, no fence.
"""
                    shell_text_buf: list[str] = []
                    async for chunk in shell_ai.chat_stream(
                        system=shell_system,
                        messages=[{"role": "user", "content": shell_user_prompt}],
                        max_tokens=8192,
                        enable_thinking=False,
                    ):
                        if isinstance(chunk, str):
                            shell_text_buf.append(chunk)
                        elif isinstance(chunk, tuple) and chunk[0] == "usage":
                            usage = chunk[1]
                            metrics.record_ai_call(
                                model=usage.get("model", "unknown"),
                                purpose="shell_synthesis",
                                input_tokens=int(usage.get("input_tokens", 0)),
                                output_tokens=int(usage.get("output_tokens", 0)),
                            )
                    shell_raw = "".join(shell_text_buf).strip()
                    if shell_raw.startswith("```"):
                        shell_raw = shell_raw.split("\n", 1)[1] if "\n" in shell_raw else shell_raw[3:]
                        if shell_raw.endswith("```"):
                            shell_raw = shell_raw[:-3]
                        shell_raw = shell_raw.strip()
                    shell_raw = re.sub(r'(?<!\\)\\(?!["\\/bfnrtu])', r"\\\\", shell_raw)
                    try:
                        shell_obj = json.loads(shell_raw)
                    except json.JSONDecodeError as parse_err:
                        # Lenient: pull shell_html between first quote after key and last quote before }
                        logger.warning("[DIAGRAM] Shell JSON parse failed (%s); attempting lenient", parse_err)
                        ho = shell_raw.find('"shell_html"')
                        if ho != -1:
                            colon = shell_raw.find(":", ho)
                            fq = shell_raw.find('"', colon + 1)
                            lq = shell_raw.rfind('"')
                            if fq != -1 and lq > fq:
                                shell_obj = {"shell_html": shell_raw[fq + 1 : lq]}
                            else:
                                shell_obj = {}
                        else:
                            shell_obj = {}
                    candidate = shell_obj.get("shell_html") if isinstance(shell_obj, dict) else None
                    if isinstance(candidate, str) and len(candidate) > 100:
                        # Sanitise inline colours through the same path screens go.
                        try:
                            from ..services.wireframe_sanitizer import sanitize_wireframe_html

                            ds_for_sanitize = (
                                (all_diagrams.get("design") or {}).get("design_system")
                                if isinstance(all_diagrams, dict)
                                else None
                            )
                            candidate = sanitize_wireframe_html(candidate, ds_for_sanitize)
                        except Exception as san_err:
                            logger.warning("[DIAGRAM] Shell sanitiser failed: %s", san_err)
                        shell_html = candidate
                        all_diagrams["wireframe_shell"] = {
                            "device": target_device,
                            "recipe": current_recipe_letter,
                            "nav_fingerprint": current_nav_fp,
                            "shell_html": shell_html,
                        }
                        # When the canonical nav changes (e.g. a new screen
                        # was added via chat), every carried-forward screen
                        # still has the OLD shell baked into its html. Swap
                        # the shell wrapper in place so existing mockups
                        # immediately reflect the new nav.
                        _swapped = 0
                        for _existing in all_screens:
                            if not isinstance(_existing, dict):
                                continue
                            if (_existing.get("kind") or "screen") != "screen":
                                # Modals / drawers / popovers don't embed the shell.
                                continue
                            _h = _existing.get("html")
                            if not isinstance(_h, str) or not _h:
                                continue
                            _new_h = _swap_shell_in_screen_html(_h, shell_html)
                            if _new_h:
                                _existing["html"] = _new_h
                                _swapped += 1
                        if _swapped:
                            logger.info(
                                "[DIAGRAM] Swapped new shell into %d existing screen(s)",
                                _swapped,
                            )
                        session_obj.diagram_state = all_diagrams
                        await db.commit()
                        logger.info(
                            "[DIAGRAM] Shell generated and persisted (chars=%d device=%s)",
                            len(shell_html),
                            target_device,
                        )
                    else:
                        logger.warning("[DIAGRAM] Shell generation produced no usable HTML — proceeding without")
                except Exception as shell_err:
                    logger.warning("[DIAGRAM] Shell synthesis failed (continuing without shell): %s", shell_err)
            else:
                logger.info(
                    "[DIAGRAM] Reusing cached shell (device=%s, recipe=%s)", cached_shell_device, cached_shell_recipe
                )

            # Build the per-screen prefix that gives the AI the shell to embed verbatim.
            shell_prefix = (
                f"\n\n=== APP SHELL — embed VERBATIM in your html, replace <main data-slot='content'> with this screen's content area ===\n{shell_html}\n=== END APP SHELL ===\n"
                if shell_html
                else ""
            )

            # Reference snippets for layout consistency: up to 2 already-
            # generated screens (truncated), passed to per-screen generation
            # so the AI matches established structural patterns for shared
            # component types (tables, cards, lists, forms, badges). Without
            # this, sibling screens drift in row density / card padding /
            # list-item shape because each generation runs blind.
            _ref_lines: list[str] = []
            for _ref in (all_screens or [])[:2]:
                if not isinstance(_ref, dict):
                    continue
                _rname = _ref.get("name") or _ref.get("id")
                _rkind = _ref.get("kind") or "screen"
                _rhtml = _ref.get("html") or ""
                if not _rname or not isinstance(_rhtml, str) or len(_rhtml) < 100:
                    continue
                _ref_lines.append(f"\n--- {_rname} ({_rkind}) ---\n{_rhtml[:1800]}\n--- END {_rname} ---")
            reference_block = (
                "\n\n=== EXISTING SCREENS — match these structural patterns where component types overlap ===\n"
                + "\n".join(_ref_lines)
                + "\n=== END EXISTING SCREENS ===\n"
                if _ref_lines
                else ""
            )

            # Trigger targets: the canonical list of surfaces in this session
            # that buttons / rows / links can navigate to. Wired into the
            # per-screen prompt so the AI can attach data-trigger="<id>" to
            # interactive elements; the simulator routes those clicks
            # without needing fragile text-match heuristics.
            _trigger_targets: list[dict] = []
            seen_target_ids: set[str] = set()
            for _t_src in [(all_screens or []), plan_entries]:
                for _t in _t_src:
                    if not isinstance(_t, dict):
                        continue
                    _tname = _t.get("name") or _t.get("id")
                    if not _tname:
                        continue
                    _tid_raw = _t.get("id") or str(_tname).lower().replace(" ", "_").replace("/", "_")
                    _tid = str(_tid_raw).lower()
                    if _tid in seen_target_ids:
                        continue
                    seen_target_ids.add(_tid)
                    _tkind = (_t.get("kind") or "screen").lower()
                    _trigger_targets.append({"id": _tid, "name": str(_tname), "kind": _tkind})
            trigger_block = ""
            if _trigger_targets:
                _lines = [f'  - data-trigger="{t["id"]}" → {t["name"]} ({t["kind"]})' for t in _trigger_targets]
                trigger_block = (
                    "\n\n=== AVAILABLE TRIGGER TARGETS (wire these to interactive elements) ===\n"
                    "Every clickable element that semantically opens one of these surfaces MUST carry "
                    'data-trigger="<id>" so the simulator routes the click. The simulator falls back '
                    "to text matching only when data-trigger is absent.\n"
                    + "\n".join(_lines)
                    + "\n=== END TRIGGER TARGETS ===\n"
                )

            # Per-kind sizing + framing rules. Screens use the device-driven
            # sizing; overlays scale with the parent device so a mobile
            # session gets mobile-sized modals (not desktop cards floating
            # beside a phone screen).
            overlay_sizes = {
                "modal": {
                    "mobile": ("340x480", "mobile-sized modal — fits over a 390-wide phone screen"),
                    "tablet": ("560x600", "tablet-sized modal — centered over an 820-wide screen"),
                    "desktop": ("640x480", "desktop modal — centered over the parent screen"),
                },
                "drawer": {
                    "mobile": ("340x844", "mobile drawer — slides over most of the phone screen"),
                    "tablet": ("440x1180", "tablet drawer — right-anchored side panel"),
                    "desktop": (
                        "560x900",
                        "desktop drawer — right-anchored side panel; wide enough for 2-column forms",
                    ),
                },
                "popover": {
                    "mobile": ("240x200", "mobile popover — small contextual card"),
                    "tablet": ("280x240", "tablet popover — compact contextual card"),
                    "desktop": ("320x280", "desktop popover — compact contextual menu"),
                },
            }
            kind_specs = {
                "screen": {
                    "size_rule": f"{target_device.title()} sizing: {device_rule}.",
                    "frame_rule": (
                        "FILL THE FULL VIEWPORT HEIGHT. The root div MUST use:\n"
                        "  style='width:100%;min-height:100vh;display:flex;flex-direction:column'\n"
                        "Make the primary content region use `flex:1` so it grows to fill the gap between header and footer."
                    ),
                    "shell_clause": "",
                },
                "modal": {
                    "size_rule": (
                        f"Modal sizing: {overlay_sizes['modal'][target_device][0]} — "
                        f"{overlay_sizes['modal'][target_device][1]}. NO header / sidebar / tab-bar."
                    ),
                    "frame_rule": (
                        "Render as a self-contained card. Root div:\n"
                        "  style='width:100%;height:100%;display:flex;flex-direction:column;background:var(--color-surface);border:1px solid var(--color-border);border-radius:12px;padding:20px;gap:14px;box-shadow:0 24px 64px -12px rgba(0,0,0,0.4)'\n"
                        "Title row + close (×), content body, action row. Scale padding/font-size DOWN on mobile (340-wide is tight)."
                    ),
                    "shell_clause": "DO NOT include any APP SHELL chrome — modals do NOT have headers / sidebars / tab-bars.",
                },
                "drawer": {
                    "size_rule": (
                        f"Drawer sizing: {overlay_sizes['drawer'][target_device][0]} — "
                        f"{overlay_sizes['drawer'][target_device][1]}."
                    ),
                    "frame_rule": (
                        "Render as a tall side panel. Root div:\n"
                        "  style='width:100%;height:100%;display:flex;flex-direction:column;background:var(--color-surface);border-left:1px solid var(--color-border);padding:18px;gap:12px;overflow:hidden'\n"
                        "Top row title + close, scrollable content body."
                    ),
                    "shell_clause": "DO NOT include any APP SHELL chrome — drawers slide over the parent screen.",
                },
                "popover": {
                    "size_rule": (
                        f"Popover sizing: {overlay_sizes['popover'][target_device][0]} — "
                        f"{overlay_sizes['popover'][target_device][1]}."
                    ),
                    "frame_rule": (
                        "Render as a compact card. Root div:\n"
                        "  style='width:100%;height:100%;display:flex;flex-direction:column;background:var(--color-surface);border:1px solid var(--color-border);border-radius:8px;padding:10px;gap:6px;box-shadow:0 12px 32px -8px rgba(0,0,0,0.4)'\n"
                        "Tight, single column. No headers — just options / fields / quick info."
                    ),
                    "shell_clause": "DO NOT include any APP SHELL chrome — popovers anchor to a trigger element on the parent screen.",
                },
                "landing": {
                    # Landing pages are long-scroll: every section listed in
                    # the screen's intent stacks vertically. Frame grows as
                    # tall as the content needs.
                    "size_rule": (
                        f"{target_device.title()} landing-page sizing: full-width "
                        f"({'390px mobile / 820px tablet / 1440px desktop' if target_device != 'desktop' else '1440px'}), "
                        "tall as content requires (no min-height cap — use multiple full-viewport sections stacked)."
                    ),
                    "frame_rule": (
                        "LONG-SCROLL LAYOUT. The root div MUST use:\n"
                        "  style='width:100%;display:flex;flex-direction:column;background:var(--color-bg)'\n"
                        "(no min-height, no flex:1 — the page grows naturally as sections accumulate). "
                        "Render EVERY section listed in the screen's intent as a stacked <section> "
                        "with its own padding-y (typically 80–120px on desktop, 56–80px on mobile). "
                        "Sections to include in order: hero (with primary CTA), social-proof / logo strip, "
                        "problem statement, how-it-works (3-step or feature explainer), feature grid, "
                        "pricing / plans, testimonials, FAQ, final CTA banner, footer — but ONLY the ones "
                        "the brief explicitly names. Do NOT pad with sections the user didn't ask for. "
                        "Hero can use min-height:80vh to feel substantial; everything else sizes to content."
                    ),
                    "shell_clause": (
                        "Marketing landing pages have their OWN top nav (logo + 3-5 nav links + CTA button) "
                        "and their OWN footer — DO NOT embed the app shell. Build a marketing-style top nav "
                        "as the first child of the root, then sections, then footer as the last child."
                    ),
                },
            }

            # Resolve which component library this session uses. Defaults to
            # "shadcn" for new sessions — the toggle lives on ai_config so
            # users can flip to "custom" for full bespoke generation.
            _ai_cfg = (session_obj.ai_config or {}) if session_obj else {}
            session_library = (_ai_cfg.get("library") or "shadcn").lower()

            # Concurrency: opus-4-7 calls run ~10-15s each; 14 screens
            # sequential = 2-3 minutes. Parallelise the per-screen loop
            # at WIREFRAME_CONCURRENCY (default 5) — capped to respect
            # Anthropic RPM limits and keep DB commits sane.
            _wf_concurrency = max(1, int(os.environ.get("WIREFRAME_CONCURRENCY", "5")))
            _wf_sem = asyncio.Semaphore(_wf_concurrency)
            # Persist lock — concurrent screens all want to write
            # session_obj.diagram_state. Without serialisation the
            # last commit wins and earlier mutations (plan tier flags,
            # design_dna, sibling screens) get clobbered. We serialise
            # the read-mutate-commit critical section AND refresh the
            # ORM row inside the lock so each screen merges on top of
            # the latest committed state instead of a stale snapshot.
            _wf_persist_lock = asyncio.Lock()

            # Hero-first generation. Identify the canonical screen — the
            # first hero-tier `kind=screen` entry in the plan. We generate
            # it serially with FULL CREATIVE LATITUDE (no shell-verbatim
            # constraint, no archetype reference), then extract its design
            # DNA (palette / shell / component specimens) and feed that to
            # every other screen in parallel. Sub-screens inherit the
            # USER's design — not a hand-curated archetype template.
            # Slug an entry's id the SAME way `_process_one_screen` derives
            # `screen_id` (id if present, else name; spaces/slashes → `_`), so
            # the hero id we pick here matches the screen the loop generates.
            def _slug_entry(_e) -> str | None:
                _eid = _e.get("id")
                _raw = str(_eid) if _eid else (_e.get("name") or "")
                return _raw.strip().lower().replace(" ", "_").replace("/", "_") or None

            _hero_id: str | None = None
            for _e in plan_entries:
                if _e.get("tier") == "hero" and _e.get("kind", "screen") == "screen":
                    _hero_id = _slug_entry(_e)
                    break
            logger.info(
                "[DIAGRAM] Hero detection — plan_entries tiers: %s",
                [(_e.get("name"), _e.get("kind"), _e.get("tier")) for _e in plan_entries],
            )
            # Decide DNA reuse vs a fresh hero pass:
            #   • No DNA yet (first generation): ALWAYS run a hero pass so the
            #     critique→enrich refinement loop fires. If the plan didn't tag a
            #     `hero` tier, fall back to the first `kind=screen` entry —
            #     otherwise single-screen / untagged plans skip the loop entirely
            #     (observed: a lone `tier=None` screen → hero_id=None → no loop).
            #   • DNA exists + explicit hero in this batch → regenerating the
            #     hero: ignore old DNA, re-run + re-extract from the refined hero.
            #   • DNA exists + no hero this batch → additive turn ("also add a
            #     help center"): reuse the trusted DNA, skip the hero pass.
            _dna_state: dict[str, object] = {}
            try:
                _existing_dna = (
                    (all_diagrams.get("wireframe") or {}).get("design_dna") if isinstance(all_diagrams, dict) else None
                )
                _has_dna = isinstance(_existing_dna, dict) and bool(_existing_dna.get("palette_css"))
                if _has_dna and _hero_id:
                    logger.info(
                        "[DIAGRAM] Existing DNA present but hero %s is in this batch — running a fresh "
                        "hero pass + refinement (DNA will be re-extracted from the refined hero)",
                        _hero_id,
                    )
                elif _has_dna:
                    # Additive turn: no hero this batch, reuse the DNA.
                    _dna_state = dict(_existing_dna)
                    logger.info(
                        "[DIAGRAM] Reusing design DNA from session (additive turn, vibe=%r)",
                        _dna_state.get("vibe_summary", "")[:80],
                    )
                elif _hero_id is None:
                    # No DNA and no explicit hero tier → use the first screen as
                    # the hero so the refinement loop still runs.
                    for _e in plan_entries:
                        if _e.get("kind", "screen") == "screen":
                            _hero_id = _slug_entry(_e)
                            if _hero_id:
                                break
                    if _hero_id:
                        logger.info(
                            "[DIAGRAM] No explicit hero tier — using first screen %s as hero for refinement",
                            _hero_id,
                        )
            except Exception:
                _dna_state = {}

            logger.info(
                "[DIAGRAM] Per-screen loop launching %d screens with concurrency=%d (hero_id=%s, dna_loaded=%s)",
                len(plan_entries),
                _wf_concurrency,
                _hero_id,
                bool(_dna_state),
            )

            async def _process_one_screen(entry):
                screen_name = entry["name"]
                screen_kind = entry.get("kind", "screen")
                screen_trigger = entry.get("trigger_from") or ""
                screen_intent = (entry.get("intent") or "").strip()
                # App-domain signal for reference routing: the title + every
                # screen's name/intent. Lets a finance/loan/debt app route its
                # generically-named screens (Dashboard, Overview…) to the
                # domain reference rather than the bland generic one.
                _app_domain_ctx = " ".join(
                    [str(title)]
                    + [str(_pe.get("name", "")) for _pe in plan_entries if isinstance(_pe, dict)]
                    + [str(_pe.get("intent", "")) for _pe in plan_entries if isinstance(_pe, dict)]
                    + [screen_intent]
                )
                # Honour the plan's id when one was forwarded (via
                # screens_to_pipeline_entries). Otherwise derive a slug
                # from the name. The plan-card status reconciliation only
                # works when ids line up across plan + screen + WS event.
                _entry_id = entry.get("id") if isinstance(entry, dict) else None
                screen_id = (
                    str(_entry_id).strip().lower().replace(" ", "_").replace("/", "_")
                    if _entry_id
                    else screen_name.lower().replace(" ", "_").replace("/", "_")
                )
                logger.info(
                    "[DIAGRAM] Generating wireframe %s: %s (device=%s)",
                    screen_kind,
                    screen_name,
                    target_device,
                )

                try:
                    # ── Generation pass (non-streaming, JSON only) ──
                    spec = kind_specs.get(screen_kind, kind_specs["screen"])
                    is_this_hero = bool(_hero_id) and screen_id == _hero_id
                    # When DNA exists (after the hero pass completes, or
                    # loaded from a previous session), every other screen
                    # uses it as the canonical aesthetic + shell source.
                    # Snapshot to a local so concurrent sub-screens see a
                    # stable view even if _dna_state is updated mid-run.
                    dna_local = dict(_dna_state) if _dna_state else {}
                    dna_block = dna_block_for_subscreen(dna_local) if dna_local else ""
                    dna_shell = (dna_local.get("shell_html") or "").strip() if dna_local else ""

                    if is_this_hero:
                        # HERO MODE — full creative latitude. No shell to
                        # embed (the model designs its own). No archetype
                        # reference. No library crutches. The hero IS the
                        # design system reference for everything that
                        # follows in this session.
                        # Build a nav whitelist + drill-in blacklist from
                        # the plan_entries so the hero knows which screens
                        # belong in the sidebar (nav_visible=True) and
                        # which are drill-in / overlay / auth surfaces
                        # that MUST stay out of nav.
                        _nav_screens: list[str] = []
                        _drill_screens: list[str] = []
                        for _e2 in plan_entries:
                            _nm = (_e2.get("name") or "").strip()
                            if not _nm:
                                continue
                            _kn = _e2.get("kind", "screen")
                            _nv = _e2.get("nav_visible")
                            if _kn != "screen":
                                _drill_screens.append(f"{_nm} ({_kn})")
                            elif _nv is False:
                                _drill_screens.append(_nm)
                            else:
                                _nav_screens.append(_nm)
                        _nav_block = ""
                        if _nav_screens or _drill_screens:
                            _parts: list[str] = []
                            if _nav_screens:
                                _parts.append(
                                    "PRIMARY NAV (sidebar / tab-bar) — render EXACTLY these labels in the nav, in this order, AND NO OTHERS:\n"
                                    + "\n".join(f"  - {n}" for n in _nav_screens)
                                )
                            if _drill_screens:
                                _parts.append(
                                    "DRILL-IN / OVERLAY surfaces — these screens are reached by clicking elements on other screens (table rows, avatars, action buttons, etc.). They MUST NOT appear in the primary nav:\n"
                                    + "\n".join(f"  - {n}" for n in _drill_screens)
                                )
                            _nav_block = "\n".join(_parts)
                        shell_rule = (
                            "- HERO MODE: This is the canonical screen of the app — you are setting the visual "
                            "language for every other screen in this session. Design your OWN header / sidebar / "
                            "topbar / nav as part of this screen. Define a rich :root palette in a <style> block "
                            "at the top using the EXTENDED token vocabulary (bg/bg-soft/bg-raised/bg-hover, "
                            "border/border-strong, good/good-soft, warn/warn-soft, hot/hot-soft, bad/bad-soft, "
                            "accent/accent-soft/accent-line, plus font-sans + font-mono). Choose the aesthetic "
                            "the brief warrants — institutional finance, editorial marketing, terminal-dense, "
                            "consumer-soft, etc. Subsequent screens will inherit your palette and your shell "
                            "VERBATIM, so make this one count."
                        )
                        active_shell_prefix = (
                            f"\n===== SIDEBAR / NAV CONTRACT =====\n{_nav_block}\n===== END NAV CONTRACT =====\n"
                            if _nav_block
                            else ""
                        )
                        # HERO INSPIRATION — inject the hand-curated archetype
                        # reference (loans-ledger, dashboard-stripe, editorial
                        # landing, etc.) as STRUCTURAL SKELETON only. The hero
                        # still invents palette/voice/density for the user's
                        # brand, but borrows the proven layout patterns,
                        # component grammar, and information density of the
                        # reference. Without this, briefs like "loan
                        # management app" get a generic dashboard instead of
                        # something that looks like Bloomberg / Apex / Plaid.
                        hero_reference = reference_block_for_screen(
                            screen_name, screen_kind, app_context=_app_domain_ctx
                        )
                        archetype_ref_prefix = (
                            "\n===== STRUCTURAL SKELETON (inspiration — do NOT copy verbatim) =====\n"
                            "Use this as a reference for LAYOUT PATTERNS, COMPONENT GRAMMAR, "
                            "and INFORMATION DENSITY only. Invent your own palette, typography, "
                            "and copy for the user's brand. Match the structural rhythm "
                            "(KPI row + chart + table; or hero + sections; etc.) — not the colours.\n"
                            f"{hero_reference}\n"
                            "===== END SKELETON =====\n"
                            if hero_reference
                            else ""
                        )
                    elif dna_block:
                        # DNA MODE — sub-screen inherits hero's palette,
                        # component specimens, and shell.
                        if screen_kind == "screen" and dna_shell:
                            shell_rule = (
                                "- SHELL: Embed the APP SHELL below VERBATIM as the outer structure of your html. "
                                "Replace the <main data-slot='content'></main> element with this screen's content "
                                "area. DO NOT redesign the header / sidebar / nav — every screen of this app "
                                "must use the SAME shell."
                            )
                            active_shell_prefix = (
                                "\n===== APP SHELL (embed verbatim) =====\n"
                                + dna_shell
                                + "\n===== END APP SHELL =====\n"
                            )
                        else:
                            shell_rule = f"- {spec['shell_clause']}"
                            active_shell_prefix = ""
                        archetype_ref_prefix = "\n" + dna_block + "\n"
                    else:
                        # LEGACY MODE — no hero, no DNA. Use the previously
                        # synthesised shell + the hand-curated archetype
                        # reference. Path used when the plan has no hero
                        # tier (rare) or the hero pass failed.
                        if screen_kind == "screen":
                            shell_rule = (
                                "- SHELL: Embed the APP SHELL above VERBATIM as the outer structure of your html. "
                                "Replace the empty <main data-slot='content'> element with this screen's content area — "
                                "DO NOT redesign the header / sidebar / tab-bar / nav. They are shared across every screen of this app."
                                if shell_html
                                else ""
                            )
                            active_shell_prefix = shell_prefix
                        else:
                            shell_rule = f"- {spec['shell_clause']}"
                            active_shell_prefix = ""
                        archetype_reference = reference_block_for_screen(
                            screen_name, screen_kind, app_context=_app_domain_ctx
                        )
                        archetype_ref_prefix = (
                            "\n===== REFERENCE EXEMPLAR — match this density and aesthetic, "
                            "adapt copy/labels to the user's domain =====\n"
                            f"{archetype_reference}\n"
                            "===== END REFERENCE =====\n"
                            if archetype_reference
                            else ""
                        )

                    intent_line = (
                        f"Surface intent (what THIS screen does in THIS app): {screen_intent}\n"
                        if screen_intent
                        else ""
                    )
                    library_prefix = ""
                    # In HERO MODE the screen IS the design system — it
                    # shouldn't inherit recipe-derived tone constraints
                    # (which can push it toward an editorial / brutalist /
                    # luxury vibe at odds with the brief). The hero reads
                    # the brief directly and picks the genre. Sub-screens
                    # get the FULL design block (their job is consistency,
                    # not authorship).
                    effective_design_block = "" if is_this_hero else design_block
                    user_prompt = f"""Generate a wireframe {screen_kind} as a SINGLE JSON object.

Surface: "{screen_name}"  (kind: {screen_kind})
{intent_line}Device: {target_device} (PIN — do not change)
Existing screens in this session: {existing_summary}
App context: {conv[-1000:]}
{effective_design_block}{active_shell_prefix}{reference_block}{trigger_block}{library_prefix}{archetype_ref_prefix}
Return ONLY this JSON, no narration, no code fence:
{{"id":"{screen_id}","name":"{screen_name}","kind":"{screen_kind}","device":"{target_device}","html":"<div style='...'> ... </div>"}}

Rules:
- "kind" MUST be exactly "{screen_kind}".
- "device" MUST be exactly "{target_device}".
{shell_rule}
- {spec["size_rule"]}
- {spec["frame_rule"]}
- LAYOUT REUSE: Wherever this surface shares component types with the EXISTING SCREENS above (tables, cards, lists, forms, badges, status pills, action rows, empty states), use the SAME visual treatment — same row density, same card padding, same list-item shape, same badge sizing, same colour-token assignments. Do not reinvent shared patterns; sibling screens must feel like they belong to one product, not five.
- INTERACTIVE WIRING (mandatory): Every clickable element that semantically opens one of the AVAILABLE TRIGGER TARGETS above MUST carry `data-trigger="<id>"` with the matching id. Examples: a primary "Invite user" button on a list → `data-trigger="invite_modal"`; a row's "Edit role" button → `data-trigger="role_editor_drawer"`; "View details" / table-row click that drills into a record → `data-trigger="user_detail"`; a destructive "Suspend selected" → `data-trigger="bulk_suspend_modal"`. Buttons WITHOUT a corresponding target (e.g. "Filters", "Export CSV", "Sort", "Settings cog") MUST NOT be dead ends — handle them inline: emit a SIBLING hidden popover/menu element directly under the trigger button (visibility:hidden by default), and add a small inline `<script>` that toggles its visibility on click. The interactivity layer auto-toggles `data-sim-expanded` on dropdown-shaped elements, but you should still emit the popover content so something visible happens. Never ship a button that does nothing.
- The wireframe MUST visibly express the VARIATION CONSTRAINTS above (LAYOUT, TYPE, COLOR, MOTION, MICRO). Each is a deliberate, named pattern from the design library — implement that pattern literally, don't default to a generic dashboard layout.
- COLOUR RULE: Prefer CSS custom properties so the renderer can re-skin.
  The base 10-token palette is provided (var(--color-bg), --color-surface,
  --color-text, --color-text-muted, --color-accent, --color-on-accent,
  --color-border, --color-success, --color-warning, --color-error). For
  finance / risk / dashboard / terminal-style screens, you MAY define an
  EXTENDED palette in a `<style>:root{{ --bg-soft: ...; --bg-raised: ...;
  --bg-hover: ...; --border-strong: ...; --good: ...; --good-soft: ...;
  --warn-soft: ...; --hot: ...; --hot-soft: ...; --bad: ...; --bad-soft: ...;
  --accent-soft: ...; --accent-line: ...; }}</style>` block at the top of
  the screen so you have the full vocabulary the reference exemplar uses
  (bg/bg-soft/bg-raised/bg-hover, border/border-strong, good/good-soft,
  warn/warn-soft, hot/hot-soft, bad/bad-soft, accent/accent-soft/accent-line).
  Direct hex / rgba is allowed inside that :root declaration only —
  use it to seed the extended tokens, not in body markup.
  In body markup, always reference variables, never literal hex.
- Typography: var(--font-family).
- HTML attribute values use SINGLE quotes (style='...') not double quotes.
- Realistic content (real numbers, names, statuses).
- VOICE / PAGE TITLES (mandatory): This is a TOOL professionals use, not a
  publication they read. Page titles are FUNCTIONAL labels — short, direct,
  data-forward. Use the screen's own name plus operational metadata only.
  ✓ RIGHT: "Loans · 1,847 active · $284.6M outstanding"
  ✓ RIGHT: "Loan Detail · Harbor Coffee Co. · LN-2024-04812"
  ✓ RIGHT: "Underwriting · APP-04901 · Marisol Fernandez"
  ✓ RIGHT: "Delinquency Queue · 87 active workouts"
  ✗ WRONG: "The book of loans, read at a glance."
  ✗ WRONG: "The numbers, read against policy."
  ✗ WRONG: "Applications, in motion."
  ✗ WRONG: "The delinquency desk, Tuesday morning."
  Editorial / newspaper / magazine voice is BANNED in dashboard tools.
  No serif-italic accent words for narrative effect ("read at a glance",
  "in motion"). No "FOLIO", "ISSUE Nº", "MARGINALIA", "EDITOR'S NOTE",
  "FILED UNDER", "TUESDAY MORNING", "VOLUME V". No date-of-publication
  framing. No second-person address. The voice is operational: the
  numbers, the IDs, the actions — like Bloomberg / Stripe / Linear /
  Mercury / Apex Clearing. Marketing landing pages CAN use editorial
  voice — internal tools NEVER.
- BUTTON COMPONENTS (mandatory): EVERY clickable element MUST carry a
  `data-component` attribute matching one of the buttons in the design
  system: button-primary, button-secondary, button-ghost, button-danger,
  button-icon, filter-tab(-active), pagination-button, link-action.
  Naked `<div>Click me</div>` text is forbidden — that produces
  unstyled, undifferentiated buttons. Pick the right variant for the
  role:
  • Primary CTA (one per cluster): button-primary
  • Secondary action (Cancel, Edit, Configure): button-secondary
  • Tertiary / inline action (Reset, Filter): button-ghost
  • Destructive (Delete, Suspend, Remove): button-danger
  • Icon-only (×, ⋯): button-icon  (NEVER an emoji — see ICON RULE)
  • Segmented filter row (All / Active / Pending): filter-tab(-active)
  • Pagination controls (Previous / Next / page numbers): pagination-button
  • Inline link-style action ("Resend", "View all"): link-action
- INTERACTIVITY (mandatory, NON-NEGOTIABLE): EVERY interactive element
  MUST be wired up with working JS. A button that doesn't do anything is
  a bug, not a stylistic choice. A single `<script>` at the bottom of
  the html is enough — use event delegation. Concrete checklist:

  CATEGORY A · STATEFUL TOGGLES (every screen probably has these):
  • Filter-tab strips (All / Current / 30 DPD / 60 DPD / 90+ DPD / Charged off):
      clicking ANY tab in the strip moves the `.active` (or whatever your
      active class is) onto it and clears it from siblings. Mandatory pattern
      (event delegation on the parent group, single listener):
        document.querySelectorAll('.filter-tabs').forEach(g => g.addEventListener('click', e => {{
          const b = e.target.closest('button'); if (!b || b.parentElement !== g) return;
          g.querySelectorAll('button').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
        }}));
      Same pattern for: range pickers (1D/1W/MTD/QTD), status toggles,
      view-mode pickers (List / Kanban / Calendar), tab nav inside detail
      panels, segmented controls anywhere.
  • Sidebar nav items: clicking moves `.active` onto the clicked item.
  • Settings sub-nav: same.
  • Detail-page tabs (Amortisation / Payments / Documents / Audit): same.
  • Kanban / breakdown rows: row hover already via CSS — clicking opens
    detail or stays no-op (acceptable).

  CATEGORY B · DROPDOWNS (anything in the topbar):
  • User avatar / username pill in top-right: clicking opens a small
    `<div role="menu">` directly under it with items like "Account",
    "Switch role", "Log out". Toggle visibility with a hidden class.
  • Notification bell: clicking opens a notifications panel below it
    (3-5 items with timestamp + body).
  • "Columns" / "Sort by" / "Group by" / "Export" menus on tables:
    same pattern. Render the menu as a sibling element, hidden by
    default, toggled on click. Click outside closes.
  • Kebab (⋯) menus on table rows: same.
  • Search box: clicking opens a command-palette panel with recent
    results / shortcuts.

  CATEGORY C · OVERLAYS (ALL `data-trigger="<id>"` elements):
  • Already covered by INTERACTIVE WIRING above. Make sure the
    data-trigger attr is present on every drill-in / modal / drawer
    trigger.

  CATEGORY D · INLINE FIELD STATE:
  • Checkboxes (`.row-checkbox` or `[role=checkbox]`) toggle a `.checked`
    class on click; clicking the column-header checkbox toggles all
    rows. Selection count updates a `.selection-count` text element if
    present. Bulk-action toolbar appears when count > 0.
  • Inputs accept typed text. Don't disable.
  • Switches / toggles flip on click.
  • Removable chips with × icon: clicking × fades + removes the chip.
  • Sortable column headers: clicking flips the sort indicator (▲ ↔ ▼).

  CATEGORY E · DATA FILTERING (NOT decoration — must actually filter):
  Filter tab strips, search inputs, multi-select chip pickers, status
  pills, and segmented range pickers MUST hide/show rows. A filter that
  toggles a `.active` class but leaves every row visible is broken.
  Pattern (mandatory — copy this shape):
    1. Tag every filterable row with data attributes carrying its
       canonical values, e.g.
         <tr data-status="overdue" data-bucket="60" data-search="acme cap loan #4821 john doe">
    2. Filter tab click handler reads `data-filter` from the clicked tab
       and shows/hides rows whose data-status matches:
         document.querySelectorAll('[data-filter-group]').forEach(g => g.addEventListener('click', e => {{
           const t = e.target.closest('[data-filter]'); if (!t || t.parentElement !== g) return;
           g.querySelectorAll('[data-filter]').forEach(x => x.classList.remove('active'));
           t.classList.add('active');
           const v = t.getAttribute('data-filter');
           const targetSel = g.getAttribute('data-filter-target') || 'tbody tr';
           document.querySelectorAll(targetSel).forEach(r => {{
             r.style.display = (v === 'all' || r.getAttribute('data-status') === v) ? '' : 'none';
           }});
         }}));
    3. Search input listens on `input` events; lowercases its value and
       hides rows whose `data-search` doesn't include it:
         document.querySelectorAll('input[type=search],input[data-search-target]').forEach(inp => inp.addEventListener('input', e => {{
           const q = (e.target.value || '').toLowerCase().trim();
           const sel = e.target.getAttribute('data-search-target') || 'tbody tr';
           document.querySelectorAll(sel).forEach(r => {{
             const hay = (r.getAttribute('data-search') || r.textContent || '').toLowerCase();
             r.style.display = !q || hay.includes(q) ? '' : 'none';
           }});
         }}));
    4. Empty-state row (`<tr class="empty-state" hidden>No results.</tr>`)
       — the script reveals it when zero visible rows remain after a
       filter pass; hides it when any row is visible.
  These three handlers are MANDATORY whenever the screen has filter
  tabs, search inputs, or chip pickers above a list/table. Wire them up
  even if the data is fake — the user is testing whether the surface
  FEELS responsive, not whether it runs SQL.

  Use plain vanilla JavaScript inside one or more `<script>` tags. No
  external libraries, no framework imports, no fetches. Keep the script
  small and self-contained — it must run inline as soon as the screen
  mounts. The scripts run in a sandbox with `allow-scripts allow-same-origin`.

- CHECKBOX STYLING (mandatory): Checkboxes (`.row-checkbox`,
  `[role="checkbox"]`) are NOT default browser inputs. Custom-style:
  14×14px, 1px border in `var(--border-strong)` or `var(--border)`,
  `var(--radius-sm)` corners, background `var(--bg)`. When `.checked`:
  background `var(--accent)`, border `var(--accent)`, with a
  white/`var(--bg)` checkmark via `clip-path` or inline SVG. NO blue
  default checkboxes. NO empty unstyled squares — they read as
  placeholders, not interactive elements.
- WIZARD / MULTI-STEP CONSISTENCY (mandatory for drawers + modals with
  step rails): When you render a multi-step wizard, the step COUNT must
  be CONSISTENT everywhere on the surface. If the rail shows 5 steps
  (Applicant / Financials / Collateral / Terms / Review), the header
  metadata reads "STEP 2 of 5" or "DRAFT · 2 of 5" — never "4 OF 9" or
  any number that doesn't match the rail. The footer + the rail + the
  header all reference the SAME total.
- WIZARD FOOTER ACTIONS (mandatory): Every multi-step wizard MUST have
  a primary CTA in the footer to advance to the next step. The exact
  shape:
    LEFT side:    [ Discard ] (ghost / link-action)
    RIGHT side:   [ ← Back ] (secondary, hidden / disabled on step 1)
                  [ Save draft ] (secondary)
                  [ Continue → ] / [ Next step → ] (PRIMARY — accent)
    On the LAST step, replace "Continue →" with "Submit application"
    (or domain-equivalent: "Approve & fund", "Send for signature", etc).
    A wizard without a primary forward action is a bug — the user has
    no way to advance. NEVER omit the Continue button just because
    Save-draft exists.
- DRAWER LAYOUT (when screen_kind == "drawer"): Drawer width is 560px on
  desktop / 440px on tablet / 340px on mobile. That's enough for ONE
  two-column form ROW (label + value) but NOT for two side-by-side
  full-data columns (income statement | balance sheet). Stack sections
  vertically. Within a single section a 2-column key/value grid is
  fine (label + mono value). Sub-sections > 2 columns will OVERFLOW
  and clip — never do them. Use a vertical scroll inside the drawer
  body for long forms; keep the head + footer fixed.
- STATIC ROWS, NOT DYNAMIC JS GENERATION (mandatory): Render every table
  row, list item, kanban card, payment-history row, etc. as STATIC HTML
  written out element-by-element. Do NOT build row content via JS at
  runtime — no IIFEs returning row strings, no .map(...).join('') inside
  a tbody, no template-literal interpolation of array data into row
  markup. Those patterns regularly render as VISIBLE TEXT inside the
  iframe (the model forgets to wrap them properly) and corrupt the
  screen. Just write 8-14 literal <tr>...</tr> rows with realistic data
  spelled out. JS is for INTERACTIVITY ONLY (toggling classes, opening
  menus, swapping visible content panels). NEVER for generating row markup.
- ICON RULE (mandatory): NEVER use emoji glyphs (👥 👤 📋 ⚙️ 🔑 📊 🏠 🔍 ⭐ 🔔 📨 📁 ▶ etc.) anywhere in the UI. They make B2B / institutional tools look like consumer toys — that's the cheap-emoji-dashboard tell that kills credibility. Two acceptable patterns, in order of preference:
  1. NO icon — just the text label with strong typographic hierarchy (font-weight + size + colour). Linear and Stripe Dashboard do this for the majority of nav items, table headers, and inline actions.
  2. Inline `<svg>` (12–16px, stroke-based, currentColor) for functional glyphs only — search → magnifier svg, close → `×` literal or svg, chevron → `▾` literal or svg, plus → `+` literal or svg. One minimal `<path>`, single stroke, no fills.
  Acceptable Unicode shapes (sparingly, only where they read as ui glyphs not pictographs): `× ✕ ✓ → ← ↑ ↓ ▾ ▴ ▸ • ◯ ◆ +`. Forbidden: any emoji codepoint (U+1F300–1F9FF), any colourful pictograph (🎯 ⚡ 🚀 etc.), any flag/animal/face emoji.
{("- DO NOT render an iOS status bar (no 9:41 / signal / battery / notch). The renderer already provides the device chrome on top of your HTML. Your content starts BELOW that." if screen_kind == "screen" and target_device in ("mobile", "tablet") else "")}
- Return ONLY the JSON object. No prose, no explanations, no code fences.
"""
                    # Stream Opus 4.7 with extended thinking — yields
                    # ('thinking', txt) tuples for the reasoning block and
                    # plain str for the actual JSON output. The reasoning
                    # streams live to the user (real model thoughts about
                    # applying the spec, not Haiku theatre).
                    await manager.send_to(
                        session_id,
                        {"type": "screen_thinking", "payload": {"screen_id": screen_id, "reset": True}},
                    )
                    text_buf: list[str] = []
                    thinking_buf: list[str] = []
                    last_thinking_flush = 0
                    # 32k for hero screens — typical hi-fi dashboard with
                    # real density runs 12-18k output tokens. Sub-screens
                    # ride the DNA and produce smaller HTML, but the cap
                    # is a soft ceiling so over-provisioning is harmless.
                    #
                    # Hero pass: `wireframe` role + extended thinking. Sub-
                    # screens: `wireframe_subscreen` role (Sonnet 4.6, no
                    # thinking) — they're pattern-matching once DNA is set,
                    # so the thinking budget is wasted and the latency cost
                    # isn't worth it. Live thinking deltas continue to
                    # stream for the hero only.
                    _screen_ai = ai if is_this_hero else subscreen_ai
                    _enable_thinking = is_this_hero
                    _thinking_budget = 8192 if is_this_hero else 0
                    async for chunk in _screen_ai.chat_stream(
                        system=system_prompt,
                        messages=[{"role": "user", "content": user_prompt}],
                        max_tokens=32768,
                        enable_thinking=_enable_thinking,
                        thinking_budget=_thinking_budget,
                    ):
                        if isinstance(chunk, tuple) and chunk[0] == "thinking":
                            thinking_buf.append(chunk[1])
                            # Flush every ~120 chars so the UI sees progress
                            # without firing a WS frame per token.
                            joined_len = sum(len(t) for t in thinking_buf)
                            if joined_len - last_thinking_flush > 120:
                                last_thinking_flush = joined_len
                                await manager.send_to(
                                    session_id,
                                    {
                                        "type": "screen_thinking",
                                        "payload": {
                                            "screen_id": screen_id,
                                            "replace": True,
                                            "text": "".join(thinking_buf),
                                        },
                                    },
                                )
                        elif isinstance(chunk, str):
                            text_buf.append(chunk)
                        elif isinstance(chunk, tuple) and chunk[0] == "usage":
                            usage = chunk[1]
                            metrics.record_ai_call(
                                model=usage.get("model", "unknown"),
                                purpose=f"screen_gen:{screen_kind}",
                                input_tokens=int(usage.get("input_tokens", 0)),
                                output_tokens=int(usage.get("output_tokens", 0)),
                                cache_creation_tokens=int(usage.get("cache_creation_input_tokens", 0)),
                                cache_read_tokens=int(usage.get("cache_read_input_tokens", 0)),
                            )
                    # Final flush of thinking text so the UI shows the full
                    # reasoning even if the last chunk landed mid-flush window.
                    if thinking_buf:
                        await manager.send_to(
                            session_id,
                            {
                                "type": "screen_thinking",
                                "payload": {
                                    "screen_id": screen_id,
                                    "replace": True,
                                    "text": "".join(thinking_buf),
                                },
                            },
                        )
                    screen_raw = "".join(text_buf).strip()
                    logger.info(
                        "[DIAGRAM] Opus stream done: thinking_chars=%d output_chars=%d",
                        sum(len(t) for t in thinking_buf),
                        len(screen_raw),
                    )
                    if screen_raw.startswith("```"):
                        screen_raw = screen_raw.split("\n", 1)[1] if "\n" in screen_raw else screen_raw[3:]
                        if screen_raw.endswith("```"):
                            screen_raw = screen_raw[:-3]
                        screen_raw = screen_raw.strip()
                    import re as _re

                    screen_raw = _re.sub(r'(?<!\\)\\(?!["\\/bfnrtu])', r"\\\\", screen_raw)
                    try:
                        screen_obj = json.loads(screen_raw)
                    except json.JSONDecodeError as parse_err:
                        # Lenient fallback. AI commonly emits unescaped quotes
                        # inside the html string ('style="..."') which kills
                        # strict JSON. Pull each field out independently:
                        #   - id / name / device by simple key→value regex
                        #   - html as everything between `"html":"` and the
                        #     LAST `"` in the message
                        logger.warning(
                            "[DIAGRAM] Strict JSON parse failed (%s); attempting lenient extract. raw[:200]=%r",
                            parse_err,
                            screen_raw[:200],
                        )

                        raw_for_scan = screen_raw

                        def _grab(field: str) -> str | None:
                            mm = _re.search(rf'"{field}"\s*:\s*"([^"]*)"', raw_for_scan)
                            return mm.group(1) if mm else None

                        sid = _grab("id") or screen_id
                        sname = _grab("name") or screen_name
                        sdevice = _grab("device") or target_device
                        html_open = raw_for_scan.find('"html"')
                        if html_open == -1:
                            logger.error("[DIAGRAM] lenient FAILED: no 'html' key. raw[:300]=%r", raw_for_scan[:300])
                            raise
                        colon = raw_for_scan.find(":", html_open)
                        first_quote = raw_for_scan.find('"', colon + 1)
                        if first_quote == -1:
                            logger.error(
                                "[DIAGRAM] lenient FAILED: no opening quote after html. raw[:200]=%r",
                                raw_for_scan[:200],
                            )
                            raise

                        # Locate the closing JSON quote. The closing `"`
                        # must be followed (after optional whitespace) by
                        # either `,` (next field), `}` (close object), or
                        # the very end of the string. Any `"` inside the
                        # html body sits between tag chars (`>`, `<`,
                        # `=`, etc.) — never followed by `,}` boundaries.
                        # rfind alone was wrong because the LAST `"` is
                        # often the closing quote of an attribute value,
                        # not the JSON terminator. The old code paired
                        # this with `last_quote <= first_quote` which
                        # only triggered on truncation, missing the much
                        # more common case where the JSON terminates
                        # cleanly but earlier attribute quotes confuse
                        # the strict parser.
                        _close_match = None
                        for _m in _re.finditer(r'"\s*([,}])', raw_for_scan):
                            if _m.start() > first_quote:
                                _close_match = _m
                        if _close_match is not None:
                            last_quote = _close_match.start()
                            html_value = raw_for_scan[first_quote + 1 : last_quote]
                        elif raw_for_scan.rstrip().endswith('"'):
                            # Truly clean termination: trailing `"` is
                            # the JSON close (no fields after html).
                            last_quote = raw_for_scan.rstrip().rfind('"')
                            html_value = raw_for_scan[first_quote + 1 : last_quote]
                        else:
                            # Truncated mid-html — no closing JSON quote.
                            # Take everything from first_quote+1 to end
                            # and treat it as the html body.
                            html_value = raw_for_scan[first_quote + 1 :]
                            if html_value and not html_value.rstrip().endswith(">"):
                                html_value = html_value + "</div>"
                            logger.warning(
                                "[DIAGRAM] lenient: truncated html, salvaged %d chars",
                                len(html_value),
                            )

                        # Unescape JSON string escapes that the AI emitted
                        # correctly (e.g. \", \\, \n) so the html body
                        # renders cleanly in the iframe.
                        html_value = (
                            html_value.replace('\\"', '"')
                            .replace("\\n", "\n")
                            .replace("\\t", "\t")
                            .replace("\\\\", "\\")
                        )
                        if not html_value.strip():
                            logger.error(
                                "[DIAGRAM] lenient FAILED: empty html. raw[:300]=%r",
                                raw_for_scan[:300],
                            )
                            raise
                        screen_obj = {"id": sid, "name": sname, "device": sdevice, "html": html_value}
                        logger.info(
                            "[DIAGRAM] Screen '%s' parsed via lenient fallback (html_len=%d)",
                            screen_name,
                            len(html_value),
                        )
                    # Belt-and-braces: even if the AI ignored the device/kind
                    # rules, pin them so the canvas doesn't render a mixed-
                    # device zone or mis-render an overlay as a screen.
                    if isinstance(screen_obj, dict):
                        screen_obj["device"] = target_device
                        screen_obj["kind"] = screen_kind
                        if screen_trigger and screen_kind != "screen":
                            screen_obj["trigger_from"] = screen_trigger
                        # Tokenise inline colour values so token swaps work
                        # without requiring an AI re-issue. Uses the design
                        # system the design panel already generated for this
                        # session (or a no-op if the AI didn't honour the rule
                        # AND no design tokens exist yet).
                        try:
                            from ..services.wireframe_sanitizer import sanitize_wireframe_html

                            ds_for_sanitize = (
                                (all_diagrams.get("design") or {}).get("design_system")
                                if isinstance(all_diagrams, dict)
                                else None
                            )
                            original_html = screen_obj.get("html") or ""
                            screen_obj["html"] = sanitize_wireframe_html(original_html, ds_for_sanitize)
                            if screen_obj["html"] != original_html:
                                logger.info("[DIAGRAM] Sanitised inline colours for screen '%s'", screen_name)
                        except Exception as san_err:
                            logger.warning("[DIAGRAM] Sanitiser failed for '%s': %s", screen_name, san_err)
                    all_screens.append(screen_obj)
                    logger.info(
                        "[DIAGRAM] SCREEN OK id=%s name=%s html_len=%d total_so_far=%d",
                        screen_obj.get("id") if isinstance(screen_obj, dict) else "?",
                        screen_name,
                        len(screen_obj.get("html") or "") if isinstance(screen_obj, dict) else 0,
                        len(all_screens),
                    )

                    # Broadcast progressive update — each screen appears as it's ready.
                    # The per-screen pipeline now generates Opus 4.7 hi-fi HTML
                    # (shell-first architecture), so this broadcast IS hi-fi.
                    # Tagging it as "low" caused the frontend to render boxes
                    # of stripped text instead of the generated iframe.
                    progressive_diagram = {
                        "type": "wireframe",
                        "title": title,
                        "screens": all_screens,
                        "fidelity": "high",
                    }
                    # Serialise the read-mutate-commit so concurrent
                    # screens can't trample each other's state. Refresh
                    # from DB inside the lock so we merge on top of the
                    # latest commit (e.g. another screen that just landed,
                    # the hero pass that just persisted DNA, plan flips
                    # done elsewhere mid-run).
                    async with _wf_persist_lock:
                        try:
                            await db.refresh(session_obj, attribute_names=["diagram_state"])
                        except Exception:
                            # refresh can fail if the row was never flushed
                            # — fall back to whatever's on the ORM object.
                            pass
                        _latest_state = dict(session_obj.diagram_state or {})
                        if "type" in _latest_state and "wireframe" not in _latest_state:
                            _legacy_t = _latest_state.get("type")
                            _latest_state = {_legacy_t: _latest_state}
                        _latest_wf = dict(_latest_state.get("wireframe") or {})
                        # Sync local `all_diagrams` so the next screen sees
                        # the freshest state (DNA, plan tier flips, etc.).
                        all_diagrams.clear()
                        all_diagrams.update(_latest_state)
                        # Preserve sibling sub-keys (plan, design_dna, etc.)
                        # set by other concurrent screens or the hero pass.
                        for _k, _v in _latest_wf.items():
                            if _k not in progressive_diagram:
                                progressive_diagram[_k] = _v
                        # Mark the matching plan screen as generated so the
                        # plan card / Inspector reflects reality after refresh.
                        _plan_dict = progressive_diagram.get("plan") if isinstance(progressive_diagram, dict) else None
                        if isinstance(_plan_dict, dict):
                            _plan_screens = _plan_dict.get("screens")
                            if isinstance(_plan_screens, list):
                                _changed_plan = False
                                _new_plan_screens = []
                                for _ps in _plan_screens:
                                    if (
                                        isinstance(_ps, dict)
                                        and _ps.get("id") == screen_id
                                        and _ps.get("status") != "generated"
                                    ):
                                        _ps = {**_ps, "status": "generated"}
                                        _changed_plan = True
                                    _new_plan_screens.append(_ps)
                                if _changed_plan:
                                    _plan_dict = {**_plan_dict, "screens": _new_plan_screens}
                                    progressive_diagram["plan"] = _plan_dict
                        all_diagrams["wireframe"] = progressive_diagram
                        session_obj.diagram_state = all_diagrams
                        await db.commit()
                    logger.info(
                        "[DIAGRAM] PROGRESSIVE broadcast wireframe screens=%d",
                        len(all_screens),
                    )
                    await manager.send_to(
                        session_id,
                        {
                            "type": "diagram_update",
                            "payload": progressive_diagram,
                        },
                    )
                    # Dual-write wireframe event
                    try:
                        from ..services.event_writer import write_wireframe_event

                        await write_wireframe_event(
                            session_id=session_id,
                            screen_name=screen_name,
                            description=None,
                            element_count=len(screen_obj.get("elements", [])) if isinstance(screen_obj, dict) else 0,
                            db=db,
                        )
                    except Exception:
                        logger.warning("[DIAGRAM] Failed to write wireframe event", exc_info=True)
                except Exception as screen_err:
                    logger.error("[DIAGRAM] Screen '%s' failed: %s", screen_name, screen_err)
                    # Mark the matching plan entry as `failed` so the plan
                    # card count stops lying ("14 screens" when only 12
                    # actually rendered). Use the same persist lock as the
                    # success path so we don't trample sibling commits.
                    try:
                        async with _wf_persist_lock:
                            try:
                                await db.refresh(session_obj, attribute_names=["diagram_state"])
                            except Exception:
                                pass
                            _fstate = dict(session_obj.diagram_state or {})
                            _fwf = dict(_fstate.get("wireframe") or {})
                            _fplan = dict(_fwf.get("plan") or {})
                            _fscreens = list(_fplan.get("screens") or [])
                            _changed_f = False
                            _new_fscreens = []
                            for _ps in _fscreens:
                                if (
                                    isinstance(_ps, dict)
                                    and _ps.get("id") == screen_id
                                    and _ps.get("status") not in ("generated", "removed", "failed")
                                ):
                                    _ps = {**_ps, "status": "failed"}
                                    _changed_f = True
                                _new_fscreens.append(_ps)
                            if _changed_f:
                                _fplan["screens"] = _new_fscreens
                                _fwf["plan"] = _fplan
                                _fstate["wireframe"] = _fwf
                                session_obj.diagram_state = _fstate
                                await db.commit()
                                all_diagrams.clear()
                                all_diagrams.update(_fstate)
                                # Broadcast plan_updated so the plan card
                                # picks up the failed badge immediately.
                                try:
                                    await manager.send_to(
                                        session_id,
                                        {"type": "plan_updated", "payload": _fplan},
                                    )
                                except Exception:
                                    pass
                    except Exception:
                        logger.warning("[DIAGRAM] Failed-status persist failed for '%s'", screen_name, exc_info=True)

            async def _bounded_screen(_e):
                """Acquire the wireframe semaphore for the duration of one
                screen — caps live AI calls at WIREFRAME_CONCURRENCY so we
                don't trip Anthropic rate limits or pile up token usage."""
                async with _wf_sem:
                    return await _process_one_screen(_e)

            _start_t = time.time()

            # ── Hero-first phase ──
            # If we identified a hero AND don't already have DNA from a
            # previous run, generate the hero serially so we can extract
            # its design DNA before launching the rest in parallel.
            _hero_entry = None
            if _hero_id and not _dna_state:
                _hero_entry = next(
                    (e for e in plan_entries if _slug_entry(e) == _hero_id),
                    None,
                )

            _remaining_entries = list(plan_entries)
            if _hero_entry is not None:
                logger.info("[DIAGRAM] Generating hero first: %s (id=%s)", _hero_entry.get("name"), _hero_id)
                try:
                    await _process_one_screen(_hero_entry)
                except Exception as _hero_err:
                    logger.warning(
                        "[DIAGRAM] Hero generation failed (%s) — falling back to legacy parallel path", _hero_err
                    )
                # Pull the hero's HTML out of all_screens to extract DNA.
                _hero_screen = next(
                    (s for s in all_screens if isinstance(s, dict) and s.get("id") == _hero_id),
                    None,
                )
                _hero_html = (_hero_screen or {}).get("html") or ""

                # ── Hero refinement loop ──
                # Lift the cheap DeepSeek draft toward expensive-single-shot
                # quality via an Opus critique → DeepSeek enrich loop BEFORE
                # extracting DNA, so the whole app inherits the richer
                # language. Gated by a flag; every failure degrades to the
                # raw draft and never blocks generation.
                _refine_settings = get_settings()
                if _hero_html and getattr(_refine_settings, "wireframe_refine_enabled", True):
                    try:
                        from ..services import wireframe_refine as _refine
                        from ..services.wireframe_sanitizer import sanitize_wireframe_html

                        _critic_ai = await get_ai_client_for_role(
                            oid, db, "wireframe_critic", session_id=session_id
                        )

                        async def _critique_fn(_html: str):
                            try:
                                _raw = await _critic_ai.chat(
                                    system=_refine.CRITIC_SYSTEM,
                                    messages=[{"role": "user", "content": _refine.build_critic_prompt(_html)}],
                                    max_tokens=2048,
                                    temperature=0.0,
                                )
                            except Exception as _ce:
                                logger.warning("[REFINE] critic call failed: %s", _ce)
                                return None
                            return _refine.parse_critique(_raw)

                        async def _enrich_fn(_html: str, _gaps):
                            try:
                                return await ai.chat(
                                    system=_refine.ENRICH_SYSTEM,
                                    messages=[{"role": "user", "content": _refine.build_enrich_prompt(_html, _gaps)}],
                                    max_tokens=32768,
                                    temperature=0.4,
                                )
                            except Exception as _ee:
                                logger.warning("[REFINE] enrich call failed: %s", _ee)
                                return None

                        _refine_result = await _refine.run_refinement(
                            initial_html=_hero_html,
                            critique_fn=_critique_fn,
                            enrich_fn=_enrich_fn,
                            threshold=int(getattr(_refine_settings, "wireframe_refine_threshold", 85)),
                            max_passes=int(getattr(_refine_settings, "wireframe_refine_max_passes", 3)),
                        )
                        logger.info(
                            "[REFINE] hero refined: passes=%d final_score=%s history=%s",
                            _refine_result.passes,
                            _refine_result.final_score,
                            _refine_result.history,
                        )
                        if _refine_result.html and _refine_result.html != _hero_html:
                            try:
                                _ds_for_refine = (
                                    (all_diagrams.get("design") or {}).get("design_system")
                                    if isinstance(all_diagrams, dict)
                                    else None
                                )
                                _refined_html = sanitize_wireframe_html(_refine_result.html, _ds_for_refine)
                            except Exception:
                                _refined_html = _refine_result.html
                            _hero_html = _refined_html
                            if _hero_screen is not None:
                                _hero_screen["html"] = _refined_html
                            # Persist + broadcast the refined hero now. Each
                            # `_process_one_screen` re-broadcasts the full
                            # `all_screens`, so the multi-screen path would pick
                            # the refined hero up on the next sub-screen commit —
                            # but a hero-only plan has no follow-up commit, so
                            # without this it would keep showing the draft.
                            try:
                                _refined_diagram = {
                                    "type": "wireframe",
                                    "title": title,
                                    "screens": all_screens,
                                    "fidelity": "high",
                                }
                                async with _wf_persist_lock:
                                    try:
                                        await db.refresh(session_obj, attribute_names=["diagram_state"])
                                    except Exception:
                                        pass
                                    _rstate = dict(session_obj.diagram_state or {})
                                    if "type" in _rstate and "wireframe" not in _rstate:
                                        _rstate = {_rstate.get("type"): _rstate}
                                    _rwf = dict(_rstate.get("wireframe") or {})
                                    # Preserve sibling sub-keys (plan, design_dna)
                                    # set elsewhere; only the screens change here.
                                    for _k, _v in _rwf.items():
                                        if _k not in _refined_diagram:
                                            _refined_diagram[_k] = _v
                                    _rstate["wireframe"] = _refined_diagram
                                    session_obj.diagram_state = _rstate
                                    await db.commit()
                                    all_diagrams.clear()
                                    all_diagrams.update(_rstate)
                                await manager.send_to(
                                    session_id,
                                    {"type": "diagram_update", "payload": _refined_diagram},
                                )
                            except Exception:
                                logger.warning(
                                    "[REFINE] refined-hero persist/broadcast failed (continuing)",
                                    exc_info=True,
                                )
                    except Exception:
                        logger.warning("[REFINE] refinement loop failed — using raw hero", exc_info=True)

                if _hero_html:
                    try:
                        logger.info("[DIAGRAM] Extracting design DNA from hero (html_len=%d)", len(_hero_html))
                        _new_dna = await extract_design_dna(_hero_html, org_id=oid, db=db)
                        if _new_dna and (_new_dna.get("palette_css") or _new_dna.get("shell_html")):
                            _dna_state = _new_dna
                            logger.info(
                                "[DIAGRAM] DNA extracted: shell_present=%s, accent=%s, vibe=%r",
                                _new_dna.get("shell_present"),
                                _new_dna.get("accent_color"),
                                (_new_dna.get("vibe_summary") or "")[:80],
                            )
                            # Persist on session so additive turns reuse it.
                            # Wrap in the persist lock + refresh so a
                            # concurrent sub-screen commit can't drop the DNA.
                            try:
                                async with _wf_persist_lock:
                                    try:
                                        await db.refresh(session_obj, attribute_names=["diagram_state"])
                                    except Exception:
                                        pass
                                    _state2 = dict(session_obj.diagram_state or {})
                                    _wf2 = dict(_state2.get("wireframe") or {})
                                    _wf2["design_dna"] = _new_dna
                                    _state2["wireframe"] = _wf2
                                    session_obj.diagram_state = _state2
                                    await db.commit()
                                    # Sync local mirror so sub-screens
                                    # built from `all_diagrams` see DNA.
                                    all_diagrams.clear()
                                    all_diagrams.update(_state2)
                            except Exception:
                                logger.warning("[DIAGRAM] DNA persist failed (continuing)", exc_info=True)
                    except Exception as _dna_err:
                        logger.warning(
                            "[DIAGRAM] DNA extraction failed (%s) — sub-screens fall back to legacy refs", _dna_err
                        )
                _remaining_entries = [e for e in plan_entries if e is not _hero_entry]

            # ── Parallel phase ──
            await asyncio.gather(
                *(_bounded_screen(_e) for _e in _remaining_entries),
                return_exceptions=True,
            )
            logger.info(
                "[DIAGRAM] All wireframe screens done: %d screens in %.1fs (hero=%s, dna=%s)",
                len(all_screens),
                time.time() - _start_t,
                bool(_hero_entry),
                bool(_dna_state),
            )

            # ── Re-run the flow companion now that every screen exists ──
            # The pre-flight flow runs BEFORE generation and only sees the
            # planned names, so it can't link nodes to the actual screen ids
            # produced this turn (especially for new modals/drawers added
            # mid-conversation). A second pass after generation refreshes
            # the flow so it picks up the new screens.
            try:
                flow_ai_post = await get_ai_client_for_role(oid, db, "flow")
                # Build the brief from the freshly-persisted screens.
                wf_screens_post = [
                    {
                        "id": s.get("id"),
                        "name": s.get("name"),
                        "kind": s.get("kind") or "screen",
                    }
                    for s in all_screens
                    if isinstance(s, dict) and s.get("id")
                ]
                wf_brief_post = json.dumps(wf_screens_post)
                existing_flow_post = (
                    json.dumps(all_diagrams.get("flow", {})) if "flow" in all_diagrams else "(none yet)"
                )
                flow_raw_post, _fp_in, _fp_out = await flow_ai_post.chat_with_full_usage(
                    system="You generate compact user-flow diagram JSON. Return ONLY JSON, no prose.",
                    messages=[
                        {
                            "role": "user",
                            "content": f"""UPDATE the user-flow diagram now that the wireframe screens are finalised.

EXISTING FLOW (extend, do not start from scratch):
{existing_flow_post}

WIREFRAME SCREENS (link flow nodes to these via screenId where the node represents arriving at one of them; modals/drawers represent transient overlays — link from the node where the user opens them):
{wf_brief_post}

CONVERSATION:
{conv[-1500:]}

Return ONLY this JSON shape:
{{"type":"flow","title":"User Flow","nodes":[{{"id":"n1","label":"User opens app","shape":"start"}},{{"id":"n2","label":"View dashboard","shape":"process","screenId":"dashboard"}}],"edges":[{{"from":"n1","to":"n2","label":"optional"}}]}}

Rules:
- Structure the diagram as a HIGH-LEVEL SPINE plus SUB-FLOWS, not one giant graph.
  The main spine = entry → auth → onboarding → home → (one parent node per feature area) → sign out.
  Each feature area gets pulled OUT into its own sub-flow, regardless of how many total nodes the product has. Don't choose by size — choose by topic.
- Canonical sub-flow areas (emit each one that genuinely applies to this product, skip those that don't): `auth` (sign up / sign in / forgot / email verify / expired link), `onboarding`, `create`, `edit`, `delete` (with confirm + undo), `share`, `search_filter` (search + filter + sort), `bulk` (multi-select actions), `settings`, `notifications` (permission prompt + due-fire + deep-link), `offline` (queue + sync + conflict resolution), `errors` (retry banners + validation failures), `sign_out`. Add product-specific sub-flows when the domain calls for them.
- For each sub-flow, emit a PARENT node on the main spine with `subflowIds: ["sub_<area>_1", "sub_<area>_2", ...]` pointing at the cluster's internal nodes.
- Internal sub-flow node ids MUST be prefixed `sub_<area>_<n>` (e.g. `sub_auth_1`, `sub_auth_2`). Sub-flow nodes connect to each other to form their own internal chain — do NOT connect them back to the main spine.
- Use shape "decision" liberally for every branch (yes/no, valid?, retry?, confirm?, online?).
- Reuse existing node ids when the meaning is the same; only add NEW ids for new branches/screens.
- Add nodes for modals/drawers/popovers when they represent a meaningful step in the user's journey.
- For nodes that represent the user landing on a wireframe screen, set "screenId" to the matching id from the list above.
- Edge labels mark branch outcomes ("yes" / "no" / "retry" / "cancel" / "<5s" / "timeout").
- No markdown. Compact JSON.""",
                        }
                    ],
                    max_tokens=4000,
                )
                metrics.record_ai_call(
                    model=flow_ai_post.model,
                    purpose="flow_post_gen",
                    input_tokens=_fp_in,
                    output_tokens=_fp_out,
                )
                flow_raw_post = flow_raw_post.strip()
                if flow_raw_post.startswith("```"):
                    flow_raw_post = flow_raw_post.split("\n", 1)[1] if "\n" in flow_raw_post else flow_raw_post[3:]
                    if flow_raw_post.endswith("```"):
                        flow_raw_post = flow_raw_post[:-3]
                    flow_raw_post = flow_raw_post.strip()
                try:
                    flow_diagram_post = json.loads(flow_raw_post)
                except Exception as flow_parse_err:
                    logger.warning("[DIAGRAM] Post-gen flow JSON parse failed: %s", flow_parse_err)
                    flow_diagram_post = None
                if isinstance(flow_diagram_post, dict) and flow_diagram_post.get("type") == "flow":
                    all_diagrams["flow"] = flow_diagram_post
                    session_obj.diagram_state = all_diagrams
                    await db.commit()
                    await manager.send_to(
                        session_id,
                        {"type": "diagram_update", "payload": flow_diagram_post},
                    )
                    logger.info(
                        "[DIAGRAM] FLOW post-gen update broadcast: %d nodes", len(flow_diagram_post.get("nodes", []))
                    )
            except Exception as flow_post_err:
                logger.warning("[DIAGRAM] Post-gen flow refresh failed (non-fatal): %s", flow_post_err)
            metrics.set("mode", "wireframe_full")
            metrics.set("screen_count", len(all_screens))
            _emitted = metrics.emit(logger)
            try:
                await manager.send_to(session_id, {"type": "pipeline_metrics_emit", "payload": _emitted})
            except Exception:
                logger.warning("[DIAGRAM] metrics broadcast failed", exc_info=True)
            return

    # ── Non-wireframe: single request for flow/architecture/ERD ──
    # NB: occasionally the AI returns wireframe JSON here (it ignores the
    # type request). Device pinning for that case is enforced below where the
    # parsed diagram is stored — see `"device": target_device` in the
    # wireframe storage block.
    # Use chat_with_full_usage so the Opus call lands in PipelineMetrics —
    # before this, the single-shot flow/arch/erd path returned `await ai.chat(...)`
    # which throws away token counts, and the `finally`-block emit at the
    # bottom of this function logged `[PIPELINE_METRICS] ai_call_count: 0`
    # even though Anthropic billed ~$0.13/call. That made the in-app
    # analytics dashboard show $0 spend during the 2026-05-18 incident.
    raw, _diag_in_tok, _diag_out_tok = await ai.chat_with_full_usage(
        system=system_prompt,
        messages=[
            {
                "role": "user",
                "content": f"""Update the project diagram based on this conversation.

CURRENT: {json.dumps(current_diagram)}

CONVERSATION: {conv[-2000:]}

LATEST: {ai_response[:500]}

CRITICAL RULES:
- PRESERVE all existing nodes and edges from CURRENT. Do NOT remove them.
- ADD new nodes/edges to expand the diagram based on the conversation.
- Only REMOVE a node if the user explicitly asked to delete it.
- SUB-FLOWS: When detailing a step, create sub-flow nodes with prefixed IDs (e.g. 'sub_create_1', 'sub_create_2'). Sub-flow nodes MUST be connected to EACH OTHER with edges forming a chain (e.g. sub_create_1→sub_create_2→sub_create_3). Do NOT connect them to the main flow. Add "subflowIds" to the parent node listing all sub-flow node IDs.
- AUTO-EXTRACT: After adding a new sub-flow, check the main flow for consistency. If a decision node has some branches already extracted as sub-flows but other branches are still inline with 3+ nodes, extract those inline branches too. Replace the inline chain with a single summary node (with subflowIds) and move the detailed nodes into a disconnected sub-flow. Keep the main flow clean — it should only show high-level steps, with details in sub-flows.
- Use unique IDs that don't conflict with existing ones.
- SCREEN LINKS: If wireframe screens exist, add "screenId" to flow nodes to link them to the matching wireframe screen (e.g. a "View Task List" node links to the task list wireframe via "screenId": "task_list").

Return ONLY valid JSON matching one of these types:
architecture: {arch_example}
{arch_critical}
erd: {erd_example}
flow: {flow_example}

5-10 nodes max. No orphans. No markdown wrapping. Keep the JSON compact — no extra whitespace.""",
            }
        ],
        max_tokens=4096,
    )
    metrics.record_ai_call(
        model=ai.model,
        purpose=f"{_likely_type}_diagram",
        input_tokens=_diag_in_tok,
        output_tokens=_diag_out_tok,
    )
    logger.info("[DIAGRAM] AI returned %d chars, type=%s", len(raw), _likely_type)
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()
    # Fix invalid JSON escapes from AI-generated HTML content
    raw = re.sub(r'(?<!\\)\\(?!["\\/bfnrtu])', r"\\\\", raw)
    logger.debug("Diagram full output: %s", raw[:500])
    try:
        new_diagram = json.loads(raw)
    except json.JSONDecodeError:
        # Try to repair truncated JSON (AI hit token limit)
        logger.warning("[DIAGRAM] JSON parse failed, attempting repair")
        repaired = raw
        # Close any open strings
        if repaired.count('"') % 2 == 1:
            repaired += '"'
        # Close brackets/braces
        open_brackets = repaired.count("[") - repaired.count("]")
        open_braces = repaired.count("{") - repaired.count("}")
        repaired += "]" * max(0, open_brackets) + "}" * max(0, open_braces)
        try:
            new_diagram = json.loads(repaired)
            logger.info("[DIAGRAM] JSON repair succeeded")
        except json.JSONDecodeError as repair_err:
            logger.error("[DIAGRAM] JSON repair also failed: %s", repair_err)
            return
    try:
        # Post-process: normalize zone label/name and ensure every node has zoneId
        if "zones" in new_diagram and "nodes" in new_diagram:
            zones = new_diagram["zones"]
            nodes = new_diagram["nodes"]

            # Fix name → label on zones
            for zone in zones:
                if "name" in zone and "label" not in zone:
                    zone["label"] = zone.pop("name")

            # Build child → zone mapping from zone children arrays
            zone_child_map = {}
            for zone in zones:
                for child_id in zone.get("children", []):
                    zone_child_map[child_id] = zone["id"]

            # Assign zoneId from children map or from node's own zoneId
            unassigned = []
            for node in nodes:
                if not node.get("zoneId"):
                    if node["id"] in zone_child_map:
                        node["zoneId"] = zone_child_map[node["id"]]
                    else:
                        unassigned.append(node)

            # Fallback: if nodes still have no zone, assign to first non-client zone
            if unassigned and len(zones) > 0:
                # Find the "main" zone (skip client/external zones)
                main_zone = None
                for z in zones:
                    lbl = (z.get("label") or z.get("name") or "").lower()
                    if "client" not in lbl and "external" not in lbl and "user" not in lbl:
                        main_zone = z["id"]
                        break
                if not main_zone:
                    main_zone = zones[0]["id"]
                for node in unassigned:
                    node["zoneId"] = main_zone

            # Infer zone nesting from labels if parentId not set
            for zone in zones:
                if zone.get("parentId"):
                    continue
                lbl = (zone.get("label") or "").lower()
                if "subnet" in lbl:
                    vpc_zone = next((z for z in zones if "vpc" in (z.get("label") or "").lower()), None)
                    if vpc_zone and vpc_zone["id"] != zone["id"]:
                        zone["parentId"] = vpc_zone["id"]
                elif "vpc" in lbl:
                    region_zone = next(
                        (
                            z
                            for z in zones
                            if any(
                                r in (z.get("label") or "").lower()
                                for r in ["region", "us-east", "us-west", "eu-west", "ap-", "primary", "secondary"]
                            )
                        ),
                        None,
                    )
                    if region_zone and region_zone["id"] != zone["id"]:
                        zone["parentId"] = region_zone["id"]

            print(
                f"[DIAGRAM] Post-processed: {len(zones)} zones, {len(nodes)} nodes, {len(unassigned)} unassigned",
                flush=True,
            )

        # Post-process flow diagrams: enrich with infrastructure links from canvas
        if new_diagram.get("type") == "flow" and "nodes" in new_diagram:
            canvas_nodes = (session_obj.canvas_elements or {}).get("nodes", [])
            flow_nodes = [n for n in canvas_nodes if n.get("_zoneType") == "flow"]
            if not flow_nodes:
                flow_nodes = [n for n in canvas_nodes if n.get("type") in ("process", "decision")]
            if flow_nodes:
                flow_infra_links = []
                for fn in flow_nodes:
                    label = fn.get("label") or fn.get("data", {}).get("label", "")
                    if label:
                        flow_infra_links.append({"id": fn.get("id", ""), "label": label})
                if flow_infra_links:
                    new_diagram["_flow_infra_links"] = flow_infra_links

        dtype = new_diagram.get("type", "")
        valid = (
            (dtype == "architecture" and "nodes" in new_diagram)
            or (dtype == "erd" and "tables" in new_diagram)
            or (dtype == "flow" and "nodes" in new_diagram)
            or (dtype == "wireframe" and "screens" in new_diagram)
            or ("nodes" in new_diagram and "edges" in new_diagram)
        )
        logger.debug("Parsed OK. type=%s, valid=%s, changed=%s", dtype, valid, new_diagram != current_diagram)
        if valid:
            if new_diagram != current_diagram:
                # Default wireframe fidelity to "low" so the frontend renderer always
                # has a concrete value to branch on even if the AI omits it.
                if dtype == "wireframe" and isinstance(new_diagram, dict):
                    new_diagram.setdefault("fidelity", "low")
                    # Always dedupe new_diagram.screens by id up front — the AI
                    # occasionally emits the same screen twice, and React keys must
                    # be unique on the frontend.
                    # Force-pin device to the same target the per-screen path
                    # would have used. Otherwise this fallback path lets the AI
                    # randomly switch device between turns.
                    by_id: dict[str, dict] = {}
                    for s in new_diagram.get("screens", []) or []:
                        if isinstance(s, dict):
                            sid = s.get("id") or f"screen_{len(by_id)}"
                            by_id[sid] = {**s, "id": sid, "device": target_device}
                    # Merge into existing wireframe instead of replacing it — later
                    # turns that talk about more screens should ADD them, not wipe
                    # the previous set. Existing screens land first so new ones
                    # overwrite matches by id.
                    existing = all_diagrams.get("wireframe")
                    if (
                        isinstance(existing, dict)
                        and isinstance(existing.get("screens"), list)
                        and existing.get("screens")
                    ):
                        merged: dict[str, dict] = {}
                        for s in existing["screens"]:
                            if isinstance(s, dict) and s.get("id"):
                                merged[s["id"]] = s
                        for sid, s in by_id.items():
                            merged[sid] = s
                        by_id = merged
                        # Merge flows by (from, to, trigger) key
                        flows_by_key: dict[tuple, dict] = {}
                        for f in (existing.get("flows") or []) + (new_diagram.get("flows") or []):
                            if isinstance(f, dict):
                                flows_by_key[(f.get("from"), f.get("to"), f.get("trigger", ""))] = f
                        new_diagram["flows"] = list(flows_by_key.values())
                        if not new_diagram.get("title") and existing.get("title"):
                            new_diagram["title"] = existing["title"]
                    new_diagram["screens"] = list(by_id.values())
                # Store as multi-diagram dict keyed by type
                all_diagrams[dtype] = new_diagram
                session_obj.diagram_state = all_diagrams
                await db.commit()
                await manager.send_to(
                    session_id,
                    {
                        "type": "diagram_update",
                        "payload": new_diagram,
                    },
                )
                logger.info("Diagram saved & broadcast! nodes=%d", len(new_diagram.get("nodes", [])))
                # Dual-write diagram event
                try:
                    from ..services.event_writer import write_diagram_event

                    await write_diagram_event(
                        session_id=session_id,
                        diagram_type=dtype,
                        title=new_diagram.get("title", dtype),
                        node_count=len(new_diagram.get("nodes", [])),
                        description=new_diagram.get("description"),
                        db=db,
                    )
                except Exception:
                    logger.warning("[DIAGRAM] Failed to write diagram event", exc_info=True)
            else:
                logger.debug("No change from current diagram")
        else:
            logger.debug("Invalid diagram: type=%s, keys=%s", dtype, list(new_diagram.keys()))
    except Exception as e:
        logger.error("Diagram extraction exception: %s: %s", type(e).__name__, e, exc_info=True)
    finally:
        # Emit pipeline metrics on every code path we exit through —
        # even errors and "nothing changed" branches — so we can see how
        # often the pipeline runs vs how often it actually produces output.
        try:
            metrics.set("mode", metrics.extra.get("mode") or "non_wireframe")
            metrics.emit(logger)
        except Exception:
            pass


# ── AI-powered element editing ──────────────────────────────────────────

_NODE_TYPE_DESCRIPTIONS = {
    "service": (
        "A service/infrastructure node. Editable fields: label (string), description (string, optional), "
        "provider (string, optional — aws/gcp/azure/vercel/cloudflare), iconUrl (string, optional)."
    ),
    "database": (
        "A database table node. Editable fields: label (string — table name), "
        "columns (array of {name: string, type: string, pk?: boolean, fk?: boolean})."
    ),
    "process": ("A process/step node. Editable fields: label (string), description (string, optional)."),
    "decision": ("A decision diamond node. Editable fields: label (string — the question)."),
    "zone": (
        "A grouping zone. Editable fields: label (string), color (CSS color string, optional), "
        "borderStyle ('solid' | 'dashed', optional)."
    ),
    "wirescreen": (
        "A wireframe screen container. Editable fields: label (string — screen name), "
        "width (number, optional), height (number, optional)."
    ),
    "wirebutton": (
        "A wireframe button. Editable fields: label (string — button text), "
        "variant (string, optional — primary/secondary/ghost)."
    ),
    "wireinput": (
        "A wireframe input field. Editable fields: label (string — field label), placeholder (string, optional)."
    ),
    "wirecard": (
        "A wireframe card component. Editable fields: label (string — card title), description (string, optional)."
    ),
    "wirenav": (
        "A wireframe navigation bar. Editable fields: label (string — nav title), items (array of strings, optional)."
    ),
    "wiretext": (
        "A wireframe text block. Editable fields: label (string — the text content), "
        "variant (string, optional — heading/body/caption)."
    ),
    "wireimage": (
        "A wireframe image placeholder. Editable fields: label (string — alt text/description), "
        "width (number, optional), height (number, optional)."
    ),
    "annotation": ("An annotation/note node. Editable fields: label (string — the annotation text)."),
    "sticky": (
        "A sticky note. Editable fields: label (string — note content), color (CSS rgba color string, optional)."
    ),
    "swimlane": (
        "A swimlane container. Editable fields: label (string — lane name), color (CSS color string, optional)."
    ),
}


@router.post("/api/sessions/{session_id}/ai-edit-element")
async def ai_edit_element(
    session_id: str,
    body: AIEditElementRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Use AI to edit a single canvas element based on a natural-language instruction."""
    from ..services.ai_provider import get_ai_client, get_ai_client_for_role  # noqa: F401

    # Verify session exists and get org_id for AI routing
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    node_type_desc = _NODE_TYPE_DESCRIPTIONS.get(
        body.node_type,
        f"A {body.node_type} node. Return updated data fields as JSON.",
    )

    # Build context about the diagram surroundings
    context_str = ""
    if body.diagram_context:
        ctx = body.diagram_context.get("context", "")
        connections = body.diagram_context.get("connections", [])
        if ctx:
            context_str = f"\n\nDiagram context:\n{ctx}"
        if connections:
            conn_lines = []
            for c in connections[:10]:  # Limit to avoid prompt bloat
                direction = c.get("direction", "?")
                label = c.get("connectedNode", {}).get("label", "?")
                conn_lines.append(f"  {direction}: {label}")
            if conn_lines:
                context_str += "\n\nConnections:\n" + "\n".join(conn_lines)

    prompt = (
        f"You are editing a diagram element. The element is a **{body.node_type}** node.\n\n"
        f"{node_type_desc}\n\n"
        f"Current data:\n```json\n{json.dumps(body.node_data, indent=2)}\n```\n"
        f"{context_str}\n\n"
        f"User instruction: {body.instruction}\n\n"
        f"Return ONLY the updated node data as a valid JSON object. "
        f"Include ALL fields from the current data, modifying only what the instruction asks. "
        f"Do not add markdown fences or explanation — just the raw JSON object."
    )

    try:
        ai = await get_ai_client(session.org_id, db, task="fast")
        raw = await ai.chat(
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1024,
        )
        raw = raw.strip()

        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()

        new_data = json.loads(raw)
        if not isinstance(new_data, dict):
            raise ValueError("AI response was not a JSON object")

        # Merge with original data to preserve any fields the AI omitted
        merged = {**body.node_data, **new_data}

        return {"node_id": body.node_id, "new_data": merged}

    except json.JSONDecodeError as e:
        logger.warning("AI edit element — JSON parse failed: %s", e)
        raise HTTPException(status_code=422, detail="AI returned invalid JSON. Try rephrasing your instruction.")
    except Exception as e:
        logger.error("AI edit element failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to process AI edit")
