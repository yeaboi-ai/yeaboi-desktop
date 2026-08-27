import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user
from ..middleware.rate_limit import limiter
from ..models.app_settings import AppSetting
from ..models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/app-settings", tags=["app-settings"])


class AppSettingResponse(BaseModel):
    key: str
    value: str


class AppSettingUpsert(BaseModel):
    key: str = Field(max_length=100)
    value: str = Field(max_length=65536)


@router.get("", response_model=AppSettingResponse)
@limiter.limit("60/minute")
async def get_app_setting(
    request: Request,
    key: str = Query(max_length=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AppSettingResponse:
    """Get a per-user setting by key."""
    result = await db.execute(
        select(AppSetting).where(
            AppSetting.user_id == user.id,
            AppSetting.key == key,
        )
    )
    setting = result.scalar_one_or_none()
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    return AppSettingResponse(key=setting.key, value=setting.value)


@router.put("", response_model=AppSettingResponse)
@limiter.limit("30/minute")
async def upsert_app_setting(
    request: Request,
    body: AppSettingUpsert,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AppSettingResponse:
    """Create or update a per-user setting."""
    result = await db.execute(
        select(AppSetting).where(
            AppSetting.user_id == user.id,
            AppSetting.key == body.key,
        )
    )
    setting = result.scalar_one_or_none()

    if setting:
        setting.value = body.value
    else:
        setting = AppSetting(user_id=user.id, key=body.key, value=body.value)
        db.add(setting)

    await db.commit()
    await db.refresh(setting)
    logger.info("App setting upserted: key=%s, user=%s", body.key, user.id)
    return AppSettingResponse(key=setting.key, value=setting.value)
