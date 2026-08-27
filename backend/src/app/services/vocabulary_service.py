"""Vocabulary learning service — detects corrections, manages vocabulary, and post-processes transcripts.

Core flow:
1. User edits a transcript → detect_corrections() finds changed spans
2. apply_corrections_to_vocabulary() persists the learning
3. get_vocabulary_for_transcription() loads the dictionary for future use
4. post_process_transcript() applies Aho-Corasick replacement on new transcripts
"""

import difflib
import logging
import re
from dataclasses import dataclass, field

import ahocorasick
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.vocabulary import TranscriptionCorrection, VocabularyEntry, VocabularyVariant

logger = logging.getLogger(__name__)


@dataclass
class CorrectionSpan:
    """A single word-level correction detected via diff."""

    original_span: str
    corrected_span: str
    position: int


@dataclass
class VocabularySet:
    """Pre-loaded vocabulary for use during transcription and post-processing."""

    entries: list[tuple[str, str]] = field(default_factory=list)  # (variant_lower, canonical_form)

    def to_deepgram_keyterms(self, max_terms: int = 100) -> list[str]:
        """Format as Deepgram Nova-3 keyterm strings (plain terms, no weights)."""
        seen = set()
        terms = []
        for _, canonical in self.entries:
            if canonical not in seen:
                seen.add(canonical)
                terms.append(canonical)
                if len(terms) >= max_terms:
                    break
        return terms

    def to_deepgram_keywords(self, max_keywords: int = 200) -> list[str]:
        """Format as Deepgram keyword boost strings: 'term:weight'."""
        seen = set()
        keywords = []
        for _, canonical in self.entries:
            if canonical not in seen:
                seen.add(canonical)
                keywords.append(f"{canonical}:1.5")
                if len(keywords) >= max_keywords:
                    break
        return keywords

    def to_whisper_prompt(self, max_tokens: int = 200) -> str:
        """Format as a Whisper prompt hint string."""
        seen = set()
        terms = []
        for _, canonical in self.entries:
            if canonical not in seen:
                seen.add(canonical)
                terms.append(canonical)
                if len(terms) >= max_tokens:
                    break
        return ", ".join(terms)

    def to_enhancement_context(self) -> list[str]:
        """Return canonical forms for the LLM enhancer's vocabulary hints."""
        seen = set()
        hints = []
        for _, canonical in self.entries:
            if canonical not in seen:
                seen.add(canonical)
                hints.append(canonical)
        return hints

    def build_replacer(self) -> ahocorasick.Automaton | None:
        """Build an Aho-Corasick automaton for fast multi-pattern replacement."""
        if not self.entries:
            return None
        automaton = ahocorasick.Automaton()
        for variant_lower, canonical in self.entries:
            automaton.add_word(variant_lower, (variant_lower, canonical))
        automaton.make_automaton()
        return automaton


def detect_corrections(original: str, corrected: str) -> list[CorrectionSpan]:
    """Detect word-level corrections between original and corrected text.

    Breaks multi-word spans into individual word-pair corrections where possible,
    strips punctuation from stored forms, and filters trivial changes.
    """
    if not original or not corrected:
        return []

    # Normalize: strip punctuation attached to words for comparison
    strip_punct = re.compile(r"^[^\w]+|[^\w]+$")

    orig_words = original.split()
    corr_words = corrected.split()

    # Compare using punctuation-stripped versions for better alignment
    orig_clean = [strip_punct.sub("", w) for w in orig_words]
    corr_clean = [strip_punct.sub("", w) for w in corr_words]

    matcher = difflib.SequenceMatcher(None, orig_clean, corr_clean)
    corrections = []

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag != "replace":
            continue

        orig_span_words = orig_clean[i1:i2]
        corr_span_words = corr_clean[j1:j2]

        # If same number of words, pair them 1:1 for granular corrections
        if len(orig_span_words) == len(corr_span_words):
            for k in range(len(orig_span_words)):
                ow = orig_span_words[k]
                cw = corr_span_words[k]
                if ow and cw and not _is_trivial_change(ow, cw):
                    corrections.append(
                        CorrectionSpan(
                            original_span=ow,
                            corrected_span=cw,
                            position=i1 + k,
                        )
                    )
        else:
            # Different word counts — store as a phrase correction
            orig_phrase = " ".join(w for w in orig_span_words if w)
            corr_phrase = " ".join(w for w in corr_span_words if w)
            if orig_phrase and corr_phrase and not _is_trivial_change(orig_phrase, corr_phrase):
                corrections.append(
                    CorrectionSpan(
                        original_span=orig_phrase,
                        corrected_span=corr_phrase,
                        position=i1,
                    )
                )

    return corrections


def _is_trivial_change(original: str, corrected: str) -> bool:
    """Check if a change is trivial (punctuation-only, whitespace, case for common words)."""
    # Strip punctuation and compare
    strip_punct = re.compile(r"[^\w\s]")
    orig_clean = strip_punct.sub("", original).strip().lower()
    corr_clean = strip_punct.sub("", corrected).strip().lower()

    if orig_clean == corr_clean:
        return True

    # Empty after stripping
    if not orig_clean or not corr_clean:
        return True

    return False


