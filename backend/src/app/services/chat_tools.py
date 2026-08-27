"""Platform chatbot tools — schemas and execution functions.

Each tool is a JSON schema (sent to Claude) paired with an async execution
function that queries the database scoped to the user's org/team.
"""

import asyncio
import json
import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from tenacity import (
    AsyncRetrying,
    RetryError,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from ..models.blueprint import BlueprintIteration, BlueprintSnapshot
from ..models.board import Board, BoardColumn, Card, CardComment
from ..models.directory import DirectoryEntry
from ..models.organization import OrgMember
from ..models.project import Project
from ..models.session import Participant, Session
from ..models.user import User
from .html_text import html_to_text, normalize_ac

logger = logging.getLogger(__name__)

# ── Tool Schemas (Anthropic format) ─────────────────────────────────────────

TOOL_SCHEMAS = [
    {
        "name": "list_projects",
        "description": "List all projects in the organization. Returns project names, descriptions, and IDs.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_project",
        "description": (
            "Get detailed information about a specific project including its description, "
            "owner, and session/board counts."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "project_name": {
                    "type": "string",
                    "description": "The project name (case-insensitive partial match).",
                },
            },
            "required": ["project_name"],
        },
    },
    {
        "name": "list_board_cards",
        "description": (
            "List cards on a project's kanban board. Optionally filter by column name "
            "(e.g. 'To Do', 'In Progress', 'Done'), assignee name, or priority."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "project_name": {
                    "type": "string",
                    "description": "The project name (case-insensitive partial match).",
                },
                "column": {
                    "type": "string",
                    "description": "Filter by column name (e.g. 'To Do', 'In Progress', 'Done').",
                },
                "assignee": {
                    "type": "string",
                    "description": "Filter by assignee name (partial match).",
                },
            },
            "required": ["project_name"],
        },
    },
    {
        "name": "get_card",
        "description": (
            "Get full detail of a specific card including description, acceptance criteria, "
            "priority, assignee, labels, and comments."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "card_title": {
                    "type": "string",
                    "description": "The card title (case-insensitive partial match).",
                },
            },
            "required": ["card_title"],
        },
    },
    {
        "name": "search_directory",
        "description": (
            "Search the team's knowledge base (directory) for entries matching a query. "
            "The directory contains information about the team's stack, infrastructure, security, costs, and architecture."  # noqa: E501
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query to match against directory entry titles and content.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results to return (default 5).",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "read_directory_entry",
        "description": (
            "Read the full content of a specific directory entry by its path "
            "(e.g. 'frontend/design-system', 'infrastructure/aws')."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "The directory entry path.",
                },
            },
            "required": ["path"],
        },
    },
    {
        "name": "list_directory",
        "description": (
            "Browse the directory tree. If path is omitted, returns top-level categories. "
            "If path is given, returns children of that entry."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Parent path to list children of. Omit for top-level.",
                },
            },
            "required": [],
        },
    },
    {
        "name": "list_sessions",
        "description": "List planning sessions for a project, including status and participant count.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_name": {
                    "type": "string",
                    "description": "The project name (case-insensitive partial match).",
                },
            },
            "required": ["project_name"],
        },
    },
    {
        "name": "get_blueprint",
        "description": (
            "Get the latest blueprint snapshot for a project. Blueprints contain the structured planning output "
            "(features, architecture, technical decisions)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "project_name": {
                    "type": "string",
                    "description": "The project name (case-insensitive partial match).",
                },
            },
            "required": ["project_name"],
        },
    },
    {
        "name": "list_team_members",
        "description": "List all members of the organization with their names, emails, and roles.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "suggest_session",
        "description": (
            "Suggest starting a planning session when the user is discussing a feature idea, "
            "project concept, or technical initiative that would benefit from collaborative planning. "
            "Call this tool when the conversation naturally leads to 'let's plan this out'. "
            "If the idea fits an existing project, provide its name. If not, suggest a new project name."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "project_name": {
                    "type": "string",
                    "description": "Existing project name to start the session under, or a suggested new project name.",
                },
                "idea_summary": {
                    "type": "string",
                    "description": "A concise summary of what to plan in the session, based on the conversation.",
                },
                "is_new_project": {
                    "type": "boolean",
                    "description": "True if new project, false if existing.",
                },
            },
            "required": ["project_name", "idea_summary", "is_new_project"],
        },
    },
    # ── Write tools ────────────────────────────────────────────────────────
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
        "description": (
            "Update a project's name or description. Find the project by name (case-insensitive partial match)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "project_name": {
                    "type": "string",
                    "description": "Current project name (case-insensitive partial match).",
                },
                "new_name": {"type": "string", "description": "New project name"},
                "new_description": {"type": "string", "description": "New project description"},
            },
            "required": ["project_name"],
        },
    },
    {
        "name": "delete_project",
        "description": (
            "Delete a project and all its data. This is irreversible. Only call after the user explicitly confirms."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "project_name": {
                    "type": "string",
                    "description": "The project name to delete (case-insensitive partial match).",
                },
            },
            "required": ["project_name"],
        },
    },
    {
        "name": "create_session",
        "description": (
            "Create a new planning session. If project_name is omitted, the session "
            "defaults to the team's currently-viewed project. If the tool returns "
            "needs_project_choice, ask the user to pick by name from the options."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "project_name": {
                    "type": "string",
                    "description": (
                        "Project name (case-insensitive partial match). Optional — "
                        "falls back to the team's current project when omitted."
                    ),
                },
                "title": {"type": "string", "description": "Session title"},
                "initial_idea": {"type": "string", "description": "The initial idea or topic to plan"},
            },
            "required": [],
        },
    },
    {
        "name": "create_card",
        "description": "Create a new card (task) on a project's kanban board.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_name": {
                    "type": "string",
                    "description": "The project name (case-insensitive partial match).",
                },
                "title": {"type": "string", "description": "Card title"},
                "description": {"type": "string", "description": "Card description"},
                "priority": {
                    "type": "string",
                    "enum": ["critical", "high", "medium", "low"],
                    "description": "Card priority (default: medium)",
                },
                "column": {
                    "type": "string",
                    "description": "Column name to place the card in (default: Backlog)",
                },
            },
            "required": ["project_name", "title"],
        },
    },
    {
        "name": "update_card",
        "description": "Update a card's title, description, priority, or move it to a different column.",
        "input_schema": {
            "type": "object",
            "properties": {
                "card_title": {
                    "type": "string",
                    "description": "Current card title (case-insensitive partial match).",
                },
                "new_title": {"type": "string", "description": "New card title"},
                "new_description": {"type": "string", "description": "New card description"},
                "new_priority": {
                    "type": "string",
                    "enum": ["critical", "high", "medium", "low"],
                    "description": "New priority",
                },
                "new_column": {"type": "string", "description": "Column name to move the card to"},
            },
            "required": ["card_title"],
        },
    },
    {
        "name": "delete_card",
        "description": "Delete a card from the board. Only call after the user explicitly confirms.",
        "input_schema": {
            "type": "object",
            "properties": {
                "card_title": {
                    "type": "string",
                    "description": "The card title to delete (case-insensitive partial match).",
                },
            },
            "required": ["card_title"],
        },
    },
    {
        "name": "update_blueprint_section",
        "description": "Update a specific section of a project's blueprint.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_name": {
                    "type": "string",
                    "description": "The project name (case-insensitive partial match).",
                },
                "section_key": {
                    "type": "string",
                    "description": (
                        "Section key: project_overview, goals_constraints, users_personas, "
                        "team_capacity, architecture, tech_stack, api_integrations, ui_ux, "
                        "security_compliance, infrastructure, risks_unknowns, out_of_scope, open_questions"
                    ),
                },
                "content": {"type": "string", "description": "New content for the section"},
            },
            "required": ["project_name", "section_key", "content"],
        },
    },
]


