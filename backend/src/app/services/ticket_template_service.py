"""Ticket template seeding, lookup, and prompt composition for AI-driven generation.

Mirrors the shape of ``services/blueprint_template_service.py`` so the planning-
studio CRUD UX can use the same patterns. System templates are seeded on first
access for an org via ``ensure_org_ticket_templates``; users can edit them or
add custom ones from the studio.

The composer ``build_generation_prompt`` is what task_generator.py calls — it
loads applicable template fragments based on the blueprint sections in the
session and renders a prompt that nudges Claude to tag every generated task
with a ``template_slug``. The create-loop in task_generator stamps the
resolved ``template_id`` and ``template_version`` so old cards keep their
shape when a template is later edited.
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.ticket_template import TicketTemplate

logger = logging.getLogger(__name__)


# Per-org seeding lock — same pattern as blueprint_template_service so concurrent
# first-load requests can't race past the existence check and double-seed.
_seed_locks: dict[str, asyncio.Lock] = {}


# ─── System templates ───────────────────────────────────────────────────────


SYSTEM_TICKET_TEMPLATES: list[dict] = [
    {
        "slug": "feature",
        "name": "Feature",
        "icon": "sparkles",
        "description": "A new capability for end users.",
        "default_priority": "high",
        "default_story_points": 5,
        "default_labels": ["feature"],
        "prompt_fragment": (
            "Use the 'feature' template for tasks that introduce new user-facing capabilities. "
            "Acceptance criteria should describe observable user outcomes, not implementation steps. "
            "Aim for 1-3 day stories."
        ),
        "field_schema": [
            {"key": "user_story", "label": "User story", "type": "text", "required": False},
        ],
        "acceptance_criteria_template": [
            "User can ___",
            "System persists ___ across reloads",
            "Documented in the relevant section",
        ],
        "applicability": {"sections": ["ui_ux", "api_integrations", "architecture"]},
    },
    {
        "slug": "bug",
        "name": "Bug",
        "icon": "bug",
        "description": "A defect to fix in existing behavior.",
        "default_priority": "high",
        "default_story_points": 2,
        "default_labels": ["bug"],
        "prompt_fragment": (
            "Use the 'bug' template only for tasks that fix incorrect existing behavior. "
            "Always include a reproduction steps line and an expected-vs-actual comparison."
        ),
        "field_schema": [
            {"key": "repro_steps", "label": "Reproduction steps", "type": "text", "required": True},
            {"key": "expected", "label": "Expected behavior", "type": "text", "required": False},
            {"key": "actual", "label": "Actual behavior", "type": "text", "required": False},
        ],
        "acceptance_criteria_template": [
            "Reproduction steps no longer trigger the bug",
            "Regression test added",
        ],
        "applicability": {"sections": ["risks_unknowns", "open_questions"]},
    },
    {
        "slug": "chore",
        "name": "Chore",
        "icon": "wrench",
        "description": "Maintenance, refactoring, or housekeeping.",
        "default_priority": "low",
        "default_story_points": 2,
        "default_labels": ["chore"],
        "prompt_fragment": (
            "Use 'chore' for non-feature, non-bug maintenance: refactors, dependency upgrades, "
            "linter fixes, build hygiene. Acceptance criteria should describe the cleaner state."
        ),
        "field_schema": [],
        "acceptance_criteria_template": [
            "Tests still pass",
            "No behavior change observable to users",
        ],
        "applicability": {"sections": ["infrastructure"]},
    },
    {
        "slug": "spike",
        "name": "Spike",
        "icon": "compass",
        "description": "Time-boxed investigation to inform a later decision.",
        "default_priority": "medium",
        "default_story_points": 3,
        "default_labels": ["spike", "research"],
        "prompt_fragment": (
            "Use 'spike' for tasks whose deliverable is a written recommendation, not shipped code. "
            "Time-box explicitly. Acceptance criteria should describe a documented decision."
        ),
        "field_schema": [
            {"key": "timebox_days", "label": "Time box (days)", "type": "number", "required": True},
        ],
        "acceptance_criteria_template": [
            "Decision document published",
            "Trade-offs and recommended option captured",
        ],
        "applicability": {"sections": ["open_questions", "risks_unknowns"]},
    },
    {
        "slug": "tech_debt",
        "name": "Tech debt",
        "icon": "alert-triangle",
        "description": "Known limitation or shortcut to revisit.",
        "default_priority": "low",
        "default_story_points": 3,
        "default_labels": ["tech-debt"],
        "prompt_fragment": (
            "Use 'tech_debt' for known shortcomings the team has consciously deferred. "
            "Always include the original context and the cost of carrying it."
        ),
        "field_schema": [
            {"key": "incurred_in", "label": "Originally introduced in", "type": "text", "required": False},
        ],
        "acceptance_criteria_template": [
            "Shortcut replaced with the long-term solution",
            "No new debt introduced as part of the fix",
        ],
        "applicability": {"sections": []},
    },
]


# ─── Field layout (unified built-in + custom) ───────────────────────────────


# Default built-in entries shared by every system template. The Studio editor
# lets users rename / reorder / hide these but the keys + types stay locked
# because they map to actual Card columns.
BUILTIN_LAYOUT_ENTRIES: list[dict] = [
    {"key": "title", "label": "Title", "type": "title", "source": "builtin",
     "placement": "header", "visible": True, "required": True},
    {"key": "description", "label": "Description", "type": "rich_text", "source": "builtin",
     "placement": "main", "visible": True, "required": False},
    {"key": "acceptance_criteria", "label": "Acceptance criteria", "type": "acceptance_criteria",
     "source": "builtin", "placement": "main", "visible": True, "required": False},
    {"key": "activity", "label": "Activity", "type": "activity", "source": "builtin",
     "placement": "main", "visible": True, "required": False},
    {"key": "status", "label": "Status", "type": "status", "source": "builtin",
     "placement": "sidebar", "visible": True, "required": False},
    {"key": "priority", "label": "Priority", "type": "priority", "source": "builtin",
     "placement": "sidebar", "visible": True, "required": False},
    {"key": "assignee", "label": "Assignee", "type": "assignee", "source": "builtin",
     "placement": "sidebar", "visible": True, "required": False},
    {"key": "story_points", "label": "Story points", "type": "story_points", "source": "builtin",
     "placement": "sidebar", "visible": True, "required": False},
    {"key": "labels", "label": "Labels", "type": "labels", "source": "builtin",
     "placement": "sidebar", "visible": True, "required": False},
    {"key": "sync", "label": "Sync", "type": "sync", "source": "builtin",
     "placement": "sidebar", "visible": True, "required": False},
    {"key": "links", "label": "Links", "type": "links", "source": "builtin",
     "placement": "sidebar", "visible": True, "required": False},
]

BUILTIN_KEYS: set[str] = {entry["key"] for entry in BUILTIN_LAYOUT_ENTRIES}
BUILTIN_TYPE_BY_KEY: dict[str, str] = {entry["key"]: entry["type"] for entry in BUILTIN_LAYOUT_ENTRIES}


def default_field_layout(custom_field_schema: list | None = None) -> list[dict]:
    """Return the default unified layout: built-ins followed by custom fields
    derived from the legacy ``field_schema``. The router validates user-supplied
    layouts against this same shape on save.
    """
    layout = [dict(entry) for entry in BUILTIN_LAYOUT_ENTRIES]
    for entry in custom_field_schema or []:
        if not isinstance(entry, dict):
            continue
        key = entry.get("key")
        label = entry.get("label")
        if not key or not label:
            continue
        ftype = entry.get("type") or "text"
        # Heuristic: longer-form types live in the main column; short ones in the sidebar.
        placement = "main" if ftype == "rich_text" else "sidebar"
        layout.append({
            "key": f"custom:{key}",
            "label": label,
            "type": ftype,
            "source": "custom",
            "placement": placement,
            "visible": True,
            "required": bool(entry.get("required", False)),
            "options": entry.get("options") or None,
        })
    return layout


# ─── Seeding ─────────────────────────────────────────────────────────────────


async def _seed_system_templates(org_id: str, db: AsyncSession) -> None:
    """Insert the system ticket templates for an org (idempotent under the lock)."""
    for sort_order, spec in enumerate(SYSTEM_TICKET_TEMPLATES):
        field_schema = spec.get("field_schema", [])
        template = TicketTemplate(
            org_id=org_id,
            slug=spec["slug"],
            name=spec["name"],
            description=spec.get("description"),
            icon=spec.get("icon", "zap"),
            default_priority=spec.get("default_priority"),
            default_story_points=spec.get("default_story_points"),
            default_labels=spec.get("default_labels", []),
            prompt_fragment=spec.get("prompt_fragment", ""),
            field_schema=field_schema,
            field_layout=default_field_layout(field_schema),
            acceptance_criteria_template=spec.get("acceptance_criteria_template", []),
            applicability=spec.get("applicability", {}),
            is_system=True,
            sort_order=sort_order,
        )
        db.add(template)
    await db.flush()
    logger.info("Seeded %d ticket templates for org %s", len(SYSTEM_TICKET_TEMPLATES), org_id)


async def ensure_org_ticket_templates(org_id: str, db: AsyncSession) -> None:
    """Seed the system ticket templates for an org if none exist yet."""
    lock = _seed_locks.setdefault(org_id, asyncio.Lock())
    async with lock:
        result = await db.execute(
            select(TicketTemplate.id)
            .where(TicketTemplate.org_id == org_id, TicketTemplate.deleted_at.is_(None))
            .limit(1)
        )
        if result.scalar_one_or_none() is not None:
            return
        await _seed_system_templates(org_id, db)
        await db.commit()


# ─── Queries ─────────────────────────────────────────────────────────────────


async def get_org_ticket_templates(org_id: str, db: AsyncSession) -> list[TicketTemplate]:
    """List all non-deleted ticket templates for an org, ordered by sort_order."""
    result = await db.execute(
        select(TicketTemplate)
        .where(TicketTemplate.org_id == org_id, TicketTemplate.deleted_at.is_(None))
        .order_by(TicketTemplate.sort_order, TicketTemplate.name)
    )
    return list(result.scalars().all())


async def get_template_by_slug(
    org_id: str, slug: str, db: AsyncSession
) -> TicketTemplate | None:
    result = await db.execute(
        select(TicketTemplate).where(
            TicketTemplate.org_id == org_id,
            TicketTemplate.slug == slug,
            TicketTemplate.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


# ─── Prompt composition ─────────────────────────────────────────────────────


_BASE_GENERATION_PROMPT = """You are a senior engineering project manager. Given the project blueprint below, \
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
- For each task, include a "depends_on_indices" array listing the 0-based indices of tasks this one \
depends on. The first task (index 0) typically has no dependencies. Later tasks should reference \
earlier ones they need completed first. Group independent tasks together so they can run in parallel.
- Tag each task with a "template_slug" matching one of the available templates below; if none fit, use null.
- For tasks whose template defines custom fields, populate "custom_fields" with the requested keys.

