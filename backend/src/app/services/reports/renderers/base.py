"""Shared rendering helpers — currency formatting, filename, Jinja env."""

from __future__ import annotations

from decimal import Decimal

from jinja2 import Environment, PackageLoader, select_autoescape


def format_usd(value: Decimal | float | int) -> str:
    """USD with two decimals, comma thousands. Used inside Jinja templates."""
    if value is None:
        return "$0.00"
    if isinstance(value, Decimal):
        v = float(value)
    else:
        v = float(value)
    sign = "-" if v < 0 else ""
    return f"{sign}${abs(v):,.2f}"


def format_pct(value: float | int | None, *, fraction_digits: int = 0) -> str:
    if value is None:
        return "—"
    return f"{value:.{fraction_digits}f}%"


def safe_filename(scope_label: str, *, ext: str) -> str:
    """Turn a scope label into a filename-safe slug + extension."""
    slug = "".join(c if c.isalnum() or c in "-_" else "-" for c in scope_label.lower())
    while "--" in slug:
        slug = slug.replace("--", "-")
    return f"analytics-{slug.strip('-')}.{ext}"


def get_jinja_env() -> Environment:
    """Jinja env loaded from the templates package directory.

    PackageLoader keeps templates next to the renderer code so they ship
    with the wheel; no separate static-files mount needed."""
    env = Environment(
        loader=PackageLoader("src.app.services.reports.renderers", "templates"),
        autoescape=select_autoescape(default=True, default_for_string=True),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.filters["usd"] = format_usd
    env.filters["pct"] = format_pct
    return env
