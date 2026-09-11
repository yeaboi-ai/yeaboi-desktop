"""Per-event Block Kit templates for Slack notifications.

``build_blocks_for_event(event_type, payload)`` is the public entry point; each
event type has its own ``_blocks_<event>`` private function. Adding a new event
type means registering it in ``EVENT_TYPES`` + writing the template.

Payload keys required by each template are documented on the template function.
Callers should supply those keys exactly. Missing keys fall back to sensible
placeholders so a bad caller never crashes the dispatcher.
"""

from __future__ import annotations

import json
from collections.abc import Callable

EVENT_TYPES: list[str] = [
    "scan_started", "scan_complete", "scan_partial", "scan_failed",
    "card_failed", "card_auto_approved", "pr_ready",
    "card_state_changed",
    "session_created", "session_completed", "session_deleted",
    "blueprint_iteration",
    "mention",
]


def _section(text: str) -> dict:
    return {"type": "section", "text": {"type": "mrkdwn", "text": text[:2900]}}


def _context(text: str) -> dict:
    return {"type": "context", "elements": [{"type": "mrkdwn", "text": text}]}


def _absolute_url(url: str | None) -> str | None:
    """Slack button URLs must be absolute — prefix relative paths with ``settings.app_url``."""
    if not url:
        return None
    if url.startswith(("http://", "https://")):
        return url
    from ..config import get_settings

    base = get_settings().app_url.rstrip("/")
    path = url if url.startswith("/") else f"/{url}"
    return f"{base}{path}"


def _button(text: str, action_id: str, style: str | None = None, url: str | None = None) -> dict:
    btn: dict = {"type": "button", "text": {"type": "plain_text", "text": text}, "action_id": action_id}
    if style:
        btn["style"] = style
    absolute = _absolute_url(url)
    if absolute:
        btn["url"] = absolute
    return btn


def _actions(buttons: list[dict]) -> dict:
    return {"type": "actions", "elements": buttons}


# -- Scan events --------------------------------------------------------------

def _blocks_scan_started(p: dict) -> list:
    return [
        _section(f":mag: *{p.get('title', 'Scan started')}*"),
        _context(f"_yeaboi · {p.get('provider_label', '?')} scan_"),
    ]


def _blocks_scan_complete(p: dict) -> list:
    stats = p.get("stats") or {}
    stat_line = " • ".join(f"{k}: {v}" for k, v in stats.items())
    return [
        _section(f":white_check_mark: *{p.get('title', 'Scan complete')}*"),
        _section(stat_line or "_no stats_"),
        _context(f"_yeaboi · {p.get('provider_label', '?')} scan_"),
    ]


def _blocks_scan_partial(p: dict) -> list:
    return [
        _section(f":warning: *{p.get('title', 'Scan finished with warnings')}*"),
        _section(p.get("failure_summary") or p.get("body") or ""),
        _context(f"_yeaboi · {p.get('provider_label', '?')} scan_"),
    ]


def _blocks_scan_failed(p: dict) -> list:
    return [
        _section(f":x: *{p.get('title', 'Scan failed')}*"),
        _section(f"`{p.get('error') or p.get('body') or 'unknown error'}`"),
        _context(f"_yeaboi · {p.get('provider_label', '?')} scan_"),
    ]


# -- Orchestrator events ------------------------------------------------------

def _blocks_card_failed(p: dict) -> list:
    card_id = p.get("card_id", "")
    return [
        _section(f":rotating_light: *Card failed:* {p.get('card_title', '?')}"),
        _section(f"```{(p.get('error') or 'unknown error')[:400]}```"),
        _actions([
            _button("Retry", "card_failed:retry", style="primary"),
            _button("Mark done anyway", "card_failed:mark_done"),
            _button("View card", "noop", url=f"/sessions/{p.get('session_id', '')}/orchestrator?card={card_id}"),
        ]),
    ]


def _blocks_card_auto_approved(p: dict) -> list:
    return [_section(f":white_check_mark: *Auto-approved:* {p.get('card_title', '?')}")]


def _blocks_pr_ready(p: dict) -> list:
    return [
        _section(f":page_facing_up: *PR ready:* {p.get('card_title', '?')}"),
        _actions([
            _button("Approve & merge", "pr_ready:approve", style="primary"),
            _button("Leave comment", "pr_ready:comment"),
            _button("Open in GitHub", "noop", url=p.get("pr_url") or "https://github.com"),
        ]),
    ]


# -- Board events -------------------------------------------------------------

def _blocks_card_state_changed(p: dict) -> list:
    return [
        _section(
            f":arrows_counterclockwise: *{p.get('card_title', '?')}* moved "
            f"{p.get('from_state', '?')} → {p.get('to_state', '?')}"
        ),
    ]


# -- Session events -----------------------------------------------------------

def _blocks_session_created(p: dict) -> list:
    return [_section(f":sparkles: *New session:* {p.get('title', '?')}")]


