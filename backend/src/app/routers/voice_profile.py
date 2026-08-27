"""Voice profile API — training flow for per-user transcription improvement."""

import logging
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user
from ..models.user import User
from ..models.vocabulary import VocabularyEntry, VocabularyVariant
from ..models.voice_profile import VoiceProfile
from ..services.transcription_service import transcribe_audio

router = APIRouter(prefix="/api/voice-profile", tags=["voice-profile"])
logger = logging.getLogger(__name__)

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "/tmp/planning-platform-uploads"))

# Training prompts — each serves a practical purpose while being fun
TRAINING_STEPS = [
    {
        "id": "name",
        "title": "The Basics",
        "prompt": (
            "Say your full name like you're introducing yourself at a party"
            " — first name, last name, nice to meet you!"
        ),
        "purpose": "name_calibration",
    },
    {
        "id": "team",
        "title": "Roll Call",
        "prompt": "Name 3 people you work with. Pretend you're taking attendance — go!",
        "purpose": "team_names",
    },
    {
        "id": "tech",
        "title": "Tech Talk",
        "prompt": (
            "What tech stack are you using? Rattle off the tools, frameworks,"
            " and buzzwords like you're pitching to a VC."
        ),
        "purpose": "domain_terms",
    },
    {
        "id": "pitch",
        "title": "The Project Pitch",
        "prompt": "In one sentence, what are you building? Sell it to me in 10 seconds.",
        "purpose": "natural_speech",
    },
    {
        "id": "speed",
        "title": "Speed Round",
        "prompt": "Say these as fast as you can: API, CI/CD, MVP, OAuth, WebSocket, GraphQL, Kubernetes",
        "purpose": "acronyms",
        "expected_terms": ["API", "CI/CD", "MVP", "OAuth", "WebSocket", "GraphQL", "Kubernetes"],
    },
    {
        "id": "tongue_twister",
        "title": "The Tongue Twister",
        "prompt": (
            "Final challenge! Say this: 'She sells serverless services by the"
            " seashore while six sticky Kubernetes clusters crash and cache.'"
        ),
        "purpose": "stress_test",
    },
]


class TrainingStepResult(BaseModel):
    step_id: str
    transcription: str
    expected_text: str | None = None


class VoiceProfileResponse(BaseModel):
    id: str
    training_completed: bool
    accent_detected: str | None
    terms_learned: int
    steps: list[dict]

    model_config = {"from_attributes": True}


@router.get("/steps")
async def get_training_steps() -> list[dict]:
    """Return the training step prompts."""
    return TRAINING_STEPS