# ── Tool Execution ──────────────────────────────────────────────────────────

# Tools whose handlers are pure reads — safe to retry on transient failures
# (DB connection blips, deadlocks). Write tools are NOT retried because a
# second attempt could create duplicate rows; the LLM can also re-issue a
# failed write itself if it cares about the result.
_IDEMPOTENT_TOOLS: frozenset[str] = frozenset(
    {
        "list_projects",
        "get_project",
        "list_board_cards",
        "get_card",
        "search_directory",
        "read_directory_entry",
        "list_directory",
        "list_sessions",
        "get_blueprint",
        "list_team_members",
        "suggest_session",  # No side effects — just shapes a structured action.
    }
)

# Per-tool deadline. DB-only tools complete in milliseconds locally; the
# generous cap exists so a runaway query (locked row, regex over a huge
# directory entry) can't pin a chat turn forever.
_TOOL_TIMEOUT_SECONDS = 10.0

# Retry only transient errors. SQLAlchemy raises OperationalError on
# connection drops / deadlocks; everything else (validation, missing rows,
# programming bugs) shouldn't retry.
_TRANSIENT_RETRY_TYPES = (asyncio.TimeoutError, ConnectionError)
try:
    from sqlalchemy.exc import OperationalError as _SAOperationalError

    _TRANSIENT_RETRY_TYPES = _TRANSIENT_RETRY_TYPES + (_SAOperationalError,)
