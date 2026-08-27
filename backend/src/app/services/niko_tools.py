"""Niko tool definitions and executors.

Each tool has a schema (for Claude tool_use) and an async executor
that calls existing service layer functions.
"""

from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.orm import selectinload

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from ..models.organization import Organization
    from ..models.user import User

logger = logging.getLogger(__name__)

# ─── Tool Schemas ────────────────────────────────────────────────────────────

TOOL_DEFINITIONS: list[dict] = [
    # ── Projects ──
    {
        "name": "list_projects",
        "description": "List all projects the user has access to in their current team.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_project",
        "description": "Get details about a specific project including name, description, and session count.",
        "input_schema": {
            "type": "object",
            "properties": {"project_id": {"type": "string", "description": "The project ID"}},
            "required": ["project_id"],
        },
    },
    {
        "name": "create_project",
        "description": "Create a new project. If only description is provided, a name will be auto-generated.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Project name (2-5 words)"},
                "description": {"type": "string", "description": "Brief project description"},
            },
            "required": [],
        },
    },
    {
        "name": "update_project",
        "description": "Update a project's name or description.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string", "description": "The project ID"},
                "name": {"type": "string", "description": "New project name"},
                "description": {"type": "string", "description": "New project description"},
            },
            "required": ["project_id"],
        },
    },
    {
        "name": "delete_project",
        "description": "Delete a project and all its data. This is irreversible. Only call after user confirms.",
        "input_schema": {
            "type": "object",
            "properties": {"project_id": {"type": "string", "description": "The project ID to delete"}},
            "required": ["project_id"],
        },
    },
    # ── Sessions ──
    {
        "name": "list_sessions",
        "description": "List all planning sessions for a project.",
        "input_schema": {
            "type": "object",
            "properties": {"project_id": {"type": "string", "description": "The project ID"}},
            "required": ["project_id"],
        },
    },
    {
        "name": "create_session",
        "description": "Create a new planning session for a project.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string", "description": "The project ID"},
                "title": {"type": "string", "description": "Session title"},
                "initial_idea": {"type": "string", "description": "The initial idea or topic to plan"},
            },
            "required": ["project_id"],
        },
    },
    {
        "name": "update_session",
        "description": "Update a session's title.",
        "input_schema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "string", "description": "The session ID"},
                "title": {"type": "string", "description": "New session title"},
            },
            "required": ["session_id"],
        },
    },
    # ── Board / Cards ──
    {
        "name": "list_board_cards",
        "description": "List the board columns and cards for a project, showing the kanban state.",
        "input_schema": {
            "type": "object",
            "properties": {"project_id": {"type": "string", "description": "The project ID"}},
            "required": ["project_id"],
        },
    },
    {
        "name": "create_card",
        "description": "Create a new card (task) on the project's board.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string", "description": "The project ID"},
                "title": {"type": "string", "description": "Card title"},
                "description": {"type": "string", "description": "Card description"},
                "priority": {
                    "type": "string",
                    "enum": ["critical", "high", "medium", "low"],
                    "description": "Card priority",
                },
                "column_name": {
                    "type": "string",
                    "description": "Column name to place the card in (default: Backlog)",
                },
            },
            "required": ["project_id", "title"],
        },
    },
    {
        "name": "update_card",
        "description": "Update a card's title, description, priority, or move it to a different column.",
        "input_schema": {
            "type": "object",
            "properties": {
                "card_id": {"type": "string", "description": "The card ID"},
                "title": {"type": "string", "description": "New card title"},
                "description": {"type": "string", "description": "New card description"},
                "priority": {
                    "type": "string",
                    "enum": ["critical", "high", "medium", "low"],
                    "description": "New priority",
                },
                "column_name": {"type": "string", "description": "Column name to move the card to"},
            },
            "required": ["card_id"],
        },
    },
    {
        "name": "delete_card",
        "description": "Delete a card from the board. Only call after user confirms.",
        "input_schema": {
            "type": "object",
            "properties": {"card_id": {"type": "string", "description": "The card ID to delete"}},
            "required": ["card_id"],
        },
    },
    # ── Blueprint ──
    {
        "name": "get_blueprint_coverage",
        "description": "Get the blueprint coverage scores and gaps for a project.",
        "input_schema": {
            "type": "object",
            "properties": {"project_id": {"type": "string", "description": "The project ID"}},
            "required": ["project_id"],
        },
    },
    {
        "name": "update_blueprint_section",
        "description": "Update a specific section of the project's blueprint.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string", "description": "The project ID"},
                "section": {
                    "type": "string",
                    "description": (
                        "Section key: project_overview, goals_constraints, users_personas, "
                        "team_capacity, architecture, tech_stack, api_integrations, ui_ux, "
                        "security_compliance, infrastructure, risks_unknowns, out_of_scope, open_questions"
                    ),
                },
                "content": {"type": "string", "description": "New content for the section"},
            },
            "required": ["project_id", "section", "content"],
        },
    },
    # ── Studio ──
    {
        "name": "list_personas",
        "description": "List all AI personas available in the user's organization.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "create_persona",
        "description": "Create a new AI persona for planning sessions.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Persona name (e.g. 'Security Expert')"},
                "description": {"type": "string", "description": "Brief description of the persona"},
                "system_prompt": {
                    "type": "string",
                    "description": "The system prompt that defines this persona's behavior",
                },
            },
            "required": ["name"],
        },
    },
    {
        "name": "list_templates",
        "description": "List all blueprint templates available in the user's organization.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "create_template",
        "description": "Create a new blueprint template.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Template name"},
                "description": {"type": "string", "description": "Template description"},
                "sections": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of section keys to include in this template",
                },
            },
            "required": ["name"],
        },
    },
    # ── Advisory ──
    {
        "name": "get_project_status",
        "description": (
            "Get a comprehensive status overview of a project: blueprint coverage, "
            "board card counts by column, and session count."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"project_id": {"type": "string", "description": "The project ID"}},
            "required": ["project_id"],
        },
    },
]


