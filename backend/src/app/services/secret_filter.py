"""Pre-AI content filter that detects and redacts secrets from file content.

Two entry points:
  - should_skip_file(filename) — True if the whole file should be skipped
  - redact_secrets(content, return_flag) — redact inline secrets from content
"""

import re

# ─── File-level skip patterns ─────────────────────────────────────────────────

_SKIP_EXACT_NAMES = frozenset(
    [
        ".env",
        ".env.local",
        ".env.development",
        ".env.production",
        ".env.staging",
        ".env.test",
        ".env.example",
        "credentials.json",
        "secrets.yaml",
        "secrets.yml",
        "vault.json",
    ]
)

_SKIP_EXTENSIONS = frozenset([".pem", ".key", ".p12", ".pfx", ".jks", ".keystore", ".crt"])


def should_skip_file(filename: str) -> bool:
    """Return True if the file is likely to contain only secrets and should be skipped entirely."""
    # Strip any leading path component — operate on the basename only
    basename = filename.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]

    if basename in _SKIP_EXACT_NAMES:
        return True

    # Any file whose name starts with ".env"
    if basename.startswith(".env"):
        return True

    # Check extension (handle dotfiles like ".keystore" with no stem)
    dot_idx = basename.rfind(".")
    if dot_idx > 0:  # dot_idx == 0 means it's a dotfile with no extension
        ext = basename[dot_idx:]
        if ext in _SKIP_EXTENSIONS:
            return True

    return False


# ─── Inline redaction patterns ────────────────────────────────────────────────

# Ordered list of (compiled_pattern, replacement) tuples.
# Patterns are applied in sequence so more specific patterns run first.
_REDACTION_RULES: list[tuple[re.Pattern[str], str]] = [
    # 1. AWS access keys
    (
        re.compile(r"AKIA[0-9A-Z]{16}"),
        "[REDACTED_AWS_KEY]",
    ),
    # 2. Private key blocks (BEGIN ... PRIVATE KEY ... END ... PRIVATE KEY)
    (
        re.compile(
            r"-----BEGIN [A-Z ]* PRIVATE KEY-----.*?-----END [A-Z ]* PRIVATE KEY-----",
            re.DOTALL,
        ),
        "[REDACTED_PRIVATE_KEY]",
    ),
    # 3. JWT tokens — three base64url segments separated by dots
    (
        re.compile(r"eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+"),
        "[REDACTED_JWT]",
    ),
    # 4. Anthropic API keys (sk-ant-...) — must come before generic sk- rule
    (
        re.compile(r"sk-ant-[A-Za-z0-9_\-]+"),
        "[REDACTED_API_KEY]",
    ),
    # 5. OpenAI / generic sk- API keys
    (
        re.compile(r"sk-[A-Za-z0-9]{20,}"),
        "[REDACTED_API_KEY]",
    ),
    # 6. Bearer tokens
    (
        re.compile(r"bearer\s+[A-Za-z0-9_\-\.]+", re.IGNORECASE),
        "Bearer [REDACTED]",
    ),
    # 7. Connection strings with embedded credentials
    (
        re.compile(
            r"(mongodb|postgres|mysql|redis)://[^@\s]+@",
            re.IGNORECASE,
        ),
        r"\1://[REDACTED]@",
    ),
    # 8. Generic key=value / key: value secret assignments
    (
        re.compile(
            r"(password|passwd|secret|api_key|apikey|access_token|auth_token|private_key)"
            r"\s*[=:]\s*[\"']?([^\s\"']+)",
            re.IGNORECASE,
        ),
        r"\1=[REDACTED]",
    ),
]


def redact_secrets(content: str, return_flag: bool = False) -> "str | tuple[str, bool]":
    """Redact inline secrets from *content*.

    Args:
        content:     Raw file text.
        return_flag: When True, return a ``(redacted_content, is_mostly_secrets)``
                     tuple instead of just the redacted string.

    Returns:
        Redacted string, or ``(redacted_string, is_mostly_secrets)`` when
        *return_flag* is True.  ``is_mostly_secrets`` is True when the ratio
        of redacted occurrences to total lines exceeds 0.5.
    """
    redacted = content
    for pattern, replacement in _REDACTION_RULES:
        redacted = pattern.sub(replacement, redacted)

    if not return_flag:
        return redacted

    lines = redacted.splitlines() or [""]
    redaction_hits = redacted.count("[REDACTED")
    is_mostly_secrets = (redaction_hits / len(lines)) > 0.5

    return redacted, is_mostly_secrets
