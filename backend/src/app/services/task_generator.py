"""Generate kanban cards from a completed project blueprint using AI."""

import json
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.board import Board, BoardColumn, Card
from ..services.ai_provider import get_ai_client
from ..services.board_service import get_or_create_board
from ..services.card_numbering import assign_friendly_id
from ..services.html_text import normalize_ac
from ..services.ticket_template_service import build_generation_prompt

logger = logging.getLogger(__name__)

GENERATION_PROMPT = """You are a senior engineering project manager. Given the project blueprint below, \
break it down into actionable development tasks for a kanban board.

BLUEPRINT:
{blueprint_text}

Generate a JSON array of tasks. Each task should be a card on the kanban board.

Rules:
- Create 8-20 tasks depending on project complexity
- Order by implementation priority (most foundational first)
- Each task should be completable in 1-3 days by one developer
- Include clear acceptance criteria (2-4 bullet points each)
- Assign story points (1, 2, 3, 5, 8) using fibonacci
- Set priority: "critical" (blockers), "high" (core features), "medium" (important), "low" (nice-to-have)
- Add labels like ["frontend", "backend", "database", "auth", "api", "devops", "ui", "testing"]
- Group related tasks as parent/children where appropriate (use "children" array)

Dependency mapping (be CONSERVATIVE — most tasks should have no dependencies):
- "depends_on_indices": 0-based indices of HARD prerequisites. DEFAULT TO AN EMPTY LIST. \
Most foundational/scaffolding tasks (auth, schema design, infrastructure setup, core data model) \
can run in parallel and should leave this empty — they belong to wave 0. Only add a hard prerequisite \
when the task literally cannot start without another being merged. ONLY include DIRECT prerequisites — \
NEVER transitive ones. If A must finish before B and B before C, then C depends on B alone (NOT also on A). \
A typical task has 0 or 1 entries; 2+ is rare and signals a genuine multi-prereq merge point. \
Every index in the list MUST be strictly less than the current task's index.
- "related_to_indices": 0-based indices of SOFT links — tasks in the same area or sharing context, but with no \
ordering requirement. Use sparingly and only when it genuinely helps a developer pick up the work.
- "wave": integer >= 0. Wave 0 = no dependencies. A task in wave N must depend on at least one wave N-1 task \
and on nothing in wave N or later. Compute this consistently with depends_on_indices.
- "sequence": integer >= 0. Stable ordering hint within a wave so the UI lists tasks in a sensible order even \
when several have no hard dependencies between them. Lower sequence = earlier within the wave.

Cross-cutting tasks need ALL their real prerequisites:
- A "Release / deploy / launch / ship to production" task must depend on EVERY implementation task it ships — \
not just on documentation or runbooks. Walk the list and add every feature/integration task as a prerequisite. \
These tasks almost always belong in the LAST wave.
- A final "QA / integration testing / regression / smoke test" task must depend on the implementation tasks it \
verifies, not on planning or design tasks alone.
- "Documentation" / "runbook" tasks usually depend on the implementation they document — not the other way around.
- "Monitoring / alerting / dashboard setup" depends on the production code paths it observes.

Children inherit their parent's wave (they execute under the parent's umbrella). Children may declare \
depends_on_indices referencing top-level task indices, but not other children.

Return ONLY valid JSON in this format (no markdown fences, no commentary):
[
  {{
    "title": "Set up project scaffolding",
    "description": "Initialize the project with the chosen tech stack...",
    "priority": "critical",
    "story_points": 3,
    "labels": ["devops", "backend"],
    "acceptance_criteria": [
      "Project builds and runs locally",
      "CI pipeline configured",
      "README with setup instructions"
    ],
    "depends_on_indices": [],
    "related_to_indices": [],
    "wave": 0,
    "sequence": 0,
    "children": [
      {{
        "title": "Configure database schema",
        "description": "Create initial migration...",
        "priority": "high",
        "story_points": 2,
        "labels": ["database", "backend"],
        "acceptance_criteria": ["Schema matches data model", "Migration runs cleanly"],
        "depends_on_indices": [0]
      }}
    ]
  }}
]"""


