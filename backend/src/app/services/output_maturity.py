"""Per-output-type blueprint maturity scoring.

Maturity = how ready is the blueprint to produce this output? 0-100.

The score uses a simple fill-ratio heuristic: count how many of the required
sections have substantive content (≥ 80 chars), divided by the number of
required sections. Good enough for a gauge; real gating happens elsewhere.
"""

from __future__ import annotations

_MIN_SUBSTANTIVE_CHARS = 80

_REQUIRED_SECTIONS: dict[str, list[str]] = {
    "code_scaffold": ["tech_stack", "architecture", "infrastructure"],
    "design_bundle": ["ui_ux"],
    "terraform_stack": ["infrastructure", "tech_stack"],
    "decision_doc": ["project_overview", "goals_constraints", "out_of_scope"],
}


def maturity_for(output_type: str, blueprint: dict) -> int:
    """Return a 0-100 maturity score for producing `output_type` from `blueprint`."""
    required = _REQUIRED_SECTIONS.get(output_type)
    if not required:
        return 0
    filled = sum(
        1
        for section in required
        if len((blueprint.get(section) or "").strip()) >= _MIN_SUBSTANTIVE_CHARS
    )
    return int(round(100 * filled / len(required)))
