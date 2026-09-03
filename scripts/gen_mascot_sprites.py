#!/usr/bin/env python3
"""Render the mascot's derived sprites from the app's own pixel duck.

Nothing here is drawn from scratch. Every sprite is the vendored design
package's 128px duck — the very pixels ``DuckMark`` draws — remapped or
dressed pixel-for-pixel with no resampling, so the whole family is equally
crisp at every size it shares:

* ``robo.png`` — the Agents world's mascot, the TUI's own law (``_mascot.py``
  in yeaboi.ai): plumage to steel, the shades' shine to a cyan LED, an antenna
  from the crown.
* ``outfit-hardhat.png`` / ``outfit-ring.png`` — the two doors' kits as
  transparent layers the canvas rig stacks on the duck: the Projects duck's
  hard hat and the Sessions duck's swim ring, coloured only with the sprite's
  own bill amber, belly white and outline navy.
* ``robo-hardhat.png`` / ``robo-ring.png`` — the robo in each kit, flattened,
  the antenna rooted in whatever is now the top of its head.

**Not a build step.** This repo has no Python environment; Pillow arrives for
the length of one command. The output is committed and CI never re-renders it,
so ``--check`` asserts structure — each file exists with the right dimensions —
and never bytes. ``test/mascot-sprites.test.ts`` runs the same assertions in
the ordinary lane, with no Python at all.

Usage::

    make mascots
    uv run --with pillow --no-project python scripts/gen_mascot_sprites.py --check
"""

from __future__ import annotations

import argparse
import math
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "node_modules" / "@yeaboi-ai" / "design" / "assets" / "duck"
OUT = ROOT / "src" / "renderer" / "assets" / "brand"
ROBO = "robo.png"
OUTFITS = {"hardhat": "outfit-hardhat.png", "ring": "outfit-ring.png"}
DRESSED = {"hardhat": "robo-hardhat.png", "ring": "robo-ring.png"}

#: The design package's sprite canvas.
SOURCE_SIZE = (128, 136)
#: Extra rows above the art for the antenna (stem + bulb + a margin).
HEADROOM = 22
#: Extra rows above the art on the outfit layers and the dressed robos: the
#: hat's dome, and the antenna standing on it.
OUTFIT_HEADROOM = 40

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

#: Line weight of everything drawn here, matching the sprite's own outline.
STROKE = 2

#: The hard hat, in source coordinates (y < 0 is above the crown). The dome is
#: the top of an ellipse cut at the brim; the brim is a flat band wider than
#: the head, which is what says "hard hat" rather than "beanie".
HAT_DOME = (12, -18, 68, 26)
HAT_BRIM_Y = 8
HAT_BRIM = (4, HAT_BRIM_Y, 76, HAT_BRIM_Y + 6)
HAT_SHINE = (22, -9, 26, 0)

#: The swim ring: an elliptical band around the body's midriff, in four
#: alternating segments, the classic lifebuoy.
RING_CENTRE = (64, 98)
RING_OUTER = (64, 26)
RING_INNER = (46, 11)
RING_SEGMENTS = 4


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


def _pixels(img) -> list[tuple[int, int, int, int]]:
    return list(img.get_flattened_data()) if hasattr(img, "get_flattened_data") else list(img.getdata())


def _recolour_body(img):
    img.putdata([_steel(p) if _is_plumage(p) else p for p in _pixels(img)])
    return img


def _recolour_shine(img):
    """The shades' white shine pixels -> the cyan LED, the TUI's W -> V."""
    out = []
    for r, g, b, a in _pixels(img):
        lum = 0.299 * r + 0.587 * g + 0.114 * b
        out.append((*CYAN, a) if a > 0 and lum >= SHINE_LUM else (r, g, b, a))
    img.putdata(out)
    return img


def _crown_top(img) -> int:
    """The first inked row in the antenna column, so the stem always roots in
    the head — or the hat — regardless of how the art shifts."""
    alpha = img.getchannel("A")
    for y in range(img.height):
        if alpha.getpixel((ANTENNA_X, y)) > 0:
            return y
    raise SystemExit(f"no opaque pixel in column {ANTENNA_X}; the art moved")


def _layers():
    from PIL import Image

    return {name: Image.open(SRC / f"{name}.png").convert("RGBA") for name in ("base", "wing", "glasses")}


def _sprite_colours(base) -> tuple[tuple[int, int, int], tuple[int, int, int]]:
    """The bill's amber and the belly's white, the commonest of each in the
    art itself, so the kits never introduce a colour the duck does not wear."""
    from collections import Counter

    opaque = [(r, g, b) for r, g, b, a in _pixels(base) if a > 0]
    amber = Counter(p for p in opaque if p[0] > 200 and p[0] > p[1] + 40).most_common(1)
    white = Counter(p for p in opaque if min(p) > 200).most_common(1)
    if not amber or not white:
        raise SystemExit("could not find the bill amber or belly white in base.png; the art moved")
    return amber[0][0], white[0][0]


