from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class IntegrationProjectMappingCreate(BaseModel):
    integration_id: str
    internal_session_id: str
    external_project_key: str = Field(..., min_length=1, max_length=120)
    external_project_id: str | None = None
    default_issue_type: str = "Task"
    field_mappings: dict = {}
    sync_direction: str = "bidirectional"
    enabled: bool = True


class IntegrationProjectMappingUpdate(BaseModel):
    external_project_key: str | None = None
    external_project_id: str | None = None
    default_issue_type: str | None = None
    field_mappings: dict | None = None
    sync_direction: str | None = None
    enabled: bool | None = None


class IntegrationProjectMappingResponse(BaseModel):
    id: str
    integration_id: str
    internal_session_id: str
    external_project_key: str
    external_project_id: str | None
    default_issue_type: str
    field_mappings: dict
    sync_direction: str
    enabled: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
