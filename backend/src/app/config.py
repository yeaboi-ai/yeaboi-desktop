import json
import logging
import os
from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)


def _config_path() -> Path:
    """Where the JSON override file lives.

    The yeaboi desktop app runs this backend as a local sidecar with all data
    under one root (~/.yeaboi, or $YEABOI_HOME); its config rides at
    <root>/planning/config.json. Outside that arrangement the legacy
    ~/.planning-platform/config.json keeps working.
    """
    yeaboi_home = os.environ.get("YEABOI_HOME", "")
    if yeaboi_home:
        return Path(yeaboi_home).expanduser() / "planning" / "config.json"
    return Path.home() / ".planning-platform" / "config.json"


CONFIG_PATH = _config_path()

# Mapping from Settings field name -> env-var / config-file key
_CONFIG_KEY_MAP: dict[str, str] = {
    "anthropic_api_key": "anthropic_api_key",
    "openai_api_key": "openai_api_key",
    "google_api_key": "google_api_key",
    "deepgram_api_key": "deepgram_api_key",
    "elevenlabs_api_key": "elevenlabs_api_key",
    "elevenlabs_voice_id": "elevenlabs_voice_id",
    "elevenlabs_model_id": "elevenlabs_model_id",
    "livekit_url": "livekit_url",
    "livekit_api_key": "livekit_api_key",
    "livekit_api_secret": "livekit_api_secret",
    "github_token": "github_token",
    "resend_api_key": "resend_api_key",
    "app_url": "app_url",
    "personaplex_ws_url": "personaplex_ws_url",
}


