"""Prompts for per-execution-wave task generation.

The single-shot `GENERATION_PROMPT` asks the model to produce the entire task
list at once (15-20 tasks, ~7K output tokens, ~60-90s with Sonnet) and was
hitting HTTP proxy timeouts. We split that into N short calls — one per
execution wave — so each request is bounded (~15-25s) and the user sees
progress as each wave lands.

Two prompts:

* :data:`WAVE_ZERO_PROMPT` — foundational tasks, no dependencies.
* :data:`WAVE_N_PROMPT` — depends on at least one already-generated task.

Both share the same JSON output shape as the single-shot prompt so the
downstream pipeline (sanitize → transitive reduce → compute waves) treats
the accumulated list identically.
"""

from __future__ import annotations

import json

# ── Wave 0 ──────────────────────────────────────────────────────────────────

WAVE_ZERO_PROMPT = """You are a senior engineering project manager. Given the project blueprint below, \
break out the FOUNDATIONAL tasks for a kanban board — work that can start immediately because it \
depends on nothing else in the plan.

BLUEPRINT:
{blueprint_text}

This is the FIRST of several waves. You're generating Wave 0 only. Later waves will be generated \
in follow-up calls; do not try to produce the whole plan now.

Rules:
- Output 3-8 tasks
- Each task must have `depends_on_indices: []` — Wave 0 by definition has no prerequisites
- 1-3 days of work per task, completable by one developer
- Include 2-4 acceptance criteria bullets per task
- Story points from Fibonacci: 1, 2, 3, 5, 8
- Priority: critical | high | medium | low
- Labels from: frontend, backend, database, auth, api, devops, ui, testing (multiple allowed)
- Use `template_slug` to pick from the available templates below; null if none fit
- Populate `custom_fields` per the template's field schema when applicable
- Children (the optional `children` array) are sub-tasks within the parent's scope — keep \
their `depends_on_indices` empty or pointing only at the parent's index (which is 0-based \
within THIS wave, but you can omit since Wave 0 children have no deps)
- Also include a top-level `complete` boolean — true ONLY if the entire project is \
genuinely small enough that no further waves are needed (rare; typical small projects still \
have at least Wave 1)

{style_fragment}

AVAILABLE TEMPLATES:
{templates_block}

Return ONLY valid JSON in this exact shape (no markdown fences, no commentary):
{example}"""


WAVE_ZERO_EXAMPLE = json.dumps(
    {
        "tasks": [
            {
                "title": "Set up project scaffolding",
                "description": "Initialize the repo with the chosen tech stack, lint, CI.",
                "priority": "critical",
                "story_points": 3,
                "labels": ["devops", "backend"],
                "acceptance_criteria": [
                    "Session builds and runs locally",
                    "CI pipeline configured",
                    "README with setup instructions",
                ],
                "depends_on_indices": [],
                "template_slug": "feature",
                "custom_fields": {},
                "children": [],
            },
        ],
        "complete": False,
    },
    indent=2,
)


# ── Wave N (N >= 1) ─────────────────────────────────────────────────────────

WAVE_N_PROMPT = """You are a senior engineering project manager continuing a multi-wave task \
breakdown for a kanban board. You already generated {prev_count} task(s) across {prev_wave_count} \
prior wave(s). Now generate the NEXT execution wave — tasks that depend on at least one already-existing \
task and on nothing that hasn't been generated yet.

BLUEPRINT:
{blueprint_text}

TASKS ALREADY GENERATED (use their 0-based indices in `depends_on_indices`):
{prior_tasks_block}

Rules for this wave:
- Output 2-6 tasks
- EVERY task must list ≥1 entry in `depends_on_indices`, pointing into 0..{max_prior_idx} \
(the indices above). NEVER reference an index ≥ {prev_count} — those tasks don't exist yet.
- Be CONSERVATIVE with dependencies: list only DIRECT prerequisites, never transitive ones. \
A typical task has 1 entry; 2+ is rare and signals a genuine merge point.
- Don't restate or duplicate any task title from above
- Stop when the work is fully covered. Set the top-level `complete: true` when this wave \
finishes the plan; otherwise `complete: false` to request another wave.
- Cross-cutting tasks (final release, end-to-end QA, runbooks/docs/monitoring of completed \
work) belong in the LAST wave and must depend on EVERY implementation task they cover — \
list them all explicitly. If you're about to emit such a cross-cutter, set `complete: true`.
- Same per-task shape as Wave 0 (title, description, priority, story_points, labels, \
acceptance_criteria, depends_on_indices, template_slug, custom_fields, children)
- 1-3 days of work per task; 2-4 acceptance criteria bullets; Fibonacci story points; \
priorities critical | high | medium | low

{style_fragment}

AVAILABLE TEMPLATES:
{templates_block}

Return ONLY valid JSON in this exact shape (no markdown fences, no commentary):
{example}"""


WAVE_N_EXAMPLE = json.dumps(
    {
        "tasks": [
            {
                "title": "Implement user login flow",
                "description": "Wire the email/password form to the auth API and persist sessions.",
                "priority": "high",
                "story_points": 5,
                "labels": ["frontend", "auth"],
                "acceptance_criteria": [
                    "User can log in with email and password",
                    "Invalid credentials show an inline error",
                    "Successful login redirects to the dashboard",
                ],
                "depends_on_indices": [0],
                "template_slug": "feature",
                "custom_fields": {},
                "children": [],
            },
        ],
        "complete": False,
    },
    indent=2,
)


def render_prior_tasks_block(prior_tasks: list[dict]) -> str:
    """Render an indexed listing of previously-generated tasks for the Wave N prompt.

    Compact format: ``[idx] (wave W) title`` so the model can quickly scan
    what already exists and pick legitimate dependency targets.
    """
    if not prior_tasks:
        return "(none — this is Wave 0)"
    lines = []
    for i, task in enumerate(prior_tasks):
        wave = task.get("wave", 0)
        title = task.get("title", f"Task {i}")
        lines.append(f"  [{i}] (wave {wave}) {title}")
    return "\n".join(lines)


def format_feedback_block(feedback_context: dict | None) -> str:
    """Same shape as task_generator._format_feedback_block — duplicated here
    so the wave module is self-contained. Kept narrow on purpose."""
    if not feedback_context:
        return ""
    parts: list[str] = [
        "REGENERATION FEEDBACK — the user already saw a previous attempt and "
        "wants this one to be different. Read this first and let it shape "
        "what you generate:",
    ]
    fb = (feedback_context.get("feedback") or "").strip()
    if fb:
        parts.append(f"What they want changed: {fb}")
    disliked = feedback_context.get("disliked_titles") or []
    if disliked:
        parts.append(
            "These specific tasks from the previous attempt did NOT work for them. "
            "Avoid generating anything semantically similar:\n" + "\n".join(f"  - {t}" for t in disliked)
        )
    parts.append("Now generate this wave's tasks with the above guidance applied.\n")
    return "\n\n".join(parts)
