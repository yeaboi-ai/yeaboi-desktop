from uuid import UUID

from pydantic import BaseModel


class LastViewedRequest(BaseModel):
    project_id: UUID
