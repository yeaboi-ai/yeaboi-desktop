"""Seed a sample workspace (project + session + blueprint + board) for a new org.

Called from `POST /api/orgs` so first-time users land on a populated workspace
instead of an empty projects list. The demo project is marked `is_demo=True` so
the frontend can mount a guided tour and we can exclude it from plan-limit counts
later.

The seed is idempotent on the team: if a `is_demo=True` project already exists
for the team, it's returned unchanged. The caller is responsible for committing
the surrounding transaction; this service only flushes.
"""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.blueprint import BlueprintIteration, BlueprintSnapshot
from ..models.board import Board, BoardColumn, Card
from ..models.project import Project
from ..models.session import ChatMessage, Participant, Session, TranscriptEntry

logger = logging.getLogger(__name__)


DEMO_PROJECT_NAME = "Demo: Plant Care App"
DEMO_PROJECT_KEY = "DEMO"
DEMO_PROJECT_DESCRIPTION = (
    "A sample project so you can see how a planning conversation becomes a "
    "blueprint and a board. Delete it whenever you're ready."
)
DEMO_SESSION_TITLE = "Kickoff: what should the Plant Care App do?"
DEMO_SESSION_INITIAL_IDEA = (
    "An app that reminds me to water my plants and tells me when one looks "
    "unhealthy from a photo."
)

# A short, realistic transcript so the recap screen has something to show.
DEMO_TRANSCRIPT: list[tuple[str, str]] = [
    ("Facilitator", "Tell me about the app you have in mind."),
    (
        "You",
        "I want something that reminds me to water my plants. I keep killing "
        "them by forgetting.",
    ),
    ("Facilitator", "How would the app know when each plant needs watering?"),
    (
        "You",
        "I'd add each plant once with its species, and it would use a schedule "
        "from a database — succulents weekly, ferns every two days, that kind "
        "of thing.",
    ),
    ("Facilitator", "Any other features you'd want beyond reminders?"),
    (
        "You",
        "Yeah — I'd love to take a photo of a sick-looking plant and have it "
        "tell me what's wrong. Overwatered, sunburn, pest, that sort of thing.",
    ),
    ("Facilitator", "Who is this for — just you, or do you imagine others using it?"),
    (
        "You",
        "Other people too. New plant owners mostly. The diagnosis part is the "
        "thing they'd really value.",
    ),
    ("Facilitator", "What platform — phone, web, both?"),
    ("You", "Phone first. iOS to start. Web maybe later."),
    ("Facilitator", "Any concerns about the photo diagnosis being wrong?"),
    (
        "You",
        "Yes — I'd want it to say how confident it is, and link out to care "
        "guides instead of just declaring a verdict.",
    ),
    ("Facilitator", "Got it. Let me draft the blueprint and a starting board."),
]

# Chat-side messages (assistant summaries, user nudges) keep the recap drawer
# from looking empty.
DEMO_CHAT: list[tuple[str, str, str]] = [
    # (message_type, speaker_name, content)
    (
        "system",
        "Facilitator",
        "Welcome — I'll listen and structure what we discuss into a blueprint as we go.",
    ),
    (
        "chat",
        "You",
        "Sounds good. Let's start with the watering reminders feature.",
    ),
    (
        "system",
        "Facilitator",
        "Captured: photo-based diagnosis is the differentiating feature. "
        "Adding it to the blueprint under Project Overview.",
    ),
]