except Exception:  # pragma: no cover - defensive, sqlalchemy must be present
    pass


async def execute_tool(
    name: str,
    input_data: dict,
    *,
    org_id: str,
    team_id: str,
    db: AsyncSession,
    user_id: str | None = None,
) -> dict | list:
    """Execute a tool by name. Returns serializable result or error dict.

    Read tools get a tenacity-style retry (3 attempts, exponential backoff)
    plus a per-attempt timeout. Write tools get the timeout only — retrying
    them risks duplicate side effects.
    """
    handler = _TOOL_HANDLERS.get(name)
    if not handler:
        return {"error": f"Unknown tool: {name}"}

    async def _attempt() -> dict | list:
        return await asyncio.wait_for(
            handler(input_data, org_id=org_id, team_id=team_id, db=db, user_id=user_id),
            timeout=_TOOL_TIMEOUT_SECONDS,
        )

    is_idempotent = name in _IDEMPOTENT_TOOLS
    started = asyncio.get_running_loop().time()
    try:
        if is_idempotent:
            async for attempt in AsyncRetrying(
                stop=stop_after_attempt(3),
                wait=wait_exponential(multiplier=0.2, max=2.0),
                retry=retry_if_exception_type(_TRANSIENT_RETRY_TYPES),
                reraise=True,
            ):
                with attempt:
                    result = await _attempt()
        else:
            result = await _attempt()
    except TimeoutError:
        logger.warning(
            "chat.tool_timeout",
            extra={"tool": name, "org_id": org_id, "timeout_s": _TOOL_TIMEOUT_SECONDS},
        )
        return {"error": f"Tool '{name}' timed out after {_TOOL_TIMEOUT_SECONDS:.0f}s"}
    except RetryError as e:
        logger.warning(
            "chat.tool_retry_exhausted",
            extra={"tool": name, "org_id": org_id, "err": str(e)},
        )
        return {"error": f"Tool '{name}' failed after retries: {e}"}
    except Exception as e:
        logger.exception(
            "chat.tool_failed",
            extra={"tool": name, "org_id": org_id, "idempotent": is_idempotent},
        )
        return {"error": f"Tool failed: {e}"}

    elapsed_ms = int((asyncio.get_running_loop().time() - started) * 1000)
    logger.info(
        "chat.tool_call",
        extra={
            "tool": name,
            "org_id": org_id,
            "idempotent": is_idempotent,
            "latency_ms": elapsed_ms,
        },
    )
    return result


MAX_TOOL_ROUNDS = 10


