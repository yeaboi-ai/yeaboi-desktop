"""Niko service — conversation orchestration, tool loop, and magic prompts.

Handles the full lifecycle of a Niko chat interaction:
1. Find or create conversation
2. Save user message
3. Build system prompt with enriched context
4. Call AI with tool definitions
5. Execute tool calls and feed results back
6. Stream response as SSE events
7. Persist assistant message
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncGenerator
from typing import TYPE_CHECKING

from sqlalchemy import func, select

from ..models.niko import NikoConversation, NikoMessage
from ..schemas.niko import NikoContextPayload, NikoMagicPrompt
from .ai_provider import get_ai_client
from .niko_prompt import build_system_prompt
from .niko_tools import TOOL_DEFINITIONS, execute_tool

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from ..models.organization import Organization
    from ..models.user import User

logger = logging.getLogger(__name__)

# Maximum tool call rounds to prevent infinite loops
MAX_TOOL_ROUNDS = 5


async def get_or_create_conversation(
    conversation_id: str | None,
    user: User,
    org: Organization,
    db: AsyncSession,
) -> NikoConversation:
    """Find existing conversation or create a new one."""
    if conversation_id:
        result = await db.execute(
            select(NikoConversation).where(
                NikoConversation.id == conversation_id,
                NikoConversation.user_id == user.id,
                NikoConversation.org_id == org.id,
            )
        )
        conv = result.scalar_one_or_none()
        if conv:
            return conv

    # Create new conversation
    conv = NikoConversation(user_id=user.id, org_id=org.id)
    db.add(conv)
    await db.flush()
    return conv


async def chat_stream(
    message: str,
    context: NikoContextPayload,
    conversation_id: str | None,
    user: User,
    org: Organization,
    db: AsyncSession,
) -> AsyncGenerator[str, None]:
    """Process a chat message and yield SSE events.

    Yields SSE-formatted strings: "event: <type>\\ndata: <json>\\n\\n"
    """
    # 1. Get or create conversation
    conv = await get_or_create_conversation(conversation_id, user, org, db)

    # 2. Save user message
    user_msg = NikoMessage(
        conversation_id=conv.id,
        role="user",
        content=message,
        context_snapshot={
            "page": context.page,
            "session_id": context.session_id,
            "board_id": context.board_id,
        },
    )
    db.add(user_msg)
    await db.flush()

    # 3. Count existing messages for feedback hint
    msg_count_result = await db.execute(
        select(func.count()).select_from(NikoMessage).where(NikoMessage.conversation_id == conv.id)
    )
    message_count = msg_count_result.scalar_one()

    # 4. Build system prompt
    system_prompt = await build_system_prompt(context, user, org, db, message_count)

    # 5. Build message history from DB
    history_result = await db.execute(
        select(NikoMessage)
        .where(NikoMessage.conversation_id == conv.id)
        .order_by(NikoMessage.created_at)
    )
    history_msgs = history_result.scalars().all()
    api_messages = _build_api_messages(history_msgs)

    # 6. Get AI client
    ai = await get_ai_client(org.id, db, task="default")

    # 7. Tool loop — call AI, execute tools, feed results back
    all_tool_calls = []
    all_tool_results = []
    final_text = ""

    for _round in range(MAX_TOOL_ROUNDS):
        response = await ai.chat_with_tools(
            system=system_prompt,
            messages=api_messages,
            tools=TOOL_DEFINITIONS,
            max_tokens=4096,
        )

        # Process content blocks
        text_parts = []
        tool_uses = []

        for block in response.get("content", []):
            if block.get("type") == "text":
                text_parts.append(block["text"])
            elif block.get("type") == "tool_use":
                tool_uses.append(block)

        # Stream any text
        if text_parts:
            combined_text = "".join(text_parts)
            final_text += combined_text
            yield _sse_event("text", {"delta": combined_text})

        # If no tool calls, we're done
        if not tool_uses:
            break

        # Execute tool calls
        # Add assistant message with tool calls to history
        api_messages.append({"role": "assistant", "content": response["content"]})

        tool_result_blocks = []
        for tool_use in tool_uses:
            tool_name = tool_use["name"]
            tool_input = tool_use.get("input", {})
            tool_id = tool_use.get("id", "")

            # Notify frontend about tool call
            yield _sse_event("tool_call", {"tool_name": tool_name, "tool_input": tool_input})

            # Execute
            result = await execute_tool(tool_name, tool_input, user, org, db)

            all_tool_calls.append({"name": tool_name, "input": tool_input})
            all_tool_results.append({"name": tool_name, **result})

            # Notify frontend about result
            yield _sse_event("tool_result", {"tool_name": tool_name, **result})

            tool_result_blocks.append(
                {
                    "type": "tool_result",
                    "tool_use_id": tool_id,
                    "content": json.dumps(
                        result.get("result") if result["success"] else {"error": result.get("error")}
                    ),
                }
            )

        # Add tool results to history for next round
        api_messages.append({"role": "user", "content": tool_result_blocks})

    # 8. Persist assistant message
    assistant_msg = NikoMessage(
        conversation_id=conv.id,
        role="assistant",
        content=final_text or None,
        tool_calls=all_tool_calls if all_tool_calls else None,
        tool_results=all_tool_results if all_tool_results else None,
    )
    db.add(assistant_msg)

    # 9. Auto-generate title if this is the first exchange
    if not conv.title and message_count <= 2:
        try:
            title_ai = await get_ai_client(org.id, db, task="fast")
            title = await title_ai.chat(
                system="Generate a 3-5 word title for this conversation. Return ONLY the title, nothing else.",
                messages=[{"role": "user", "content": message}],
                max_tokens=20,
            )
            conv.title = title.strip().strip('"').strip("'")[:255]
        except Exception:
            logger.debug("Failed to auto-generate conversation title")

    await db.commit()

    # 10. Done event
    yield _sse_event("done", {"conversation_id": conv.id, "message_id": assistant_msg.id})


def _build_api_messages(messages: list[NikoMessage]) -> list[dict]:
    """Convert stored messages to Anthropic API format."""
    api_messages = []
    for msg in messages:
        if msg.role == "user":
            api_messages.append({"role": "user", "content": msg.content or ""})
        elif msg.role == "assistant":
            # Reconstruct content blocks if there were tool calls
            if msg.tool_calls:
                # For simplicity in history, just include the text
                content = msg.content or ""
                api_messages.append({"role": "assistant", "content": content})
            else:
                api_messages.append({"role": "assistant", "content": msg.content or ""})
    return api_messages


def _sse_event(event_type: str, data: dict) -> str:
    """Format an SSE event string."""
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"


# ─── Magic Prompts ────────────────────────────────────────────────────────────

_MAGIC_PROMPTS: dict[str, list[dict]] = {
    "/projects": [
        {"label": "Create a new project", "prompt": "Help me create a new project", "icon": "plus"},
        {
            "label": "Session status overview",
            "prompt": "Give me a status overview of all my projects",
            "icon": "bar-chart",
        },
        {
            "label": "What should I work on?",
            "prompt": "Based on my projects, what should I prioritize?",
            "icon": "compass",
        },
    ],
    "/sessions/{id}": [
        {
            "label": "Start a planning session",
            "prompt": "Let's start a new planning session for this project",
            "icon": "play",
        },
        {
            "label": "Check blueprint coverage",
            "prompt": "How complete is this project's blueprint?",
            "icon": "shield-check",
        },
        {
            "label": "Board summary",
            "prompt": "Summarize the board status for this project",
            "icon": "layout",
        },
    ],
    "/sessions/{id}/board": [
        {
            "label": "Create a new card",
            "prompt": "Help me create a new card for this board",
            "icon": "plus-square",
        },
        {
            "label": "Prioritize backlog",
            "prompt": "Help me prioritize the backlog cards",
            "icon": "arrow-up-down",
        },
        {"label": "Sprint planning", "prompt": "Let's do sprint planning", "icon": "calendar"},
    ],
    "/studio": [
        {"label": "Create a persona", "prompt": "Help me create a custom AI persona", "icon": "user-plus"},
        {"label": "Design a template", "prompt": "Help me design a new blueprint template", "icon": "file-plus"},
        {
            "label": "Review personas",
            "prompt": "Show me my current personas and suggest improvements",
            "icon": "users",
        },
    ],
    "/board": [
        {
            "label": "Cross-project overview",
            "prompt": "Give me an overview of cards across all projects",
            "icon": "layers",
        },
        {"label": "What's blocked?", "prompt": "Are there any blocked or overdue cards?", "icon": "alert-triangle"},
    ],
    "/analytics": [
        {
            "label": "Explain metrics",
            "prompt": "Explain what these analytics mean for my projects",
            "icon": "trending-up",
        },
        {"label": "What needs attention?", "prompt": "What needs my attention?", "icon": "bell"},
    ],
    "/settings": [
        {"label": "Platform overview", "prompt": "Give me an overview of the platform", "icon": "info"},
    ],
}


def get_magic_prompts(page: str, session_id: str | None = None) -> list[NikoMagicPrompt]:
    """Return contextual magic prompts for the given page."""
    # Try exact match first
    prompts = _MAGIC_PROMPTS.get(page)

    if not prompts:
        # Try pattern matching
        if session_id and "/board" in page:
            prompts = _MAGIC_PROMPTS.get("/sessions/{id}/board")
        elif session_id:
            prompts = _MAGIC_PROMPTS.get("/sessions/{id}")

    if not prompts:
        # Match by prefix
        for pattern, p in _MAGIC_PROMPTS.items():
            if page.startswith(pattern.split("{")[0]) and pattern != page:
                prompts = p
                break

    if not prompts:
        # Default prompts
        prompts = _MAGIC_PROMPTS["/projects"]

    return [NikoMagicPrompt(**p) for p in prompts]


async def list_conversations(
    user: User,
    org: Organization,
    db: AsyncSession,
    limit: int = 20,
    offset: int = 0,
) -> list[NikoConversation]:
    """List user's conversations, most recent first."""
    result = await db.execute(
        select(NikoConversation)
        .where(
            NikoConversation.user_id == user.id,
            NikoConversation.org_id == org.id,
            NikoConversation.is_archived.is_(False),
        )
        .order_by(NikoConversation.updated_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


async def get_conversation_with_messages(
    conversation_id: str,
    user: User,
    org: Organization,
    db: AsyncSession,
) -> tuple[NikoConversation | None, list[NikoMessage]]:
    """Get a conversation with all its messages.

    Returns (conversation, messages) tuple. Messages are loaded separately
    to avoid greenlet issues with lazy loading in async SQLAlchemy.
    """
    result = await db.execute(
        select(NikoConversation).where(
            NikoConversation.id == conversation_id,
            NikoConversation.user_id == user.id,
            NikoConversation.org_id == org.id,
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        return None, []

    msgs_result = await db.execute(
        select(NikoMessage)
        .where(NikoMessage.conversation_id == conv.id)
        .order_by(NikoMessage.created_at)
    )
    messages = list(msgs_result.scalars().all())
    return conv, messages


async def archive_conversation(
    conversation_id: str,
    user: User,
    org: Organization,
    db: AsyncSession,
) -> bool:
    """Archive a conversation. Returns True if found and archived."""
    result = await db.execute(
        select(NikoConversation).where(
            NikoConversation.id == conversation_id,
            NikoConversation.user_id == user.id,
            NikoConversation.org_id == org.id,
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        return False
    conv.is_archived = True
    await db.commit()
    return True