def _blueprint_to_text(content: dict[str, str]) -> str:
    """Convert blueprint content dict to readable text."""
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
    lines = []
    for key, label in section_labels.items():
        val = content.get(key, "").strip()
        if val:
            lines.append(f"## {label}\n{val}")
    return "\n\n".join(lines) if lines else "No blueprint content available."


def _parse_tasks_json(raw: str) -> list[dict] | None:
    """Parse a JSON array of tasks. If the response was truncated mid-task, drop
    the partial tail and return whatever full tasks we managed to parse — this
    keeps the wizard usable even when the model hits a token limit.
    """
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, list) else None
    except json.JSONDecodeError as e:
        logger.warning("Initial JSON parse failed (%s); attempting truncation recovery", e)

    # Find the last `},` and try parsing up to the prior closed object + closing `]`.
    last_close = raw.rfind("},")
    if last_close == -1:
        logger.error("Cannot recover truncated tasks output: no complete tasks found")
        logger.error("Raw output (first 500 chars): %s", raw[:500])
        return None
    candidate = raw[: last_close + 1] + "]"
    try:
        parsed = json.loads(candidate)
        if isinstance(parsed, list):
            logger.warning("Recovered %d tasks from truncated AI output", len(parsed))
            return parsed
    except json.JSONDecodeError as e:
        logger.error("Truncation recovery failed: %s", e)
        logger.error("Raw output (first 500 chars): %s", raw[:500])
    return None


def _sanitize_dep_indices(tasks: list[dict]) -> list[dict]:
    """Drop forward / self / out-of-range references from depends_on_indices.

    The orchestrator's wave scheduler assumes a DAG. If the model emits a cycle,
    we drop the offending edges and log rather than fail the whole preview —
    the user can still review and commit the rest.
    """
    n = len(tasks)
    for i, task in enumerate(tasks):
        deps = task.get("depends_on_indices") or []
        clean = [j for j in deps if isinstance(j, int) and 0 <= j < i]
        if len(clean) != len(deps):
            dropped = [j for j in deps if j not in clean]
            logger.warning("Dropped invalid depends_on_indices %s on task %d", dropped, i)
        task["depends_on_indices"] = clean

        rel = task.get("related_to_indices") or []
        rel_clean = [j for j in rel if isinstance(j, int) and 0 <= j < n and j != i]
        if len(rel_clean) != len(rel):
            logger.warning("Dropped invalid related_to_indices on task %d", i)
        task["related_to_indices"] = rel_clean
    return tasks


def _transitive_reduce_indices(tasks: list[dict]) -> list[dict]:
    """Drop edges in depends_on_indices that are redundant via another path.

    The AI consistently over-specifies hard dependencies (every later card listing
    every foundational card as a prereq) which makes nearly the entire backlog
    show up as Blocked. Transitive reduction keeps only the minimal set of edges
    that preserves the original reachability — so if A→B and B→C are both in the
    graph, the redundant A→C edge is removed.

    Mutates ``tasks`` in place and returns the same list. Logs the count of
    edges dropped per pass for observability.

    Operates on the top-level task list. Children (parent_card_id-style nesting)
    have their own depends_on_indices that point at top-level tasks; we don't
    reduce across the parent/child boundary because children always run within
    the parent's umbrella anyway.
    """
    n = len(tasks)
    if n == 0:
        return tasks

    # Build forward adjacency (parent → set of children that depend on it),
    # so we can BFS reachability from any direct prereq A excluding the edge A→C
    # itself when checking whether A can reach C through other intermediaries.
    direct: list[set[int]] = [set() for _ in range(n)]
    for i, task in enumerate(tasks):
        for dep in task.get("depends_on_indices") or []:
            if isinstance(dep, int) and 0 <= dep < i:
                direct[i].add(dep)

    dropped_total = 0
    for i in range(n):
        # For each direct prereq A of i, check if A can reach i through any
        # OTHER direct prereq of i. If yes, A→i is redundant.
        prereqs = list(direct[i])
        for a in prereqs:
            others = [b for b in direct[i] if b != a]
            if not others:
                continue
            # BFS from `a` through the (still-current) direct sets. We only need
            # to know whether `a` reaches any of `others`; if so, there's a path
            # a → … → b → i, so the direct a → i edge is redundant.
            seen: set[int] = set()
            stack = [a]
            redundant = False
            while stack:
                node = stack.pop()
                if node in seen:
                    continue
                seen.add(node)
                # `direct[k]` lists what k depends on. We want forward reachability
                # in the dependency direction — children of `node` (tasks that
                # depend on `node`). Find them by scanning all k > node where
                # node ∈ direct[k].
                for k in range(node + 1, n):
                    if node in direct[k]:
                        if k in others:
                            redundant = True
                            break
                        stack.append(k)
                if redundant:
                    break
            if redundant:
                direct[i].discard(a)
                dropped_total += 1

    if dropped_total:
        logger.info("Transitive reduction removed %d redundant depends_on edges", dropped_total)

    # Write the reduced sets back. Preserve the original list ordering so the
    # downstream code (which relies on positional indexing) sees deterministic
    # output between runs.
    for i, task in enumerate(tasks):
        original = task.get("depends_on_indices") or []
        kept = [d for d in original if d in direct[i]]
        task["depends_on_indices"] = kept

    return tasks


