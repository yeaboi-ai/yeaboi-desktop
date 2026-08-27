"""Background-job per-execution-wave task generator.

The single-shot `preview_tasks_from_blueprint` does the full plan in one
~60-90s Sonnet call, which trips HTTP proxy timeouts. This module produces
the same final list by iterating: one short Sonnet call per execution wave,
each conditioned on the accumulated previously-generated tasks.

Entry point: :func:`run_wave_generation` — spawned by ``BackgroundTasks``
from the ``/stories/preview-async`` route. Owns its own DB session.

Final task list shape matches what ``preview_tasks_from_blueprint`` returns:
the same downstream sanitize → transitive_reduce → compute_waves pipeline
runs once at the end, so the wizard and persist path don't need to know
the list was assembled incrementally.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from ..db import get_session_factory
from ..models.task_generation_job import TaskGenerationJob
from .ai_provider import get_ai_client
from .generation_styles import DEFAULT_GRANULARITY, compose_style_block
from .granularity_service import ensure_org_granularities, get_org_granularities
from .modifier_service import ensure_org_modifiers, get_org_modifiers
from .task_generator import (
    _blueprint_to_text,
    _compute_waves_and_sequences,
    _parse_tasks_json,
    _sanitize_dep_indices,
    _transitive_reduce_indices,
)
from .ticket_template_service import (
    _render_template_block,
    get_org_ticket_templates,
    pick_applicable_templates,
)
from .wave_prompts import (
    WAVE_N_EXAMPLE,
    WAVE_N_PROMPT,
    WAVE_ZERO_EXAMPLE,
    WAVE_ZERO_PROMPT,
    format_feedback_block,
    render_prior_tasks_block,
)

logger = logging.getLogger(__name__)

# Hard cap on number of waves we'll ever produce, regardless of what the model
# claims. Prevents runaway generation if the model never signals `complete`.
MAX_WAVES = 6

# Per-wave token cap. Each wave only emits 2-6 tasks so 3072 is plenty
# (single-shot used 8192 for 15-20 tasks).
WAVE_MAX_TOKENS = 3072


async def _load_blueprint(project_id: str, db) -> dict[str, str]:
    """Load the project's blueprint content. Imported lazily to keep this
    module's import graph small at module-import time."""
    from .blueprint_service import get_or_create_blueprint

    bp = await get_or_create_blueprint(project_id, db)
    return bp.content or {}


