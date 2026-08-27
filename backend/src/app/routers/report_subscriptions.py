"""CRUD + immediate-run endpoints for `ReportSubscription`s."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_org, get_current_user
from ..models.organization import Organization
from ..models.report_subscription import ReportSubscription
from ..models.user import User
from ..services import scheduler as scheduler_module
from ..services.subscription_runner import run_subscription

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/report-subscriptions", tags=["reports"])


# ── Schemas ──────────────────────────────────────────────────────────────


class ChannelSpec(BaseModel):
    kind: Literal["email", "slack"]
    target: str  # email address or slack channel id


class ScheduleConfig(BaseModel):
    """Validated shape of `report_subscription.schedule_config`. Frequency-
    specific fields are checked in the parent `SubscriptionInput.validate`."""

    time_of_day: str = "09:00"  # "HH:MM" 24h
    timezone: str = "UTC"
    day_of_week: int | None = None  # 0=Mon … 6=Sun
    day_of_month: int | str | None = None  # 1-31 or "last"

    @field_validator("time_of_day")
    @classmethod
    def _v_time(cls, v: str) -> str:
        try:
            hh, mm = v.split(":")
            if not (0 <= int(hh) <= 23 and 0 <= int(mm) <= 59):
                raise ValueError
        except Exception:
            raise ValueError("time_of_day must be HH:MM 24-hour") from None
        return v

    @field_validator("timezone")
    @classmethod
    def _v_tz(cls, v: str) -> str:
        try:
            ZoneInfo(v)
        except Exception:
            raise ValueError(f"unknown timezone: {v!r}") from None
        return v


class SubscriptionInput(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    scope_kind: Literal["org", "project", "session"] = "org"
    scope_id: str | None = None
    filters: dict | None = None
    frequency: Literal["daily", "weekly", "monthly"]
    schedule_config: ScheduleConfig
    channels: list[ChannelSpec] = Field(min_length=1)
    formats: list[Literal["pdf", "markdown"]] = Field(default_factory=lambda: ["markdown"], min_length=1)
    is_active: bool = True

    def validate_consistency(self) -> None:
        """Cross-field validation that doesn't fit naturally on either model."""
        if self.scope_kind in ("project", "session") and not self.scope_id:
            raise ValueError(f"scope_id is required when scope_kind={self.scope_kind}")
        if self.frequency == "weekly" and self.schedule_config.day_of_week is None:
            raise ValueError("weekly subscriptions require schedule_config.day_of_week")
        if self.frequency == "monthly" and self.schedule_config.day_of_month is None:
            raise ValueError("monthly subscriptions require schedule_config.day_of_month")
        if self.schedule_config.day_of_week is not None and not (0 <= self.schedule_config.day_of_week <= 6):
            raise ValueError("day_of_week must be 0–6 (0=Monday)")
        if isinstance(self.schedule_config.day_of_month, int) and not (1 <= self.schedule_config.day_of_month <= 31):
            raise ValueError("day_of_month must be 1–31 or 'last'")


class SubscriptionOut(BaseModel):
    id: str
    org_id: str
    owner_user_id: str
    name: str
    scope_kind: str
    scope_id: str | None
    filters: dict | None
    frequency: str
    schedule_config: dict
    channels: list[dict]
    formats: list[str]
    is_active: bool
    last_run_at: datetime | None
    next_run_at: datetime | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_row(cls, row: ReportSubscription) -> SubscriptionOut:
        return cls(
            id=row.id,
            org_id=row.org_id,
            owner_user_id=row.owner_user_id,
            name=row.name,
            scope_kind=row.scope_kind,
            scope_id=row.scope_id,
            filters=row.filters,
            frequency=row.frequency,
            schedule_config=row.schedule_config,
            channels=row.channels or [],
            formats=row.formats or [],
            is_active=row.is_active,
            last_run_at=row.last_run_at,
            next_run_at=row.next_run_at,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )


class RunOut(BaseModel):
    id: str
    subscription_id: str
    started_at: datetime
    finished_at: datetime | None
    status: str
    error: str | None
    deliveries: list[dict] | None


# ── Helpers ──────────────────────────────────────────────────────────────


async def _load_owned(db: AsyncSession, *, sub_id: str, org: Organization) -> ReportSubscription:
    row = (
        await db.execute(
            select(ReportSubscription).where(
                ReportSubscription.id == sub_id,
                ReportSubscription.org_id == org.id,
                ReportSubscription.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="subscription not found")
    return row


# ── Endpoints ────────────────────────────────────────────────────────────


@router.get("")
async def list_subscriptions(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
) -> list[SubscriptionOut]:
    rows = (
        (
            await db.execute(
                select(ReportSubscription)
                .where(ReportSubscription.org_id == org.id, ReportSubscription.deleted_at.is_(None))
                .order_by(ReportSubscription.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return [SubscriptionOut.from_row(r) for r in rows]


@router.post("", status_code=201)
async def create_subscription(
    payload: SubscriptionInput,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
) -> SubscriptionOut:
    try:
        payload.validate_consistency()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    row = ReportSubscription(
        org_id=org.id,
        owner_user_id=user.id,
        name=payload.name,
        scope_kind=payload.scope_kind,
        scope_id=payload.scope_id,
        filters=payload.filters,
        frequency=payload.frequency,
        schedule_config=payload.schedule_config.model_dump(exclude_none=True),
        channels=[c.model_dump() for c in payload.channels],
        formats=list(payload.formats),
        is_active=payload.is_active,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)

    await scheduler_module.schedule_subscription(db, row.id)
    await db.refresh(row)
    return SubscriptionOut.from_row(row)


@router.get("/{sub_id}")
async def get_subscription(
    sub_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
) -> SubscriptionOut:
    row = await _load_owned(db, sub_id=sub_id, org=org)
    return SubscriptionOut.from_row(row)


@router.patch("/{sub_id}")
async def update_subscription(
    sub_id: str,
    payload: SubscriptionInput,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
) -> SubscriptionOut:
    try:
        payload.validate_consistency()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    row = await _load_owned(db, sub_id=sub_id, org=org)
    row.name = payload.name
    row.scope_kind = payload.scope_kind
    row.scope_id = payload.scope_id
    row.filters = payload.filters
    row.frequency = payload.frequency
    row.schedule_config = payload.schedule_config.model_dump(exclude_none=True)
    row.channels = [c.model_dump() for c in payload.channels]
    row.formats = list(payload.formats)
    row.is_active = payload.is_active
    await db.commit()
    await db.refresh(row)

    await scheduler_module.schedule_subscription(db, row.id)
    await db.refresh(row)
    return SubscriptionOut.from_row(row)


@router.delete("/{sub_id}", status_code=204)
async def delete_subscription(
    sub_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
) -> None:
    from datetime import UTC as _UTC
    from datetime import datetime as _dt

    row = await _load_owned(db, sub_id=sub_id, org=org)
    row.deleted_at = _dt.now(_UTC)
    row.is_active = False
    await db.commit()
    await scheduler_module.unschedule_subscription(sub_id)


@router.post("/{sub_id}/run")
async def run_now(
    sub_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
) -> RunOut:
    """Fire a subscription immediately. Used for 'send a test now' from the
    UI and for verifying delivery configuration without waiting for the
    next scheduled time."""
    await _load_owned(db, sub_id=sub_id, org=org)
    run = await run_subscription(db, sub_id)
    return RunOut(
        id=run.id,
        subscription_id=run.subscription_id,
        started_at=run.started_at,
        finished_at=run.finished_at,
        status=run.status,
        error=run.error,
        deliveries=run.deliveries,
    )