def _load_config_file() -> dict[str, str]:
    """Read ~/.planning-platform/config.json, return empty dict on any error."""
    if not CONFIG_PATH.exists():
        return {}
    try:
        with CONFIG_PATH.open() as f:
            data = json.load(f)
            return {k: str(v) for k, v in data.items() if isinstance(v, str)}
    except (json.JSONDecodeError, OSError):
        logger.warning("Failed to parse config file %s", CONFIG_PATH, exc_info=True)
        return {}


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://planning:planning@localhost:5432/planning_platform"
    redis_url: str = "redis://localhost:6379/0"
    nextauth_secret: str = "dev-secret-change-me"
    cors_origins: str = "http://localhost:3000,http://localhost:3001"
    debug: bool = True

    # Local mode — the yeaboi desktop app running this backend as a bundled
    # sidecar: SQLite under ~/.yeaboi, loopback origin, single user, no infra.
    # The hosted deployment never sets these, so its behaviour is unchanged.
    local_mode: bool = Field(default=False, validation_alias=AliasChoices("YEABOI_LOCAL_MODE", "LOCAL_MODE"))
    # Redis is optional everywhere (cache.py and provider_health.py carry
    # in-process fallbacks); False skips client construction entirely so a
    # local install never pays the connect-timeout stall.
    redis_enabled: bool = True
    # The six lifespan background loops; three make outbound network calls
    # (statuspage feeds, provider probes). A desktop install must not phone
    # statuspage.io twelve times an hour.
    probes_enabled: bool = True

    @property
    def cors_origin_list(self) -> list[str]:
        """Parse CORS origins from comma-separated string or JSON array."""
        raw = self.cors_origins.strip()
        if raw.startswith("["):
            import json

            return json.loads(raw)
        return [o.strip() for o in raw.split(",") if o.strip()]

    anthropic_api_key: str = ""
    livekit_api_key: str = "devkey"
    livekit_api_secret: str = "devsecret"
    livekit_url: str = "ws://localhost:7880"
    livekit_detach_grace_seconds: int = 5  # graceful-detach wait before force-removing the agent

    # LiveKit agent worker identity. Hardcoded "planning-facilitator" in dev
    # would make multiple worktrees compete for the same dispatches (LiveKit
    # round-robins to ANY worker registered under this name). scripts/worktree
    # /setup.sh writes a per-worktree value (planning-facilitator-<slug>) so
    # each worktree's backend only ever dispatches to its own worker.
    agent_name: str = "planning-facilitator"

    # Recording / Egress — off by default in dev. When enabled, calls record
    # via LiveKit Cloud Egress (RoomCompositeEgressRequest, MP4) and the file
    # is stored on LiveKit Cloud's bundled storage. Webhook verifies events.
    recording_enabled: bool = False
    recording_default_expiry_days: int = 30
    livekit_webhook_key: str = ""  # HMAC secret used by LiveKit to sign webhooks
    deepgram_api_key: str = ""
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = "21m00Tcm4TlvDq8ikWAM"  # "Rachel" — default neutral voice
    elevenlabs_model_id: str = "eleven_turbo_v2_5"  # Low-latency model
    google_api_key: str = ""
    openai_api_key: str = ""
    deepseek_api_key: str = ""
    qwen_api_key: str = ""
    # Selects the platform-hosted provider used when an org has no BYOK config.
    # One of: anthropic | gemini | deepseek | qwen. Defaults to anthropic for
    # backwards compatibility — set to `gemini` (etc.) on Railway to switch.
    platform_ai_provider: str = "anthropic"
    # When True (default), AIClient walks the per-role failover chain after
    # retries exhaust on a recoverable error (transient / rate-limited /
    # credit-exhausted). Set to False as an emergency switch — e.g. if a
    # backup provider starts returning bad output that's worse than 503ing.
    # Per-role chain definitions live in services/ai_provider.py
    # (_FAILOVER_CHAINS) and can be tuned via ROLE_<NAME>_FAILOVER env vars.
    ai_failover_enabled: bool = True
    # Iterative hero refinement loop (generate → critique → enrich). When on,
    # the DeepSeek-drafted hero is critiqued by Opus and patched until it
    # scores >= threshold or hits the pass cap. Off → single-shot hero (the
    # pre-loop behaviour). Threshold is the 0-100 richness score that ends the
    # loop; max_passes counts the draft + enrich rounds (3 = draft + 2 enrich).
    wireframe_refine_enabled: bool = True
    wireframe_refine_threshold: int = 85
    wireframe_refine_max_passes: int = 3
    github_token: str = ""
    resend_api_key: str = ""
    app_url: str = "http://localhost:3001"  # Used for invite links (frontend URL)
    backend_url: str = "http://localhost:8000"  # Used for OAuth callback redirect_uri
    personaplex_ws_url: str = ""  # e.g. wss://<pod-id>-8998.proxy.runpod.net/api/chat
    transcription_provider: str = "whisper"  # "whisper" or "deepgram"
    internal_api_secret: str = "change-me-in-production"
    sentry_dsn: str = ""
    sentry_environment: str = "development"
    sentry_traces_sample_rate: float = 0.1
    otel_exporter_endpoint: str = ""  # e.g. "http://localhost:4317" for Jaeger/OTLP collector
    otel_service_name: str = "planning-platform-backend"

    # Slack
    slack_client_id: str = ""
    slack_client_secret: str = ""
    slack_signing_secret: str = ""
    slack_interactive_enabled: bool = False

    # Session context system
    use_session_context: bool = False
    context_summary_trigger: int = 15
    context_summary_max_tokens: int = 800
    context_recent_messages: int = 15

    # Card-attachment storage backend.
    #   "local"  — write to UPLOAD_DIR; only safe for single-instance dev.
    #   "s3"     — boto3-compatible (works with AWS S3, Cloudflare R2, MinIO).
    attachment_backend: str = "local"
    upload_dir: str = "/tmp/planning-platform-uploads"
    s3_bucket: str = ""
    s3_region: str = ""
    s3_endpoint_url: str = ""  # set for R2/MinIO; leave empty for AWS
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_public_base_url: str = ""  # if non-empty, presigned URLs are skipped

    # Load both the root .env (project-wide secrets) and backend/.env
    # (backend-specific keys). Later entries override earlier ones, and
    # actual env vars / config.json overrides still win on top of these.
    model_config = {
        "env_file": ("../.env", ".env"),
        "env_file_encoding": "utf-8",
        "env_ignore_empty": True,
        "extra": "ignore",
    }


@lru_cache
def get_settings() -> Settings:
    """
    Return a Settings instance with config-file overrides layered on top of env vars.

    Priority (highest first):
      1. ~/.planning-platform/config.json
      2. Environment variables / .env file
      3. Pydantic field defaults

    The result is cached. Call get_settings.cache_clear() after writing the config
    file to pick up new values on the next call.
    """
    base = Settings()
    overrides = _load_config_file()

    if not overrides:
        return base

    # Build a dict of current values and apply config-file overrides
    current = base.model_dump()
    changed = False
    for field_name, config_key in _CONFIG_KEY_MAP.items():
        if config_key in overrides and overrides[config_key]:
            current[field_name] = overrides[config_key]
            changed = True

    if not changed:
        return base

    # Re-construct with overrides applied
    return Settings.model_validate(current)
