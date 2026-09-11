"""Platform chatbot — streaming chat endpoint with tool-calling.

Accepts conversation messages, runs a Claude tool-calling loop to fetch
platform data, and streams the final text response as SSE.
"""

import json
import logging

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_org, get_current_team, get_current_user
from ..models.organization import Organization, Team
from ..models.session import Session
from ..models.user import User
from ..services.ai_provider import get_ai_client
from ..services.chat_tools import TOOL_SCHEMAS, execute_tool

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_TOOL_ROUNDS = 10  # Safety limit on tool-calling loops
SYSTEM_PROMPT_TEMPLATE = """You are a helpful platform assistant for the organization "{org_name}".

You are speaking with {user_name} ({user_role}).{team_line}

You have tools to query live platform data: projects, kanban boards, planning sessions,
blueprints, the team's technical directory, and team members. Always use your tools to look
up data before answering — never fabricate project names, card titles, or other platform data.

IMPORTANT: When the user asks about architecture, infrastructure, where something fits, or
how things are built, ALWAYS search the directory first using search_directory or list_directory.
The directory contains the team's knowledge base about their stack, infrastructure, security,
costs, and architecture. Ground your answers in what the directory actually says.

Be friendly and conversational. If the user says hello or chats casually, respond warmly —
you're a colleague, not a search engine. Only use tools when the user asks something that
requires looking up data. When you can't find what was asked about, say so plainly.

When the user discusses a feature idea, project concept, or technical initiative that would benefit
from a planning session, use the suggest_session tool to offer starting one. Match to an existing
project if the idea fits, otherwise suggest creating a new project."""


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    context: dict = {}

    @field_validator("messages")
    @classmethod
    def at_least_one_message(cls, v):
        if not v:
            raise ValueError("At least one message is required")
        return v


@router.post("/api/chat")
async def chat(
    body: ChatRequest,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    team: Team = Depends(get_current_team),
    db: AsyncSession = Depends(get_db),
):
    """Streaming chat endpoint with tool-calling loop."""
    ai = await get_ai_client(org.id, db, task="fast")

    team_line = f"\nTeam: {team.name}." if team else ""
    system = SYSTEM_PROMPT_TEMPLATE.format(
        org_name=org.name,
        user_name=user.name or user.email,
        user_role=user.role or "member",
        team_line=team_line,
    )

    # Inject current page context if provided
    ctx = body.context
    if ctx:
        context_lines: list[str] = []
        if ctx.get("page"):
            context_lines.append(f"The user is currently on: {ctx['page']}")
        if ctx.get("session_id"):
            proj_result = await db.execute(
                select(Session).where(Session.id == ctx["session_id"], Session.deleted_at.is_(None))
            )
            proj = proj_result.scalar_one_or_none()
            if proj:
                context_lines.append(f"Currently viewing project: {proj.name}")
        if ctx.get("session_id"):
            context_lines.append(f"Active session ID: {ctx['session_id']}")
        if ctx.get("board_id"):
            context_lines.append(f"Active board ID: {ctx['board_id']}")
        if context_lines:
            system += "\n\nCurrent Context:\n" + "\n".join(context_lines)

    # Build messages in Anthropic format
    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    async def event_stream():
        nonlocal messages
        rounds = 0

        try:
            while rounds < MAX_TOOL_ROUNDS:
                rounds += 1

                response = await ai.chat_with_tools(
                    system=system,
                    messages=messages,
                    tools=TOOL_SCHEMAS,
                )

                # Response is a dict: {"role": "assistant", "content": [...], "stop_reason": "..."}
                content = response["content"]

                # Check for tool calls
                tool_blocks = [b for b in content if b["type"] == "tool_use"]

                if not tool_blocks:
                    # No more tool calls — send the text word-by-word.
                    for block in content:
                        if block["type"] == "text":
                            words = block["text"].split(" ")
                            for i, word in enumerate(words):
                                chunk = word if i == 0 else " " + word
                                yield f"data: {json.dumps({'type': 'text', 'content': chunk})}\n\n"
                    yield f"data: {json.dumps({'type': 'done'})}\n\n"
                    return

                # Execute tool calls in parallel
                logger.info("Chat tool round %d: %d tool calls", rounds, len(tool_blocks))
                messages.append({"role": "assistant", "content": content})

                # Stream tool names so frontend knows what's happening
                for block in tool_blocks:
                    yield f"data: {json.dumps({'type': 'tool', 'name': block['name']})}\n\n"

                # Run all tools concurrently
                import asyncio
                async def _run_tool(block):
                    return block, await execute_tool(
                        block["name"], block["input"],
                        org_id=org.id, team_id=team.id, db=db, user_id=user.id,
                    )

                results = await asyncio.gather(*[_run_tool(b) for b in tool_blocks])

                tool_results = []
                for block, result in results:
                    if isinstance(result, dict) and "_action" in result:
                        action_data = {k: v for k, v in result.items() if k != "_action"}
                        yield f"data: {json.dumps({'type': 'action', 'action': result['_action'], **action_data})}\n\n"
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block["id"],
                        "content": json.dumps(result),
                    })

                messages.append({"role": "user", "content": tool_results})

            # Safety: max rounds reached
            fallback = "I ran into a limit while looking up data. Please try a simpler question."
            yield f"data: {json.dumps({'type': 'text', 'content': fallback})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as e:
            logger.exception("Chat stream error: %s", e)
            yield f"data: {json.dumps({'type': 'text', 'content': f'Error: {e}'})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