async def run_tool_loop(
    *,
    ai,  # AI client from get_ai_client(...)
    system: str,
    messages: list[dict],
    org_id: str,
    team_id: str,
    db: AsyncSession,
    user_id: str | None = None,
) -> tuple[str, list[dict]]:
    """Drive a tool-calling loop to completion and return (final_text, tool_results).

    Non-streaming counterpart to the SSE loop in routers/chat.py. Used by the
    Slack event handler so a single reply can be composed and posted.

    Returns:
        (final_text, tool_results) where tool_results is a list of
        {"name": str, "result": dict | list} in call order.
    """
    import asyncio

    messages = list(messages)
    all_tool_results: list[dict] = []

    for _ in range(MAX_TOOL_ROUNDS):
        response = await ai.chat_with_tools(system=system, messages=messages, tools=TOOL_SCHEMAS)
        content = response["content"]
        tool_blocks = [b for b in content if b["type"] == "tool_use"]

        if not tool_blocks:
            text_parts = [b["text"] for b in content if b["type"] == "text"]
            return ("".join(text_parts).strip(), all_tool_results)

        messages.append({"role": "assistant", "content": content})

        async def _run(block):
            return block, await execute_tool(
                block["name"],
                block["input"],
                org_id=org_id,
                team_id=team_id,
                db=db,
                user_id=user_id,
            )

        results = await asyncio.gather(*[_run(b) for b in tool_blocks])
        tool_results_turn = []
        for block, result in results:
            all_tool_results.append({"name": block["name"], "result": result})
            tool_results_turn.append(
                {
                    "type": "tool_result",
                    "tool_use_id": block["id"],
                    "content": json.dumps(result),
                }
            )
        messages.append({"role": "user", "content": tool_results_turn})

    logger.warning(
        "run_tool_loop hit MAX_TOOL_ROUNDS",
        extra={"org_id": org_id, "rounds": MAX_TOOL_ROUNDS},
    )
    return (
        "I ran into a limit while working on that. Try a simpler request.",
        all_tool_results,
    )


# ── Individual tool handlers ────────────────────────────────────────────────


async def _list_projects(
    input_data: dict,
    *,
    org_id: str,
    team_id: str,
    db: AsyncSession,
    user_id: str | None = None,
) -> list:
    result = await db.execute(
        select(Project).where(Project.org_id == org_id, Project.deleted_at.is_(None)).order_by(Project.name)
    )
    projects = result.scalars().all()
    return [{"id": p.id, "name": p.name, "description": p.description or ""} for p in projects]


async def _get_project(
    input_data: dict,
    *,
    org_id: str,
    team_id: str,
    db: AsyncSession,
    user_id: str | None = None,
) -> dict:
    name = input_data["project_name"]
    result = await db.execute(
        select(Project).where(Project.org_id == org_id, Project.name.ilike(f"%{name}%"), Project.deleted_at.is_(None))
    )
    project = result.scalar_one_or_none()
    if not project:
        return {"error": f"No project found matching '{name}'"}

    # Count sessions and board cards
    session_count = (await db.execute(select(func.count()).where(Session.project_id == project.id))).scalar() or 0

    board_result = await db.execute(select(Board).where(Board.project_id == project.id).limit(1))
    board = board_result.scalar_one_or_none()
    card_count = 0
    if board:
        card_count_result = await db.execute(
            select(func.count()).select_from(Card).join(BoardColumn).where(BoardColumn.board_id == board.id)
        )
        card_count = card_count_result.scalar() or 0

    # Get owner name
    owner_result = await db.execute(select(User).where(User.id == project.owner_id))
    owner = owner_result.scalar_one_or_none()

    return {
        "id": project.id,
        "name": project.name,
        "description": project.description or "",
        "owner": owner.name or owner.email if owner else "Unknown",
        "session_count": session_count,
        "card_count": card_count,
    }


async def _list_board_cards(
    input_data: dict,
    *,
    org_id: str,
    team_id: str,
    db: AsyncSession,
    user_id: str | None = None,
) -> list:
    name = input_data["project_name"]
    project_result = await db.execute(
        select(Project).where(Project.org_id == org_id, Project.name.ilike(f"%{name}%"), Project.deleted_at.is_(None))
    )
    project = project_result.scalar_one_or_none()
    if not project:
        return [{"error": f"No project found matching '{name}'"}]

    board_result = await db.execute(select(Board).where(Board.project_id == project.id).limit(1))
    board = board_result.scalar_one_or_none()
    if not board:
        return []

    query = (
        select(Card, BoardColumn.name.label("column_name"), User.name.label("assignee_name"))
        .join(BoardColumn, Card.column_id == BoardColumn.id)
        .outerjoin(User, Card.assignee_id == User.id)
        .where(BoardColumn.board_id == board.id)
    )

    col_filter = input_data.get("column")
    if col_filter:
        query = query.where(BoardColumn.name.ilike(f"%{col_filter}%"))

    assignee_filter = input_data.get("assignee")
    if assignee_filter:
        query = query.where(User.name.ilike(f"%{assignee_filter}%"))

    query = query.order_by(BoardColumn.position, Card.position)
    result = await db.execute(query)
    rows = result.all()

    return [
        {
            "title": card.title,
            "column": column_name,
            "priority": card.priority or "none",
            "assignee": assignee_name or "Unassigned",
            "story_points": card.story_points,
            "labels": card.labels or "",
        }
        for card, column_name, assignee_name in rows
    ]


