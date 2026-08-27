from src.app.services.wireframe_sanitizer import sanitize_wireframe_html


def _ds(**colours):
    """Helper: build a minimal design_system with given palette."""
    return {"colors": {key: {"hex": hex_val, "name": key.title(), "usage": ""} for key, hex_val in colours.items()}}


def test_replaces_inline_hex_with_nearest_var():
    ds = _ds(background="#000000", text="#ffffff", accent="#f59e0b")
    html = '<div style="color:#f59e0b">hi</div>'
    out = sanitize_wireframe_html(html, ds)
    assert "var(--color-accent)" in out
    assert "#f59e0b" not in out


def test_keeps_layout_properties_untouched():
    ds = _ds(background="#000000", text="#ffffff", accent="#f59e0b")
    html = '<div style="display:flex;padding:12px;color:#f59e0b">x</div>'
    out = sanitize_wireframe_html(html, ds)
    assert "display:flex" in out
    assert "padding:12px" in out
    assert "var(--color-accent)" in out


def test_handles_single_quoted_style_attrs():
    ds = _ds(background="#000000", text="#ffffff", accent="#f59e0b")
    html = "<div style='color:#f59e0b'>x</div>"
    out = sanitize_wireframe_html(html, ds)
    assert "var(--color-accent)" in out


def test_replaces_rgb_values():
    ds = _ds(background="#000000", text="#ffffff", accent="#f59e0b")
    html = '<div style="color:rgb(245, 158, 11)">x</div>'
    out = sanitize_wireframe_html(html, ds)
    assert "var(--color-accent)" in out


def test_replaces_rgba_values():
    ds = _ds(background="#000000", text="#ffffff", accent="#f59e0b")
    html = '<div style="background:rgba(245, 158, 11, 0.5)">x</div>'
    out = sanitize_wireframe_html(html, ds)
    assert "var(--color-accent)" in out


def test_short_hex_supported():
    ds = _ds(background="#000000", text="#ffffff", accent="#fff")
    # #fff should map to text (#ffffff exact)
    html = '<div style="color:#fff">x</div>'
    out = sanitize_wireframe_html(html, ds)
    assert "var(--color-text)" in out


def test_no_palette_returns_input_unchanged():
    html = '<div style="color:#f59e0b">x</div>'
    assert sanitize_wireframe_html(html, {}) == html
    assert sanitize_wireframe_html(html, None) == html


def test_distant_colour_maps_to_closest():
    ds = _ds(background="#0a0a0a", text="#e8e8e8", accent="#f59e0b")
    # #ff0000 is closest to accent (#f59e0b) among the three options
    html = '<div style="color:#ff0000">x</div>'
    out = sanitize_wireframe_html(html, ds)
    assert "var(--color-accent)" in out


def test_multiple_colours_in_one_attr():
    ds = _ds(background="#0a0a0a", text="#e8e8e8", accent="#f59e0b")
    html = '<div style="color:#e8e8e8;background:#0a0a0a;border:1px solid #f59e0b">x</div>'
    out = sanitize_wireframe_html(html, ds)
    assert "var(--color-text)" in out
    assert "var(--color-bg)" in out
    assert "var(--color-accent)" in out
    assert "#" not in out  # all hex gone


def test_named_colour_replacement():
    ds = _ds(background="#000000", text="#ffffff", accent="#f59e0b")
    html = '<div style="color:white">x</div>'
    out = sanitize_wireframe_html(html, ds)
    # 'white' should map closest to text (#ffffff)
    assert "var(--color-text)" in out


def test_handles_string_palette_entries():
    """Older payloads or design overrides may pass plain hex strings."""
    ds = {"colors": {"accent": "#f59e0b", "background": "#000000", "text": "#ffffff"}}
    html = '<div style="color:#f59e0b">x</div>'
    out = sanitize_wireframe_html(html, ds)
    assert "var(--color-accent)" in out


def test_preserves_html_outside_style_attrs():
    ds = _ds(background="#000000", text="#ffffff", accent="#f59e0b")
    # #f59e0b appearing outside a style attr (e.g. text content) stays.
    html = '<div data-original-color="#f59e0b" style="color:#f59e0b">#f59e0b</div>'
    out = sanitize_wireframe_html(html, ds)
    # Inside style: replaced
    assert "color:var(--color-accent)" in out
    # Outside style: untouched
    assert 'data-original-color="#f59e0b"' in out
    assert ">#f59e0b</div>" in out


def test_ignores_html_with_no_style_attrs():
    ds = _ds(background="#000000", text="#ffffff", accent="#f59e0b")
    html = "<div>just text</div>"
    assert sanitize_wireframe_html(html, ds) == html


def test_empty_input():
    assert sanitize_wireframe_html("", {"colors": {}}) == ""
    assert sanitize_wireframe_html(None, {"colors": {}}) is None  # type: ignore[arg-type]