@router.get("/status")
async def get_profile_status(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Check if user has completed voice training."""
    result = await db.execute(
        select(VoiceProfile).where(VoiceProfile.user_id == user.id)
    )
    profile = result.scalar_one_or_none()
    return {
        "completed": profile is not None and profile.training_completed_at is not None,
        "accent_detected": profile.accent_detected if profile else None,
    }


@router.post("/train-step")
async def process_training_step(
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Upload a training recording for a single step. Returns the transcription."""
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Audio too large")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "training.webm").suffix or ".webm"
    filename = f"training-{uuid.uuid4()}{ext}"
    filepath = UPLOAD_DIR / filename
    filepath.write_bytes(content)

    try:
        transcript = await transcribe_audio(filepath)
        return {"transcription": transcript}
    finally:
        filepath.unlink(missing_ok=True)


@router.post("/complete")
async def complete_training(
    results: list[TrainingStepResult],
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Compare expected vs transcribed text to learn misrecognitions and build vocabulary."""
    from ..deps import get_current_org
    from ..services.vocabulary_service import detect_corrections

    org = await get_current_org(user, db)
    if not org:
        raise HTTPException(status_code=400, detail="No organization found")

    terms_learned = 0
    sample_results = []
    strip_punct = __import__("re").compile(r"[^\w\s]")

    for result in results:
        sample_results.append({
            "step_id": result.step_id,
            "transcription": result.transcription,
            "expected_text": result.expected_text,
        })

        if not result.expected_text or not result.transcription:
            continue

        # Core logic: diff expected phrase vs what STT actually produced
        # This finds exactly which words the STT got wrong for this user's voice
        corrections = detect_corrections(result.transcription, result.expected_text)

        for corr in corrections:
            # corr.original_span = what STT heard (wrong)
            # corr.corrected_span = what the user actually said (correct)
            existing = await db.execute(
                select(VocabularyEntry).where(
                    VocabularyEntry.org_id == org.id,
                    VocabularyEntry.canonical_form == corr.corrected_span,
                    VocabularyEntry.deleted_at.is_(None),
                )
            )
            entry = existing.scalar_one_or_none()
            if not entry:
                entry = VocabularyEntry(
                    org_id=org.id,
                    user_id=user.id,
                    canonical_form=corr.corrected_span,
                    category=_guess_training_category(corr.corrected_span),
                    source="training",
                )
                db.add(entry)
                await db.flush()

            # Add the wrong transcription as a variant
            variant_lower = corr.original_span.lower()
            existing_var = await db.execute(
                select(VocabularyVariant).where(
                    VocabularyVariant.entry_id == entry.id,
                    VocabularyVariant.variant_lower == variant_lower,
                )
            )
            if not existing_var.scalar_one_or_none():
                db.add(VocabularyVariant(
                    entry_id=entry.id,
                    variant_text=corr.original_span,
                    variant_lower=variant_lower,
                ))
            terms_learned += 1

        # Also add all significant words from expected text as keyterm entries
        # (even if STT got them right — boosts future recognition)
        expected_words = result.expected_text.split()
        skip_words = {
            "the", "a", "an", "is", "are", "was", "were", "and", "or", "but",
            "in", "on", "at", "to", "for", "of", "with", "from", "by", "as",
            "it", "its", "my", "your", "our", "we", "i", "you", "hi", "nice",
            "meet", "say", "this", "that", "can", "will", "do", "have", "has",
            "not", "no", "yes", "about", "im", "were", "me",
        }
        for word in expected_words:
            clean = strip_punct.sub("", word).strip()
            if not clean or len(clean) < 3 or clean.lower() in skip_words:
                continue
            existing = await db.execute(
                select(VocabularyEntry).where(
                    VocabularyEntry.org_id == org.id,
                    VocabularyEntry.canonical_form == clean,
                    VocabularyEntry.deleted_at.is_(None),
                )
            )
            if not existing.scalar_one_or_none():
                entry = VocabularyEntry(
                    org_id=org.id,
                    user_id=user.id,
                    canonical_form=clean,
                    category=_guess_training_category(clean),
                    source="training",
                )
                db.add(entry)
                terms_learned += 1

    # Create or update voice profile
    result = await db.execute(
        select(VoiceProfile).where(VoiceProfile.user_id == user.id)
    )
    profile = result.scalar_one_or_none()

    if profile:
        profile.sample_results = sample_results
        profile.training_completed_at = func.now()
    else:
        profile = VoiceProfile(
            user_id=user.id,
            org_id=org.id,
            sample_results=sample_results,
            training_completed_at=func.now(),
        )
        db.add(profile)

    await db.commit()

    logger.info("Voice training completed: user=%s, terms_learned=%d", user.id, terms_learned)
    return {
        "terms_learned": terms_learned,
        "training_completed": True,
    }


def _guess_training_category(term: str) -> str:
    """Guess category for a term extracted from voice training."""
    # Known technical terms
    tech_terms = {
        "react", "next.js", "postgresql", "redis", "livekit", "websocket",
        "graphql", "kubernetes", "docker", "ci/cd", "api", "mvp", "oauth",
        "typescript", "python", "fastapi", "nginx", "aws", "vercel",
    }
    if term.lower() in tech_terms:
        return "technical_term"
    # Acronyms (all caps, short)
    if term.isupper() and len(term) <= 10:
        return "acronym"
    # Capitalized multi-word → likely a name
    words = term.split()
    if len(words) >= 2 and all(w[0].isupper() for w in words if w):
        return "person_name"
    return "general"