def _compute_waves_and_sequences(tasks: list[dict]) -> list[dict]:
    """Recompute wave + sequence from the (post-reduction) DAG.

    AI-supplied wave/sequence values are unreliable after we've reduced the
    graph, so we replace them with derived values:

    * ``wave[i]`` = ``max(wave[d] + 1 for d in deps)`` or 0 if deps is empty.
    * ``sequence[i]`` = stable index within the wave, ordered by the AI's
      original sequence hint when present, else by original position.
    """
    n = len(tasks)
    waves: list[int] = [0] * n
    for i, task in enumerate(tasks):
        deps = task.get("depends_on_indices") or []
        if deps:
            waves[i] = max((waves[d] + 1) for d in deps if 0 <= d < i)
        task["wave"] = waves[i]

    # Group by wave, sort within group by AI-hint sequence then original index.
    by_wave: dict[int, list[int]] = {}
    for i in range(n):
        by_wave.setdefault(waves[i], []).append(i)
    for wave in sorted(by_wave.keys()):
        ordered = sorted(
            by_wave[wave],
            key=lambda i: (
                tasks[i].get("sequence") if isinstance(tasks[i].get("sequence"), int) else 1_000_000,
                i,
            ),
        )
        for seq, i in enumerate(ordered):
            tasks[i]["sequence"] = seq

    return tasks


def _format_feedback_block(feedback_context: dict | None) -> str:
    """Render the regenerate-feedback dict as a prompt section. Empty string
    when no feedback was supplied. Placed near the top of the prompt so the
    model treats it as primary intent rather than an afterthought."""
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
            "Avoid generating anything semantically similar:\n"
            + "\n".join(f"  - {t}" for t in disliked)
        )
    parts.append("Now generate the new task list with the above guidance applied.\n")
    return "\n\n".join(parts)


async def preview_tasks_from_blueprint(
    blueprint_content: dict[str, str],
    db: AsyncSession,
    org_id: str | None = None,
    feedback_context: dict | None = None,
) -> list[dict]:
    """Call the AI to generate a task list from a blueprint. No DB writes.

    Returns the parsed (and dependency-sanitized) task list. The wizard's
    StoriesPane shows this to the user; the user can edit/remove tasks before
    persisting via persist_tasks_to_board().

    The prompt is composed from the org's ticket templates so user edits in the
    Planning Studio shape generation. Falls back to the legacy GENERATION_PROMPT
    when no org is in scope (e.g. tests mocking the path without org seeding).

    ``feedback_context`` is supplied when the user clicks Regenerate from the
    wizard. Shape: ``{"feedback": str, "disliked_titles": list[str]}``. We
    prepend it to the prompt so the model factors it in.
    """
    blueprint_text = _blueprint_to_text(blueprint_content)
    if blueprint_text == "No blueprint content available.":
        logger.warning("Cannot preview tasks — blueprint is empty")
        return []

    # Use the "fast" tier (Haiku) so the full request fits inside the Next.js
    # dev proxy's ~60s timeout. The "default" tier (Sonnet) was producing
    # 64-67s responses, which the proxy was killing before they reached the
    # browser. The user can edit/remove tasks in the wizard, so quality
    # tradeoff is fine for the preview.
    ai = await get_ai_client(org_id, db, task="fast")
    if org_id:
        sections = list(blueprint_content.keys()) if isinstance(blueprint_content, dict) else []
        prompt, _templates = await build_generation_prompt(blueprint_text, org_id, sections, db)
    else:
        prompt = GENERATION_PROMPT.format(blueprint_text=blueprint_text)

    feedback_block = _format_feedback_block(feedback_context)
    if feedback_block:
        prompt = f"{feedback_block}\n\n{prompt}"
        logger.info("Preview includes regeneration feedback (%d disliked titles, %d chars feedback)",
                    len(feedback_context.get("disliked_titles") or []),
                    len(feedback_context.get("feedback") or ""))

    logger.info("Previewing tasks from blueprint (provider=%s)", ai.provider)
    # 8192 tokens: typical 15-task output is ~16-20K chars (~6-7K tokens).
    # 4096 was truncating mid-string and breaking the JSON parse.
    raw = await ai.chat(
        messages=[{"role": "user", "content": prompt}],
        max_tokens=8192,
    )
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

    tasks = _parse_tasks_json(raw)
    if tasks is None:
        return []

    if not isinstance(tasks, list):
        logger.error("Expected list of tasks, got %s", type(tasks).__name__)
        return []

    tasks = _sanitize_dep_indices(tasks)
    tasks = _transitive_reduce_indices(tasks)
    tasks = _compute_waves_and_sequences(tasks)
    return tasks


