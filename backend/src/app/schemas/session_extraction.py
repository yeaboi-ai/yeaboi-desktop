"""Pydantic schemas for the session recap extraction payload.

The shape is defined here so the GET/POST extraction endpoints have a stable
contract for the frontend (`RecapDoc`) to consume.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class ExtractedItem(BaseModel):
    text: str
    ts: str | None = None


class Highlight(BaseModel):
    quote: str
    speaker: str | None = None
    ts: str | None = None


class ChapterSummary(BaseModel):
    label: str
    start_ts: str | None = None
    end_ts: str | None = None
    summary: str = ""


class SessionExtractionOut(BaseModel):
    summary: str = ""
    highlights: list[Highlight] = Field(default_factory=list)
    decisions: list[ExtractedItem] = Field(default_factory=list)
    action_items: list[ExtractedItem] = Field(default_factory=list)
    open_questions: list[ExtractedItem] = Field(default_factory=list)
    chapter_summaries: list[ChapterSummary] = Field(default_factory=list)
