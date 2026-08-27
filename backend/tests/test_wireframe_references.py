"""Tests for the per-screen reference exemplar router.

These references are injected into both the legacy generation path AND
the hero pass (the latter as structural skeleton). Loan / underwriting /
portfolio briefs MUST route to the finance dashboard reference — the
whole point of the hero-skeleton injection is to anchor those briefs to
the Bloomberg / Apex density patterns instead of letting the model
invent a generic dashboard.
"""

from __future__ import annotations

from src.app.services.wireframe_references import (
    reference_block_for_screen,
)


def test_loans_screen_routes_to_finance_reference():
    block = reference_block_for_screen("Loans", "screen")
    assert "FINANCE / RISK / OPS DASHBOARD" in block
    assert "WAR" in block  # market-stat strip is the unique fingerprint


def test_underwriting_screen_routes_to_finance_reference():
    block = reference_block_for_screen("Underwriting Queue", "screen")
    assert "FINANCE / RISK / OPS DASHBOARD" in block


def test_portfolio_screen_routes_to_finance_reference():
    block = reference_block_for_screen("Portfolio Overview", "screen")
    assert "FINANCE / RISK / OPS DASHBOARD" in block


def test_dashboard_without_finance_keyword_routes_to_generic_dashboard():
    """A vanilla 'Dashboard' brief gets the Stripe/Linear/Mercury reference,
    NOT the finance one — the finance reference is reserved for loan-ish
    briefs to avoid bleeding Bloomberg-terminal vibes into every dashboard."""
    block = reference_block_for_screen("Dashboard", "screen")
    assert "DASHBOARD (Stripe / Linear / Mercury vibe)" in block
    assert "FINANCE / RISK / OPS DASHBOARD" not in block


def test_landing_kind_routes_to_landing_reference():
    block = reference_block_for_screen("Home", "landing")
    assert "EDITORIAL LANDING PAGE" in block


def test_unknown_screen_returns_empty():
    """Vanilla CRUD list / form screens get no reference — the design_block
    guidance is enough and a reference would crowd the prompt."""
    block = reference_block_for_screen("Settings", "screen")
    assert block == ""