async def persist_tasks_to_board(
    project_id: str,
    tasks: list[dict],
    db: AsyncSession,
    session_id: str | None = None,
) -> tuple[Board, int]:
    """Persist a parsed task list as Cards in the project's Backlog. Returns (board, card_count).

    Reads each task's optional ``template_slug`` and ``custom_fields`` and resolves
    them against the org's TicketTemplate set, stamping ``template_id`` and the
    template's current ``version`` on the Card so it survives later prompt edits.
    """

    board = await get_or_create_board(project_id, db)
    backlog_col = next((c for c in board.columns if c.name == "Backlog"), None)
    if not backlog_col:
        logger.error("No Backlog column found on board %s", board.id)
        return board, 0

    existing_count = len(backlog_col.cards) if backlog_col.cards else 0
    # Idempotent across the preview→persist boundary: preview already runs these,
    # but persist may also be called directly (legacy paths) so we re-run to be safe.
    tasks = _sanitize_dep_indices(tasks)
    tasks = _transitive_reduce_indices(tasks)
    tasks = _compute_waves_and_sequences(tasks)

    # Look up the project's org so we can resolve template slugs once for the whole batch.
    from sqlalchemy import select as _select  # local import to avoid touching module header

    from ..models.project import Project
    from ..services.ticket_template_service import get_org_ticket_templates

    proj_row = (
        await db.execute(_select(Project.org_id).where(Project.id == project_id))
    ).scalar_one_or_none()
    template_lookup: dict[str, tuple[str, int, list[str], int | None, str | None]] = {}
    if proj_row:
        org_templates = await get_org_ticket_templates(proj_row, db)
        for t in org_templates:
            template_lookup[t.slug] = (
                t.id,
                t.version,
                list(t.default_labels or []),
                t.default_story_points,
                t.default_priority,
            )

    def _apply_template(task_dict: dict) -> tuple[str | None, int | None, dict, str, list[str], int | None]:
        """Return (template_id, template_version, custom_fields, priority, labels, story_points)
        merging the task dict with template defaults for unset fields.
        """
        slug = task_dict.get("template_slug")
        defaults = template_lookup.get(slug) if isinstance(slug, str) else None
        custom_fields = task_dict.get("custom_fields") or {}
        if not isinstance(custom_fields, dict):
            custom_fields = {}

        priority = task_dict.get("priority")
        labels = task_dict.get("labels") or []
        sp = task_dict.get("story_points")

        if defaults:
            tmpl_id, tmpl_version, default_labels, default_sp, default_priority = defaults
            if not priority:
                priority = default_priority
            if not labels and default_labels:
                labels = list(default_labels)
            if sp is None and default_sp is not None:
                sp = default_sp
            return tmpl_id, tmpl_version, custom_fields, priority or "medium", labels, sp

        return None, None, custom_fields, priority or "medium", labels, sp

    created = 0
    index_to_card: dict[int, Card] = {}
    child_card_groups: dict[int, list[Card]] = {}

    for i, task in enumerate(tasks):
        tmpl_id, tmpl_ver, custom_fields, task_priority, task_labels, task_sp = _apply_template(task)
        card = Card(
            column_id=backlog_col.id,
            position=existing_count + i,
            title=task.get("title", f"Task {i + 1}"),
            description=task.get("description"),
            priority=task_priority,
            story_points=task_sp,
            labels=task_labels,
            acceptance_criteria=normalize_ac(task.get("acceptance_criteria", [])),
            wave=task.get("wave"),
            sequence=task.get("sequence"),
            auto_approve=task_priority in ("low", "medium"),
            session_id=session_id,
            template_id=tmpl_id,
            template_version=tmpl_ver,
            custom_fields=custom_fields,
        )
        db.add(card)
        await db.flush()
        await assign_friendly_id(card, project_id, db)
        index_to_card[i] = card
        created += 1

        # Children inherit their parent's wave + sequence so they share the
        # parent's exec label slot in the rendered board.
        parent_wave = task.get("wave")
        parent_sequence = task.get("sequence")
        children_for_task: list[Card] = []
        for j, child in enumerate(task.get("children", [])):
            c_tmpl_id, c_tmpl_ver, c_custom, c_priority, c_labels, c_sp = _apply_template(child)
            child_card = Card(
                column_id=backlog_col.id,
                position=existing_count + len(tasks) + created,
                title=child.get("title", f"Subtask {j + 1}"),
                description=child.get("description"),
                priority=c_priority,
                story_points=c_sp,
                labels=c_labels,
                acceptance_criteria=normalize_ac(child.get("acceptance_criteria", [])),
                parent_card_id=card.id,
                wave=parent_wave,
                sequence=parent_sequence,
                auto_approve=c_priority in ("low", "medium"),
                session_id=session_id,
                template_id=c_tmpl_id,
                template_version=c_tmpl_ver,
                custom_fields=c_custom,
            )
            db.add(child_card)
            await db.flush()
            await assign_friendly_id(child_card, project_id, db)
            children_for_task.append(child_card)
            created += 1
        child_card_groups[i] = children_for_task

    # Second pass — resolve depends_on_indices and related_to_indices to card IDs.
    for i, task in enumerate(tasks):
        dep_indices = task.get("depends_on_indices", [])
        if dep_indices:
            index_to_card[i].depends_on = [index_to_card[idx].id for idx in dep_indices if idx in index_to_card]

        rel_indices = task.get("related_to_indices", [])
        if rel_indices:
            index_to_card[i].related_to = [index_to_card[idx].id for idx in rel_indices if idx in index_to_card]

        children = task.get("children", [])
        child_cards = child_card_groups.get(i, [])
        for j, child_task in enumerate(children):
            if j >= len(child_cards):
                break
            child_dep_indices = child_task.get("depends_on_indices", [])
            if child_dep_indices:
                child_cards[j].depends_on = [
                    index_to_card[idx].id for idx in child_dep_indices if idx in index_to_card
                ]

    await db.commit()
    logger.info("Persisted %d cards for project %s", created, project_id)

    result = await db.execute(
        select(Board).where(Board.id == board.id).options(selectinload(Board.columns).selectinload(BoardColumn.cards))
    )
    return result.scalar_one(), created


