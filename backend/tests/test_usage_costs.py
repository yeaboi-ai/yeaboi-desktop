"""Tests for services/usage_costs.py — scan-cost estimator and the cost engine."""

from __future__ import annotations

from decimal import Decimal

import pytest

from src.app.services.usage_costs import (
    STALE_THRESHOLD_DAYS,
    UNIT_PER_1K_TOKENS_IN,
    UNIT_PER_1K_TOKENS_OUT,
    UNIT_PER_CHARACTER,
    PricingRule,
    _best_match,
    compute_cost,
    estimate_cost_usd,
    is_known_cost,
    model_is_priced,
)


def test_estimate_cost_for_known_model():
    # claude-3-5-sonnet-20241022 → 0.0035 per 1k tokens blended
    cost = estimate_cost_usd("claude-3-5-sonnet-20241022", 10_000)
    assert cost == 0.035


def test_estimate_cost_for_haiku():
    # Much cheaper than sonnet — check we're not using one price for all
    assert estimate_cost_usd("claude-haiku-4-5", 10_000) == 0.012


def test_estimate_cost_prefix_matches_versioned_model():
    # A versioned model we didn't explicitly list should still price
    cost = estimate_cost_usd("claude-3-5-sonnet-20250601", 1_000)
    assert cost == 0.0035


def test_estimate_cost_unknown_model_returns_zero():
    assert estimate_cost_usd("mystery-llm-v1", 100_000) == 0.0


def test_estimate_cost_zero_tokens():
    assert estimate_cost_usd("claude-opus-4-7", 0) == 0.0


def test_estimate_cost_negative_tokens_returns_zero():
    assert estimate_cost_usd("claude-opus-4-7", -500) == 0.0


def test_estimate_cost_none_model():
    assert estimate_cost_usd(None, 1_000) == 0.0


def test_estimate_cost_rounds_to_four_decimals():
    # 1 token × 0.0035 / 1000 = 0.0000035 — should round to 0.0
    assert estimate_cost_usd("claude-3-5-sonnet", 1) == 0.0
    # 100 tokens × 0.0035 / 1000 = 0.00035 → rounds to 0.0004
    assert estimate_cost_usd("claude-3-5-sonnet", 100) == 0.0004


def test_model_is_priced_exact():
    assert model_is_priced("claude-opus-4-7") is True
    assert model_is_priced("unknown-model") is False


def test_model_is_priced_prefix():
    assert model_is_priced("claude-3-5-sonnet-20250101") is True


def test_model_is_priced_none():
    assert model_is_priced(None) is False


def test_stale_threshold_exposed():
    # Integrations page reads this constant — assert it's a reasonable number
    # so a typo like 1400 never silently ships.
    assert 1 <= STALE_THRESHOLD_DAYS <= 60


# ---------------------------------------------------------------------------
# General cost engine
# ---------------------------------------------------------------------------


