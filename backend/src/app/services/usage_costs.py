"""Cost estimation for provider API usage.

Two layers live here:

1. **Legacy scan helpers** (`estimate_cost_usd`, `model_is_priced`) — kept for
   the integration-scan call sites that already use them. Don't extend.

2. **General cost engine** (`compute_cost`, `_PRICING`, `PricingRule`) — the
   single source of truth for the new `usage_events` ledger. Each provider /
   operation has one or more `PricingRule`s; the most specific model match
   wins. Returns `Decimal` so per-event costs can sum without floating-point
   drift.

Pricing values are vendor list prices captured at the date noted in each
comment. Negotiated or updated rates can be applied without redeploying via
the `pricing_overrides` table — see `services.usage_recorder` for the
override resolver wiring.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from decimal import Decimal

# ---------------------------------------------------------------------------
# Legacy: integration-scan blended pricing. Do not extend — new call sites
# should use `compute_cost` instead.
# ---------------------------------------------------------------------------

# Approximate blended price in USD per 1k tokens. Input and output pricing
# differs, but scan logs don't separate them — we use a single weighted
# average (input × 0.75 + output × 0.25, which reflects typical scan I/O
# ratios where the model gets a fat prompt and produces a short summary).
#
# Keep this list short; adding a row is a conscious act, not a reflex.
_BLENDED_PRICE_PER_1K: dict[str, float] = {
    # Anthropic
    "claude-opus-4-7": 0.012,
    "claude-opus-4-6": 0.012,
    "claude-opus-4-5": 0.012,
    "claude-sonnet-4-6": 0.0035,
    "claude-3-5-sonnet-20241022": 0.0035,
    "claude-3-5-sonnet": 0.0035,
    "claude-haiku-4-5-20251001": 0.0012,
    "claude-haiku-4-5": 0.0012,
    "claude-3-5-haiku": 0.0012,
    # OpenAI (rough — we rarely use these for scans but included for safety)
    "gpt-4o": 0.006,
    "gpt-4o-mini": 0.0005,
    "gpt-4-turbo": 0.012,
}


def estimate_cost_usd(model: str | None, tokens: int) -> float:
    """Return a USD cost estimate for *tokens* consumed by *model*.

    Unknown models return 0.0 — surface that to the user so they know the
    number is a lower bound. Callers that need a clear "we don't know" can
    check model_is_priced() first.
    """
    if not model or tokens <= 0:
        return 0.0
    price = _BLENDED_PRICE_PER_1K.get(model)
    if price is None:
        # Fallback: match on known prefix (handles version variants like
        # claude-3-5-sonnet-YYYYMMDD that we haven't explicitly listed).
        for key, p in _BLENDED_PRICE_PER_1K.items():
            if model.startswith(key):
                price = p
                break
    if price is None:
        return 0.0
    return round((tokens / 1000.0) * price, 4)


def model_is_priced(model: str | None) -> bool:
    """True if we have a price entry for *model* (exact or prefix match)."""
    if not model:
        return False
    if model in _BLENDED_PRICE_PER_1K:
        return True
    return any(model.startswith(k) for k in _BLENDED_PRICE_PER_1K)


# Integrations scanned longer ago than this are flagged "stale" in the UI.
STALE_THRESHOLD_DAYS = 14


# ---------------------------------------------------------------------------
# General cost engine — used by the usage_events ledger.
# ---------------------------------------------------------------------------

# Unit codes — keep in sync with `pricing_overrides.unit` column.
UNIT_PER_1K_TOKENS_IN = "per_1k_tokens_in"
UNIT_PER_1K_TOKENS_OUT = "per_1k_tokens_out"
UNIT_PER_1K_CACHE_READ = "per_1k_cache_read"
UNIT_PER_1K_CACHE_WRITE = "per_1k_cache_write"
UNIT_PER_CHARACTER = "per_character"
UNIT_PER_MINUTE = "per_minute"
UNIT_PER_PARTICIPANT_MINUTE = "per_participant_minute"
UNIT_PER_EMAIL = "per_email"


@dataclass(frozen=True)
class PricingRule:
    """One billable line. `model_match` is a prefix-match against the model
    name; `None` means the rule applies to any model under (provider,
    operation). The cost engine sums all matching rules for a usage event.
    """

    unit: str
    price_usd: Decimal
    model_match: str | None = None

    def applies_to(self, model: str | None) -> bool:
        if self.model_match is None:
            return True
        if model is None:
            return False
        return model.startswith(self.model_match)


def _d(value: str) -> Decimal:
    """Compact constructor — `_d("0.012")` reads cleaner than `Decimal("0.012")`."""
    return Decimal(value)


# Pricing tables. Each (provider, operation) maps to a list of rules; the
# most-specific rule wins per unit (more specific model_match prefix first).
#
# Sources (captured 2026-05-09):
#   Anthropic — anthropic.com/pricing
#   OpenAI    — openai.com/api/pricing
#   ElevenLabs — elevenlabs.io/pricing (Creator → ~$0.00018/char turbo)
#   Cartesia  — cartesia.ai/pricing (Sonic 2 ~$0.000015/char)
#   Deepgram  — deepgram.com/pricing (Nova-3 streaming ~$0.0043/min)
#   LiveKit   — livekit.io/pricing
#   Resend    — resend.com/pricing (~$20/100k → $0.0002/email)
_PRICING: dict[tuple[str, str], list[PricingRule]] = {
    ("anthropic", "chat"): [
        # Opus
        PricingRule(UNIT_PER_1K_TOKENS_IN, _d("0.015"), model_match="claude-opus"),
        PricingRule(UNIT_PER_1K_TOKENS_OUT, _d("0.075"), model_match="claude-opus"),
        PricingRule(UNIT_PER_1K_CACHE_READ, _d("0.0015"), model_match="claude-opus"),
        PricingRule(UNIT_PER_1K_CACHE_WRITE, _d("0.01875"), model_match="claude-opus"),
        # Sonnet
        PricingRule(UNIT_PER_1K_TOKENS_IN, _d("0.003"), model_match="claude-sonnet"),
        PricingRule(UNIT_PER_1K_TOKENS_OUT, _d("0.015"), model_match="claude-sonnet"),
        PricingRule(UNIT_PER_1K_CACHE_READ, _d("0.0003"), model_match="claude-sonnet"),
        PricingRule(UNIT_PER_1K_CACHE_WRITE, _d("0.00375"), model_match="claude-sonnet"),
        # Sonnet 3.x legacy naming
        PricingRule(UNIT_PER_1K_TOKENS_IN, _d("0.003"), model_match="claude-3-5-sonnet"),
        PricingRule(UNIT_PER_1K_TOKENS_OUT, _d("0.015"), model_match="claude-3-5-sonnet"),
        # Haiku
        PricingRule(UNIT_PER_1K_TOKENS_IN, _d("0.0008"), model_match="claude-haiku"),
        PricingRule(UNIT_PER_1K_TOKENS_OUT, _d("0.004"), model_match="claude-haiku"),
        PricingRule(UNIT_PER_1K_TOKENS_IN, _d("0.0008"), model_match="claude-3-5-haiku"),
        PricingRule(UNIT_PER_1K_TOKENS_OUT, _d("0.004"), model_match="claude-3-5-haiku"),
    ],
    ("openai", "chat"): [
        PricingRule(UNIT_PER_1K_TOKENS_IN, _d("0.0025"), model_match="gpt-4o-mini"),
        PricingRule(UNIT_PER_1K_TOKENS_OUT, _d("0.0006"), model_match="gpt-4o-mini"),
        PricingRule(UNIT_PER_1K_TOKENS_IN, _d("0.00015"), model_match="gpt-4o-mini"),  # noqa: E501  (mini cheaper)
        PricingRule(UNIT_PER_1K_TOKENS_OUT, _d("0.0006"), model_match="gpt-4o-mini"),
        PricingRule(UNIT_PER_1K_TOKENS_IN, _d("0.0025"), model_match="gpt-4o"),
        PricingRule(UNIT_PER_1K_TOKENS_OUT, _d("0.01"), model_match="gpt-4o"),
        PricingRule(UNIT_PER_1K_TOKENS_IN, _d("0.01"), model_match="gpt-4-turbo"),
        PricingRule(UNIT_PER_1K_TOKENS_OUT, _d("0.03"), model_match="gpt-4-turbo"),
    ],
    ("elevenlabs", "tts"): [
        # Turbo v2.5 / Flash — billed per character of synthesized text.
        PricingRule(UNIT_PER_CHARACTER, _d("0.00018")),
    ],
    ("cartesia", "tts"): [
        # Sonic 2 — billed per character.
        PricingRule(UNIT_PER_CHARACTER, _d("0.000015")),
    ],
    ("deepgram", "stt"): [
        # Nova-3 streaming, USD per minute of audio processed.
        PricingRule(UNIT_PER_MINUTE, _d("0.0043")),
    ],
    ("livekit", "egress"): [
        # Cloud egress — room composite. Audio-only is much cheaper; we use a
        # blended audio+video rate. Override per-org if you know the mix.
        PricingRule(UNIT_PER_MINUTE, _d("0.0075")),
    ],
    ("livekit", "room_minutes"): [
        # Cloud Connection minutes per participant.
        PricingRule(UNIT_PER_PARTICIPANT_MINUTE, _d("0.0005")),
    ],
    ("resend", "email_send"): [
        # ~$20 per 100k emails on the Pro tier.
        PricingRule(UNIT_PER_EMAIL, _d("0.0002")),
    ],
    # github / api_call: no per-call price; left empty intentionally.
}


def _best_match(rules: list[PricingRule], unit: str, model: str | None) -> PricingRule | None:
    """Pick the rule for *unit* with the longest matching model prefix.

    A rule with `model_match=None` is the catch-all and only wins when no
    model-specific rule matches. Length-of-prefix tie-break ensures
    "claude-3-5-haiku" beats "claude-3" (if we ever added the latter).
    """
    candidates = [r for r in rules if r.unit == unit and r.applies_to(model)]
    if not candidates:
        return None
    candidates.sort(key=lambda r: len(r.model_match or ""), reverse=True)
    return candidates[0]


# Override resolver type. Returns a (unit → Decimal) dict for the matching
# (provider, operation, model) — empty dict if no override applies.
OverrideResolver = Callable[[str, str, str | None], dict[str, Decimal]]


def compute_cost(
    provider: str,
    operation: str,
    units: dict,
    model: str | None = None,
    override_resolver: OverrideResolver | None = None,
) -> Decimal:
    """Compute cost in USD for one usage event.

    `units` is a dict like ``{"tokens_in": 1234, "tokens_out": 56}`` or
    ``{"characters": 9000}`` or ``{"seconds": 120}`` or ``{"count": 1}`` — only
    the keys relevant to (provider, operation) are read.

    `override_resolver`, if given, is consulted first and its prices replace
    the static `_PRICING` entries for this (provider, operation, model). Set
    by `services.usage_recorder` to layer in `pricing_overrides` rows.
    """
    rules = _PRICING.get((provider, operation), [])
    if not rules and override_resolver is None:
        return Decimal("0")

    overrides = override_resolver(provider, operation, model) if override_resolver else {}
    total = Decimal("0")

    def _price_for(unit: str) -> Decimal | None:
        if unit in overrides:
            return overrides[unit]
        rule = _best_match(rules, unit, model)
        return rule.price_usd if rule else None

    # Map the units dict into pricing line items.
    line_items: list[tuple[str, Decimal]] = []
    if "tokens_in" in units:
        line_items.append((UNIT_PER_1K_TOKENS_IN, Decimal(units["tokens_in"]) / Decimal("1000")))
    if "tokens_out" in units:
        line_items.append((UNIT_PER_1K_TOKENS_OUT, Decimal(units["tokens_out"]) / Decimal("1000")))
    if "cache_read" in units:
        line_items.append((UNIT_PER_1K_CACHE_READ, Decimal(units["cache_read"]) / Decimal("1000")))
    if "cache_write" in units:
        line_items.append((UNIT_PER_1K_CACHE_WRITE, Decimal(units["cache_write"]) / Decimal("1000")))
    if "characters" in units:
        line_items.append((UNIT_PER_CHARACTER, Decimal(units["characters"])))
    if "seconds" in units:
        line_items.append((UNIT_PER_MINUTE, Decimal(units["seconds"]) / Decimal("60")))
    if "participant_minutes" in units:
        line_items.append((UNIT_PER_PARTICIPANT_MINUTE, Decimal(units["participant_minutes"])))
    if "count" in units:
        line_items.append((UNIT_PER_EMAIL, Decimal(units["count"])))

    for unit, quantity in line_items:
        price = _price_for(unit)
        if price is None or quantity <= 0:
            continue
        total += price * quantity

    return total.quantize(Decimal("0.000001"))


def is_known_cost(provider: str, operation: str) -> bool:
    """True if we have a static price entry for this (provider, operation).

    Useful for surfacing "we don't know how to price this" in the UI rather
    than silently writing $0 events.
    """
    return bool(_PRICING.get((provider, operation)))