async def apply_corrections_to_vocabulary(
    org_id: str,
    user_id: str,
    corrections: list[CorrectionSpan],
    db: AsyncSession,
    session_id: str | None = None,
    message_id: str | None = None,
    original_text: str = "",
    corrected_text: str = "",
) -> bool:
    """Persist correction spans as vocabulary entries. Returns True if any were saved."""
    if not corrections:
        return False

    any_saved = False

    for span in corrections:
        # Look for existing entry with this canonical form
        result = await db.execute(
            select(VocabularyEntry).where(
                and_(
                    VocabularyEntry.org_id == org_id,
                    VocabularyEntry.canonical_form == span.corrected_span,
                    VocabularyEntry.deleted_at.is_(None),
                )
            )
        )
        entry = result.scalar_one_or_none()

        if not entry:
            # Also check user-scoped entries
            result = await db.execute(
                select(VocabularyEntry).where(
                    and_(
                        VocabularyEntry.org_id == org_id,
                        VocabularyEntry.user_id == user_id,
                        VocabularyEntry.canonical_form == span.corrected_span,
                        VocabularyEntry.deleted_at.is_(None),
                    )
                )
            )
            entry = result.scalar_one_or_none()

        if not entry:
            entry = VocabularyEntry(
                org_id=org_id,
                user_id=user_id,
                canonical_form=span.corrected_span,
                category=_guess_category(span.corrected_span),
                source="correction",
            )
            db.add(entry)
            await db.flush()

        # Add/update the variant
        variant_lower = span.original_span.lower()
        result = await db.execute(
            select(VocabularyVariant).where(
                and_(
                    VocabularyVariant.entry_id == entry.id,
                    VocabularyVariant.variant_lower == variant_lower,
                )
            )
        )
        variant = result.scalar_one_or_none()

        if variant:
            variant.occurrence_count += 1
        else:
            variant = VocabularyVariant(
                entry_id=entry.id,
                variant_text=span.original_span,
                variant_lower=variant_lower,
            )
            db.add(variant)

        any_saved = True

    # Log the correction
    if any_saved:
        correction_log = TranscriptionCorrection(
            org_id=org_id,
            user_id=user_id,
            session_id=session_id,
            message_id=message_id,
            original_text=original_text,
            corrected_text=corrected_text,
            corrections_json=[
                {"original": s.original_span, "corrected": s.corrected_span, "position": s.position}
                for s in corrections
            ],
            auto_detected=True,
        )
        db.add(correction_log)

    await db.commit()
    return any_saved


async def get_vocabulary_for_transcription(
    org_id: str,
    user_id: str | None,
    db: AsyncSession,
) -> VocabularySet:
    """Load merged org-wide + user-specific vocabulary for transcription."""
    # Query: all non-deleted entries for this org (org-wide OR this user)
    conditions = [
        VocabularyEntry.org_id == org_id,
        VocabularyEntry.deleted_at.is_(None),
    ]
    if user_id:
        conditions.append((VocabularyEntry.user_id.is_(None)) | (VocabularyEntry.user_id == user_id))
    else:
        conditions.append(VocabularyEntry.user_id.is_(None))

    result = await db.execute(
        select(VocabularyEntry).where(and_(*conditions)).order_by(VocabularyEntry.usage_count.desc())
    )
    entries = result.scalars().all()

    pairs: list[tuple[str, str]] = []
    for entry in entries:
        # Load variants for this entry
        variant_result = await db.execute(select(VocabularyVariant).where(VocabularyVariant.entry_id == entry.id))
        for variant in variant_result.scalars().all():
            pairs.append((variant.variant_lower, entry.canonical_form))

    return VocabularySet(entries=pairs)


def post_process_transcript(text: str, vocabulary: VocabularySet) -> tuple[str, str]:
    """Apply vocabulary corrections to transcript text using Aho-Corasick.

    Returns (corrected_text, original_text).
    """
    if not text or not vocabulary.entries:
        return text, text

    automaton = vocabulary.build_replacer()
    if automaton is None:
        return text, text

    original = text
    text_lower = text.lower()

    # Collect all matches with their positions
    replacements: list[tuple[int, int, str]] = []
    for end_pos, (variant_lower, canonical) in automaton.iter(text_lower):
        start_pos = end_pos - len(variant_lower) + 1

        # Only replace at word boundaries
        if start_pos > 0 and text_lower[start_pos - 1].isalnum():
            continue
        if end_pos + 1 < len(text_lower) and text_lower[end_pos + 1].isalnum():
            continue

        replacements.append((start_pos, end_pos + 1, canonical))

    if not replacements:
        return text, text

    # Apply replacements in reverse order to preserve positions
    replacements.sort(key=lambda r: r[0], reverse=True)

    # Remove overlapping replacements (keep the longest)
    filtered: list[tuple[int, int, str]] = []
    for repl in replacements:
        if not filtered or repl[1] <= filtered[-1][0]:
            filtered.append(repl)

    result = list(text)
    for start, end, canonical in filtered:
        # Match the case of the original text
        original_chunk = text[start:end]
        if original_chunk.isupper():
            replacement = canonical.upper()
        elif original_chunk[0].isupper():
            replacement = canonical[0].upper() + canonical[1:] if len(canonical) > 1 else canonical.upper()
        else:
            replacement = canonical
        result[start:end] = list(replacement)

    corrected = "".join(result)
    return corrected, original


def _guess_category(term: str) -> str:
    """Guess the category of a term based on its form."""
    # Proper nouns (capitalized words)
    words = term.split()
    if all(w[0].isupper() for w in words if w):
        if len(words) >= 2:
            return "person_name"
        return "general"

    # Acronyms (all caps)
    if term.isupper() and len(term) <= 10:
        return "acronym"

    # Technical terms (contains special chars)
    if any(c in term for c in "_-./"):
        return "technical_term"

    return "general"
