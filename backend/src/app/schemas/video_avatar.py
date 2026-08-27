from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, field_validator

_VALID_PROVIDERS = {"tavus", "bey", "hedra", "simli"}
_VALID_GENDERS = {"male", "female", "neutral"}


class VideoAvatarCreate(BaseModel):
    name: str
    description: str | None = None
    provider: str = "tavus"
    replica_id: str
    preview_url: str | None = None
    gender: str | None = None
    voice_id: str | None = None
    realtime_voice: str | None = None
    voice_sample_url: str | None = None
    tavus_persona_id: str | None = None
    sort_order: int = 0

    @field_validator("gender")
    @classmethod
    def validate_gender(cls, v: str | None) -> str | None:
        if v is not None and v not in _VALID_GENDERS:
            raise ValueError(f"Gender must be one of: {', '.join(sorted(_VALID_GENDERS))}")
        return v

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Name must be at least 2 characters")
        if len(v) > 100:
            raise ValueError("Name must be at most 100 characters")
        return v

    @field_validator("provider")
    @classmethod
    def validate_provider(cls, v: str) -> str:
        if v not in _VALID_PROVIDERS:
            raise ValueError(f"Provider must be one of: {', '.join(sorted(_VALID_PROVIDERS))}")
        return v

    @field_validator("replica_id")
    @classmethod
    def validate_replica_id(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("replica_id is required")
        if len(v) > 100:
            raise ValueError("replica_id must be at most 100 characters")
        return v


class VideoAvatarUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    provider: str | None = None
    replica_id: str | None = None
    preview_url: str | None = None
    gender: str | None = None
    voice_id: str | None = None
    realtime_voice: str | None = None
    voice_sample_url: str | None = None
    tavus_persona_id: str | None = None
    sort_order: int | None = None

    @field_validator("gender")
    @classmethod
    def validate_gender(cls, v: str | None) -> str | None:
        if v is not None and v not in _VALID_GENDERS:
            raise ValueError(f"Gender must be one of: {', '.join(sorted(_VALID_GENDERS))}")
        return v

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if len(v) < 2 or len(v) > 100:
            raise ValueError("Name must be between 2 and 100 characters")
        return v

    @field_validator("provider")
    @classmethod
    def validate_provider(cls, v: str | None) -> str | None:
        if v is not None and v not in _VALID_PROVIDERS:
            raise ValueError(f"Provider must be one of: {', '.join(sorted(_VALID_PROVIDERS))}")
        return v


class VideoAvatarResponse(BaseModel):
    id: str
    org_id: str | None
    name: str
    description: str | None
    provider: str
    replica_id: str
    preview_url: str | None
    gender: str | None = None
    voice_id: str | None = None
    realtime_voice: str | None = None
    voice_sample_url: str | None = None
    tavus_persona_id: str | None = None
    is_system: bool
    sort_order: int
    created_at: datetime

    model_config = {"from_attributes": True}
