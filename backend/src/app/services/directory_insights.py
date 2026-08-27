"""Directory insights — extracts structured signals from scan-produced markdown.

The scan connectors emit long-form markdown summaries tuned for the AI
facilitator. For the UI we want a faster, human-scannable view: tech stack
chips, recent activity, and risk flags. This module does that extraction
server-side so the frontend can just render.

Everything is best-effort pattern matching on text the AI produced — it's
deliberately lenient (empty buckets are preferred over false positives).
"""

from __future__ import annotations

import re
from collections import Counter
from datetime import UTC, datetime
from typing import Any

# ---------------------------------------------------------------------------
# Tech stack extraction
# ---------------------------------------------------------------------------

# Known tech tokens — grouped by category for the aggregated tech-stack chip
# cloud. Keep the list focused on things scan prompts actually mention;
# exhaustive "every-framework-ever" lookups create noise.
_LANG_TOKENS: dict[str, str] = {
    "TypeScript": "language",
    "JavaScript": "language",
    "Python": "language",
    "Go": "language",
    "Rust": "language",
    "Java": "language",
    "Kotlin": "language",
    "Swift": "language",
    "Ruby": "language",
    "PHP": "language",
    "C#": "language",
    "C++": "language",
    "Scala": "language",
    "Elixir": "language",
}

_FRAMEWORK_TOKENS: dict[str, str] = {
    "Next.js": "framework",
    "React": "framework",
    "Vue": "framework",
    "Svelte": "framework",
    "Angular": "framework",
    "FastAPI": "framework",
    "Django": "framework",
    "Flask": "framework",
    "Express": "framework",
    "NestJS": "framework",
    "Rails": "framework",
    "Spring": "framework",
    "Laravel": "framework",
}

_INFRA_TOKENS: dict[str, str] = {
    "PostgreSQL": "database",
    "Postgres": "database",
    "MySQL": "database",
    "SQLite": "database",
    "Redis": "database",
    "MongoDB": "database",
    "DynamoDB": "database",
    "Qdrant": "database",
    "pgvector": "database",
    "Kafka": "messaging",
    "RabbitMQ": "messaging",
    "SQS": "messaging",
    "SNS": "messaging",
    "Docker": "infra",
    "Kubernetes": "infra",
    "K8s": "infra",
    "Terraform": "infra",
    "Pulumi": "infra",
    "Nginx": "infra",
    "AWS": "cloud",
    "GCP": "cloud",
    "Azure": "cloud",
    "Lambda": "serverless",
    "Cloudflare": "cdn",
    "Vercel": "hosting",
    "Netlify": "hosting",
    "Railway": "hosting",
    "LiveKit": "realtime",
}

_TOOLING_TOKENS: dict[str, str] = {
    "GitHub Actions": "ci",
    "GitLab CI": "ci",
    "CircleCI": "ci",
    "Jenkins": "ci",
    "Sentry": "monitoring",
    "Datadog": "monitoring",
    "New Relic": "monitoring",
    "Prometheus": "monitoring",
    "Grafana": "monitoring",
    "Anthropic": "ai",
    "OpenAI": "ai",
    "Claude": "ai",
    "Deepgram": "ai",
    "ElevenLabs": "ai",
}

_ALL_TOKENS = {**_LANG_TOKENS, **_FRAMEWORK_TOKENS, **_INFRA_TOKENS, **_TOOLING_TOKENS}


def extract_tech_stack(content: str | None) -> list[tuple[str, str]]:
    """Return ``[(token, kind), …]`` of tech mentions found in ``content``."""
    if not content:
        return []

    found: list[tuple[str, str]] = []
    for token, kind in _ALL_TOKENS.items():
        # Case-sensitive match for acronyms (AWS, K8s), word-boundary aware
        pattern = rf"(?<![A-Za-z0-9_]){re.escape(token)}(?![A-Za-z0-9_])"
        if re.search(pattern, content):
            found.append((token, kind))
    return found


# ---------------------------------------------------------------------------
# Risk / flag extraction
# ---------------------------------------------------------------------------