def _blocks_session_completed(p: dict) -> list:
    return [
        _section(f":checkered_flag: *Session completed:* {p.get('title', '?')}"),
        _section(p.get("summary") or "_no summary_"),
        _actions([
            _button("Acknowledge", "session_completed:ack"),
            _button("Open session", "noop", url=f"/sessions/{p.get('session_id', '')}"),
        ]),
    ]


def _blocks_session_deleted(p: dict) -> list:
    return [_section(f":wastebasket: *Session deleted:* {p.get('title', '?')}")]


# -- Blueprint events ---------------------------------------------------------

def _blocks_blueprint_iteration(p: dict) -> list:
    return [
        _section(
            f":memo: *Blueprint update* ({p.get('iteration_type', 'update')}) "
            f"by {p.get('author_name', '?')}"
        ),
    ]


# -- Mentions -----------------------------------------------------------------

def _blocks_mention(p: dict) -> list:
    return [
        _section(
            f":bust_in_silhouette: *{p.get('mentioned_user_name', 'You')}* was mentioned on "
            f"{p.get('source_type', 'resource')} *{p.get('source_title', '?')}*"
        ),
        _actions([_button("Open in yeaboi", "noop", url=p.get("source_url") or "/")]),
    ]


_REGISTRY: dict[str, Callable[[dict], list]] = {
    "scan_started": _blocks_scan_started,
    "scan_complete": _blocks_scan_complete,
    "scan_partial": _blocks_scan_partial,
    "scan_failed": _blocks_scan_failed,
    "card_failed": _blocks_card_failed,
    "card_auto_approved": _blocks_card_auto_approved,
    "pr_ready": _blocks_pr_ready,
    "card_state_changed": _blocks_card_state_changed,
    "session_created": _blocks_session_created,
    "session_completed": _blocks_session_completed,
    "session_deleted": _blocks_session_deleted,
    "blueprint_iteration": _blocks_blueprint_iteration,
    "mention": _blocks_mention,
}


def build_blocks_for_event(event_type: str, payload: dict) -> list:
    """Return Block Kit for the event type; unknown types get a minimal fallback."""
    builder = _REGISTRY.get(event_type)
    if builder is None:
        return [_section(f"yeaboi event: `{event_type}`")]
    return builder(payload)


def session_created_block(
    *,
    slack_user_id: str,
    title: str,
    continues_from: str,
    session_url: str,
) -> list[dict]:
    """Block Kit message announcing a new session with a clickable link."""
    return [
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": (
                    f":spiral_note_pad: *<@{slack_user_id}>* created a session: *{title}*\n"
                    f"Continuing *{continues_from}*"
                ),
            },
        },
        {
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "style": "primary",
                    "text": {"type": "plain_text", "text": "Open session →"},
                    "url": session_url,
                    "action_id": "session_open_link",
                }
            ],
        },
    ]


def over_session_limit_block(*, sessions_url: str) -> list[dict]:
    """Ephemeral block when the picker would have more than 10 entries."""
    return [
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": (
                    ":warning: Your org has more than 10 active sessions — "
                    "please pick one in the web app."
                ),
            },
        },
        {
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "Open yeaboi →"},
                    "url": sessions_url,
                    "action_id": "session_open_sessions_list",
                }
            ],
        },
    ]


def session_picker_block(
    *,
    title: str,
    sessions: list[dict],
    source: str = "slash",
) -> list[dict]:
    """Block Kit picker — one button per candidate session (max 10).

    ``source`` is tagged into each button's ``value`` so the action handler
    knows whether to delete the picker message after a click. Use ``"mention"``
    for a publicly-posted picker (regular chat.postMessage) so the handler can
    remove it via ``chat.delete`` once a choice is made. Use ``"slash"`` for
    ephemerals — those are cleared via ``response_action`` instead.
    """
    elements = [
        {
            "type": "button",
            "text": {"type": "plain_text", "text": p["name"][:75]},
            # Slack requires unique action_ids within a single message —
            # suffix with the index so the dispatcher still matches via
            # startswith("session_create_pick").
            "action_id": f"session_create_pick:{i}",
            "value": json.dumps(
                {"session_id": p["id"], "title": title, "source": source}
            ),
        }
        for i, p in enumerate(sessions[:10])
    ]
    return [
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f":thinking_face: Which session should *{title}* continue?",
            },
        },
        {"type": "actions", "elements": elements},
    ]


def title_for_event(event_type: str, payload: dict) -> str:
    """A plain-text fallback title (Slack requires ``text`` alongside ``blocks``)."""
    if event_type == "card_failed":
        return f"Card failed: {payload.get('card_title', '?')}"
    if event_type == "pr_ready":
        return f"PR ready: {payload.get('card_title', '?')}"
    if event_type.startswith("session_"):
        return f"Session {event_type.split('_', 1)[1]}: {payload.get('title', '?')}"
    if event_type.startswith("scan_"):
        return payload.get("title") or f"Slack {event_type}"
    return f"yeaboi {event_type}"
