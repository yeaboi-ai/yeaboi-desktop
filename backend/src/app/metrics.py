"""Centralized Prometheus metric definitions.

Import individual metrics where needed — all are registered in the default
CollectorRegistry and exposed via the ``/metrics`` endpoint in ``main.py``.
"""

from prometheus_client import Counter, Gauge, Histogram

# ---------------------------------------------------------------------------
# HTTP request metrics
# ---------------------------------------------------------------------------
REQUEST_COUNT = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status"],
)
REQUEST_LATENCY = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "endpoint"],
)

# ---------------------------------------------------------------------------
# Database metrics
# ---------------------------------------------------------------------------
DB_QUERY_COUNT = Counter("db_queries_total", "Total database queries executed")
DB_QUERY_LATENCY = Histogram(
    "db_query_duration_seconds",
    "Database query latency in seconds",
)

# ---------------------------------------------------------------------------
# WebSocket metrics
# ---------------------------------------------------------------------------
WS_CONNECTIONS = Gauge(
    "ws_active_connections",
    "Active WebSocket connections",
    ["type"],
)
WS_BROADCAST_LATENCY = Histogram(
    "ws_broadcast_duration_seconds",
    "WebSocket broadcast latency in seconds",
    ["type"],
)

# ---------------------------------------------------------------------------
# AI provider metrics
# ---------------------------------------------------------------------------
AI_CALL_COUNT = Counter(
    "ai_calls_total",
    "Total AI provider calls",
    ["provider", "model"],
)
AI_CALL_LATENCY = Histogram(
    "ai_call_duration_seconds",
    "AI provider call latency in seconds",
    ["provider", "model"],
)
AI_RETRY_COUNT = Counter(
    "ai_retries_total",
    "Total AI provider call retries (transient errors that triggered a backoff retry)",
    ["provider", "attempt"],
)
AI_FAILOVER_COUNT = Counter(
    "ai_failovers_total",
    "Total successful AI provider failovers — primary unhealthy, backup served the request",
    ["role", "from_provider", "to_provider"],
)
AI_HOURLY_BURN_ALARM_COUNT = Counter(
    "ai_hourly_burn_alarm_total",
    "Times the rolling-1h spend tripwire fired for a (provider, scope) pair",
    ["provider", "scope"],
)

# ---------------------------------------------------------------------------
# Orchestrator metrics
# ---------------------------------------------------------------------------
ORCHESTRATOR_ACTIVE = Gauge(
    "orchestrator_active",
    "Number of actively running orchestrators",
)
ORCHESTRATOR_CARDS = Counter(
    "orchestrator_cards_total",
    "Total cards processed by the orchestrator",
    ["status"],
)
ORCHESTRATOR_STAGE_LATENCY = Histogram(
    "orchestrator_stage_duration_seconds",
    "Orchestrator stage duration in seconds",
    ["stage"],
)
