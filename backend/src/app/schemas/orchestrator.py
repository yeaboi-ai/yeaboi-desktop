"""Orchestrator request/response schemas."""

from pydantic import BaseModel


class OrchestratorStartRequest(BaseModel):
    repo_path: str | None = None  # Deprecated — repo_url is now stored on the project


class OrchestratorStatusResponse(BaseModel):
    running: bool
    project_id: str


class AgentApprovalRequest(BaseModel):
    action: str  # "approve" or "reject"
    feedback: str | None = None
