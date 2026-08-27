"""Lightweight input validation for chat messages.

All checks are regex-based and run in <1ms. No LLM calls.
Ported from scrum_agent/input_guardrails.py (regex layers only).
"""

import re

MAX_INPUT_CHARS = 5_000

# ─── Prompt injection patterns ────────────────────────────────────────────────

_INJECTION_PATTERNS = [
    re.compile(
        r"ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)",
        re.I,
    ),
    re.compile(
        r"disregard\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)",
        re.I,
    ),
    re.compile(
        r"forget\s+(all\s+)?(your|previous|prior)\s+(instructions?|prompts?|rules?)",
        re.I,
    ),
    re.compile(r"you\s+are\s+now\s+(a|an|the)\s+", re.I),
    re.compile(r"new\s+instructions?\s*:", re.I),
    re.compile(r"system\s*:\s*you\s+are", re.I),
    re.compile(r"<\s*/?\s*system\s*>", re.I),
    re.compile(r"\bact\s+as\s+(a|an|the)\s+", re.I),
    re.compile(
        r"override\s+(your|the|all)\s+(instructions?|prompts?|rules?|guidelines?)",
        re.I,
    ),
    re.compile(r"pretend\s+(you\s+are|to\s+be)\s+", re.I),
]

# ─── Profanity patterns ───────────────────────────────────────────────────────

_PROFANITY_PATTERNS = [
    re.compile(r"\b(f+u+c*k|sh[i1]+t|stfu|wtf)\b", re.I),
    re.compile(r"\b(bitch|asshole|dickhead|bastard|dumbass|retard)\b", re.I),
    re.compile(
        r"\b(dirty|filthy|nasty|naughty)\s+(boy|boii?|girl|bitch|slut|dog)\b",
        re.I,
    ),
    re.compile(r"\b(suck\s*(my|it|this)|blow\s*me|eat\s*my|kiss\s*my\s*a)\b", re.I),
]

# ─── Validation functions ─────────────────────────────────────────────────────


def check_length(text: str) -> str | None:
    """Return error if text exceeds the length cap."""
    if len(text) > MAX_INPUT_CHARS:
        return (
            f"Message too long ({len(text):,} chars). "
            f"Maximum is {MAX_INPUT_CHARS:,} characters."
        )
    return None


def check_injection(text: str) -> str | None:
    """Return warning if text matches a known injection pattern."""
    for pattern in _INJECTION_PATTERNS:
        if pattern.search(text):
            return (
                "Your message was blocked because it resembles a prompt "
                "injection attempt. Please rephrase."
            )
    return None


def check_profanity(text: str) -> str | None:
    """Return warning if text contains obvious profanity."""
    for pattern in _PROFANITY_PATTERNS:
        if pattern.search(text):
            return (
                "Let's keep the conversation professional. "
                "Please rephrase your message."
            )
    return None


def validate_input(text: str) -> str | None:
    """Run all input guardrails. Returns first error or None if clean."""
    return check_length(text) or check_injection(text) or check_profanity(text)
