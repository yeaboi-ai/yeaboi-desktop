"""Tests for vocabulary service — diff detection and post-processing."""

from src.app.services.vocabulary_service import (
    VocabularySet,
    detect_corrections,
    post_process_transcript,
)


class TestDetectCorrections:
    def test_simple_word_replacement(self):
        corrections = detect_corrections(
            "Omar Nouraldeen said hello",
            "Omar Noureldin said hello",
        )
        assert len(corrections) == 1
        assert corrections[0].original_span == "Nouraldeen"
        assert corrections[0].corrected_span == "Noureldin"

    def test_multiple_corrections(self):
        corrections = detect_corrections(
            "Use Postgressql and Kubernets",
            "Use PostgreSQL and Kubernetes",
        )
        assert len(corrections) == 2
        spans = [(c.original_span, c.corrected_span) for c in corrections]
        assert ("Postgressql", "PostgreSQL") in spans
        assert ("Kubernets", "Kubernetes") in spans

    def test_punctuation_only_is_trivial(self):
        corrections = detect_corrections(
            "hello world",
            "hello, world.",
        )
        assert len(corrections) == 0

    def test_empty_strings(self):
        assert detect_corrections("", "hello") == []
        assert detect_corrections("hello", "") == []
        assert detect_corrections("", "") == []

    def test_identical_text(self):
        assert detect_corrections("hello world", "hello world") == []

    def test_case_only_change_is_trivial(self):
        corrections = detect_corrections("hello world", "Hello World")
        assert len(corrections) == 0

    def test_insertion_not_captured(self):
        """Insertions (new words added) should not be captured as corrections."""
        corrections = detect_corrections(
            "use the database",
            "use the PostgreSQL database",
        )
        # This is an insert, not a replace — we don't learn from insertions
        assert len(corrections) == 0

    def test_multi_word_correction(self):
        corrections = detect_corrections(
            "the live kit server",
            "the LiveKit server",
        )
        assert len(corrections) == 1
        assert corrections[0].corrected_span == "LiveKit"

    def test_punctuation_stripped_from_corrections(self):
        """Punctuation attached to words should be stripped in corrections."""
        corrections = detect_corrections(
            "my colleague, Nikulai Maine, is here",
            "my colleague, Nikolai Main, is here",
        )
        # Should get individual word corrections without punctuation
        spans = [(c.original_span, c.corrected_span) for c in corrections]
        assert ("Nikulai", "Nikolai") in spans
        assert ("Maine", "Main") in spans
        # "colleague," should NOT be in any correction (it didn't change)

    def test_no_surrounding_words_captured(self):
        """Only changed words should be in corrections, not unchanged neighbors."""
        corrections = detect_corrections(
            "So my colleague Nouraldeen said hello",
            "So my colleague Noureldin said hello",
        )
        assert len(corrections) == 1
        assert corrections[0].original_span == "Nouraldeen"
        assert corrections[0].corrected_span == "Noureldin"


class TestPostProcessTranscript:
    def test_simple_replacement(self):
        vocab = VocabularySet(entries=[("nouraldeen", "Noureldin")])
        corrected, original = post_process_transcript("Omar Nouraldeen said hello", vocab)
        assert corrected == "Omar Noureldin said hello"
        assert original == "Omar Nouraldeen said hello"

    def test_case_preservation_uppercase(self):
        vocab = VocabularySet(entries=[("postgresql", "PostgreSQL")])
        corrected, _ = post_process_transcript("Use POSTGRESQL for the database", vocab)
        assert "POSTGRESQL" in corrected or "PostgreSQL" in corrected

    def test_case_preservation_titlecase(self):
        vocab = VocabularySet(entries=[("nouraldeen", "Noureldin")])
        corrected, _ = post_process_transcript("Nouraldeen is here", vocab)
        assert corrected == "Noureldin is here"

    def test_no_match_returns_same(self):
        vocab = VocabularySet(entries=[("nouraldeen", "Noureldin")])
        corrected, original = post_process_transcript("Hello world", vocab)
        assert corrected == "Hello world"
        assert original == "Hello world"

    def test_empty_vocabulary(self):
        vocab = VocabularySet(entries=[])
        corrected, original = post_process_transcript("Hello world", vocab)
        assert corrected == "Hello world"

    def test_empty_text(self):
        vocab = VocabularySet(entries=[("nouraldeen", "Noureldin")])
        corrected, original = post_process_transcript("", vocab)
        assert corrected == ""

    def test_word_boundary_respected(self):
        """Should not replace partial word matches."""
        vocab = VocabularySet(entries=[("sql", "SQL")])
        corrected, _ = post_process_transcript("Use postgresql for data", vocab)
        # Should NOT replace "sql" inside "postgresql"
        assert corrected == "Use postgresql for data"

    def test_multiple_replacements(self):
        vocab = VocabularySet(
            entries=[
                ("nouraldeen", "Noureldin"),
                ("postgressql", "PostgreSQL"),
            ]
        )
        corrected, _ = post_process_transcript("Nouraldeen uses Postgressql", vocab)
        assert "Noureldin" in corrected
        assert "PostgreSQL" in corrected


class TestVocabularySet:
    def test_to_deepgram_keywords(self):
        vocab = VocabularySet(
            entries=[
                ("nouraldeen", "Noureldin"),
                ("nooreldeen", "Noureldin"),
                ("postgressql", "PostgreSQL"),
            ]
        )
        keywords = vocab.to_deepgram_keywords()
        # Should deduplicate by canonical form
        assert len(keywords) == 2
        assert "Noureldin:1.5" in keywords
        assert "PostgreSQL:1.5" in keywords

    def test_to_whisper_prompt(self):
        vocab = VocabularySet(
            entries=[
                ("nouraldeen", "Noureldin"),
                ("postgressql", "PostgreSQL"),
            ]
        )
        prompt = vocab.to_whisper_prompt()
        assert "Noureldin" in prompt
        assert "PostgreSQL" in prompt
        assert ", " in prompt

    def test_to_enhancement_context(self):
        vocab = VocabularySet(
            entries=[
                ("nouraldeen", "Noureldin"),
                ("nooreldeen", "Noureldin"),
            ]
        )
        hints = vocab.to_enhancement_context()
        assert hints == ["Noureldin"]

    def test_max_keywords_limit(self):
        entries = [(f"variant{i}", f"Term{i}") for i in range(300)]
        vocab = VocabularySet(entries=entries)
        keywords = vocab.to_deepgram_keywords(max_keywords=200)
        assert len(keywords) == 200
