"""Render a Report as a PDF via WeasyPrint.

WeasyPrint pulls native deps (cairo, pango, gdk-pixbuf) and isn't strictly
required to operate the platform — so we import lazily and surface a clear
error instead of crashing app startup when the wheel isn't present.
"""

from __future__ import annotations

import logging

from ..model import RenderedReport, Report
from .base import get_jinja_env, safe_filename

logger = logging.getLogger(__name__)


class PdfRendererUnavailable(RuntimeError):
    """Raised when WeasyPrint isn't installed. Callers should map this to a
    503 with a clear remediation message rather than letting it bubble as a
    500."""


def render_pdf(report: Report) -> RenderedReport:
    """Render *report* to PDF bytes. Raises PdfRendererUnavailable if
    WeasyPrint isn't importable in the current environment."""
    try:
        from weasyprint import HTML  # type: ignore[import-not-found]
    except ImportError as exc:
        raise PdfRendererUnavailable(
            "PDF reports require WeasyPrint. Install with `uv add weasyprint` "
            "and ensure native deps (cairo, pango) are present on the host."
        ) from exc

    env = get_jinja_env()
    template = env.get_template("report.html.j2")
    html = template.render(report=report)
    pdf_bytes: bytes = HTML(string=html).write_pdf()
    return RenderedReport(
        content=pdf_bytes,
        mimetype="application/pdf",
        filename=safe_filename(report.scope.label, ext="pdf"),
    )


def is_available() -> bool:
    """Cheap probe so callers can decide before construction whether PDF is
    on offer (e.g., to disable the PDF button in the UI)."""
    try:
        import weasyprint  # type: ignore[import-not-found]  # noqa: F401

        return True
    except ImportError:
        return False