async def generate_tasks_from_blueprint(
    project_id: str,
    blueprint_content: dict[str, str],
    db: AsyncSession,
    org_id: str | None = None,
    session_id: str | None = None,
) -> Board:
    """Use Claude to generate kanban cards from a blueprint, then persist them.

    Kept as the entry point for the legacy auto-generation path
    (`_generate_tasks_on_complete` in the sessions router). The wizard flow
    instead calls preview_tasks_from_blueprint() and persist_tasks_to_board()
    separately so the user can edit between the two.
    """
    tasks = await preview_tasks_from_blueprint(blueprint_content, db, org_id=org_id)
    if not tasks:
        return await get_or_create_board(project_id, db)
    board, _ = await persist_tasks_to_board(project_id, tasks, db, session_id=session_id)
    return board


# ─── Single-task regeneration ────────────────────────────────────────────────


REGEN_FIELDS_ALLOWED = {
    "title",
    "description",
    "acceptance_criteria",
    "priority",
    "story_points",
    "labels",
    "template_slug",
    "custom_fields",
}


def _format_existing_task_for_prompt(task: dict) -> str:
    """Render an existing task as a labelled block the model can read."""
    lines: list[str] = [f"Title: {task.get('title', '(no title)')}"]
    if task.get("template_slug"):
        lines.append(f"Type: {task['template_slug']}")
    if task.get("priority"):
        lines.append(f"Priority: {task['priority']}")
    if task.get("story_points") is not None:
        lines.append(f"Story points: {task['story_points']}")
    if task.get("labels"):
        lines.append(f"Labels: {', '.join(task['labels'])}")
    if task.get("description"):
        lines.append(f"Description: {task['description']}")
    if task.get("acceptance_criteria"):
        lines.append(
            "Acceptance criteria:\n"
            + "\n".join(
                f"  - [{'x' if (isinstance(c, dict) and c.get('done')) else ' '}] "
                f"{c['text'] if isinstance(c, dict) else c}"
                for c in task["acceptance_criteria"]
            )
        )
    return "\n".join(lines)


