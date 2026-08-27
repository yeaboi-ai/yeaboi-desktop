"""Data classes for reports.

A `Report` is a renderer-agnostic intermediate form: the assembler builds it
from analytics queries, then a renderer (Markdown / PDF) turns it into bytes.
Keeping the shape stable across renderers means the email-attached PDF and
the inline-rendered Markdown always show the same numbers."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal


@dataclass
class ScopeRef:
    """Lightweight projection of analytics ScopeInfo for the report header."""

    kind: str  # "org" | "project" | "session"
    label: str  # e.g. "Acme Org", "Project Foo", "Session #abc12345"
    session_count: int


@dataclass
class DateRange:
    start: datetime
    end: datetime

    def label(self) -> str:
        # "May 9 → Jun 8" — short and unambiguous on both PDF and Slack.
        same_year = self.start.year == self.end.year
        fmt_start = "%b %-d" if same_year else "%b %-d, %Y"
        return f"{self.start.strftime(fmt_start)} → {self.end.strftime('%b %-d, %Y')}"


@dataclass
class CostLine:
    provider: str
    cost_usd: Decimal
    is_estimated: bool


@dataclass
class SessionRow:
    session_id: str
    project_name: str | None
    started_at: datetime | None
    duration_minutes: float | None
    messages: int
    cost_usd: Decimal
    is_estimated: bool


@dataclass
class Report:
    """The renderer-agnostic report payload. Sections are computed by the
    assembler; renderers walk them in order. Keep new sections additive so
    the Markdown and PDF templates stay simple."""

    scope: ScopeRef
    range: DateRange
    generated_at: datetime
    total_cost_usd: Decimal
    cost_lines: list[CostLine] = field(default_factory=list)
    sessions: list[SessionRow] = field(default_factory=list)
    summary: dict = field(default_factory=dict)
    is_partially_estimated: bool = False

    def title(self) -> str:
        return f"{self.scope.label} — Analytics report ({self.range.label()})"


@dataclass
class RenderedReport:
    """The output of a renderer — bytes plus the metadata callers need to
    name the file (email attachment, Slack upload)."""

    content: bytes
    mimetype: str
    filename: str