DEMO_BLUEPRINT_CONTENT: dict[str, str] = {
    "project_overview": (
        "A mobile-first app that helps casual plant owners keep their plants "
        "alive through species-aware watering reminders and on-demand photo "
        "diagnosis of common plant health issues."
    ),
    "goals_constraints": (
        "- Get a new user to their first reminder in under 60 seconds.\n"
        "- Photo diagnosis must surface a confidence score, never a bare verdict.\n"
        "- Phone-first; no desktop client at launch."
    ),
    "users_personas": (
        "Primary: new plant owners (1–10 plants) who want guardrails, not a "
        "horticulture textbook. Secondary: enthusiasts with larger collections "
        "who want a single source of truth for care schedules."
    ),
    "team_capacity": "One full-stack engineer, one designer (50%), shipping iOS first.",
    "architecture": (
        "Native iOS client (Swift) talking to a small FastAPI service. Species → "
        "care schedule lives in Postgres; image diagnosis calls a vision model "
        "via an internal proxy so we can swap providers without an app update."
    ),
    "tech_stack": "Swift / SwiftUI · FastAPI · Postgres · S3 · OpenAI Vision (proxied).",
    "api_integrations": (
        "Push notifications via APNs. Vision model behind an internal proxy. "
        "No third-party data sources at launch."
    ),
    "ui_ux": (
        "Two primary surfaces: a plant list (next-watering-due first) and a "
        "diagnosis screen that's one tap from anywhere. Reminders are the "
        "default empty-state action."
    ),
    "security_compliance": (
        "User photos stored in S3 with per-user prefixes; signed URLs only. "
        "No PII beyond email and device token."
    ),
    "infrastructure": (
        "Backend on a single-region container service to start; CDN-fronted "
        "static assets. Postgres backups daily."
    ),
    "risks_unknowns": (
        "- Vision model false positives could mislead users — confidence "
        "thresholds and a 'show me why' link mitigate this.\n"
        "- Notification fatigue if reminders fire when the user is asleep — "
        "respect quiet hours from day one."
    ),
    "out_of_scope": (
        "Community features, plant trading, fertiliser logging, multi-user "
        "households. All deferred to a later iteration."
    ),
    "open_questions": (
        "- Do we localise care schedules by climate zone at launch?\n"
        "- Should diagnosis history be private by default or shareable?"
    ),
}


# (title, description, priority, column_key, depends_on_titles)
# column_key ∈ {"backlog", "in_progress", "done"}
DEMO_CARDS: list[tuple[str, str, str, str, list[str]]] = [
    (
        "Add a plant to the list",
        "User can name a plant, pick a species, and see the next-watering-due time.",
        "high",
        "in_progress",
        [],
    ),
    (
        "Local watering reminders (APNs)",
        "Reminders fire at the species' default cadence; respects quiet hours.",
        "high",
        "in_progress",
        ["Add a plant to the list"],
    ),
    (
        "Species → care schedule seed data",
        "Seed 30 common species with default watering cadence and light needs.",
        "medium",
        "backlog",
        [],
    ),
    (
        "Photo capture + upload",
        "Camera button on the plant card; stores image under the user's S3 prefix.",
        "high",
        "backlog",
        ["Add a plant to the list"],
    ),
    (
        "Diagnosis call to vision proxy",
        "POST image to /api/diagnose; render result + confidence; never bare verdicts.",
        "critical",
        "backlog",
        ["Photo capture + upload"],
    ),
    (
        "Confidence-aware result UI",
        "Show confidence as a bar; below 60% show 'inconclusive — try a clearer photo'.",
        "medium",
        "backlog",
        ["Diagnosis call to vision proxy"],
    ),
    (
        "Quiet-hours setting",
        "Time-range picker in Settings; reminders queue until the window ends.",
        "low",
        "backlog",
        ["Local watering reminders (APNs)"],
    ),
    (
        "Project scaffolding",
        "iOS app target, FastAPI service, Postgres schema, CI green on main.",
        "high",
        "done",
        [],
    ),
]


