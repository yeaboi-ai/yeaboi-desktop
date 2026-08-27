from datetime import datetime

from pydantic import BaseModel


class NikoContextPayload(BaseModel):
    page: str
    project_id: str | None = None
    session_id: str | None = None
    board_id: str | None = None
    selected_card_id: str | None = None


class NikoChatRequest(BaseModel):
    conversation_id: str | None = None
    message: str
    context: NikoContextPayload


class NikoMessageResponse(BaseModel):
    id: str
    role: str
    content: str | None = None
    tool_calls: list[dict] | None = None
    tool_results: list[dict] | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class NikoConversationResponse(BaseModel):
    id: str
    title: str | None = None
    is_archived: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class NikoConversationDetailResponse(NikoConversationResponse):
    messages: list[NikoMessageResponse] = []


class NikoMagicPrompt(BaseModel):
    label: str
    prompt: str
    icon: str | None = None
