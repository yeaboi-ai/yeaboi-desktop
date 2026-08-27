"""Aggregate system-health endpoint that powers the frontend banner.

Returns one payload covering:
- Per-provider Redis health (platform-scoped + this org's BYOK scope merged)
- Per-feature availability derived from FEATURE_TO_PROVIDERS
- Current-month spend vs configured limits

Polled every 60s by `ProviderHealthProvider` on the frontend, plus an
on-demand refresh from any 402 response interceptor.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_org
from ..models.organization import Organization
from ..services import provider_health, spend_tracker

logger = logging.getLogger(__name__)
router = APIRouter()


# Map UI-facing feature names → list of underlying provider names. A feature
# is unavailable iff ANY of its providers are unhealthy. Keep this in sync
# with `_ROLE_DEFAULTS` in services/ai_provider.py — when a role's default
# provider changes, update its entry here.
FEATURE_TO_PROVIDERS: dict[str, list[str]] = {
    # User-facing chat — Anthropic-default per role config
    "chat": ["anthropic"],
    # Niko/summary/wireframe etc. lean on Gemini
    "summary": ["gemini"],
    "niko": ["gemini"],
    "wireframe": ["gemini"],
    # Vision is Gemini direct (google.genai client)
    "vision": ["google"],
    # Voice agent: STT + LLM + TTS — any failure breaks the room
    "voice": ["anthropic", "deepgram", "elevenlabs"],
    # Video shares the voice-agent stack; user explicitly asked it to
    # disable when ANY of those three is unhealthy.
    "video": ["anthropic", "deepgram", "elevenlabs"],
}


def _merge_provider_status(
    snapshots: dict[str, dict[str, Any]],
    org_id: str,
    provider: str,
) -> dict[str, Any]:
    """Pick the worst-of (platform, org) snapshot for `provider`.

    BYOK users have an `org:<id>` scope that takes precedence over `platform`
    when present (their own key is what they're billed for). Platform-locked
    roles read the `platform` scope.
    """
    org_key = f"org:{org_id}:{provider}"
    plat_key = f"platform:{provider}"
    snap = snapshots.get(org_key) or snapshots.get(plat_key)
    if snap is None:
        return {"status": "ok"}
    return {
        "status": snap.get("status", "unhealthy"),
        "error_code": snap.get("error_code"),
        "message": snap.get("message"),
        "since": snap.get("since"),
        "scope": "org" if org_key in snapshots else "platform",
    }


@router.get("/api/system/health-summary")
async def health_summary(
    org: Organization = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    snapshots = await provider_health.get_all()
    # Active-failover snapshots keyed by role (e.g. {"chat": {from: anthropic,
    # to: gemini, since: ...}}). Used below to mark features as "degraded"
    # rather than "unavailable" when a backup provider is currently serving
    # the request — drives the amber banner variant on the frontend.
    active_failovers = await provider_health.get_active_failovers()

    # For each provider, pre-compute the role(s) for which it's currently
    # acting as the active backup. Most providers won't be a backup for
    # anything; the lookup is sparse and cheap.
    provider_as_backup_for: dict[str, list[str]] = {}
    for role, info in active_failovers.items():
        provider_as_backup_for.setdefault(info["to_provider"], []).append(role)

    providers_out: dict[str, dict[str, Any]] = {}
    all_providers = sorted({p for ps in FEATURE_TO_PROVIDERS.values() for p in ps})
    for prov in all_providers:
        status = _merge_provider_status(snapshots, org.id, prov)
        if prov in provider_as_backup_for:
            # Indicates this provider is currently serving traffic that
            # normally belongs to another vendor.
            status["serving_failover_for"] = provider_as_backup_for[prov]
        providers_out[prov] = status

    # Index active failovers by `from_provider` so we can ask "is this
    # unhealthy primary currently being routed around?" without caring which
    # role triggered the failover.
    failover_by_from_provider: dict[str, dict[str, Any]] = {
        info["from_provider"]: info
        for info in active_failovers.values()
        if info.get("from_provider")
    }

    # Feature → degraded vs unavailable.
    # A feature is "degraded" only when EVERY one of its unhealthy primaries
    # has an active failover whose target provider is itself healthy. Any
    # single unhealthy primary without a working failover → "unavailable".
    features_out: dict[str, dict[str, Any]] = {}
    for feature, deps in FEATURE_TO_PROVIDERS.items():
        unhealthy = [p for p in deps if providers_out.get(p, {}).get("status") not in (None, "ok")]
        if not unhealthy:
            features_out[feature] = {"available": True, "mode": "ok"}
            continue

        # Collect (primary, backup) pairs where the primary has an active
        # failover AND the backup is healthy.
        degraded_pairs: list[tuple[str, str]] = []
        all_have_working_backup = True
        for primary in unhealthy:
            fail_info = failover_by_from_provider.get(primary)
            backup = fail_info.get("to_provider") if fail_info else None
            backup_healthy = (
                backup is not None
                and providers_out.get(backup, {}).get("status") in (None, "ok")
            )
            if backup_healthy:
                degraded_pairs.append((primary, backup))
            else:
                all_have_working_backup = False
                break

        if all_have_working_backup and degraded_pairs:
            primary, backup = degraded_pairs[0]
            features_out[feature] = {
                "available": True,
                "mode": "degraded",
                "primary_provider": primary,
                "active_provider": backup,
                "message": providers_out[primary].get("message"),
            }
        else:
            snap = providers_out[unhealthy[0]]
            features_out[feature] = {
                "available": False,
                "mode": "unavailable",
                "reason": snap.get("error_code") or "provider_unhealthy",
                "blocking_provider": unhealthy[0],
                "message": snap.get("message"),
            }

    spend_status = await spend_tracker.get_org_spend_status(db, org.id)
    # Best-effort: send threshold emails (deduped). Don't fail the request
    # if the email infra is down.
    try:
        await spend_tracker.maybe_send_threshold_alert(db, org.id, spend_status)
        await db.commit()
    except Exception:
        logger.exception("threshold email path failed")

    # If the hard limit is tripped, also expose `chat` and `video` etc. as
    # unavailable so the frontend mirrors the backend short-circuit even
    # before the next AI call returns 402.
    if spend_status.status == "hard_blocked":
        for feature in features_out:
            features_out[feature] = {
                "available": False,
                "mode": "unavailable",
                "reason": "ORG_HARD_LIMIT_REACHED",
                "blocking_provider": "spend_cap",
                "message": (
                    f"Monthly AI spend cap reached "
                    f"(${float(spend_status.month_to_date_usd):.2f} / "
                    f"${float(spend_status.hard_limit_usd or 0):.2f})."
                ),
            }

    return {
        "providers": providers_out,
        "features": features_out,
        "usage": spend_status.to_dict(),
        "fetched_at": datetime.now(UTC).isoformat(),
    }
