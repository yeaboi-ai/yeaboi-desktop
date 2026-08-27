import io
import logging
import os
import uuid
import zoneinfo
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user
from ..middleware.rate_limit import limiter
from ..models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["me"])

_VALID_TIMEZONES = zoneinfo.available_timezones()

# Avatar upload config
_UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "/tmp/planning-platform-uploads"))
_AVATAR_SUBDIR = "avatars"
_AVATAR_URL_PREFIX = f"/uploads/{_AVATAR_SUBDIR}/"
_ALLOWED_AVATAR_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}
_MAX_AVATAR_BYTES = 5 * 1024 * 1024  # 5 MB
_AVATAR_OUTPUT_SIZE = (256, 256)
# TODO: migrate to S3 / cloud storage before scale-out — local filesystem only
# works for single-replica deploys.


class MeResponse(BaseModel):
    id: str
    email: str
    name: str | None
    display_name: str | None
    avatar_url: str | None
    pronouns: str | None
    job_title: str | None
    bio: str | None
    timezone: str | None
    onboarded_at: datetime | None
    tour_completed_at: datetime | None
    intended_use: str | None

    model_config = {"from_attributes": True}


class UpdateMeRequest(BaseModel):
    """User-editable profile fields. Lifecycle timestamps (`onboarded_at`,
    `tour_completed_at`) are deliberately NOT included — they're set
    server-side on the relevant action to prevent a client from clearing
    them and trapping themselves in an onboarding/tour loop."""

    display_name: str | None = None
    pronouns: str | None = Field(default=None, max_length=40)
    job_title: str | None = Field(default=None, max_length=100)
    bio: str | None = Field(default=None, max_length=280)
    timezone: str | None = None
    intended_use: str | None = Field(default=None, max_length=500)

    @field_validator("timezone")
    @classmethod
    def _validate_timezone(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return value
        if value not in _VALID_TIMEZONES:
            raise ValueError(f"Unknown IANA timezone: {value}")
        return value


def _normalize(value: str | None) -> str | None:
    """Empty/whitespace strings collapse to NULL."""
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _delete_previous_avatar_file(avatar_url: str | None) -> None:
    """Delete a previously uploaded avatar file if it lives inside our avatar dir.

    Never touches external avatar URLs (OAuth providers, Gravatar, etc.).
    """
    if not avatar_url or not avatar_url.startswith(_AVATAR_URL_PREFIX):
        return
    filename = avatar_url[len(_AVATAR_URL_PREFIX):]
    # Guard against path traversal — only allow simple filenames
    if "/" in filename or "\\" in filename or ".." in filename:
        return
    path = _UPLOAD_DIR / _AVATAR_SUBDIR / filename
    try:
        path.unlink(missing_ok=True)
    except OSError as exc:  # pragma: no cover — best-effort cleanup
        logger.warning("Failed to delete previous avatar %s: %s", path, exc)


@router.get("/api/me", response_model=MeResponse)
@limiter.limit("60/minute")
async def get_me(
    request: Request,
    user: User = Depends(get_current_user),
) -> User:
    """Return the current authenticated user's profile."""
    return user


@router.patch("/api/me", response_model=MeResponse)
@limiter.limit("30/minute")
async def update_me(
    request: Request,
    body: UpdateMeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Update the current user's profile fields. Only sent fields are updated.

    Side effect: the first time a `display_name` lands on a user that has
    never been onboarded, we stamp `onboarded_at = now()` server-side.
    Clients can't write the timestamp directly — see UpdateMeRequest.
    """
    fields = body.model_dump(exclude_unset=True)
    if "display_name" in fields:
        new_name = _normalize(fields["display_name"])
        user.display_name = new_name
        # First time we see a display_name, finish onboarding. Idempotent —
        # only stamps once, so a later rename never re-bounces the user.
        if new_name and user.onboarded_at is None:
            user.onboarded_at = datetime.now(UTC)
    if "pronouns" in fields:
        user.pronouns = _normalize(fields["pronouns"])
    if "job_title" in fields:
        user.job_title = _normalize(fields["job_title"])
    if "bio" in fields:
        user.bio = _normalize(fields["bio"])
    if "timezone" in fields:
        user.timezone = _normalize(fields["timezone"])
    if "intended_use" in fields:
        user.intended_use = _normalize(fields["intended_use"])

    try:
        await db.commit()
    except Exception:
        await db.rollback()
        logger.exception("Failed to update profile for user %s", user.id)
        raise HTTPException(status_code=500, detail="Failed to update profile")
    logger.info("User profile updated: %s (fields=%s)", user.id, list(fields.keys()))
    await db.refresh(user)
    return user


@router.post("/api/me/tour-complete", response_model=MeResponse)
@limiter.limit("10/minute")
async def complete_tour(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Mark the demo-project guided tour as complete. One-way (null → now);
    re-calling is a no-op so a client can't force the tour to re-appear."""
    if user.tour_completed_at is None:
        user.tour_completed_at = datetime.now(UTC)
        try:
            await db.commit()
        except Exception:
            await db.rollback()
            logger.exception("Failed to complete tour for user %s", user.id)
            raise HTTPException(status_code=500, detail="Failed to complete tour")
        await db.refresh(user)
    return user


@router.post("/api/me/avatar", response_model=MeResponse)
@limiter.limit("10/minute")
async def upload_avatar(
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Upload a new avatar. Center-crops to 256x256 PNG."""
    if file.content_type not in _ALLOWED_AVATAR_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported avatar type: {file.content_type}. Allowed: PNG, JPEG, WebP, GIF.",
        )
    content = await file.read()
    if len(content) > _MAX_AVATAR_BYTES:
        raise HTTPException(status_code=413, detail="Avatar too large (max 5 MB)")

    try:
        img = Image.open(io.BytesIO(content))
        img.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(status_code=415, detail="Could not decode image") from exc

    # Normalize: convert to RGBA → center-crop to 256x256 → PNG
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA")
    cropped = ImageOps.fit(img, _AVATAR_OUTPUT_SIZE, method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))

    avatar_dir = _UPLOAD_DIR / _AVATAR_SUBDIR
    avatar_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{user.id}-{uuid.uuid4().hex[:8]}.png"
    out_path = avatar_dir / filename
    cropped.save(out_path, format="PNG", optimize=True)

    # Best-effort cleanup of previously uploaded avatar
    _delete_previous_avatar_file(user.avatar_url)

    user.avatar_url = f"{_AVATAR_URL_PREFIX}{filename}"
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        # The new file is now orphaned — best-effort cleanup
        try:
            out_path.unlink(missing_ok=True)
        except OSError:
            pass
        logger.exception("Failed to persist avatar for user %s", user.id)
        raise HTTPException(status_code=500, detail="Failed to save avatar")
    logger.info("Avatar uploaded for user %s (%s bytes -> %s)", user.id, len(content), filename)
    await db.refresh(user)
    return user


@router.delete("/api/me/avatar", response_model=MeResponse)
@limiter.limit("20/minute")
async def delete_avatar(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Remove the current avatar."""
    _delete_previous_avatar_file(user.avatar_url)
    user.avatar_url = None
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        logger.exception("Failed to clear avatar for user %s", user.id)
        raise HTTPException(status_code=500, detail="Failed to remove avatar")
    logger.info("Avatar removed for user %s", user.id)
    await db.refresh(user)
    return user