async def seed_demo_workspace(
    db: AsyncSession,
    *,
    org_id: str,
    team_id: str,
    user_id: str,
) -> Project:
    """Create a sample project + session + blueprint + board for a new org.

    Idempotent: returns the existing demo project for the team if one already
    exists. The caller commits the surrounding transaction; this function only
    flushes so the org-create POST stays atomic.
    """
    existing = (
        await db.execute(
            select(Project).where(
                Project.team_id == team_id,
                Project.is_demo.is_(True),
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        logger.info("Demo workspace already seeded for team %s — returning %s", team_id, existing.id)
        return existing

    project = Project(
        name=DEMO_PROJECT_NAME,
        description=DEMO_PROJECT_DESCRIPTION,
        owner_id=user_id,
        org_id=org_id,
        team_id=team_id,
        key=DEMO_PROJECT_KEY,
        card_counter=len(DEMO_CARDS),
        is_demo=True,
    )
    db.add(project)
    await db.flush()

    iteration = BlueprintIteration(
        project_id=project.id,
        org_id=org_id,
        iteration_number=1,
        label="v1",
        display_name="v1 — first cut",
        status="ready",
    )
    db.add(iteration)
    await db.flush()

    db.add(
        BlueprintSnapshot(
            project_id=project.id,
            org_id=org_id,
            iteration_id=iteration.id,
            version_number=1,
            content=DEMO_BLUEPRINT_CONTENT,
            created_by="system",
        )
    )

    session = Session(
        project_id=project.id,
        org_id=org_id,
        status="completed",
        title=DEMO_SESSION_TITLE,
        initial_idea=DEMO_SESSION_INITIAL_IDEA,
        iteration_id=iteration.id,
        ai_config={"assertiveness": "balanced", "muted": False, "persona": "pm"},
    )
    db.add(session)
    await db.flush()

    db.add(Participant(session_id=session.id, user_id=user_id, role="host"))

    for speaker, text in DEMO_TRANSCRIPT:
        db.add(
            TranscriptEntry(
                session_id=session.id,
                speaker_id=user_id if speaker == "You" else None,
                speaker_name=speaker,
                text=text,
                is_final=True,
            )
        )

    for message_type, speaker_name, content in DEMO_CHAT:
        db.add(
            ChatMessage(
                session_id=session.id,
                user_id=user_id if speaker_name == "You" else None,
                content=content,
                message_type=message_type,
                speaker_name=speaker_name,
            )
        )

    board = Board(project_id=project.id, org_id=org_id, iteration_id=iteration.id)
    db.add(board)
    await db.flush()

    columns = {
        "backlog": BoardColumn(
            board_id=board.id, name="Backlog", position=0, is_start_state=True
        ),
        "in_progress": BoardColumn(
            board_id=board.id, name="In Progress", position=1, wip_limit=3
        ),
        "done": BoardColumn(
            board_id=board.id, name="Done", position=2, is_done_state=True
        ),
    }
    for column in columns.values():
        db.add(column)
    await db.flush()

    title_to_card: dict[str, Card] = {}
    # Cards intentionally omit `friendly_id` — that column is globally
    # unique, and if two demo projects exist (e.g. after a soft-delete and
    # re-onboarding) the second seed would collide on `uq_cards_friendly_id`.
    # `number` is still set so the UI can render a stable ordinal if needed.
    column_positions: dict[str, int] = {"backlog": 0, "in_progress": 0, "done": 0}
    for idx, (title, description, priority, column_key, _depends) in enumerate(DEMO_CARDS, start=1):
        column = columns[column_key]
        card = Card(
            column_id=column.id,
            position=column_positions[column_key],
            project_id=project.id,
            title=title,
            description=description,
            priority=priority,
            number=idx,
            session_id=session.id,
        )
        column_positions[column_key] += 1
        db.add(card)
        title_to_card[title] = card
    await db.flush()

    for title, _description, _priority, _column_key, depends in DEMO_CARDS:
        if not depends:
            continue
        card = title_to_card[title]
        card.depends_on = [title_to_card[dep_title].id for dep_title in depends if dep_title in title_to_card]
    await db.flush()

    logger.info(
        "Demo workspace seeded: project=%s session=%s board=%s cards=%d",
        project.id,
        session.id,
        board.id,
        len(DEMO_CARDS),
    )
    return project
