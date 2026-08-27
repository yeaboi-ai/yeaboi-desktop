"""AI provider configuration endpoints.

GET    /api/orgs/{org_id}/ai-config      — get current provider config (keys masked)
PATCH  /api/orgs/{org_id}/ai-config      — update provider config (org admin only)
POST   /api/orgs/{org_id}/ai-config/test — test connection with current config
GET    /api/orgs/{org_id}/ai-defaults    — get org voice/language defaults
PATCH  /api/orgs/{org_id}/ai-defaults    — update org voice/language defaults (admin only)
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user
from ..models.ai_config import OrgAIConfig
from ..models.base import gen_uuid
from ..models.organization import OrgMember
from ..models.user import User
from ..schemas.blueprint_template import OrgAIDefaultsResponse, OrgAIDefaultsUpdate
from ..services.ai_provider import test_ai_connection
from ..services.audit_service import get_client_ip, log_audit
from ..services.crypto import encrypt_api_key, mask_api_key
from ..services.voice_config_service import get_or_create_org_defaults

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────────


class AIConfigResponse(BaseModel):
    provider: str
    byok_provider: str | None = None
    byok_api_key_masked: str | None = None
    byok_default_model: str | None = None
    byok_fast_model: str | None = None
    bedrock_role_arn: str | None = None
    bedrock_region: str | None = None
    bedrock_model: str | None = None
    bedrock_fast_model: str | None = None
    self_hosted_url: str | None = None
    self_hosted_model: str | None = None
    self_hosted_fast_model: str | None = None
    # Per-task model overrides (null → role default)
    flow_model: str | None = None
    arch_model: str | None = None
    wireframe_model: str | None = None
    wireframe_critic_model: str | None = None


class AIConfigUpdate(BaseModel):
    provider: str | None = None  # platform, byok, bedrock, self_hosted
    byok_provider: str | None = None
    byok_api_key: str | None = None  # plaintext — will be encrypted
    byok_default_model: str | None = None
    byok_fast_model: str | None = None
    bedrock_role_arn: str | None = None
    bedrock_region: str | None = None
    bedrock_model: str | None = None
    bedrock_fast_model: str | None = None
    self_hosted_url: str | None = None
    self_hosted_model: str | None = None
    self_hosted_fast_model: str | None = None
    # Per-task model overrides (null/"" → role default)
    flow_model: str | None = None
    arch_model: str | None = None
    wireframe_model: str | None = None
    wireframe_critic_model: str | None = None


# ── Helpers ──────────────────────────────────────────────────────────────────


async def _require_org_admin(org_id: str, user: User, db: AsyncSession) -> None:
    """Raise 403 if user is not an admin of this org."""
    result = await db.execute(
        select(OrgMember).where(
            OrgMember.org_id == org_id,
            OrgMember.user_id == user.id,
            OrgMember.role == "admin",
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Org admin required")


async def _get_or_create_config(org_id: str, db: AsyncSession) -> OrgAIConfig:
    """Get or create the AI config for an org."""
    result = await db.execute(select(OrgAIConfig).where(OrgAIConfig.org_id == org_id))
    config = result.scalar_one_or_none()
    if not config:
        config = OrgAIConfig(id=gen_uuid(), org_id=org_id, provider="platform")
        db.add(config)
        await db.flush()
    return config


# ── Routes ───────────────────────────────────────────────────────────────────


@router.get("/api/orgs/{org_id}/ai-config")
async def get_ai_config(
    org_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AIConfigResponse:
    """Get the current AI provider config for an org. API keys are masked."""
    # Any org member can view (need to see which provider is active)
    result = await db.execute(select(OrgMember).where(OrgMember.org_id == org_id, OrgMember.user_id == user.id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member of this organization")

    config = await _get_or_create_config(org_id, db)
    await db.commit()

    return AIConfigResponse(
        provider=config.provider,
        byok_provider=config.byok_provider,
        byok_api_key_masked=mask_api_key(config.byok_api_key) if config.byok_api_key else None,
        byok_default_model=config.byok_default_model,
        byok_fast_model=config.byok_fast_model,
        bedrock_role_arn=config.bedrock_role_arn,
        bedrock_region=config.bedrock_region,
        bedrock_model=config.bedrock_model,
        bedrock_fast_model=config.bedrock_fast_model,
        self_hosted_url=config.self_hosted_url,
        self_hosted_model=config.self_hosted_model,
        self_hosted_fast_model=config.self_hosted_fast_model,
        flow_model=config.flow_model,
        arch_model=config.arch_model,
        wireframe_model=config.wireframe_model,
        wireframe_critic_model=config.wireframe_critic_model,
    )


@router.patch("/api/orgs/{org_id}/ai-config")
async def update_ai_config(
    request: Request,
    org_id: str,
    body: AIConfigUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AIConfigResponse:
    """Update AI provider config. Org admin only."""
    await _require_org_admin(org_id, user, db)

    config = await _get_or_create_config(org_id, db)

    if body.provider is not None:
        if body.provider not in ("platform", "byok", "bedrock", "self_hosted"):
            raise HTTPException(status_code=400, detail=f"Invalid provider: {body.provider}")
        config.provider = body.provider

    # BYOK fields
    if body.byok_provider is not None:
        if body.byok_provider not in ("anthropic", "openai", "google"):
            raise HTTPException(status_code=400, detail=f"Invalid BYOK provider: {body.byok_provider}")
        config.byok_provider = body.byok_provider
    if body.byok_api_key is not None:
        config.byok_api_key = encrypt_api_key(body.byok_api_key)
    # Empty string → NULL so users can clear an override
    if "byok_default_model" in body.model_fields_set:
        config.byok_default_model = body.byok_default_model or None
    if "byok_fast_model" in body.model_fields_set:
        config.byok_fast_model = body.byok_fast_model or None

    # Bedrock fields
    if body.bedrock_role_arn is not None:
        config.bedrock_role_arn = body.bedrock_role_arn
    if body.bedrock_region is not None:
        config.bedrock_region = body.bedrock_region
    if body.bedrock_model is not None:
        config.bedrock_model = body.bedrock_model
    if "bedrock_fast_model" in body.model_fields_set:
        config.bedrock_fast_model = body.bedrock_fast_model or None

    # Self-hosted fields
    if body.self_hosted_url is not None:
        config.self_hosted_url = body.self_hosted_url
    if body.self_hosted_model is not None:
        config.self_hosted_model = body.self_hosted_model
    if "self_hosted_fast_model" in body.model_fields_set:
        config.self_hosted_fast_model = body.self_hosted_fast_model or None

    # Per-task model overrides — empty string clears back to the role default
    if "flow_model" in body.model_fields_set:
        config.flow_model = body.flow_model or None
    if "arch_model" in body.model_fields_set:
        config.arch_model = body.arch_model or None
    if "wireframe_model" in body.model_fields_set:
        config.wireframe_model = body.wireframe_model or None
    if "wireframe_critic_model" in body.model_fields_set:
        config.wireframe_critic_model = body.wireframe_critic_model or None

    await log_audit(
        db,
        org_id=org_id,
        user_id=user.id,
        action="update",
        resource_type="ai_config",
        resource_id=org_id,
        metadata={"provider": config.provider},
        ip_address=get_client_ip(request),
    )
    await db.commit()

    logger.info("AI config updated for org %s by user %s: provider=%s", org_id, user.id, config.provider)

    return AIConfigResponse(
        provider=config.provider,
        byok_provider=config.byok_provider,
        byok_api_key_masked=mask_api_key(body.byok_api_key)
        if body.byok_api_key
        else (mask_api_key(config.byok_api_key) if config.byok_api_key else None),
        byok_default_model=config.byok_default_model,
        byok_fast_model=config.byok_fast_model,
        bedrock_role_arn=config.bedrock_role_arn,
        bedrock_region=config.bedrock_region,
        bedrock_model=config.bedrock_model,
        bedrock_fast_model=config.bedrock_fast_model,
        self_hosted_url=config.self_hosted_url,
        self_hosted_model=config.self_hosted_model,
        self_hosted_fast_model=config.self_hosted_fast_model,
        flow_model=config.flow_model,
        arch_model=config.arch_model,
        wireframe_model=config.wireframe_model,
        wireframe_critic_model=config.wireframe_critic_model,
    )


@router.post("/api/orgs/{org_id}/ai-config/test")
async def test_ai_config(
    org_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Test the AI connection with current config."""
    await _require_org_admin(org_id, user, db)
    return await test_ai_connection(org_id, db)


