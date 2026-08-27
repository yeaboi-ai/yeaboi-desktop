from __future__ import annotations

import re
from datetime import datetime

from pydantic import BaseModel, field_validator

# ─── Validation helpers ─────────────────────────────────────────────────────

_NAME_RE = re.compile(r"^[a-zA-Z][\w\s\-/&.]+$")
_MIN_NAME_LEN = 2
_MAX_NAME_LEN = 80

_VALID_EMOTIONS = {"neutral", "happy", "serious", "excited", "calm"}
_VALID_LANGUAGES = {
    "en",
    "ar",
    "zh",
    "nl",
    "fr",
    "de",
    "hi",
    "it",
    "ja",
    "ko",
    "pl",
    "pt",
    "ru",
    "es",
    "tr",
    "uk",
}
_VALID_REALTIME_VOICES = {"alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse"}


def _validate_name(v: str, label: str = "Name") -> str:
    v = v.strip()
    if len(v) < _MIN_NAME_LEN:
        raise ValueError(f"{label} must be at least {_MIN_NAME_LEN} characters")
    if len(v) > _MAX_NAME_LEN:
        raise ValueError(f"{label} must be at most {_MAX_NAME_LEN} characters")
    if not _NAME_RE.match(v):
        raise ValueError(
            f"{label} must start with a letter and contain only letters, numbers, spaces, hyphens, or slashes"
        )
    return v


def _validate_voice_fields(values: dict) -> dict:
    """Shared validation for voice-related fields."""
    speed = values.get("speed")
    if speed is not None and not (0.5 <= speed <= 2.0):
        raise ValueError("Speed must be between 0.5 and 2.0")

    emotion = values.get("emotion")
    if emotion is not None and emotion not in _VALID_EMOTIONS:
        raise ValueError(f"Emotion must be one of: {', '.join(sorted(_VALID_EMOTIONS))}")

    language = values.get("language")
    if language is not None and language not in _VALID_LANGUAGES:
        raise ValueError(f"Language must be a valid code: {', '.join(sorted(_VALID_LANGUAGES))}")

    realtime_voice = values.get("realtime_voice")
    if realtime_voice is not None and realtime_voice not in _VALID_REALTIME_VOICES:
        raise ValueError(f"Realtime voice must be one of: {', '.join(sorted(_VALID_REALTIME_VOICES))}")

    return values


# ─── Voice settings mixin ──────────────────────────────────────────────────


class _VoiceFieldsMixin(BaseModel):
    voice_id: str | None = None
    speed: float | None = None
    emotion: str | None = None
    language: str | None = None
    realtime_voice: str | None = None

    @field_validator("speed")
    @classmethod
    def validate_speed(cls, v: float | None) -> float | None:
        if v is not None and not (0.5 <= v <= 2.0):
            raise ValueError("Speed must be between 0.5 and 2.0")
        return v

    @field_validator("emotion")
    @classmethod
    def validate_emotion(cls, v: str | None) -> str | None:
        if v is not None and v not in _VALID_EMOTIONS:
            raise ValueError(f"Emotion must be one of: {', '.join(sorted(_VALID_EMOTIONS))}")
        return v

    @field_validator("language")
    @classmethod
    def validate_language(cls, v: str | None) -> str | None:
        if v is not None and v not in _VALID_LANGUAGES:
            raise ValueError(f"Language must be a valid code: {', '.join(sorted(_VALID_LANGUAGES))}")
        return v

    @field_validator("realtime_voice")
    @classmethod
    def validate_realtime_voice(cls, v: str | None) -> str | None:
        if v is not None and v not in _VALID_REALTIME_VOICES:
            raise ValueError(f"Realtime voice must be one of: {', '.join(sorted(_VALID_REALTIME_VOICES))}")
        return v


# ─── Persona Schemas ─────────────────────────────────────────────────────────