def _hardhat(amber, white):
    from PIL import Image, ImageDraw

    layer = Image.new("RGBA", outfit_size(), (0, 0, 0, 0))
    dome = Image.new("RGBA", outfit_size(), (0, 0, 0, 0))
    ImageDraw.Draw(dome).ellipse(_shift(HAT_DOME), fill=amber, outline=OUTLINE, width=STROKE)
    # Only the crown of the ellipse survives: everything under the brim goes.
    dome.paste((0, 0, 0, 0), (0, OUTFIT_HEADROOM + HAT_BRIM_Y, dome.width, dome.height))
    layer.alpha_composite(dome)
    d = ImageDraw.Draw(layer)
    d.rectangle(_shift(HAT_BRIM), fill=amber, outline=OUTLINE, width=STROKE)
    d.rectangle(_shift(HAT_SHINE), fill=white)
    return layer


def _ring(amber, white):
    from PIL import Image

    layer = Image.new("RGBA", outfit_size(), (0, 0, 0, 0))
    cx, cy = RING_CENTRE
    ox, oy = RING_OUTER
    ix, iy = RING_INNER

    def inside(dx: float, dy: float, rx: float, ry: float) -> bool:
        return (dx / rx) ** 2 + (dy / ry) ** 2 <= 1

    for y in range(layer.height):
        for x in range(layer.width):
            dx, dy = x - cx + 0.5, y - OUTFIT_HEADROOM - cy + 0.5
            if not inside(dx, dy, ox, oy) or inside(dx, dy, ix, iy):
                continue
            edge = not inside(dx, dy, ox - STROKE, oy - STROKE) or inside(dx, dy, ix + STROKE, iy + STROKE)
            angle = math.atan2(dy / oy, dx / ox) + math.pi
            segment = int(angle / (2 * math.pi / RING_SEGMENTS)) % 2
            layer.putpixel((x, y), (*OUTLINE, 255) if edge else (*(amber if segment else white), 255))
    return layer


def _shift(box: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    """A source-coordinate box onto the outfit canvas."""
    x0, y0, x1, y1 = box
    return (x0, y0 + OUTFIT_HEADROOM, x1, y1 + OUTFIT_HEADROOM)


def outfits():
    layers = _layers()
    amber, white = _sprite_colours(layers["base"])
    return {"hardhat": _hardhat(amber, white), "ring": _ring(amber, white)}


def robo(outfit=None, kit: str | None = None):
    """The robo: the recoloured layers stacked, a kit between or over them,
    and the antenna last, standing on whatever is now the top of the head."""
    from PIL import Image, ImageDraw

    headroom = OUTFIT_HEADROOM if outfit is not None else HEADROOM
    size = outfit_size() if outfit is not None else sprite_size()
    layers = _layers()
    staged = Image.new("RGBA", size, (0, 0, 0, 0))
    staged.alpha_composite(_recolour_body(layers["base"]), (0, headroom))
    # The ring sits under the wing, as a ring around a body does; the hat goes
    # over everything.
    if outfit is not None and kit == "ring":
        staged.alpha_composite(outfit)
    staged.alpha_composite(_recolour_body(layers["wing"]), (0, headroom))
    staged.alpha_composite(_recolour_shine(layers["glasses"]), (0, headroom))
    if outfit is not None and kit == "hardhat":
        staged.alpha_composite(outfit)

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


def outfit_size() -> tuple[int, int]:
    return (SOURCE_SIZE[0], SOURCE_SIZE[1] + OUTFIT_HEADROOM)


def expected() -> dict[str, tuple[int, int]]:
    sizes = {ROBO: sprite_size()}
    sizes.update({name: outfit_size() for name in OUTFITS.values()})
    sizes.update({name: outfit_size() for name in DRESSED.values()})
    return sizes


def render() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    robo().save(OUT / ROBO)
    kits = outfits()
    for kit, layer in kits.items():
        layer.save(OUT / OUTFITS[kit])
        robo(layer, kit).save(OUT / DRESSED[kit])
    for name in expected():
        print(f"wrote {OUT.relative_to(ROOT) / name}")


def _png_size(path: Path) -> tuple[int, int]:
    header = path.read_bytes()[:24]
    if header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR":
        raise SystemExit(f"{path} is not a PNG")
    w, h = struct.unpack(">II", header[16:24])
    return (w, h)


def check() -> None:
    for name, size in expected().items():
        path = OUT / name
        if not path.is_file():
            raise SystemExit(f"missing {path}; run `make mascots`")
        if _png_size(path) != size:
            raise SystemExit(f"{path} is {_png_size(path)}, expected {size}; run `make mascots`")
        print(f"{name} OK ({size[0]}x{size[1]})")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="assert the committed output's structure")
    args = parser.parse_args()
    check() if args.check else render()


if __name__ == "__main__":
    main()
