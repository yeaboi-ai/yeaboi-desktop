import json
import logging
import os
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from ..config import get_settings
from ..deps import get_current_user
from ..middleware.rate_limit import limiter
from ..models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/settings", tags=["settings"])

CONFIG_PATH = Path.home() / ".planning-platform" / "config.json"

# Keys that are considered secrets — display them masked
SECRET_KEYS = {
    "anthropic_api_key",
    "openai_api_key",
    "google_api_key",
    "deepgram_api_key",
    "elevenlabs_api_key",
    "livekit_api_key",
    "livekit_api_secret",
    "github_token",
    "resend_api_key",
}

# The full list of configurable settings, in display order
SETTING_KEYS = [
    "anthropic_api_key",
    "openai_api_key",
    "google_api_key",
    "deepgram_api_key",
    "elevenlabs_api_key",
    "elevenlabs_voice_id",
    "elevenlabs_model_id",
    "livekit_url",
    "livekit_api_key",
    "livekit_api_secret",
    "github_token",
    "resend_api_key",
    "app_url",
]

# Map setting key -> env var name
ENV_VAR_MAP: dict[str, str] = {
    "anthropic_api_key": "ANTHROPIC_API_KEY",
    "openai_api_key": "OPENAI_API_KEY",
    "google_api_key": "GOOGLE_API_KEY",
    "deepgram_api_key": "DEEPGRAM_API_KEY",
    "elevenlabs_api_key": "ELEVENLABS_API_KEY",
    "elevenlabs_voice_id": "ELEVENLABS_VOICE_ID",
    "elevenlabs_model_id": "ELEVENLABS_MODEL_ID",
    "livekit_url": "LIVEKIT_URL",
    "livekit_api_key": "LIVEKIT_API_KEY",
    "livekit_api_secret": "LIVEKIT_API_SECRET",
    "github_token": "GITHUB_TOKEN",
    "resend_api_key": "RESEND_API_KEY",
    "app_url": "APP_URL",
}


def _read_config() -> dict[str, str]:
    """Read the JSON config file, returning an empty dict if it doesn't exist."""
    if not CONFIG_PATH.exists():
        return {}
    try:
        with CONFIG_PATH.open() as f:
            data = json.load(f)
            return {k: str(v) for k, v in data.items() if isinstance(v, str)}
    except (json.JSONDecodeError, OSError):
        return {}


def _write_config(data: dict[str, str]) -> None:
    """Write the JSON config file, creating the directory if needed."""
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CONFIG_PATH.open("w") as f:
        json.dump(data, f, indent=2)


def _mask_value(key: str, value: str) -> str:
    """Show first 8 chars + last 4, mask the rest."""
    if key not in SECRET_KEYS or not value:
        return value
    if len(value) <= 12:
        return "*" * len(value)
    return value[:8] + "*" * (len(value) - 12) + value[-4:]


def _resolve_value(key: str, config: dict[str, str]) -> str:
    """Return the value for a key: config file overrides env var."""
    if key in config:
        return config[key]
    env_var = ENV_VAR_MAP.get(key, key.upper())
    return os.environ.get(env_var, "")


class SettingItem(BaseModel):
    key: str
    masked_value: str
    is_set: bool
    is_secret: bool
    source: str  # "config" | "env" | "default"


class SettingsResponse(BaseModel):
    settings: list[SettingItem]


class SettingsPatch(BaseModel):
    updates: dict[str, Any]


@router.get("", response_model=SettingsResponse)
@limiter.limit("60/minute")
async def get_settings_endpoint(request: Request, _user: User = Depends(get_current_user)) -> SettingsResponse:
    """Return all configurable settings with masked values. Admin only."""
    config = _read_config()
    items: list[SettingItem] = []

    for key in SETTING_KEYS:
        raw = _resolve_value(key, config)
        if key in config and raw:
            source = "config"
        elif raw:
            source = "env"
        else:
            source = "default"

        items.append(
            SettingItem(
                key=key,
                masked_value=_mask_value(key, raw),
                is_set=bool(raw),
                is_secret=key in SECRET_KEYS,
                source=source,
            )
        )

    return SettingsResponse(settings=items)


@router.patch("", response_model=SettingsResponse)
@limiter.limit("60/minute")
async def update_settings(
    request: Request,
    body: SettingsPatch,
    _user: User = Depends(get_current_user),
) -> SettingsResponse:
    """Update one or more settings in the config file. Admin only."""
    # Validate keys
    unknown = set(body.updates.keys()) - set(SETTING_KEYS)
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown setting keys: {unknown}")

    config = _read_config()

    for key, value in body.updates.items():
        if value is None or value == "":
            # Empty string / null = remove override (fall back to env)
            config.pop(key, None)
        else:
            config[key] = str(value)

    _write_config(config)
    logger.info("Settings updated: %s", list(body.updates.keys()))

    # Bust the lru_cache so get_settings() returns fresh values on next call
    get_settings.cache_clear()

    # Return updated state
    items: list[SettingItem] = []
    for key in SETTING_KEYS:
        raw = _resolve_value(key, config)
        if key in config and raw:
            source = "config"
        elif raw:
            source = "env"
        else:
            source = "default"

        items.append(
            SettingItem(
                key=key,
                masked_value=_mask_value(key, raw),
                is_set=bool(raw),
                is_secret=key in SECRET_KEYS,
                source=source,
            )
        )

    return SettingsResponse(settings=items)