def _format_template_for_regen_prompt(template) -> str:
    """Render a single TicketTemplate as a detailed spec block for the
    single-task regen prompt — the user's planning-studio customisations are
    the source of truth, so we surface every relevant field."""
    parts: list[str] = [f"slug: {template.slug}", f"name: {template.name}"]
    if template.description:
        parts.append(f"description: {template.description}")
    if template.prompt_fragment:
        parts.append(f"guidance: {template.prompt_fragment}")
    if template.default_priority:
        parts.append(f"default priority: {template.default_priority}")
    if template.default_story_points is not None:
        parts.append(f"default story points: {template.default_story_points}")
    if template.default_labels:
        parts.append(f"default labels: {', '.join(template.default_labels)}")
    if template.acceptance_criteria_template:
        bullets = "\n".join(f"      · {c}" for c in template.acceptance_criteria_template)
        parts.append("acceptance criteria template — use these as a starting point:\n" + bullets)
    if template.field_schema:
        keys = []
        for f in template.field_schema:
            if isinstance(f, dict) and f.get("key"):
                key = f["key"]
                ftype = f.get("type", "text")
                label = f.get("label", key)
                keys.append(f"      · {key} ({ftype}) — {label}")
        if keys:
            parts.append("custom_fields schema — populate these in the task's `custom_fields` object:\n"
                         + "\n".join(keys))
    return "\n  ".join(parts)


def _build_template_guidance(
    templates: list,
    current_slug: str | None,
    regenerating_slug: bool,
) -> str:
    """Pick which template spec to show the model.

    * If the task has a slug AND we're NOT regenerating it → show ONLY that
      template's full spec so the AI sticks to the user's template choice.
    * If we ARE regenerating slug (or no current slug) → show all templates
      so the AI can pick one and apply its rules.
    """
    if not templates:
        return "(no ticket templates configured — leave template_slug as null)"

    by_slug = {t.slug: t for t in templates}

    if current_slug and not regenerating_slug and current_slug in by_slug:
        active = by_slug[current_slug]
        return (
            f"This task uses the '{current_slug}' template — keep it. The output MUST honour:\n  "
            + _format_template_for_regen_prompt(active)
        )

    # Picking from all templates (or no current slug): brief listing + active spec if any
    blocks = ["Available templates — pick the slug that fits and apply its rules:"]
    for t in templates:
        blocks.append("  " + _format_template_for_regen_prompt(t))
    if current_slug and current_slug in by_slug:
        blocks.append(f"\nCurrent slug is '{current_slug}'; you may keep it or change it.")
    return "\n\n".join(blocks)


