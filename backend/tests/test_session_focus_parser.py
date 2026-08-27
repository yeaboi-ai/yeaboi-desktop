from src.app.services.facilitator import _extract_session_focus


def test_no_block_returns_none():
    text = "Just a regular response. No special blocks."
    focus, stripped = _extract_session_focus(text)
    assert focus is None
    assert stripped == text


def test_valid_block_extracted():
    text = (
        "Got it. I'll narrow down to UI planning.\n"
        '```session_focus\n{"sections": ["ui_ux"], "reason": "user asked for UI only"}\n```\n'
        "Let's talk about the main screens."
    )
    focus, stripped = _extract_session_focus(text)
    assert focus == ["ui_ux"]
    assert "session_focus" not in stripped
    assert "UI planning" in stripped
    assert "main screens" in stripped


def test_invalid_section_filtered():
    text = (
        '```session_focus\n'
        '{"sections": ["ui_ux", "not_a_real_section"], "reason": "x"}\n'
        '```'
    )
    focus, _ = _extract_session_focus(text)
    assert focus == ["ui_ux"]


def test_empty_list_resets_scope():
    text = '```session_focus\n{"sections": [], "reason": "widen"}\n```'
    focus, _ = _extract_session_focus(text)
    assert focus == []


def test_malformed_json_ignored():
    text = '```session_focus\n{not valid json}\n```'
    focus, stripped = _extract_session_focus(text)
    assert focus is None
    assert "session_focus" not in stripped


def test_last_block_wins():
    text = (
        '```session_focus\n{"sections": ["ui_ux"], "reason": "first"}\n```\n'
        'Middle text.\n'
        '```session_focus\n{"sections": ["infrastructure"], "reason": "second"}\n```'
    )
    focus, _ = _extract_session_focus(text)
    assert focus == ["infrastructure"]
