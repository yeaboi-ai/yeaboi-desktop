from datetime import datetime

from pydantic import BaseModel


class HarnessGenerateRequest(BaseModel):
    repo_name: str | None = None
    github_token: str | None = None
    create_repo: bool = False


class HarnessPreviewResponse(BaseModel):
    files: dict[str, str]


class HarnessStatusResponse(BaseModel):
    id: str
    project_id: str
    status: str
    repo_url: str | None
    repo_name: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
