"""Niko AI agent router.

Endpoints for the unified Niko assistant:
- POST /api/niko/chat — SSE streaming chat
- GET /api/niko/conversations — list conversations
- GET /api/niko/conversations/{id} — get conversation detail
- DELETE /api/niko/conversations/{id} — archive conversation
- GET /api/niko/magic-prompts — contextual quick-start suggestions
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_org, get_current_user
from ..middleware.rate_limit import limiter
from ..models.organization import Organization
from ..models.user import User
from ..schemas.niko import (
    NikoChatRequest,
    NikoConversationDetailResponse,
    NikoConversationResponse,
    NikoMagicPrompt,
    NikoMessageResponse,
)
from ..services.niko_service import (
    archive_conversation,
    chat_stream,
    get_conversation_with_messages,
    get_magic_prompts,
    list_conversations,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/niko", tags=["niko"])


@router.post("/chat")
@limiter.limit("30/minute")
async def niko_chat(
    request: Request,
    body: NikoChatRequest,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Chat with Niko. Returns an SSE stream."""
    logger.info("Niko chat: user=%s page=%s", user.email, body.context.page)

    async def event_generator():
        try:
            async for event in chat_stream(
                message=body.message,
                context=body.context,
                conversation_id=body.conversation_id,
                user=user,
                org=org,
                db=db,
            ):
                yield event
        except Exception as e:
            import json

            logger.exception("Niko chat stream error: %s", e)
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/conversations", response_model=list[NikoConversationResponse])
@limiter.limit("60/minute")
async def get_conversations(
    request: Request,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=20, le=50),
    offset: int = Query(default=0, ge=0),
) -> list:
    """List user's Niko conversations."""
    return await list_conversations(user, org, db, limit=limit, offset=offset)


@router.get("/conversations/{conversation_id}", response_model=NikoConversationDetailResponse)
@limiter.limit("60/minute")
async def get_conversation(
    request: Request,
    conversation_id: str,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> NikoConversationDetailResponse:
    """Get a conversation with all messages."""
    conv, messages = await get_conversation_with_messages(conversation_id, user, org, db)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return NikoConversationDetailResponse(
        id=conv.id,
        title=conv.title,
        is_archived=conv.is_archived,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        messages=[
            NikoMessageResponse(
                id=m.id,
                role=m.role,
                content=m.content,
                tool_calls=m.tool_calls,
                tool_results=m.tool_results,
                created_at=m.created_at,
            )
            for m in messages
        ],
    )


@router.delete("/conversations/{conversation_id}", status_code=204)
@limiter.limit("30/minute")
async def delete_conversation(
    request: Request,
    conversation_id: str,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Archive a conversation."""
    found = await archive_conversation(conversation_id, user, org, db)
    if not found:
        raise HTTPException(status_code=404, detail="Conversation not found")


@router.get("/magic-prompts", response_model=list[NikoMagicPrompt])
@limiter.limit("60/minute")
async def magic_prompts(
    request: Request,
    page: str = Query(default="/projects"),
    session_id: str | None = Query(default=None),
    user: User = Depends(get_current_user),
) -> list[NikoMagicPrompt]:
    """Get contextual magic prompt suggestions for the current page."""
    return get_magic_prompts(page, session_id)