class BlueprintPersonaCreate(BaseModel):
    # Voice config (voice_id/speed/emotion/language/realtime_voice) is bundled
    # into the chosen character (video_avatar_id) — see VideoAvatar. Per-persona
    # voice override fields were retired. The persona's thumbnail is also
    # derived from the chosen character's preview video; there is no separate
    # avatar_url field.
    name: str
    description: str | None = None
    system_prompt: str
    focus_sections: list[str] = []
    video_avatar_id: str | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        return _validate_name(v, "Persona name")

    @field_validator("system_prompt")
    @classmethod
    def validate_prompt(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 10:
            raise ValueError("System prompt must be at least 10 characters")
        if len(v) > 5000:
            raise ValueError("System prompt must be at most 5000 characters")
        return v

    @field_validator("focus_sections")
    @classmethod
    def validate_focus(cls, v: list[str]) -> list[str]:
        return [s.strip() for s in v if s.strip()]


class BlueprintPersonaUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    system_prompt: str | None = None
    focus_sections: list[str] | None = None
    video_avatar_id: str | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        if v is not None:
            return _validate_name(v, "Persona name")
        return v

    @field_validator("system_prompt")
    @classmethod
    def validate_prompt(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip()
            if len(v) < 10:
                raise ValueError("System prompt must be at least 10 characters")
        return v


class BlueprintPersonaResponse(BaseModel):
    id: str
    org_id: str
    slug: str
    name: str
    description: str | None
    system_prompt: str
    focus_sections: list[str]
    is_system: bool
    sort_order: int
    created_at: datetime
    video_avatar_id: str | None = None

    model_config = {"from_attributes": True}


# ─── Template Schemas ────────────────────────────────────────────────────────


class BlueprintTemplateCreate(BaseModel):
    name: str
    description: str | None = None
    icon: str = "zap"
    sections: list[str] = []
    default_persona_id: str | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        return _validate_name(v, "Template name")

    @field_validator("sections")
    @classmethod
    def validate_sections(cls, v: list[str]) -> list[str]:
        cleaned = [s.strip() for s in v if s.strip()]
        if not cleaned:
            raise ValueError("Template must have at least one section")
        return cleaned

    @field_validator("icon")
    @classmethod
    def validate_icon(cls, v: str) -> str:
        v = v.strip().lower()
        if not v or len(v) > 30:
            return "zap"
        return v


class BlueprintTemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    icon: str | None = None
    sections: list[str] | None = None
    default_persona_id: str | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        if v is not None:
            return _validate_name(v, "Template name")
        return v

    @field_validator("sections")
    @classmethod
    def validate_sections(cls, v: list[str] | None) -> list[str] | None:
        if v is not None:
            cleaned = [s.strip() for s in v if s.strip()]
            if not cleaned:
                raise ValueError("Template must have at least one section")
            return cleaned
        return v


class BlueprintTemplateResponse(BaseModel):
    id: str
    org_id: str
    slug: str
    name: str
    description: str | None
    icon: str
    sections: list[str]
    default_persona_id: str | None
    is_system: bool
    sort_order: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Section Schemas ────────────────────────────────────────────────────────


class BlueprintSectionCreate(BaseModel):
    label: str
    description: str | None = None

    @field_validator("label")
    @classmethod
    def validate_label(cls, v: str) -> str:
        return _validate_name(v, "Section name")


class BlueprintSectionUpdate(BaseModel):
    label: str | None = None
    description: str | None = None

    @field_validator("label")
    @classmethod
    def validate_label(cls, v: str | None) -> str | None:
        if v is not None:
            return _validate_name(v, "Section name")
        return v


class BlueprintSectionResponse(BaseModel):
    id: str
    slug: str
    label: str
    description: str | None
    is_system: bool
    sort_order: int

    model_config = {"from_attributes": True}


# ─── Org AI Defaults Schemas ───────────────────────────────────────────────


class OrgAIDefaultsUpdate(_VoiceFieldsMixin):
    pass


class OrgAIDefaultsResponse(BaseModel):
    id: str
    org_id: str
    voice_id: str | None = None
    speed: float | None = None
    emotion: str | None = None
    language: str | None = None
    realtime_voice: str | None = None

    model_config = {"from_attributes": True}
