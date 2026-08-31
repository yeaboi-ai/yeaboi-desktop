#!/usr/bin/env python3
"""Render the Agents world's robo mascot from the app's own pixel duck.

The robo is never drawn from scratch — it is the brand duck recoloured, the
same law the TUI applies (src/yeaboi/ui/shared/_mascot.py in yeaboi.ai): the
plumage becomes steel, the shades' white shine becomes a cyan LED, and an
antenna grows from the crown. The source layers are the vendored design
package's 128px sprite — the very pixels ``DuckMark`` draws — remapped
pixel-for-pixel with no resampling, so the two mascots are equally crisp at
every size they share.

**Not a build step.** This repo has no Python environment; Pillow arrives for
the length of one command. The output is committed and CI never re-renders it,
so ``--check`` asserts structure — the file exists with the right dimensions —
and never bytes. ``test/robo-sprites.test.ts`` runs the same assertions in the
ordinary lane, with no Python at all.

Usage::

    make robo
    uv run --with pillow --no-project python scripts/gen_robo_sprites.py --check
"""

from __future__ import annotations

import argparse
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "node_modules" / "@yeaboi-ai" / "design" / "assets" / "duck"
OUT = ROOT / "src" / "renderer" / "assets" / "brand"
ROBO = "robo.png"

#: The design package's sprite canvas.
SOURCE_SIZE = (128, 136)
#: Extra rows above the art for the antenna (stem + bulb + a margin).
HEADROOM = 22

#: The TUI robo's own palette (ROBO_PALETTE in _mascot.py).
STEEL_LIGHT = (140, 160, 178)
STEEL_DARK = (88, 104, 122)
CYAN = (90, 200, 230)
OUTLINE = (2, 4, 7)  # the sprite's own outline navy

#: Luminance band the steel ramp interpolates across.
LUM_LOW = 60
LUM_HIGH = 200
#: Glasses pixels at least this bright are the shine the TUI maps W -> V.
SHINE_LUM = 180

#: Antenna geometry at sprite scale.
STEM_WIDTH = 4
STEM_RISE = 9
BULB = 5
#: The crown's centre column in the source art.
ANTENNA_X = 39


def _steel(pixel: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    """A plumage pixel mapped onto the steel ramp by its own luminance."""
    r, g, b, a = pixel
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    t = min(1.0, max(0.0, (lum - LUM_LOW) / (LUM_HIGH - LUM_LOW)))
    return (
        round(STEEL_DARK[0] + (STEEL_LIGHT[0] - STEEL_DARK[0]) * t),
        round(STEEL_DARK[1] + (STEEL_LIGHT[1] - STEEL_DARK[1]) * t),
        round(STEEL_DARK[2] + (STEEL_LIGHT[2] - STEEL_DARK[2]) * t),
        a,
    )


def _is_plumage(pixel: tuple[int, int, int, int]) -> bool:
    """The teal-to-mint feather range: green ahead of red, and not blue-led.

    Excludes the navy outline (blue-led, near-black), the amber bill and feet
    (red ahead of green), and the white belly (no green lead).
    """
    r, g, b, a = pixel
    return a > 0 and g > r + 15 and b < g + 25


def _recolour_body(img):
    data = [_steel(p) if _is_plumage(p) else p for p in img.getdata()]
    img.putdata(data)
    return img


def _recolour_shine(img):
    """The shades' white shine pixels -> the cyan LED, the TUI's W -> V."""
    out = []
    for r, g, b, a in img.getdata():
        lum = 0.299 * r + 0.587 * g + 0.114 * b
        out.append((*CYAN, a) if a > 0 and lum >= SHINE_LUM else (r, g, b, a))
    img.putdata(out)
    return img


def _crown_top(img) -> int:
    """The first inked row in the antenna column, so the stem always roots in
    the head regardless of how the art shifts."""
    alpha = img.getchannel("A")
    for y in range(img.height):
        if alpha.getpixel((ANTENNA_X, y)) > 0:
            return y
    raise SystemExit(f"no opaque pixel in column {ANTENNA_X}; the art moved")


def robo():
    from PIL import Image, ImageDraw

    staged = Image.new("RGBA", sprite_size(), (0, 0, 0, 0))
    body = Image.alpha_composite(
        Image.open(SRC / "base.png").convert("RGBA"),
        Image.open(SRC / "wing.png").convert("RGBA"),
    )
    staged.alpha_composite(_recolour_body(body), (0, HEADROOM))
    staged.alpha_composite(_recolour_shine(Image.open(SRC / "glasses.png").convert("RGBA")), (0, HEADROOM))

    top = _crown_top(staged)
    d = ImageDraw.Draw(staged)
    stem_left = ANTENNA_X - STEM_WIDTH // 2
    bulb_top = top - STEM_RISE - 2 * BULB
    d.rectangle((stem_left, top - STEM_RISE, stem_left + STEM_WIDTH - 1, top + 2), fill=OUTLINE)
    d.ellipse(
        (ANTENNA_X - BULB, bulb_top, ANTENNA_X + BULB, bulb_top + 2 * BULB),
        fill=CYAN,
        outline=OUTLINE,
        width=2,
    )
    return staged


def sprite_size() -> tuple[int, int]:
    return (SOURCE_SIZE[0], SOURCE_SIZE[1] + HEADROOM)


def render() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    robo().save(OUT / ROBO)
    print(f"wrote {OUT.relative_to(ROOT) / ROBO}")


def _png_size(path: Path) -> tuple[int, int]:
    header = path.read_bytes()[:24]
    if header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR":
        raise SystemExit(f"{path} is not a PNG")
    w, h = struct.unpack(">II", header[16:24])
    return (w, h)


def check() -> None:
    expected = sprite_size()
    path = OUT / ROBO
    if not path.is_file():
        raise SystemExit(f"missing {path}; run `make robo`")
    if _png_size(path) != expected:
        raise SystemExit(f"{path} is {_png_size(path)}, expected {expected}; run `make robo`")
    print(f"robo sprite OK ({expected[0]}x{expected[1]})")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="assert the committed output's structure")
    args = parser.parse_args()
    check() if args.check else render()


if __name__ == "__main__":
    main()