AVAILABLE TEMPLATES:
{templates_block}

Return ONLY valid JSON in this format:
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
    "template_slug": "feature",
    "custom_fields": {{}},
    "children": [
      {{
        "title": "Configure database schema",
        "description": "Create initial migration...",
        "priority": "high",
        "story_points": 2,
        "labels": ["database", "backend"],
        "acceptance_criteria": ["Schema matches data model", "Migration runs cleanly"],
        "depends_on_indices": [0],
        "template_slug": "feature"
      }}
    ]
  }}
]"""


def _render_template_block(templates: list[TicketTemplate]) -> str:
    if not templates:
        return "(none defined — leave template_slug as null)"
    lines: list[str] = []
    for t in templates:
        lines.append(f"- slug: {t.slug} ({t.name})")
        if t.prompt_fragment:
            lines.append(f"  guidance: {t.prompt_fragment}")
        if t.field_schema:
            keys = ", ".join(
                f"{f.get('key')} ({f.get('type', 'text')})"
                for f in t.field_schema
                if isinstance(f, dict)
            )
            if keys:
                lines.append(f"  custom_fields: {keys}")
    return "\n".join(lines)


def _matches_applicability(template: TicketTemplate, sections: list[str]) -> bool:
    """Whether a template's applicability rules match the session sections."""
    appl = template.applicability or {}
    section_filter = appl.get("sections") or []
    if not section_filter:
        return True  # no constraints → always applicable
    return any(s in section_filter for s in sections)


async def pick_applicable_templates(
    org_id: str, sections: list[str], db: AsyncSession
) -> list[TicketTemplate]:
    """Return the templates that should be offered to the LLM for this session.

    Always includes templates with no applicability constraints (e.g. tech_debt).
    Filters the section-restricted ones by the session's blueprint sections so
    we don't bias generation toward a template the project doesn't actually use.
    """
    await ensure_org_ticket_templates(org_id, db)
    all_templates = await get_org_ticket_templates(org_id, db)
    return [t for t in all_templates if _matches_applicability(t, sections)]


async def build_generation_prompt(
    blueprint_text: str,
    org_id: str,
    sections: list[str],
    db: AsyncSession,
) -> tuple[str, list[TicketTemplate]]:
    """Render the LLM prompt + return the template list so the create loop can resolve slugs."""
    templates = await pick_applicable_templates(org_id, sections, db)
    block = _render_template_block(templates)
    return _BASE_GENERATION_PROMPT.format(blueprint_text=blueprint_text, templates_block=block), templates
