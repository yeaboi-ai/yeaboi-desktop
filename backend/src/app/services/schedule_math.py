"""Compute the next fire time for a simple-frequency subscription.

We deliberately avoid pulling in a cron parser for this — the user-confirmed
schedule model is daily / weekly / monthly with a fixed time-of-day, which
fits comfortably in straightforward datetime math. Stored times are wall
clock in the configured IANA timezone; we convert to UTC for next_run_at."""

from __future__ import annotations

from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

VALID_FREQUENCIES = ("daily", "weekly", "monthly")


def _parse_time_of_day(s: str) -> time:
    hh, mm = s.split(":", 1)
    return time(int(hh), int(mm))


def _last_day_of_month(year: int, month: int) -> int:
    """Days-in-month helper without pulling in calendar."""
    if month == 12:
        next_first = datetime(year + 1, 1, 1)
    else:
        next_first = datetime(year, month + 1, 1)
    return (next_first - timedelta(days=1)).day


def _set_dom(dt: datetime, dom: int) -> datetime:
    """Return *dt* with day-of-month replaced by `dom`, clamped to the
    month's actual length so 'day_of_month=31' on Feb falls to 28/29."""
    last = _last_day_of_month(dt.year, dt.month)
    return dt.replace(day=min(dom, last))


def compute_next_run(
    *,
    frequency: str,
    schedule_config: dict,
    after: datetime,
) -> datetime | None:
    """Return the next firing time strictly after *after* (UTC)."""
    if frequency not in VALID_FREQUENCIES:
        return None
    tz_name = schedule_config.get("timezone") or "UTC"
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = UTC
    tod_str = schedule_config.get("time_of_day") or "09:00"
    try:
        tod = _parse_time_of_day(tod_str)
    except Exception:
        tod = time(9, 0)

    after_tz = after.astimezone(tz) if after.tzinfo else after.replace(tzinfo=UTC).astimezone(tz)

    if frequency == "daily":
        candidate = after_tz.replace(hour=tod.hour, minute=tod.minute, second=0, microsecond=0)
        while candidate <= after_tz:
            candidate += timedelta(days=1)

    elif frequency == "weekly":
        dow = int(schedule_config.get("day_of_week", 0))  # 0=Mon
        candidate = after_tz.replace(hour=tod.hour, minute=tod.minute, second=0, microsecond=0)
        while candidate.weekday() != dow or candidate <= after_tz:
            candidate += timedelta(days=1)

    else:  # monthly
        dom_raw = schedule_config.get("day_of_month", 1)
        if dom_raw == "last":
            target = _last_day_of_month(after_tz.year, after_tz.month)
        else:
            target = int(dom_raw)
        candidate = after_tz.replace(hour=tod.hour, minute=tod.minute, second=0, microsecond=0)
        candidate = _set_dom(candidate, target)
        if candidate <= after_tz:
            year, month = (candidate.year + 1, 1) if candidate.month == 12 else (candidate.year, candidate.month + 1)
            candidate = candidate.replace(year=year, month=month)
            if dom_raw == "last":
                target = _last_day_of_month(year, month)
            candidate = _set_dom(candidate, target)

    return candidate.astimezone(UTC)
