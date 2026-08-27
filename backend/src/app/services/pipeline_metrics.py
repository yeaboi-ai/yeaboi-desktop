"""Wireframe pipeline metrics — durations, token usage, and cost per run.

A single `PipelineMetrics` instance follows one `_extract_diagram_inline_inner`
invocation. It records phase timings, AI call usage, and computes cost from a
per-model rate table. At the end the pipeline calls `emit()` which logs a
single structured JSON line and (optionally) persists to the
`wireframe_pipeline_runs` table.

Usage:
    metrics = PipelineMetrics(session_id, run_id)
    with metrics.phase("preflight"):
        ...
    metrics.record_ai_call("claude-haiku-4-5", in_tokens=412, out_tokens=87)
    ...
    metrics.emit(logger)
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from collections.abc import Callable
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any

# Cost per million tokens, USD. Numbers reflect Anthropic's published list as
# of late 2025; update when rates change. Unknown models fall back to (0, 0)
# so unknown-model spend shows as 0 rather than crashing the run.
COST_PER_MTOK: dict[str, tuple[float, float]] = {
    # Claude Opus 4.7
    "claude-opus-4-7": (15.0, 75.0),
    "claude-opus-4-7-20251008": (15.0, 75.0),
    # Claude Opus 4.6
    "claude-opus-4-6": (15.0, 75.0),
    # Claude Sonnet 4.6
    "claude-sonnet-4-6": (3.0, 15.0),
    "claude-sonnet-4-6-20250929": (3.0, 15.0),
    # Claude Sonnet 4.5
    "claude-sonnet-4-5": (3.0, 15.0),
    # Claude Haiku 4.5
    "claude-haiku-4-5": (1.0, 5.0),
    "claude-haiku-4-5-20251001": (1.0, 5.0),
    # OpenAI (rough placeholders)
    "gpt-4o": (2.5, 10.0),
    "gpt-4o-mini": (0.15, 0.60),
    # Google Gemini 2.5 family — published pricing as of 2026-Q1
    "gemini-2.5-pro": (1.25, 10.0),
    "gemini-2.5-flash": (0.30, 2.50),
    "gemini-2.5-flash-lite": (0.10, 0.40),
    # DeepSeek V4 family — flat rates (75% discount window, ends 2026-05-31)
    "deepseek-chat": (0.14, 0.28),
    "deepseek-reasoner": (0.55, 2.19),
    # Qwen via DashScope — best estimates; verify against your invoice
    "qwen-turbo": (0.05, 0.20),
    "qwen-plus": (0.40, 1.20),
    "qwen-max": (2.50, 10.0),
}


def cost_for(
    model: str,
    input_tokens: int,
    output_tokens: int,
    *,
    cache_creation_tokens: int = 0,
    cache_read_tokens: int = 0,
) -> float:
    """USD cost for one AI call.

    Anthropic prompt caching changes the input pricing:
      - cache_creation_input_tokens: 1.25× the base input rate (one-time write)
      - cache_read_input_tokens:     0.10× the base input rate (cheap re-use)
    `input_tokens` from the SDK is the *uncached* portion only — it does
    NOT double-count the cache fields. We sum all three at their
    respective rates so cost matches what Anthropic actually bills.
    """
    rate = COST_PER_MTOK.get(model)
    if not rate:
        # Strip any version suffix like "-20251001" and retry the lookup.
        base = model.rsplit("-", 1)[0] if "-" in model else model
        rate = COST_PER_MTOK.get(base, (0.0, 0.0))
    in_rate, out_rate = rate
    in_cost = (input_tokens / 1_000_000.0) * in_rate
    cache_create_cost = (cache_creation_tokens / 1_000_000.0) * in_rate * 1.25
    cache_read_cost = (cache_read_tokens / 1_000_000.0) * in_rate * 0.10
    out_cost = (output_tokens / 1_000_000.0) * out_rate
    return round(in_cost + cache_create_cost + cache_read_cost + out_cost, 6)


@dataclass
class PhaseTiming:
    name: str
    start: float
    duration_ms: float = 0.0


@dataclass
class AICallRecord:
    model: str
    purpose: str
    input_tokens: int
    output_tokens: int
    duration_ms: float
    cost_usd: float


@dataclass
class PipelineMetrics:
    session_id: str
    run_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    pipeline_kind: str = "wireframe"
    started_at: float = field(default_factory=time.perf_counter)
    phases: list[PhaseTiming] = field(default_factory=list)
    ai_calls: list[AICallRecord] = field(default_factory=list)
    extra: dict[str, Any] = field(default_factory=dict)
    # Optional callback invoked after every record_ai_call, with the current
    # summary() dict. Lets the pipeline broadcast progress over WebSocket so
    # the Debug drawer updates live (cost, tokens, phases) instead of waiting
    # for the final emit().
    on_call_recorded: Callable[[dict[str, Any]], None] | None = None

    @contextmanager
    def phase(self, name: str):
        timing = PhaseTiming(name=name, start=time.perf_counter())
        try:
            yield timing
        finally:
            timing.duration_ms = (time.perf_counter() - timing.start) * 1000
            self.phases.append(timing)

    def record_ai_call(
        self,
        *,
        model: str,
        purpose: str,
        input_tokens: int,
        output_tokens: int,
        duration_ms: float = 0.0,
        cache_creation_tokens: int = 0,
        cache_read_tokens: int = 0,
    ) -> None:
        cost = cost_for(
            model,
            input_tokens,
            output_tokens,
            cache_creation_tokens=cache_creation_tokens,
            cache_read_tokens=cache_read_tokens,
        )
        self.ai_calls.append(
            AICallRecord(
                model=model,
                purpose=purpose,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                duration_ms=duration_ms,
                cost_usd=cost,
            )
        )
        if self.on_call_recorded is not None:
            try:
                self.on_call_recorded(self.summary())
            except Exception:  # noqa: BLE001
                # Progress broadcast must never break the pipeline.
                pass

    def set(self, key: str, value: Any) -> None:
        """Attach an arbitrary attribute (screen count, kind breakdown, recipe…)."""
        self.extra[key] = value

    def summary(self) -> dict[str, Any]:
        total_ms = (time.perf_counter() - self.started_at) * 1000
        total_input = sum(c.input_tokens for c in self.ai_calls)
        total_output = sum(c.output_tokens for c in self.ai_calls)
        total_cost = round(sum(c.cost_usd for c in self.ai_calls), 6)
        per_model: dict[str, dict[str, Any]] = {}
        for c in self.ai_calls:
            row = per_model.setdefault(
                c.model,
                {"calls": 0, "input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0, "duration_ms": 0.0},
            )
            row["calls"] += 1
            row["input_tokens"] += c.input_tokens
            row["output_tokens"] += c.output_tokens
            row["cost_usd"] = round(row["cost_usd"] + c.cost_usd, 6)
            row["duration_ms"] += c.duration_ms
        return {
            "run_id": self.run_id,
            "session_id": self.session_id,
            "pipeline_kind": self.pipeline_kind,
            "total_ms": round(total_ms, 1),
            "total_input_tokens": total_input,
            "total_output_tokens": total_output,
            "total_cost_usd": total_cost,
            "phases": [{"name": p.name, "duration_ms": round(p.duration_ms, 1)} for p in self.phases],
            "per_model": per_model,
            "ai_call_count": len(self.ai_calls),
            **self.extra,
        }

    _emitted: bool = False

    def emit(self, logger_obj: logging.Logger) -> dict[str, Any]:
        # Idempotent — early-return paths and the finally fallback both
        # call emit; we only want one log line per pipeline run.
        if self._emitted:
            return self.summary()
        self._emitted = True
        s = self.summary()
        logger_obj.info("[PIPELINE_METRICS] %s", json.dumps(s, default=str))
        return s
