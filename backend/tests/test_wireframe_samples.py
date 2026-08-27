"""Tests for the live HTML samples loader + distiller.

The samples loader makes `design-library/samples/` the live source for
wireframe reference exemplars: a full HTML app is distilled to a compact
structural skeleton on read, and routed to screens via manifest keywords.
These tests pin the distillation contract (scripts stripped, size capped,
design tokens + structure preserved) and the routing (loan-ish briefs hit
the loans-ledger sample, unknown briefs fall back).
"""

from __future__ import annotations

from src.app.services import wireframe_samples
from src.app.services.wireframe_references import reference_block_for_screen
from src.app.services.wireframe_samples import (
    MAX_CHARS,
    distill_html,
    sample_block_for_screen,
)

_SAMPLE_HTML = """
<!doctype html>
<html><head><style>
:root { --accent: #d4a574; --bg: #0d0d0f; }
.kpi { padding: 12px; }
</style></head>
<body>
  <div class="topbar"><span>WAR</span><span>7.5%</span></div>
  <svg><path d="M40,170 C90,165 160,158 230,148 C300,138 370,118 440,98 C500,78 560,52 600,38"/></svg>
  <table><tbody>
    <tr><td>row 1</td></tr>
    <tr><td>row 2</td></tr>
    <tr><td>row 3</td></tr>
    <tr><td>row 4</td></tr>
    <tr><td>row 5</td></tr>
    <tr><td>row 6</td></tr>
  </tbody></table>
  <script>const x = 1; document.body.innerHTML = 'should be stripped';</script>
</body></html>
"""


def test_distill_strips_scripts():
    out = distill_html(_SAMPLE_HTML, "TEST")
    assert "<script" not in out.lower()
    assert "should be stripped" not in out


def test_distill_preserves_design_tokens_and_structure():
    out = distill_html(_SAMPLE_HTML, "TEST LABEL")
    assert "TEST LABEL" in out  # label header injected
    assert ":root" in out  # CSS custom props (palette) survive
    assert "--accent" in out
    assert "<table" in out  # structural skeleton survives


def test_distill_collapses_repeated_rows():
    out = distill_html(_SAMPLE_HTML, "TEST")
    # keep=3 for <tr>: first 3 kept, rest elided
    assert out.count("<tr") == 3
    assert "more tr rows" in out


def test_distill_keeps_chart_paths_but_trims_pathological_ones():
    # A normal chart curve is preserved so charts render WITH data (eliding it
    # used to teach the model to draw empty chart frames).
    out = distill_html(_SAMPLE_HTML, "TEST")
    assert "C300,138 370,118" in out
    assert "M0,0 …" not in out
    # A pathologically long path is truncated to a valid prefix.
    import re as _re

    huge_d = "M0,0 " + " ".join(f"L{i},{i % 50}" for i in range(400))
    huge_html = f'<body><svg viewBox="0 0 600 220"><path d="{huge_d}"/></svg></body>'
    kept = _re.search(r'd="([^"]*)"', distill_html(huge_html, "BIG")).group(1)
    assert len(kept) <= 220
    assert kept.startswith("M0,0")


def test_distilled_sample_includes_a_data_chart():
    import re as _re

    block = sample_block_for_screen("Dashboard Loans", "screen")
    assert block is not None
    assert "M0,0 …" not in block  # no degenerate elided paths
    # A large-viewBox chart and at least one real (long) data curve survive.
    assert 'viewBox="0 0 6' in block
    dpaths = _re.findall(r'd="([^"]*)"', block)
    assert any(len(d) > 50 for d in dpaths)


def test_distill_respects_max_chars():
    huge = "<body>" + ("<div>x</div>" * 50_000) + "</body>"
    out = distill_html(huge, "BIG")
    assert len(out) <= MAX_CHARS


def test_loan_screen_routes_to_sample():
    block = sample_block_for_screen("Loans", "screen")
    assert block is not None
    # label carries the finance header; market-stat strip carries WAR
    assert "FINANCE / RISK / OPS DASHBOARD" in block
    assert "WAR" in block
    assert "<script" not in block.lower()
    assert len(block) <= MAX_CHARS


def test_underwriting_and_portfolio_route_to_sample():
    assert sample_block_for_screen("Underwriting Queue", "screen") is not None
    assert sample_block_for_screen("Portfolio Overview", "screen") is not None


def test_unknown_screen_returns_none():
    assert sample_block_for_screen("Settings", "screen") is None
    assert sample_block_for_screen("Contact Form", "screen") is None


def test_generic_screen_name_routes_via_app_context():
    # A screen named "Dashboard" misses on its own, but a finance/debt app's
    # domain context routes it to the sample.
    assert sample_block_for_screen("Dashboard", "screen") is None
    block = sample_block_for_screen("Dashboard", "screen", app_context="Payoff — track student loan debt payoff")
    assert block is not None
    assert "FINANCE / RISK / OPS DASHBOARD" in block


def test_app_context_does_not_force_finance_on_unrelated_apps():
    # A generic SaaS app's dashboard stays unmatched (no finance bleed).
    assert sample_block_for_screen("Dashboard", "screen", app_context="Team project management workspace") is None


def test_reference_router_prefers_live_sample_for_loans():
    # The public entry point should now serve the distilled live sample for
    # loan briefs (still satisfying the finance-header contract).
    block = reference_block_for_screen("Loans", "screen")
    assert "FINANCE / RISK / OPS DASHBOARD" in block
    assert "WAR" in block


def test_reference_router_falls_back_when_no_sample():
    # Generic dashboard with no app context → inline Stripe/Linear reference.
    block = reference_block_for_screen("Dashboard", "screen")
    assert "DASHBOARD (Stripe / Linear / Mercury vibe)" in block
    assert "FINANCE / RISK / OPS DASHBOARD" not in block


def test_reference_router_uses_app_context_for_generic_screen():
    # Same "Dashboard" screen, but a debt-app domain context → finance sample.
    block = reference_block_for_screen("Dashboard", "screen", app_context="debt payoff loan tracker")
    assert "FINANCE / RISK / OPS DASHBOARD" in block
    assert "DASHBOARD (Stripe / Linear / Mercury vibe)" not in block


def test_distillation_is_cached_by_mtime():
    wireframe_samples._DISTILL_CACHE.clear()
    sample_block_for_screen("Loans", "screen")
    assert len(wireframe_samples._DISTILL_CACHE) == 1
    # second call hits cache (no new entry)
    sample_block_for_screen("Underwriting", "screen")
    assert len(wireframe_samples._DISTILL_CACHE) == 1