# Each rule: (severity, short label, pattern). Matched patterns surface as
# risk cards on the landing widget.
_RISK_RULES: list[tuple[str, str, re.Pattern[str]]] = [
    (
        "high",
        "Publicly accessible storage",
        re.compile(r"\bpublic(?:ly)?\s+(?:accessible|readable|exposed)\b", re.IGNORECASE),
    ),
    (
        "high",
        "Exposed secret or credential",
        re.compile(r"\b(?:exposed|leaked)\s+(?:secret|credential|token|key)s?\b", re.IGNORECASE),
    ),
    (
        "high",
        "Security vulnerability",
        re.compile(r"\b(?:vulnerab(?:le|ility)|CVE-\d{4}-\d+|known\s+exploit)\b", re.IGNORECASE),
    ),
    (
        "high",
        "Deprecated dependency",
        re.compile(r"\b(?:deprecated|end[- ]of[- ]life|EOL)\s+(?:dep|depend|library|package|version)", re.IGNORECASE),
    ),
    (
        "medium",
        "Cost spike or overrun",
        re.compile(r"\bcost\s+(?:spike|overrun|increase|anomaly|surge)\b", re.IGNORECASE),
    ),
    (
        "medium",
        "Stale documentation",
        re.compile(r"\b(?:stale|outdated|out[- ]of[- ]date)\s+(?:doc|documentation|content|page)", re.IGNORECASE),
    ),
    (
        "medium",
        "Failing pipeline or build",
        re.compile(r"\b(?:failing|broken|red)\s+(?:pipeline|build|CI|tests?)\b", re.IGNORECASE),
    ),
    (
        "medium",
        "Missing or empty resource",
        re.compile(r"\bno\s+(?:README|tests?|documentation|CI|license)\b", re.IGNORECASE),
    ),
    ("low", "Single point of failure", re.compile(r"\bsingle\s+point\s+of\s+failure\b", re.IGNORECASE)),
    ("low", "Bus factor concern", re.compile(r"\b(?:bus\s+factor|knowledge\s+silo)\b", re.IGNORECASE)),
]


def extract_risks(content: str | None) -> list[dict[str, str]]:
    """Return matching risk signals for this content, as list of dicts."""
    if not content:
        return []

    risks: list[dict[str, str]] = []
    seen: set[str] = set()  # dedupe within a single entry
    for severity, label, pattern in _RISK_RULES:
        match = pattern.search(content)
        if not match:
            continue
        if label in seen:
            continue
        seen.add(label)

        # Grab ~120 chars of surrounding text for the human-readable excerpt.
        start = max(0, match.start() - 60)
        end = min(len(content), match.end() + 60)
        excerpt = content[start:end].replace("\n", " ").strip()
        if start > 0:
            excerpt = "…" + excerpt
        if end < len(content):
            excerpt = excerpt + "…"

        risks.append(
            {
                "severity": severity,
                "label": label,
                "excerpt": excerpt,
            }
        )
    return risks


# ---------------------------------------------------------------------------
# Aggregate
# ---------------------------------------------------------------------------


def aggregate_insights(entries: list[dict[str, Any]]) -> dict[str, Any]:
    """Walk a list of (dict-shaped) entries and return aggregated insights."""
    stack_counter: Counter[tuple[str, str]] = Counter()
    per_entry_tech: dict[str, list[str]] = {}
    risks_out: list[dict[str, Any]] = []
    activity_out: list[dict[str, Any]] = []

    for entry in entries:
        content = entry.get("content") or ""
        entry_id = entry.get("id")
        title = entry.get("title") or ""
        updated_at = entry.get("updated_at")
        provider = entry.get("integration_provider") or entry.get("source")

        # Tech stack
        for token, kind in extract_tech_stack(content):
            stack_counter[(token, kind)] += 1
            per_entry_tech.setdefault(entry_id, []).append(token)

        # Risks
        for risk in extract_risks(content):
            risks_out.append(
                {
                    "entry_id": entry_id,
                    "entry_title": title,
                    "provider": provider,
                    **risk,
                }
            )

        # Activity
        if updated_at:
            activity_out.append(
                {
                    "entry_id": entry_id,
                    "entry_title": title,
                    "category": entry.get("category"),
                    "provider": provider,
                    "updated_at": updated_at,
                }
            )

    # Sort tech stack by count desc, then name
    tech_stack = [{"name": name, "kind": kind, "count": count} for (name, kind), count in stack_counter.most_common()]

    # Severity ordering for risks (high → medium → low), then keep stable order
    severity_rank = {"high": 0, "medium": 1, "low": 2}
    risks_out.sort(key=lambda r: (severity_rank.get(r["severity"], 3), r["label"]))

    # Most recent 15 activity items
    def _parse_ts(ts: str | None) -> float:
        if not ts:
            return 0.0
        try:
            return datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
        except (ValueError, TypeError):
            return 0.0

    activity_out.sort(key=lambda a: _parse_ts(a["updated_at"]), reverse=True)
    activity_out = activity_out[:15]

    return {
        "generated_at": datetime.now(tz=UTC).isoformat(),
        "entry_count": len(entries),
        "tech_stack": tech_stack,
        "tech_by_entry": per_entry_tech,
        "risks": risks_out,
        "activity": activity_out,
    }