# ─── Tool Executors ──────────────────────────────────────────────────────────


async def execute_tool(
    tool_name: str,
    tool_input: dict,
    user: User,
    org: Organization,
    db: AsyncSession,
) -> dict:
    """Dispatch a tool call to the appropriate handler.

    Returns dict with {success: bool, result?: any, error?: str}.
    """
    handler = _HANDLERS.get(tool_name)
    if not handler:
        return {"success": False, "error": f"Unknown tool: {tool_name}"}
    try:
        result = await handler(tool_input, user, org, db)
        return {"success": True, "result": result}
    except Exception as e:
        logger.error("Niko tool %s failed: %s", tool_name, e, exc_info=True)
        return {"success": False, "error": str(e)}


# ── Project handlers ──


async def _list_projects(inp: dict, user: User, org: Organization, db: AsyncSession) -> list[dict]:
    from ..models.organization import Team, TeamMember
    from ..models.project import Project

    # Get user's team in this org
    tm_result = await db.execute(
        select(TeamMember).join(Team).where(Team.org_id == org.id, TeamMember.user_id == user.id).limit(1)
    )
    tm = tm_result.scalar_one_or_none()
    if not tm:
        return []

    result = await db.execute(
        select(Project)
        .where(Project.org_id == org.id, Project.team_id == tm.team_id)
        .order_by(Project.created_at.desc())
    )
    projects = result.scalars().all()
    return [{"id": p.id, "name": p.name, "description": p.description} for p in projects]


async def _get_project(inp: dict, user: User, org: Organization, db: AsyncSession) -> dict:
    from ..models.project import Project

    result = await db.execute(select(Project).where(Project.id == inp["project_id"]))
    project = result.scalar_one_or_none()
    if not project:
        return {"error": "Project not found"}
    return {"id": project.id, "name": project.name, "description": project.description}