class TestComputeCost:
    def test_anthropic_opus_chat(self):
        # 1000 input + 500 output tokens at opus rates ($0.015/$0.075 per 1k).
        cost = compute_cost("anthropic", "chat", {"tokens_in": 1000, "tokens_out": 500}, model="claude-opus-4-7")
        assert cost == Decimal("0.052500")  # 0.015 + (0.075 * 0.5)

    def test_anthropic_sonnet_chat(self):
        cost = compute_cost("anthropic", "chat", {"tokens_in": 2000, "tokens_out": 1000}, model="claude-sonnet-4-6")
        # 2 * 0.003 + 1 * 0.015 = 0.021
        assert cost == Decimal("0.021000")

    def test_anthropic_haiku_chat(self):
        cost = compute_cost("anthropic", "chat", {"tokens_in": 1000, "tokens_out": 1000}, model="claude-haiku-4-5")
        # 0.0008 + 0.004 = 0.0048
        assert cost == Decimal("0.004800")

    def test_anthropic_includes_cache(self):
        cost = compute_cost(
            "anthropic",
            "chat",
            {"tokens_in": 0, "tokens_out": 0, "cache_read": 1000, "cache_write": 1000},
            model="claude-opus-4-7",
        )
        # 0.0015 + 0.01875 = 0.02025
        assert cost == Decimal("0.020250")

    def test_elevenlabs_tts(self):
        cost = compute_cost("elevenlabs", "tts", {"characters": 10000})
        # 10000 * 0.00018 = 1.8
        assert cost == Decimal("1.800000")

    def test_cartesia_tts(self):
        cost = compute_cost("cartesia", "tts", {"characters": 10000})
        # 10000 * 0.000015 = 0.15
        assert cost == Decimal("0.150000")

    def test_deepgram_stt(self):
        cost = compute_cost("deepgram", "stt", {"seconds": 600})
        # 10 minutes * 0.0043 = 0.043
        assert cost == Decimal("0.043000")

    def test_livekit_egress(self):
        cost = compute_cost("livekit", "egress", {"seconds": 1800})
        # 30 minutes * 0.0075 = 0.225
        assert cost == Decimal("0.225000")

    def test_livekit_room_minutes(self):
        cost = compute_cost("livekit", "room_minutes", {"participant_minutes": 100})
        # 100 * 0.0005 = 0.05
        assert cost == Decimal("0.050000")

    def test_resend_email(self):
        cost = compute_cost("resend", "email_send", {"count": 50})
        # 50 * 0.0002 = 0.01
        assert cost == Decimal("0.010000")

    def test_unknown_provider_returns_zero(self):
        assert compute_cost("nonexistent", "chat", {"tokens_in": 1000}) == Decimal("0")

    def test_unknown_model_returns_zero(self):
        # No catch-all rule for anthropic/chat — every rule has model_match.
        assert compute_cost("anthropic", "chat", {"tokens_in": 1000}, model="weird-model") == Decimal("0")

    def test_zero_units_returns_zero(self):
        assert compute_cost("anthropic", "chat", {"tokens_in": 0, "tokens_out": 0}, model="claude-opus-4-7") == Decimal(
            "0"
        )

    def test_negative_units_treated_as_zero(self):
        cost = compute_cost("anthropic", "chat", {"tokens_in": -100, "tokens_out": 1000}, model="claude-opus-4-7")
        # negative tokens_in skipped, just 1000 output tokens at $0.075/1k
        assert cost == Decimal("0.075000")

    def test_override_resolver_overrides_static_price(self):
        def resolver(provider, operation, model):
            return {UNIT_PER_1K_TOKENS_IN: Decimal("0.0075")}

        cost = compute_cost(
            "anthropic",
            "chat",
            {"tokens_in": 1000, "tokens_out": 1000},
            model="claude-opus-4-7",
            override_resolver=resolver,
        )
        # 0.0075 (overridden) + 0.075 (static output) = 0.0825
        assert cost == Decimal("0.082500")

    def test_override_resolver_only_affects_named_units(self):
        def resolver(provider, operation, model):
            return {UNIT_PER_CHARACTER: Decimal("0.0001")}

        cost = compute_cost("elevenlabs", "tts", {"characters": 1000}, override_resolver=resolver)
        # 1000 * 0.0001 = 0.1
        assert cost == Decimal("0.100000")


class TestBestMatch:
    def test_picks_longest_prefix(self):
        rules = [
            PricingRule(UNIT_PER_1K_TOKENS_IN, Decimal("0.001"), model_match="claude-3"),
            PricingRule(UNIT_PER_1K_TOKENS_IN, Decimal("0.0008"), model_match="claude-3-5-haiku"),
        ]
        match = _best_match(rules, UNIT_PER_1K_TOKENS_IN, "claude-3-5-haiku-20251001")
        assert match is not None
        assert match.price_usd == Decimal("0.0008")

    def test_falls_back_to_catch_all(self):
        rules = [
            PricingRule(UNIT_PER_CHARACTER, Decimal("0.001")),
            PricingRule(UNIT_PER_CHARACTER, Decimal("0.0001"), model_match="premium"),
        ]
        match = _best_match(rules, UNIT_PER_CHARACTER, None)
        assert match is not None
        assert match.price_usd == Decimal("0.001")

    def test_no_match_returns_none(self):
        rules = [PricingRule(UNIT_PER_1K_TOKENS_IN, Decimal("0.001"), model_match="claude-opus")]
        assert _best_match(rules, UNIT_PER_1K_TOKENS_OUT, "claude-opus-4-7") is None
        assert _best_match(rules, UNIT_PER_1K_TOKENS_IN, "gpt-4o") is None


class TestIsKnownCost:
    @pytest.mark.parametrize(
        "provider,operation",
        [
            ("anthropic", "chat"),
            ("openai", "chat"),
            ("elevenlabs", "tts"),
            ("cartesia", "tts"),
            ("deepgram", "stt"),
            ("livekit", "egress"),
            ("livekit", "room_minutes"),
            ("resend", "email_send"),
        ],
    )
    def test_known_combinations(self, provider, operation):
        assert is_known_cost(provider, operation) is True

    def test_unknown_combination(self):
        assert is_known_cost("github", "api_call") is False
        assert is_known_cost("anthropic", "embedding") is False
