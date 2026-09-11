from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

OutputType = Literal["code_scaffold", "design_bundle", "terraform_stack", "decision_doc"]
OutputStatus = Literal["not_generated", "generating", "ready", "failed"]


class ProjectOutputResponse(BaseModel):
    id: str
    session_id: str
    output_type: OutputType
    status: OutputStatus
    payload: dict | None = None
    artifacts: dict | None = None
    error: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class GenerateOutputRequest(BaseModel):
    """Type-specific payload is opaque here; each handler validates its own shape."""

    payload: dict = Field(default_factory=dict)


class OutputCatalogueEntry(BaseModel):
    """Shape returned by GET /outputs — one entry per type, even if no row exists yet."""

    output_type: OutputType
    status: OutputStatus
    implemented: bool  # True for code_scaffold, False for slot-only types
    maturity: int  # 0-100 based on blueprint readiness for this output
    artifacts: dict | None = None
    updated_at: datetime | None = None