# ── Org AI Defaults (voice/language) ────────────────────────────────────────


@router.get("/api/orgs/{org_id}/ai-defaults", response_model=OrgAIDefaultsResponse)
async def get_ai_defaults(
    org_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get the org's default voice/language settings. Any member can read."""
    result = await db.execute(select(OrgMember).where(OrgMember.org_id == org_id, OrgMember.user_id == user.id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member of this organization")

    defaults = await get_or_create_org_defaults(org_id, db)
    await db.commit()
    return defaults


@router.patch("/api/orgs/{org_id}/ai-defaults", response_model=OrgAIDefaultsResponse)
async def update_ai_defaults(
    org_id: str,
    body: OrgAIDefaultsUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update org default voice/language settings. Any org member can update."""
    # Voice/language settings aren't sensitive — allow any org member
    result = await db.execute(
        select(OrgMember).where(OrgMember.org_id == org_id, OrgMember.user_id == user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member of this organization")

    defaults = await get_or_create_org_defaults(org_id, db)

    for field in ("voice_id", "speed", "emotion", "language", "realtime_voice"):
        value = getattr(body, field, None)
        # Use model_fields_set to distinguish "explicitly set to None" from "not provided"
        if field in body.model_fields_set:
            setattr(defaults, field, value)

    await db.commit()
    logger.info("AI defaults updated for org %s by user %s", org_id, user.id)
    return defaults
