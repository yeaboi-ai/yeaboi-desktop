from uuid import UUID

from pydantic import BaseModel


class LastViewedRequest(BaseModel):
    session_id: UUID