def _strip_fences(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()
    return raw


def _parse_wave_response(raw: str) -> tuple[list[dict], bool]:
    """Parse a per-wave response of shape ``{"tasks": [...], "complete": bool}``.

    Falls back to treating the whole payload as a bare task list (the legacy
    single-shot shape) if the model forgot the wrapping object — in that case
    we assume `complete: false` so the caller decides what to do next.
    """
    raw = _strip_fences(raw)
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.warning("Wave JSON parse failed (%s); attempting recovery", e)
        parsed = None

    if isinstance(parsed, dict):
        tasks = parsed.get("tasks") or []
        complete = bool(parsed.get("complete"))
        if not isinstance(tasks, list):
            logger.error("Wave response 'tasks' was not a list (got %s)", type(tasks).__name__)
            tasks = []
        return tasks, complete

    # Bare list — older shape. Treat as not-complete to let the loop decide.
    if isinstance(parsed, list):
        return parsed, False

    # Final fallback — try the truncated-array recovery from task_generator.
    recovered = _parse_tasks_json(raw)
    return (recovered or [], False)


def _validate_wave_output(new_tasks: list[dict], prev_count: int, wave_idx: int) -> list[dict]:
    """Drop dependency indices that point past the accumulated task list.

    The Wave N prompt explicitly forbids indices >= prev_count, but models
    hallucinate. Keep the task, scrub the bad edges, log the drops.
    Wave 0 has `prev_count=0` so any depends_on_indices is invalid — they all
    get cleared and the task remains a foundational one.
    """
    cleaned: list[dict] = []
    for j, task in enumerate(new_tasks):
        if not isinstance(task, dict):
            logger.warning("Wave %d: dropping non-dict task at position %d", wave_idx, j)
            continue
        deps = task.get("depends_on_indices") or []
        kept = [d for d in deps if isinstance(d, int) and 0 <= d < prev_count]
        if len(kept) != len(deps):
            dropped = [d for d in deps if d not in kept]
            logger.warning(
                "Wave %d task %r: dropped invalid depends_on_indices %s (prev_count=%d)",
                wave_idx,
                task.get("title"),
                dropped,
                prev_count,
            )
        task["depends_on_indices"] = kept

        # related_to_indices in incremental waves can only point at prior tasks
        # too — we don't yet know what later waves will produce.
        rel = task.get("related_to_indices") or []
        rel_kept = [r for r in rel if isinstance(r, int) and 0 <= r < prev_count]
        task["related_to_indices"] = rel_kept

        cleaned.append(task)
    return cleaned


def _render_template_block_with_fallback(templates) -> str:
    if not templates:
        return "(none defined — leave template_slug as null)"
    return _render_template_block(templates)


async def _build_wave_prompt(
    *,
    blueprint_text: str,
    prev_tasks: list[dict],
    wave_idx: int,
    templates_block: str,
    feedback_context: dict | None,
    granularity: str = DEFAULT_GRANULARITY,
    modifiers: list[str] | None = None,
    repo_profile: dict | None = None,
    fragments_by_slug: dict[str, str] | None = None,
) -> str:
    """Compose the per-wave prompt: base rules + style block + templates block + optional regen feedback.

    ``granularity`` is the slug of the chosen granularity and sets the per-wave
    count target. ``modifiers`` is a list of additional modifier slugs that
    stack on top. ``repo_profile`` is the conventions snapshot used when
    ``"follow_practices"`` is in ``modifiers``; ignored otherwise.
    ``fragments_by_slug`` is the iteration-6 org-editable fragment map
    (granularity + modifier rows from the DB). When None, falls back to the
    system :data:`STYLE_FRAGMENTS` dict so tests and other callers don't break.
    """
    style_fragment = compose_style_block(granularity, modifiers, repo_profile, fragments_by_slug=fragments_by_slug)
    if wave_idx == 0:
        body = WAVE_ZERO_PROMPT.format(
            blueprint_text=blueprint_text,
            style_fragment=style_fragment,
            templates_block=templates_block,
            example=WAVE_ZERO_EXAMPLE,
        )
    else:
        prev_wave_count = (max((t.get("wave") or 0) for t in prev_tasks) + 1) if prev_tasks else 0
        body = WAVE_N_PROMPT.format(
            blueprint_text=blueprint_text,
            prev_count=len(prev_tasks),
            prev_wave_count=prev_wave_count,
            max_prior_idx=len(prev_tasks) - 1,
            prior_tasks_block=render_prior_tasks_block(prev_tasks),
            style_fragment=style_fragment,
            templates_block=templates_block,
            example=WAVE_N_EXAMPLE,
        )
    fb = format_feedback_block(feedback_context)
    return f"{fb}\n\n{body}" if fb else body


async def _generate_one_wave(
    *,
    blueprint_text: str,
    prev_tasks: list[dict],
    wave_idx: int,
    templates_block: str,
    feedback_context: dict | None,
    org_id: str,
    db,
    granularity: str = DEFAULT_GRANULARITY,
    modifiers: list[str] | None = None,
    repo_profile: dict | None = None,
    fragments_by_slug: dict[str, str] | None = None,
) -> tuple[list[dict], bool]:
    """One LLM round-trip producing the next wave's tasks."""
    prompt = await _build_wave_prompt(
        blueprint_text=blueprint_text,
        prev_tasks=prev_tasks,
        wave_idx=wave_idx,
        templates_block=templates_block,
        feedback_context=feedback_context,
        granularity=granularity,
        modifiers=modifiers,
        repo_profile=repo_profile,
        fragments_by_slug=fragments_by_slug,
    )
    ai = await get_ai_client(org_id, db, task="default")
    logger.info(
        "Generating wave %d (prev_count=%d, provider=%s)",
        wave_idx,
        len(prev_tasks),
        ai.provider,
    )
    # Stream the response. `ai.chat()` is non-streaming and gets killed by the
    # SDK's 30s read timeout when Sonnet takes longer than that to produce a
    # full ~3K-token JSON object — exactly our wave shape. Streaming keeps
    # bytes flowing on the wire so no timeout fires; we concatenate chunks
    # locally before parsing.
    chunks: list[str] = []
    async for chunk in ai.chat_stream(
        messages=[{"role": "user", "content": prompt}],
        max_tokens=WAVE_MAX_TOKENS,
    ):
        # `chat_stream` may also yield ('thinking', text) tuples when extended
        # thinking is enabled. We don't enable it here, but guard anyway.
        if isinstance(chunk, str):
            chunks.append(chunk)
    raw = "".join(chunks)
    new_tasks, complete = _parse_wave_response(raw)
    new_tasks = _validate_wave_output(new_tasks, prev_count=len(prev_tasks), wave_idx=wave_idx)
    return new_tasks, complete


async def _refresh_job(db, job_id: str) -> TaskGenerationJob | None:
    return (await db.execute(select(TaskGenerationJob).where(TaskGenerationJob.id == job_id))).scalar_one_or_none()


async def run_wave_generation(job_id: str) -> None:
    """Run the per-wave generation loop for one job.

    Owns its own DB session — BackgroundTasks doesn't carry the request-scoped
    one. Writes status / current_wave / waves_complete / partial_tasks
    incrementally so the polling frontend can render progress.
    """
    factory = get_session_factory()
    async with factory() as db:
        job = await _refresh_job(db, job_id)
        if not job:
            logger.error("Job %s not found — cannot start generation", job_id)
            return
        if job.status not in ("pending", "running"):
            logger.info("Job %s already in terminal state %s; skipping", job_id, job.status)
            return

        job.status = "running"
        await db.commit()

        try:
            blueprint = await _load_blueprint(job.project_id, db)
            blueprint_text = _blueprint_to_text(blueprint)
            if blueprint_text == "No blueprint content available.":
                job.status = "failed"
                job.error = "Blueprint is empty — fill in at least one section before previewing tasks."
                job.finished_at = datetime.now(UTC)
                await db.commit()
                return

            # Templates: resolve once for the whole job and cache on the row so
            # the GET endpoint can return them without re-querying.
            sections = list(blueprint.keys()) if isinstance(blueprint, dict) else []
            applicable_templates = await pick_applicable_templates(job.org_id, sections, db)
            templates_block = _render_template_block_with_fallback(applicable_templates)
            all_templates = await get_org_ticket_templates(job.org_id, db)
            job.templates_payload = [{"slug": t.slug, "name": t.name} for t in all_templates]
            await db.commit()

            # Iteration 6: load the org's editable granularity + modifier
            # rows and build the slug → prompt_fragment map. Admin edits to
            # any system row (or custom rows they added) propagate into the
            # wave prompt from here. Seeded on first access if missing.
            await ensure_org_granularities(job.org_id, db)
            await ensure_org_modifiers(job.org_id, db)
            org_grans = await get_org_granularities(job.org_id, db)
            org_mods = await get_org_modifiers(job.org_id, db)
            fragments_by_slug: dict[str, str] = {
                **{g.slug: g.prompt_fragment for g in org_grans},
                **{m.slug: m.prompt_fragment for m in org_mods},
            }

            accumulated: list[dict] = list(job.partial_tasks or [])
            wave_idx = job.current_wave or 0
            waves_complete = job.waves_complete or 0
            complete = False

            while wave_idx < MAX_WAVES and not complete:
                # Bail out early if the request was cancelled while we were
                # mid-flight in the previous wave.
                refreshed = await _refresh_job(db, job_id)
                if not refreshed or refreshed.status == "cancelled":
                    logger.info("Job %s cancelled — stopping wave loop at wave %d", job_id, wave_idx)
                    return

                try:
                    new_tasks, complete = await _generate_one_wave(
                        blueprint_text=blueprint_text,
                        prev_tasks=accumulated,
                        wave_idx=wave_idx,
                        templates_block=templates_block,
                        feedback_context=job.feedback_context,
                        org_id=job.org_id,
                        db=db,
                        granularity=job.style or DEFAULT_GRANULARITY,
                        modifiers=list(job.modifiers or []),
                        repo_profile=job.repo_profile_json,
                        fragments_by_slug=fragments_by_slug,
                    )
                except Exception as exc:
                    logger.exception("Wave %d failed for job %s", wave_idx, job_id)
                    job.status = "failed"
                    job.error = f"Wave {wave_idx} failed: {exc.__class__.__name__}: {exc}"
                    job.finished_at = datetime.now(UTC)
                    await db.commit()
                    return

                if not new_tasks:
                    # Model returned an empty wave but didn't signal complete.
                    # Don't loop forever — treat as natural termination.
                    logger.info("Wave %d produced no tasks; ending loop", wave_idx)
                    complete = True
                    break

                accumulated.extend(new_tasks)
                wave_idx += 1
                waves_complete = wave_idx

                # Reconcile after every wave so the partial_tasks the frontend
                # polls already has correct wave + sequence values, not just
                # titles in arrival order. The pipeline mutates in place but
                # is idempotent — running it after each wave produces the same
                # final list as a single pass at the end.
                accumulated = _sanitize_dep_indices(accumulated)
                accumulated = _transitive_reduce_indices(accumulated)
                accumulated = _compute_waves_and_sequences(accumulated)

                # Persist progress so the frontend sees this wave's tasks
                # before we start the next one. flag_modified guarantees the
                # JSON column write lands even when SQLAlchemy's value
                # equality check is fooled by shared inner-dict aliases.
                job.partial_tasks = list(accumulated)
                flag_modified(job, "partial_tasks")
                job.current_wave = wave_idx
                job.waves_complete = waves_complete
                await db.commit()

            # accumulated has been reconciled after every wave (above), so the
            # final list is already canonical. Just mark the job complete.
            final_tasks = list(accumulated)

            job.partial_tasks = final_tasks
            flag_modified(job, "partial_tasks")
            job.waves_complete = waves_complete
            job.status = "complete"
            job.finished_at = datetime.now(UTC)
            await db.commit()
            logger.info(
                "Job %s complete: %d tasks across %d waves",
                job_id,
                len(final_tasks),
                waves_complete,
            )
        except Exception as exc:
            logger.exception("Unhandled error in run_wave_generation for job %s", job_id)
            job.status = "failed"
            job.error = f"{exc.__class__.__name__}: {exc}"
            job.finished_at = datetime.now(UTC)
            await db.commit()
