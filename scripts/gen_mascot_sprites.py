#!/usr/bin/env python3
"""Render the mascot's derived sprites from the app's own pixel duck.

Nothing here is drawn from scratch. Every sprite is the vendored design
package's 128px duck — the very pixels ``DuckMark`` draws — remapped or
dressed pixel-for-pixel with no resampling, so the whole family is equally
crisp at every size it shares:

* ``robo.png`` — the Agents world's mascot, the TUI's own law (``_mascot.py``
  in yeaboi.ai): plumage to steel, the shades' shine to a cyan LED, an antenna
  from the crown.
* ``outfit-<kit>.png`` — the six kits as transparent layers the canvas rig
  stacks on the duck, one per world and door (src/renderer/lib/yeaboi/kits.ts
  says which is which), coloured only with the sprite's own bill amber, belly
  white, shade black and outline navy.
* ``robo-<kit>.png`` — the robo in the Agents world's two kits, flattened,
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
KITS = ("hardhat", "ring", "cap", "headset", "propeller", "bowtie")
OUTFITS = {kit: f"outfit-{kit}.png" for kit in KITS}
#: The kits the Agents world wears, so the robo is rendered in these alone.
ROBO_KITS = ("propeller", "bowtie")
DRESSED = {kit: f"robo-{kit}.png" for kit in ROBO_KITS}

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

#: The captain's cap: a white top, a navy band, a black visor over the bill
#: and an amber badge on the band's front.
CAP_TOP = (14, -16, 66, -2)
CAP_BAND = (14, -3, 66, 8)
CAP_VISOR = ((30, 6), (2, 8), (2, 13), (30, 12))
CAP_BADGE = (24, -1, 34, 6)

#: The headset: a band over the crown, a cup on the ear at the back of the
#: head, and a boom to a mic under the bill.
HEADSET_BAND = (10, -6, 68, 44)
HEADSET_BAND_CUT = 16
HEADSET_CUP = (54, 16, 70, 34)
HEADSET_BOOM = ((60, 30), (40, 44), (16, 46))
HEADSET_MIC = (8, 42, 18, 50)

#: The propeller beanie: a small striped dome, a stem, and the blade on top.
BEANIE_DOME = (20, -12, 58, 10)
BEANIE_CUT = 4
BEANIE_STRIPES = ((28, 34), (44, 50))
PROP_STEM = (37, -18, 41, -10)
PROP_BLADE = (20, -22, 58, -17)
PROP_HUB = (35, -23, 43, -15)

#: The bow tie, on the chest under the bill.
BOW_LEFT = ((26, 57), (12, 50), (12, 64))
BOW_RIGHT = ((30, 57), (44, 50), (44, 64))
BOW_KNOT = (25, 54, 31, 61)


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


class Colours:
    """The kits' whole palette, read off the art itself: the bill's amber, the
    belly's white and the shades' black, the commonest of each, so a kit never
    introduces a colour the duck does not already wear."""

    def __init__(self, base, glasses):
        from collections import Counter

        opaque = [(r, g, b) for r, g, b, a in _pixels(base) if a > 0]
        amber = Counter(p for p in opaque if p[0] > 200 and p[0] > p[1] + 40).most_common(1)
        white = Counter(p for p in opaque if min(p) > 200).most_common(1)
        shade = Counter(
            (r, g, b) for r, g, b, a in _pixels(glasses) if a > 0 and 10 < 0.299 * r + 0.587 * g + 0.114 * b < 60
        ).most_common(1)
        if not amber or not white or not shade:
            raise SystemExit("could not find the amber, white or shade black in the art; it moved")
        self.amber = amber[0][0]
        self.white = white[0][0]
        self.black = shade[0][0]
        self.navy = OUTLINE


def _blank():
    from PIL import Image

    return Image.new("RGBA", outfit_size(), (0, 0, 0, 0))


def _clear_below(img, y: int) -> None:
    """Erase everything from source row `y` down."""
    img.paste((0, 0, 0, 0), (0, OUTFIT_HEADROOM + y, img.width, img.height))


def _clear_above(img, y: int) -> None:
    img.paste((0, 0, 0, 0), (0, 0, img.width, OUTFIT_HEADROOM + y))


def _hardhat(c: Colours):
    from PIL import ImageDraw

    layer = _blank()
    dome = _blank()
    ImageDraw.Draw(dome).ellipse(_shift(HAT_DOME), fill=c.amber, outline=c.navy, width=STROKE)
    # Only the crown of the ellipse survives: everything under the brim goes.
    _clear_below(dome, HAT_BRIM_Y)
    layer.alpha_composite(dome)
    d = ImageDraw.Draw(layer)
    d.rectangle(_shift(HAT_BRIM), fill=c.amber, outline=c.navy, width=STROKE)
    d.rectangle(_shift(HAT_SHINE), fill=c.white)
    return layer


def _cap(c: Colours):
    from PIL import ImageDraw

    layer = _blank()
    d = ImageDraw.Draw(layer)
    d.polygon([_pt(p) for p in CAP_VISOR], fill=c.black, outline=c.navy)
    d.rounded_rectangle(_shift(CAP_TOP), radius=6, fill=c.white, outline=c.navy, width=STROKE)
    d.rectangle(_shift(CAP_BAND), fill=c.navy)
    d.ellipse(_shift(CAP_BADGE), fill=c.amber, outline=c.white, width=1)
    return layer


def _headset(c: Colours):
    from PIL import ImageDraw

    band = _blank()
    ImageDraw.Draw(band).ellipse(_shift(HEADSET_BAND), outline=c.navy, width=STROKE + 2)
    _clear_below(band, HEADSET_BAND_CUT)
    layer = _blank()
    layer.alpha_composite(band)
    d = ImageDraw.Draw(layer)
    d.line([_pt(p) for p in HEADSET_BOOM], fill=c.navy, width=STROKE + 1, joint="curve")
    d.rounded_rectangle(_shift(HEADSET_CUP), radius=5, fill=c.navy, outline=c.white, width=1)
    d.ellipse(_shift(HEADSET_MIC), fill=c.amber, outline=c.navy, width=STROKE)
    return layer


def _propeller(c: Colours):
    from PIL import ImageDraw

    dome = _blank()
    dd = ImageDraw.Draw(dome)
    dd.ellipse(_shift(BEANIE_DOME), fill=c.white, outline=c.navy, width=STROKE)
    x0, y0, x1, y1 = BEANIE_DOME
    for left, right in BEANIE_STRIPES:
        stripe = _blank()
        ImageDraw.Draw(stripe).ellipse(_shift(BEANIE_DOME), fill=c.amber)
        stripe.paste((0, 0, 0, 0), (0, 0, left, stripe.height))
        stripe.paste((0, 0, 0, 0), (right, 0, stripe.width, stripe.height))
        inner = _blank()
        ImageDraw.Draw(inner).ellipse(_shift((x0 + STROKE, y0 + STROKE, x1 - STROKE, y1 - STROKE)), fill=(255, 255, 255, 255))
        stripe.putalpha(_and_alpha(stripe, inner))
        dome.alpha_composite(stripe)
    _clear_below(dome, BEANIE_CUT)
    layer = _blank()
    layer.alpha_composite(dome)
    d = ImageDraw.Draw(layer)
    d.rectangle(_shift(PROP_STEM), fill=c.navy)
    d.rounded_rectangle(_shift(PROP_BLADE), radius=2, fill=c.amber, outline=c.navy, width=1)
    d.ellipse(_shift(PROP_HUB), fill=c.navy)
    return layer


def _and_alpha(a, b):
    from PIL import ImageChops

    return ImageChops.multiply(a.getchannel("A"), b.getchannel("A"))


def _bowtie(c: Colours):
    from PIL import ImageDraw

    layer = _blank()
    d = ImageDraw.Draw(layer)
    for wing in (BOW_LEFT, BOW_RIGHT):
        d.polygon([_pt(p) for p in wing], fill=c.amber, outline=c.navy)
    d.rectangle(_shift(BOW_KNOT), fill=c.navy)
    return layer


def _ring(c: Colours):
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
            colour = c.navy if edge else (c.amber if segment else c.white)
            layer.putpixel((x, y), (*colour, 255))
    return layer


def _shift(box: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    """A source-coordinate box onto the outfit canvas."""
    x0, y0, x1, y1 = box
    return (x0, y0 + OUTFIT_HEADROOM, x1, y1 + OUTFIT_HEADROOM)


def _pt(point: tuple[int, int]) -> tuple[int, int]:
    return (point[0], point[1] + OUTFIT_HEADROOM)


DRAW = {
    "hardhat": _hardhat,
    "ring": _ring,
    "cap": _cap,
    "headset": _headset,
    "propeller": _propeller,
    "bowtie": _bowtie,
}


def outfits():
    layers = _layers()
    colours = Colours(layers["base"], layers["glasses"])
    return {kit: DRAW[kit](colours) for kit in KITS}


def robo(outfit=None, kit: str | None = None):
    """The robo: the recoloured layers stacked, a kit between or over them,
    and the antenna last, standing on whatever is now the top of the head."""
    from PIL import Image, ImageDraw

    headroom = OUTFIT_HEADROOM if outfit is not None else HEADROOM
    size = outfit_size() if outfit is not None else sprite_size()
    layers = _layers()
    staged = Image.new("RGBA", size, (0, 0, 0, 0))
    staged.alpha_composite(_recolour_body(layers["base"]), (0, headroom))
    # The ring sits under the wing, as a ring around a body does; every other
    # kit goes over everything.
    if outfit is not None and kit == "ring":
        staged.alpha_composite(outfit)
    staged.alpha_composite(_recolour_body(layers["wing"]), (0, headroom))
    staged.alpha_composite(_recolour_shine(layers["glasses"]), (0, headroom))
    if outfit is not None and kit != "ring":
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
        if kit in DRESSED:
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
