from pydantic import BaseModel, Field, field_validator

from ..services.slack_templates import EVENT_TYPES

_EVENTS = set(EVENT_TYPES)


class TeamSlackChannelCreate(BaseModel):
    slack_channel_id: str = Field(..., min_length=1, max_length=64)
    slack_channel_name: str | None = Field(None, max_length=255)
    event_types: list[str] = Field(default_factory=list)

    @field_validator("event_types")
    @classmethod
    def _validate(cls, v: list[str]) -> list[str]:
        bad = [x for x in v if x not in _EVENTS]
        if bad:
            raise ValueError(f"unknown event types: {bad}")
        return list(dict.fromkeys(v))  # dedupe, preserve order


class TeamSlackChannelUpdate(BaseModel):
    slack_channel_id: str | None = None
    slack_channel_name: str | None = None
    event_types: list[str] | None = None

    @field_validator("event_types")
    @classmethod
    def _validate(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        bad = [x for x in v if x not in _EVENTS]
        if bad:
            raise ValueError(f"unknown event types: {bad}")
        return list(dict.fromkeys(v))


class TeamSlackChannelOut(BaseModel):
    id: str
    team_id: str
    slack_channel_id: str
    slack_channel_name: str | None
    event_types: list[str]


class TeamSlackChannelList(BaseModel):
    channels: list[TeamSlackChannelOut]