async def regenerate_single_task(
    existing_task: dict,
    fields_to_regenerate: list[str],
    blueprint_content: dict[str, str],
    context_titles: list[str],
    feedback: str | None,
    db: AsyncSession,
    org_id: str | None = None,
) -> dict:
    """Ask the AI to regenerate selected fields of one task. Returns a dict
    that's the existing task merged with the regenerated fields — caller can
    drop it back into its position in the wizard's task list.

    Dependency / wave / sequence / related_to fields are NEVER regenerated;
    they're system-managed and changing them would break the dep graph.
    """
    invalid = [f for f in fields_to_regenerate if f not in REGEN_FIELDS_ALLOWED]
    if invalid:
        raise ValueError(f"Cannot regenerate fields: {invalid}. Allowed: {sorted(REGEN_FIELDS_ALLOWED)}")
    if not fields_to_regenerate:
        raise ValueError("fields_to_regenerate must be non-empty")

    blueprint_text = _blueprint_to_text(blueprint_content)
    other_titles_block = (
        "\n".join(f"  - {t}" for t in context_titles if t and t != existing_task.get("title"))
        or "  (none)"
    )

    feedback_block = ""
    if feedback and feedback.strip():
        feedback_block = (
            "USER FEEDBACK on what's wrong with the current task — let this guide the rewrite:\n"
            f"{feedback.strip()[:2000]}\n\n"
        )

    fields_block = ", ".join(fields_to_regenerate)

    # Load the org's planning-studio templates so the regen output respects
    # the same shape the bulk preview uses. Falls back to a "no templates"
    # hint when the org has none (or no org_id supplied — e.g. tests).
    template_guidance = "(no ticket templates loaded)"
    if org_id:
        from .ticket_template_service import ensure_org_ticket_templates, get_org_ticket_templates

        await ensure_org_ticket_templates(org_id, db)
        org_templates = await get_org_ticket_templates(org_id, db)
        template_guidance = _build_template_guidance(
            templates=org_templates,
            current_slug=existing_task.get("template_slug"),
            regenerating_slug="template_slug" in fields_to_regenerate,
        )

    prompt = f"""You are regenerating ONE task in an existing kanban backlog. \
Keep the task's intent the same — it still maps to the same dependency slot — but \
rewrite the fields the user asked for.

PROJECT BLUEPRINT (for context):
{blueprint_text}

TICKET TEMPLATE RULES — these come from the user's planning studio and \
ARE THE SOURCE OF TRUTH for ticket shape. The regenerated fields must conform:
{template_guidance}

OTHER TASKS IN THIS PLAN (don't duplicate these — this task should stay distinct):
{other_titles_block}

CURRENT TASK:
{_format_existing_task_for_prompt(existing_task)}

{feedback_block}REGENERATE THESE FIELDS ONLY: {fields_block}

Rules:
- Output a single JSON object with the regenerated fields. You may include other fields too — \
they will be ignored.
- For acceptance_criteria, output 2-4 concrete, observable bullets as a JSON array of strings. \
If the active template provides an acceptance_criteria_template, use it as the starting shape.
- For priority, use one of: critical, high, medium, low. Default to the active template's \
default_priority if you have no strong reason otherwise.
- For story_points, use a Fibonacci value: 1, 2, 3, 5, 8. Default to the active template's \
default_story_points if no signal indicates otherwise.
- For labels, output a JSON array of short tag strings. Always include the active template's \
default_labels and add domain tags (frontend, backend, etc) that apply.
- For template_slug, choose from the available templates listed above. Don't invent slugs.
- If the active template defines a custom_fields schema, populate the matching keys in a \
"custom_fields" object — the schema lists each key + its type.
- Do NOT include depends_on_indices, wave, sequence, or related_to_indices — those are system-managed.

Return ONLY the JSON object, no fences, no commentary.
"""

    ai = await get_ai_client(org_id, db, task="fast")
    logger.info(
        "Regenerating single task (provider=%s, fields=%s, has_feedback=%s)",
        ai.provider,
        fields_to_regenerate,
        bool(feedback),
    )
    raw = await ai.chat(messages=[{"role": "user", "content": prompt}], max_tokens=2048)
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

    try:
        new_data = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.error("Single-task regen JSON parse failed: %s — raw: %s", e, raw[:300])
        raise ValueError(f"AI returned invalid JSON: {e}") from e
    if not isinstance(new_data, dict):
        raise ValueError(f"AI returned {type(new_data).__name__}, expected object")

    # Merge: only swap the requested fields. System-managed fields stay put.
    merged = dict(existing_task)
    for f in fields_to_regenerate:
        if f in new_data:
            merged[f] = new_data[f]
    for system_field in ("depends_on_indices", "related_to_indices", "wave", "sequence"):
        merged[system_field] = existing_task.get(system_field)
    return merged
