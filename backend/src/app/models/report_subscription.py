"""Report subscriptions — recurring deliveries of analytics reports.

A `ReportSubscription` row pairs a scope+filter with a schedule and a list of
delivery channels. The scheduler (services/scheduler.py) reads active rows
on boot and registers cron jobs; CRUD endpoints keep the in-memory scheduler
in sync with DB state.

`SubscriptionRun` is the audit log — one row per fire, including delivery
status per channel."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, gen_uuid

SUBSCRIPTION_FREQUENCIES = ("daily", "weekly", "monthly")
SUBSCRIPTION_RUN_STATUSES = ("queued", "running", "succeeded", "failed")


class ReportSubscription(TimestampMixin, Base):
    """One scheduled report delivery.

    `schedule_config` shape (validated in the router):
        daily:   {"time_of_day": "HH:MM", "timezone": "UTC"}
        weekly:  {"time_of_day": "HH:MM", "timezone": "UTC", "day_of_week": 0-6}
        monthly: {"time_of_day": "HH:MM", "timezone": "UTC", "day_of_month": 1-31|"last"}

    `channels` is a list of `{kind: "email"|"slack", target: str}` dicts.
    `formats` is a list of "pdf" | "markdown".
    """

    __tablename__ = "report_subscriptions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id"), nullable=False)
    owner_user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    # Scope: kind in {org, project, session}; scope_id NULL for org.
    scope_kind: Mapped[str] = mapped_column(String(20), nullable=False, default="org")
    scope_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    filters: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    frequency: Mapped[str] = mapped_column(String(20), nullable=False)
    schedule_config: Mapped[dict] = mapped_column(JSON, nullable=False)

    channels: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    formats: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_report_subscriptions_org", "org_id", "is_active"),
        Index("ix_report_subscriptions_next_run", "next_run_at"),
    )


class SubscriptionRun(Base):
    """One execution attempt of a ReportSubscription. Append-only — successes
    and failures both land here so the UI can show a 'last 5 runs' history."""

    __tablename__ = "subscription_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    subscription_id: Mapped[str] = mapped_column(String(36), ForeignKey("report_subscriptions.id"), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="queued")
    error: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    deliveries: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    __table_args__ = (Index("ix_subscription_runs_subscription", "subscription_id", "started_at"),)