async def _create_project(inp: dict, user: User, org: Organization, db: AsyncSession) -> dict:
    from ..models.organization import Team, TeamMember
    from ..models.project import Project

    # Get user's team
    tm_result = await db.execute(
        select(TeamMember).join(Team).where(Team.org_id == org.id, TeamMember.user_id == user.id).limit(1)
    )
    tm = tm_result.scalar_one_or_none()
    if not tm:
        return {"error": "User not in any team"}

    name = inp.get("name") or "Untitled Project"
    project = Project(
        name=name,
        description=inp.get("description"),
        owner_id=user.id,
        org_id=org.id,
        team_id=tm.team_id,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return {"id": project.id, "name": project.name, "description": project.description}


async def _update_project(inp: dict, user: User, org: Organization, db: AsyncSession) -> dict:
    from ..models.project import Project

    result = await db.execute(select(Project).where(Project.id == inp["project_id"]))
    project = result.scalar_one_or_none()
    if not project:
        return {"error": "Project not found"}
    if "name" in inp and inp["name"]:
        project.name = inp["name"]
    if "description" in inp and inp["description"]:
        project.description = inp["description"]
    await db.commit()
    return {"id": project.id, "name": project.name, "description": project.description}


async def _delete_project(inp: dict, user: User, org: Organization, db: AsyncSession) -> dict:
    from ..models.project import Project

    result = await db.execute(select(Project).where(Project.id == inp["project_id"]))
    project = result.scalar_one_or_none()
    if not project:
        return {"error": "Project not found"}
    if project.owner_id != user.id:
        return {"error": "Only the project owner can delete it"}

    await db.delete(project)
    await db.commit()
    return {"deleted": True, "name": project.name}


# ── Session handlers ──


async def _list_sessions(inp: dict, user: User, org: Organization, db: AsyncSession) -> list[dict]:
    from ..models.session import Session

    result = await db.execute(
        select(Session).where(Session.project_id == inp["project_id"]).order_by(Session.created_at.desc())
    )
    sessions = result.scalars().all()
    return [{"id": s.id, "title": s.title, "status": s.status} for s in sessions]


async def _create_session(inp: dict, user: User, org: Organization, db: AsyncSession) -> dict:
    from ..models.session import Participant, Session

    session = Session(
        project_id=inp["project_id"],
        org_id=org.id,
        title=inp.get("title"),
        initial_idea=inp.get("initial_idea"),
    )
    db.add(session)
    await db.flush()
    # Add creator as participant
    db.add(Participant(session_id=session.id, user_id=user.id, role="facilitator"))
    await db.commit()
    await db.refresh(session)
    return {"id": session.id, "title": session.title, "join_code": session.join_code}


async def _update_session(inp: dict, user: User, org: Organization, db: AsyncSession) -> dict:
    from ..models.session import Session

    result = await db.execute(select(Session).where(Session.id == inp["session_id"]))
    session = result.scalar_one_or_none()
    if not session:
        return {"error": "Session not found"}
    if "title" in inp and inp["title"]:
        session.title = inp["title"]
    await db.commit()
    return {"id": session.id, "title": session.title}


# ── Board / Card handlers ──


async def _list_board_cards(inp: dict, user: User, org: Organization, db: AsyncSession) -> dict:
    from ..models.board import BoardColumn
    from ..services.board_service import get_or_create_board

    board = await get_or_create_board(inp["project_id"], db)
    cols_result = await db.execute(
        select(BoardColumn)
        .where(BoardColumn.board_id == board.id)
        .options(selectinload(BoardColumn.cards))
        .order_by(BoardColumn.position)
    )
    columns = cols_result.scalars().all()
    return {
        "board_id": board.id,
        "columns": [
            {
                "id": col.id,
                "name": col.name,
                "cards": [
                    {
                        "id": c.id,
                        "title": c.title,
                        "priority": c.priority,
                        "description": (c.description or "")[:100],
                    }
                    for c in sorted(col.cards, key=lambda x: x.position)
                ],
            }
            for col in columns
        ],
    }


async def _create_card(inp: dict, user: User, org: Organization, db: AsyncSession) -> dict:
    from ..models.board import BoardColumn, Card
    from ..services.board_service import get_or_create_board

    board = await get_or_create_board(inp["project_id"], db)

    # Find the target column
    column_name = inp.get("column_name", "Backlog")
    col_result = await db.execute(
        select(BoardColumn).where(
            BoardColumn.board_id == board.id,
            BoardColumn.name.ilike(column_name),
        )
    )
    column = col_result.scalar_one_or_none()
    if not column:
        # Fallback to first column
        col_result = await db.execute(
            select(BoardColumn).where(BoardColumn.board_id == board.id).order_by(BoardColumn.position).limit(1)
        )
        column = col_result.scalar_one_or_none()
        if not column:
            return {"error": "No columns found on board"}

    # Get next position
    from sqlalchemy import func

    max_pos = await db.execute(
        select(func.coalesce(func.max(Card.position), -1)).where(Card.column_id == column.id)
    )
    next_pos = max_pos.scalar_one() + 1

    card = Card(
        column_id=column.id,
        position=next_pos,
        title=inp["title"],
        description=inp.get("description"),
        priority=inp.get("priority", "medium"),
    )
    db.add(card)
    await db.commit()
    await db.refresh(card)
    return {"id": card.id, "title": card.title, "column": column.name, "priority": card.priority}


async def _update_card(inp: dict, user: User, org: Organization, db: AsyncSession) -> dict:
    from ..models.board import BoardColumn, Card

    result = await db.execute(select(Card).where(Card.id == inp["card_id"]))
    card = result.scalar_one_or_none()
    if not card:
        return {"error": "Card not found"}

    if "title" in inp and inp["title"]:
        card.title = inp["title"]
    if "description" in inp and inp["description"]:
        card.description = inp["description"]
    if "priority" in inp and inp["priority"]:
        card.priority = inp["priority"]
    if "column_name" in inp and inp["column_name"]:
        # Find the column by name on the same board
        col_result = await db.execute(
            select(BoardColumn).where(BoardColumn.name.ilike(inp["column_name"]))
        )
        col = col_result.scalar_one_or_none()
        if col:
            card.column_id = col.id

    await db.commit()
    return {"id": card.id, "title": card.title, "priority": card.priority}


async def _delete_card(inp: dict, user: User, org: Organization, db: AsyncSession) -> dict:
    from ..models.board import Card

    result = await db.execute(select(Card).where(Card.id == inp["card_id"]))
    card = result.scalar_one_or_none()
    if not card:
        return {"error": "Card not found"}
    title = card.title
    await db.delete(card)
    await db.commit()
    return {"deleted": True, "title": title}


# ── Blueprint handlers ──


async def _get_blueprint_coverage(inp: dict, user: User, org: Organization, db: AsyncSession) -> dict:
    from ..services.blueprint_service import get_or_create_blueprint
    from ..services.facilitator import assess_coverage

    snapshot = await get_or_create_blueprint(inp["project_id"], db)
    if not snapshot or not snapshot.content:
        return {"overall": 0, "grade": "F", "message": "Blueprint is empty"}
    return assess_coverage(snapshot.content)


async def _update_blueprint_section(inp: dict, user: User, org: Organization, db: AsyncSession) -> dict:
    from ..services.blueprint_service import update_section

    snapshot = await update_section(
        project_id=inp["project_id"],
        section_name=inp["section"],
        content=inp["content"],
        created_by=user.id,
        db=db,
        source="niko_tool",
    )
    return {"version": snapshot.version_number, "section": inp["section"]}


# ── Studio handlers ──


async def _list_personas(inp: dict, user: User, org: Organization, db: AsyncSession) -> list[dict]:
    from ..services.blueprint_template_service import ensure_org_blueprints, get_org_personas

    await ensure_org_blueprints(org.id, db)
    personas = await get_org_personas(org.id, db)
    return [
        {
            "id": p.id,
            "name": p.name,
            "slug": p.slug,
            "description": p.description,
            "focus_sections": p.focus_sections,
        }
        for p in personas
    ]


async def _create_persona(inp: dict, user: User, org: Organization, db: AsyncSession) -> dict:
    from ..models.blueprint_template import BlueprintPersona

    slug = re.sub(r"[^a-z0-9_]", "", inp["name"].lower().replace(" ", "_").replace("-", "_"))
    if not slug:
        return {"error": "Invalid persona name"}

    persona = BlueprintPersona(
        org_id=org.id,
        slug=slug,
        name=inp["name"],
        description=inp.get("description", ""),
        system_prompt=inp.get("system_prompt", ""),
        is_system=False,
    )
    db.add(persona)
    await db.commit()
    await db.refresh(persona)
    return {"id": persona.id, "name": persona.name, "slug": persona.slug}


async def _list_templates(inp: dict, user: User, org: Organization, db: AsyncSession) -> list[dict]:
    from ..services.blueprint_template_service import ensure_org_blueprints, get_org_templates

    await ensure_org_blueprints(org.id, db)
    templates = await get_org_templates(org.id, db)
    return [
        {"id": t.id, "name": t.name, "slug": t.slug, "description": t.description}
        for t in templates
    ]


async def _create_template(inp: dict, user: User, org: Organization, db: AsyncSession) -> dict:
    from ..models.blueprint_template import BlueprintTemplate

    slug = re.sub(r"[^a-z0-9_]", "", inp["name"].lower().replace(" ", "_").replace("-", "_"))
    if not slug:
        return {"error": "Invalid template name"}

    template = BlueprintTemplate(
        org_id=org.id,
        slug=slug,
        name=inp["name"],
        description=inp.get("description", ""),
        sections=inp.get("sections", []),
        is_system=False,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return {"id": template.id, "name": template.name, "slug": template.slug}


# ── Advisory handlers ──


async def _get_project_status(inp: dict, user: User, org: Organization, db: AsyncSession) -> dict:
    from sqlalchemy import func

    from ..models.board import Board, BoardColumn, Card
    from ..models.project import Project
    from ..models.session import Session
    from ..services.blueprint_service import get_or_create_blueprint
    from ..services.facilitator import assess_coverage

    # Project info
    result = await db.execute(select(Project).where(Project.id == inp["project_id"]))
    project = result.scalar_one_or_none()
    if not project:
        return {"error": "Project not found"}

    # Session count
    session_count = await db.execute(
        select(func.count()).select_from(Session).where(Session.project_id == project.id)
    )

    # Board state
    board_summary = {}
    board_result = await db.execute(select(Board).where(Board.project_id == project.id))
    board = board_result.scalar_one_or_none()
    if board:
        cols = await db.execute(
            select(BoardColumn).where(BoardColumn.board_id == board.id).order_by(BoardColumn.position)
        )
        for col in cols.scalars().all():
            count = await db.execute(
                select(func.count()).select_from(Card).where(Card.column_id == col.id)
            )
            board_summary[col.name] = count.scalar_one()

    # Blueprint coverage
    coverage = None
    try:
        snapshot = await get_or_create_blueprint(project.id, db)
        if snapshot and snapshot.content:
            coverage = assess_coverage(snapshot.content)
    except Exception:
        pass

    return {
        "project": {"name": project.name, "description": project.description},
        "sessions": session_count.scalar_one(),
        "board": board_summary,
        "blueprint_coverage": coverage,
    }


# ─── Handler Registry ────────────────────────────────────────────────────────

_HANDLERS = {
    "list_projects": _list_projects,
    "get_project": _get_project,
    "create_project": _create_project,
    "update_project": _update_project,
    "delete_project": _delete_project,
    "list_sessions": _list_sessions,
    "create_session": _create_session,
    "update_session": _update_session,
    "list_board_cards": _list_board_cards,
    "create_card": _create_card,
    "update_card": _update_card,
    "delete_card": _delete_card,
    "get_blueprint_coverage": _get_blueprint_coverage,
    "update_blueprint_section": _update_blueprint_section,
    "list_personas": _list_personas,
    "create_persona": _create_persona,
    "list_templates": _list_templates,
    "create_template": _create_template,
    "get_project_status": _get_project_status,
}
