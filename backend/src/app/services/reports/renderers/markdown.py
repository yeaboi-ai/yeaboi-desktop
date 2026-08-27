"""Render a Report as a Markdown document — used for the on-demand download
button and as the preferred Slack attachment format (small, diff-friendly)."""

from __future__ import annotations

from ..model import RenderedReport, Report
from .base import get_jinja_env, safe_filename


def render_markdown(report: Report) -> RenderedReport:
    env = get_jinja_env()
    template = env.get_template("report.md.j2")
    body = template.render(report=report)
    return RenderedReport(
        content=body.encode("utf-8"),
        mimetype="text/markdown",
        filename=safe_filename(report.scope.label, ext="md"),
    )
