"""The facilitator prompt must no longer contain the retired 'Complete and Generate
Board' gatekeeping phrases, and must include the new `_RULES_OUTPUTS` block."""

from src.app.services.facilitator import _RULES_ABSOLUTE, _RULES_FACILITATION, _RULES_OUTPUTS, _RULES_STEERING


def test_retired_phrases_removed():
    combined = _RULES_FACILITATION + _RULES_ABSOLUTE + _RULES_STEERING
    for phrase in (
        "Complete and Generate Board",
        "NEVER suggest completing if the overall grade",
        "Only say 'Blueprint is looking solid'",
        "Blueprint is looking solid",
        "click Complete",
        "clicking Complete",
        "suggest clicking Complete",
    ):
        assert phrase not in combined, f"retired phrase still present: {phrase}"


def test_rules_outputs_mentions_each_type():
    for output_type in ("code scaffold", "design bundle", "Terraform stack", "decision doc"):
        assert output_type in _RULES_OUTPUTS, f"{output_type} missing from _RULES_OUTPUTS"


def test_rules_outputs_frames_as_options_not_gates():
    """The block must say outputs are available, not required."""
    assert "the user chooses" in _RULES_OUTPUTS.lower() or "user's choice" in _RULES_OUTPUTS.lower()
    assert "planning is continuous" in _RULES_OUTPUTS.lower()


def test_intent_aware_rule_present():
    """The facilitator prompt must describe the session_focus emission and
    tell the model to honour user-declared intent before gap-walking."""
    assert "session_focus" in _RULES_FACILITATION
    assert "user explicitly states" in _RULES_FACILITATION.lower()


def test_session_focus_emission_format_described():
    """The prompt must show an example of the session_focus block so the model
    can emit it correctly."""
    assert '```session_focus' in _RULES_FACILITATION
    assert '"sections"' in _RULES_FACILITATION
    assert '"reason"' in _RULES_FACILITATION
