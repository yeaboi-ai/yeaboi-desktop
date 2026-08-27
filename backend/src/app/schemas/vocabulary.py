"""Pydantic schemas for vocabulary CRUD operations."""

from datetime import datetime

from pydantic import BaseModel


class VocabularyVariantResponse(BaseModel):
    id: str
    variant_text: str
    confidence: float
    occurrence_count: int

    model_config = {"from_attributes": True}


class VocabularyEntryCreate(BaseModel):
    canonical_form: str
    category: str = "general"
    phonetic_hint: str | None = None
    boost_weight: float = 1.5
    scope: str = "personal"  # "org" or "personal"
    variants: list[str] = []


class VocabularyEntryUpdate(BaseModel):
    canonical_form: str | None = None
    category: str | None = None
    phonetic_hint: str | None = None
    boost_weight: float | None = None


class VocabularyEntryResponse(BaseModel):
    id: str
    org_id: str
    user_id: str | None
    canonical_form: str
    category: str
    phonetic_hint: str | None
    boost_weight: float
    source: str
    usage_count: int
    variants: list[VocabularyVariantResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class VocabularyKeywordsResponse(BaseModel):
    """Keyword list for Deepgram/Whisper integration."""

    keywords: list[str]
    prompt: str
