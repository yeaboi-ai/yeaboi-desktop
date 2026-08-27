from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class FeedbackCreate(BaseModel):
    target_type: Literal["chat_message", "voice_response", "session", "transcript"]
    target_id: str | None = None
    session_id: str | None = None
    agent_type: Literal["chat", "voice", "platform_chat"]
    rating: Literal["thumbs_up", "thumbs_down"]
    comment: str | None = None
    context: dict | None = None


class FeedbackResponse(BaseModel):
    id: str
    user_id: str
    session_id: str | None
    target_type: str
    target_id: str | None
    agent_type: str
    rating: str
    comment: str | None
    context: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}


class FeedbackSummary(BaseModel):
    total: int
    thumbs_up: int
    thumbs_down: int
    with_comments: int
    by_agent_type: dict[str, dict[str, int]]