async def _get_card(
    input_data: dict,
    *,
    org_id: str,
    team_id: str,
    db: AsyncSession,
    user_id: str | None = None,
) -> dict:
    title = input_data["card_title"]
    result = await db.execute(
        select(Card, BoardColumn.name.label("column_name"), User.name.label("assignee_name"))
        .join(BoardColumn, Card.column_id == BoardColumn.id)
        .join(Board, BoardColumn.board_id == Board.id)
        .outerjoin(User, Card.assignee_id == User.id)
        .where(Board.org_id == org_id, Card.title.ilike(f"%{title}%"))
        .limit(1)
    )
    row = result.one_or_none()
    if not row:
        return {"error": f"No card found matching '{title}'"}

    card, column_name, assignee_name = row

    # Fetch comments
    comments_result = await db.execute(
        select(CardComment, User.name.label("author_name"))
        .outerjoin(User, CardComment.user_id == User.id)
        .where(CardComment.card_id == card.id)
        .order_by(CardComment.created_at)
    )
    comments = [{"author": author or "Unknown", "content": c.content} for c, author in comments_result.all()]

    return {
        "title": card.title,
        "column": column_name,
        "description": html_to_text(card.description),
        "priority": card.priority or "none",
        "assignee": assignee_name or "Unassigned",
        "story_points": card.story_points,
        "labels": card.labels or [],
        "acceptance_criteria": normalize_ac(card.acceptance_criteria),
        "agent_status": card.agent_status,
        "agent_pr_url": card.agent_pr_url,
        "comments": comments,
    }


async def _search_directory(
    input_data: dict,
    *,
    org_id: str,
    team_id: str,
    db: AsyncSession,
    user_id: str | None = None,
) -> list:
    """Ranked search over the team directory.

    Shares the ranking logic with the facilitator's context loader so Claude
    agents and the facilitator see the same top-K for a given query. Agents
    don't need the overview injected every time (they can call
    read_directory_entry for that), so we skip it here.
    """
    from .directory_retrieval import retrieve_for_query

    query_text = input_data["query"]
    limit = input_data.get("limit", 5)
    entries = await retrieve_for_query(
        team_id=team_id,
        query=query_text,
        db=db,
        limit=limit,
        include_overview=False,
    )
    # Agent-facing response keeps the same shape callers expected before
    # (path / title / category / summary).
    return [
        {
            "path": e["path"],
            "title": e["title"],
            "category": e["category"],
            "summary": e["description"],
        }
        for e in entries
    ]


async def _read_directory_entry(
    input_data: dict,
    *,
    org_id: str,
    team_id: str,
    db: AsyncSession,
    user_id: str | None = None,
) -> dict:
    path = input_data["path"]
    result = await db.execute(
        select(DirectoryEntry).where(DirectoryEntry.team_id == team_id, DirectoryEntry.path == path)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        return {"error": f"No directory entry at path '{path}'"}
    return {
        "path": entry.path,
        "title": entry.title,
        "category": entry.category,
        "content": entry.content,
        "source": entry.source,
    }


async def _list_directory(
    input_data: dict,
    *,
    org_id: str,
    team_id: str,
    db: AsyncSession,
    user_id: str | None = None,
) -> list:
    path = input_data.get("path")
    query = select(DirectoryEntry).where(DirectoryEntry.team_id == team_id)

    if path:
        parent_result = await db.execute(
            select(DirectoryEntry).where(DirectoryEntry.team_id == team_id, DirectoryEntry.path == path)
        )
        parent = parent_result.scalar_one_or_none()
        if not parent:
            return [{"error": f"Path not found: {path}"}]
        query = query.where(DirectoryEntry.parent_id == parent.id)
    else:
        query = query.where(DirectoryEntry.parent_id.is_(None))

    query = query.order_by(DirectoryEntry.path)
    result = await db.execute(query)
    entries = result.scalars().all()
    return [
        {
            "path": e.path,
            "title": e.title,
            "category": e.category,
            "summary": e.content[:100] + ("..." if len(e.content) > 100 else ""),
        }
        for e in entries
    ]


async def _list_sessions(
    input_data: dict,
    *,
    org_id: str,
    team_id: str,
    db: AsyncSession,
    user_id: str | None = None,
) -> list:
    name = input_data["project_name"]
    project_result = await db.execute(
        select(Project).where(Project.org_id == org_id, Project.name.ilike(f"%{name}%"), Project.deleted_at.is_(None))
    )
    project = project_result.scalar_one_or_none()
    if not project:
        return [{"error": f"No project found matching '{name}'"}]

    result = await db.execute(
        select(Session).where(Session.project_id == project.id).order_by(Session.created_at.desc())
    )
    sessions = result.scalars().all()
    return [
        {
            "id": s.id,
            "title": s.title or "Untitled",
            "status": s.status or "unknown",
        }
        for s in sessions
    ]


async def _get_blueprint(
    input_data: dict,
    *,
    org_id: str,
    team_id: str,
    db: AsyncSession,
    user_id: str | None = None,
) -> dict:
    name = input_data["project_name"]
    project_result = await db.execute(
        select(Project).where(Project.org_id == org_id, Project.name.ilike(f"%{name}%"), Project.deleted_at.is_(None))
    )
    project = project_result.scalar_one_or_none()
    if not project:
        return {"error": f"No project found matching '{name}'"}

    # Get latest iteration
    iter_result = await db.execute(
        select(BlueprintIteration)
        .where(BlueprintIteration.project_id == project.id)
        .order_by(BlueprintIteration.iteration_number.desc())
        .limit(1)
    )
    iteration = iter_result.scalar_one_or_none()
    if not iteration:
        return {"error": f"No blueprint found for '{project.name}'"}

    # Get latest snapshot
    snap_result = await db.execute(
        select(BlueprintSnapshot)
        .where(BlueprintSnapshot.iteration_id == iteration.id)
        .order_by(BlueprintSnapshot.version_number.desc())
        .limit(1)
    )
    snapshot = snap_result.scalar_one_or_none()
    if not snapshot:
        return {"error": f"No blueprint snapshot for '{project.name}'"}

    return {
        "project": project.name,
        "iteration": iteration.iteration_number,
        "label": iteration.label or "",
        "status": iteration.status or "",
        "content": snapshot.content or "",
    }


async def _list_team_members(
    input_data: dict,
    *,
    org_id: str,
    team_id: str,
    db: AsyncSession,
    user_id: str | None = None,
) -> list:
    result = await db.execute(
        select(User, OrgMember.role)
        .join(OrgMember, OrgMember.user_id == User.id)
        .where(OrgMember.org_id == org_id)
        .order_by(User.name)
    )
    rows = result.all()
    return [{"name": user.name or user.email, "email": user.email, "role": role} for user, role in rows]


async def _suggest_session(
    input_data: dict,
    *,
    org_id: str,
    team_id: str,
    db: AsyncSession,
    user_id: str | None = None,
) -> dict:
    project_name = input_data["project_name"]
    is_new = input_data.get("is_new_project", False)

    project_id = None
    if not is_new:
        result = await db.execute(
            select(Project).where(
                Project.org_id == org_id,
                Project.name.ilike(f"%{project_name}%"),
                Project.deleted_at.is_(None),
            )
        )
        project = result.scalar_one_or_none()
        if project:
            project_id = project.id
            project_name = project.name
        else:
            is_new = True

    return {
        "_action": "suggest_session",
        "project_name": project_name,
        "project_id": project_id,
        "idea_summary": input_data["idea_summary"],
        "is_new_project": is_new,
    }


# ── Write tool handlers ────────────────────────────────────────────────────


async def _create_project(
    input_data: dict,
    *,
    org_id: str,
    team_id: str,
    db: AsyncSession,
    user_id: str | None = None,
) -> dict:
    if not user_id:
        return {"error": "user_id is required to create a project"}

    name = input_data.get("name") or "Untitled Project"
    project = Project(
        name=name,
        description=input_data.get("description"),
        owner_id=user_id,
        org_id=org_id,
        team_id=team_id,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return {"id": project.id, "name": project.name, "description": project.description}


async def _update_project(
    input_data: dict,
    *,
    org_id: str,
    team_id: str,
    db: AsyncSession,
    user_id: str | None = None,
) -> dict:
    name = input_data["project_name"]
    result = await db.execute(
        select(Project).where(
            Project.org_id == org_id,
            Project.name.ilike(f"%{name}%"),
            Project.deleted_at.is_(None),
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        return {"error": f"No project found matching '{name}'"}

    if input_data.get("new_name"):
        project.name = input_data["new_name"]
    if input_data.get("new_description"):
        project.description = input_data["new_description"]
    await db.commit()
    return {"id": project.id, "name": project.name, "description": project.description}


async def _delete_project(
    input_data: dict,
    *,
    org_id: str,
    team_id: str,
    db: AsyncSession,
    user_id: str | None = None,
) -> dict:
    name = input_data["project_name"]
    result = await db.execute(
        select(Project).where(
            Project.org_id == org_id,
            Project.name.ilike(f"%{name}%"),
            Project.deleted_at.is_(None),
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        return {"error": f"No project found matching '{name}'"}
    if user_id and project.owner_id != user_id:
        return {"error": "Only the project owner can delete it"}

    await db.delete(project)
    await db.commit()
    return {"deleted": True, "name": project.name}


async def _create_session(
    input_data: dict,
    *,
    org_id: str,
    team_id: str,
    db: AsyncSession,
    user_id: str | None = None,
) -> dict:
    # Lazy import: slack_query_flow pulls in the Slack dependency graph
    # (httpx + Slack resolvers) and we don't want to force-load it for every
    # chatbot call.
    from .slack_query_flow import list_candidate_projects, resolve_project

    name = input_data.get("project_name")
    project: Project | None = None

    if name:
        project_result = await db.execute(
            select(Project).where(
                Project.org_id == org_id,
                Project.name.ilike(f"%{name}%"),
                Project.deleted_at.is_(None),
            )
        )
        project = project_result.scalar_one_or_none()
        if not project:
            # Named project didn't match. Fall through to the picker so the
            # caller (Slack event handler) can render options — same as the
            # ambiguous-stamp path. Pulling the whole candidate list lets the
            # user pick something that does exist without another round-trip.
            candidates = await list_candidate_projects(team_id, db)
            if not candidates:
                return {"status": "no_projects"}
            return {
                "status": "needs_project_choice",
                "options": [{"id": p.id, "name": p.name} for p in candidates],
                "unmatched_name": name,
            }
    else:
        project = await resolve_project(team_id, db)
        if project is None:
            candidates = await list_candidate_projects(team_id, db)
            if not candidates:
                return {"status": "no_projects"}
            return {
                "status": "needs_project_choice",
                "options": [{"id": p.id, "name": p.name} for p in candidates],
            }

    session = Session(
        project_id=project.id,
        org_id=org_id,
        title=input_data.get("title"),
        initial_idea=input_data.get("initial_idea"),
    )
    db.add(session)
    await db.flush()
    if user_id:
        db.add(Participant(session_id=session.id, user_id=user_id, role="facilitator"))
    await db.commit()
    await db.refresh(session)
    return {
        "id": session.id,
        "title": session.title,
        "project": project.name,
        "project_id": project.id,
        "join_code": session.join_code,
    }


async def _create_card(
    input_data: dict,
    *,
    org_id: str,
    team_id: str,
    db: AsyncSession,
    user_id: str | None = None,
) -> dict:
    from ..services.board_service import get_or_create_board

    name = input_data["project_name"]
    project_result = await db.execute(
        select(Project).where(
            Project.org_id == org_id,
            Project.name.ilike(f"%{name}%"),
            Project.deleted_at.is_(None),
        )
    )
    project = project_result.scalar_one_or_none()
    if not project:
        return {"error": f"No project found matching '{name}'"}

    board = await get_or_create_board(project.id, db)

    column_name = input_data.get("column", "Backlog")
    col_result = await db.execute(
        select(BoardColumn).where(
            BoardColumn.board_id == board.id,
            BoardColumn.name.ilike(column_name),
        )
    )
    column = col_result.scalar_one_or_none()
    if not column:
        col_result = await db.execute(
            select(BoardColumn).where(BoardColumn.board_id == board.id).order_by(BoardColumn.position).limit(1)
        )
        column = col_result.scalar_one_or_none()
        if not column:
            return {"error": "No columns found on board"}

    max_pos = await db.execute(select(func.coalesce(func.max(Card.position), -1)).where(Card.column_id == column.id))
    next_pos = max_pos.scalar_one() + 1

    card = Card(
        column_id=column.id,
        position=next_pos,
        title=input_data["title"],
        description=input_data.get("description"),
        priority=input_data.get("priority", "medium"),
    )
    db.add(card)
    await db.commit()
    await db.refresh(card)
    return {"id": card.id, "title": card.title, "column": column.name, "priority": card.priority}


async def _update_card(
    input_data: dict,
    *,
    org_id: str,
    team_id: str,
    db: AsyncSession,
    user_id: str | None = None,
) -> dict:
    title = input_data["card_title"]
    result = await db.execute(
        select(Card, BoardColumn.name.label("column_name"))
        .join(BoardColumn, Card.column_id == BoardColumn.id)
        .join(Board, BoardColumn.board_id == Board.id)
        .where(Board.org_id == org_id, Card.title.ilike(f"%{title}%"))
        .limit(1)
    )
    row = result.one_or_none()
    if not row:
        return {"error": f"No card found matching '{title}'"}

    card, _column_name = row

    if input_data.get("new_title"):
        card.title = input_data["new_title"]
    if input_data.get("new_description"):
        card.description = input_data["new_description"]
    if input_data.get("new_priority"):
        card.priority = input_data["new_priority"]
    if input_data.get("new_column"):
        col_result = await db.execute(select(BoardColumn).where(BoardColumn.name.ilike(input_data["new_column"])))
        col = col_result.scalar_one_or_none()
        if col:
            card.column_id = col.id

    await db.commit()
    return {"id": card.id, "title": card.title, "priority": card.priority}


async def _delete_card(
    input_data: dict,
    *,
    org_id: str,
    team_id: str,
    db: AsyncSession,
    user_id: str | None = None,
) -> dict:
    title = input_data["card_title"]
    result = await db.execute(
        select(Card)
        .join(BoardColumn, Card.column_id == BoardColumn.id)
        .join(Board, BoardColumn.board_id == Board.id)
        .where(Board.org_id == org_id, Card.title.ilike(f"%{title}%"))
        .limit(1)
    )
    card = result.scalar_one_or_none()
    if not card:
        return {"error": f"No card found matching '{title}'"}
    card_title = card.title
    await db.delete(card)
    await db.commit()
    return {"deleted": True, "title": card_title}


async def _update_blueprint_section(
    input_data: dict,
    *,
    org_id: str,
    team_id: str,
    db: AsyncSession,
    user_id: str | None = None,
) -> dict:
    from ..services.blueprint_service import update_section

    name = input_data["project_name"]
    project_result = await db.execute(
        select(Project).where(
            Project.org_id == org_id,
            Project.name.ilike(f"%{name}%"),
            Project.deleted_at.is_(None),
        )
    )
    project = project_result.scalar_one_or_none()
    if not project:
        return {"error": f"No project found matching '{name}'"}

    snapshot = await update_section(
        project_id=project.id,
        section_name=input_data["section_key"],
        content=input_data["content"],
        created_by=user_id or "chat",
        db=db,
        source="chat_tool",
    )
    return {"version": snapshot.version_number, "section": input_data["section_key"], "project": project.name}


# ── Handler registry ────────────────────────────────────────────────────────

_TOOL_HANDLERS = {
    "list_projects": _list_projects,
    "get_project": _get_project,
    "list_board_cards": _list_board_cards,
    "get_card": _get_card,
    "search_directory": _search_directory,
    "read_directory_entry": _read_directory_entry,
    "list_directory": _list_directory,
    "list_sessions": _list_sessions,
    "get_blueprint": _get_blueprint,
    "list_team_members": _list_team_members,
    "suggest_session": _suggest_session,
    "create_project": _create_project,
    "update_project": _update_project,
    "delete_project": _delete_project,
    "create_session": _create_session,
    "create_card": _create_card,
    "update_card": _update_card,
    "delete_card": _delete_card,
    "update_blueprint_section": _update_blueprint_section,
}
