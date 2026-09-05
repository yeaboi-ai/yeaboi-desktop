#!/usr/bin/env python3
"""Render the mascot's derived sprites from the app's own pixel duck.

Nothing here is drawn from scratch. Every sprite is the vendored design
package's 128px duck — the very pixels ``DuckMark`` draws — remapped or
dressed pixel-for-pixel with no resampling, so the whole family is equally
crisp at every size it shares:

* ``robo.png`` — the Agents world's mascot, the TUI's own law (``_mascot.py``
  in yeaboi.ai): plumage to steel, the shades' shine to a cyan LED, an antenna
  from the crown.
* ``persona-<id>.png`` (and ``persona-<id>-body.png`` where a persona has a
  layer under the wing) — the eight personas as transparent layers the canvas
  rig stacks on the duck, drawn as pixel grids on the duck's own 64-cell art
  grid (``scripts/persona_grids.py``) in the duck's own colours.
* ``robo-<id>.png`` — the robo in each persona, flattened, the antenna rooted
  in whatever is now the top of its head.
* ``public/pet/assets/persona-<id>[-body].png`` — the same grids at the
  desktop pet's scale, where a cell is 7.5px, the pet's own pixel pitch.

**Not a build step.** This repo has no Python environment; Pillow arrives for
the length of one command. The output is committed and CI never re-renders it,
so ``--check`` asserts structure — each file exists with the right dimensions —
and never bytes. ``test/mascot-sprites.test.ts`` runs the same assertions in
the ordinary lane, with no Python at all.

Usage::

    make mascots
    uv run --with pillow --no-project python scripts/gen_mascot_sprites.py --check
    uv run --with pillow --no-project python scripts/gen_mascot_sprites.py --sheet out.png
"""

from __future__ import annotations

import argparse
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from persona_grids import HEADROOM_CELLS, Layer, layers  # noqa: E402

SRC = ROOT / "node_modules" / "@yeaboi-ai" / "design" / "assets" / "duck"
OUT = ROOT / "src" / "renderer" / "assets" / "brand"
PET_OUT = ROOT / "src" / "renderer" / "public" / "pet" / "assets"
ROBO = "robo.png"
PERSONAS = ("engineer", "teacher", "martial", "chef", "astronaut", "dj", "detective", "wizard")
#: The personas with a layer between the body and the wing.
BODY_PERSONAS = ("martial",)

#: The design package's sprite canvas.
SOURCE_SIZE = (128, 136)
#: Extra rows above the art for the antenna (stem + bulb + a margin).
HEADROOM = 22
#: Extra rows above the art on the persona layers and the dressed robos: the
#: hat, and the antenna standing on it.
OUTFIT_HEADROOM = 40
#: The desktop pet draws the same art at this size, with this headroom.
PET_SIZE = (480, 659)
PET_HEADROOM = 150
#: Pixels per art cell on each canvas.
CELL = 2
PET_CELL = 7.5

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
    """The teal-to-mint feather range: green ahead of red, and not blue-led."""
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
    """The personas' whole palette, read off the art itself — the bill's
    amber, the belly's white, the shades' black, the plumage's teal and mint —
    plus the robo's two steels, so a persona never wears a colour the family
    does not already."""

    def __init__(self, base, glasses):
        from collections import Counter

        opaque = [(r, g, b) for r, g, b, a in _pixels(base) if a > 0]
        amber = Counter(p for p in opaque if p[0] > 200 and p[0] > p[1] + 40).most_common(1)
        white = Counter(p for p in opaque if min(p) > 200).most_common(1)
        plumage = [p for p in opaque if _is_plumage((*p, 255))]
        teal = Counter(p for p in plumage if 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2] < 150).most_common(1)
        mint = Counter(p for p in plumage if 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2] >= 150).most_common(1)
        shade = Counter(
            (r, g, b) for r, g, b, a in _pixels(glasses) if a > 0 and 10 < 0.299 * r + 0.587 * g + 0.114 * b < 60
        ).most_common(1)
        if not (amber and white and shade and teal and mint):
            raise SystemExit("could not find the amber, white, shade black, teal or mint in the art; it moved")
        self.by_letter = {
            "a": amber[0][0],
            "w": white[0][0],
            "k": shade[0][0],
            "n": OUTLINE,
            "t": teal[0][0],
            "m": mint[0][0],
            "s": STEEL_LIGHT,
            "d": STEEL_DARK,
        }


def _paint(layer: Layer, colours: Colours, size: tuple[int, int], cell: float, headroom: int):
    """A layer's cells as a transparent canvas: each cell a rectangle whose
    edges are the rounded multiples of the cell pitch, so a 7.5px cell is 7
    or 8 pixels wide exactly as the pet's own body pixels are."""
    from PIL import Image, ImageDraw

    img = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    edge = lambda i: round(i * cell)  # noqa: E731
    for (x, y), letter in layer.cells.items():
        if y < -HEADROOM_CELLS:
            raise SystemExit(f"{layer.persona}: cell at row {y} is above the headroom")
        colour = colours.by_letter[letter]
        yy = y + HEADROOM_CELLS
        d.rectangle((edge(x), headroom - edge(HEADROOM_CELLS) + edge(yy), edge(x + 1) - 1, headroom - edge(HEADROOM_CELLS) + edge(yy + 1) - 1), fill=(*colour, 255))
    return img


def _outfit_name(persona: str, slot: str) -> str:
    return f"persona-{persona}.png" if slot == "top" else f"persona-{persona}-body.png"


def outfits(colours: Colours):
    """Every persona's layers on the brand canvas, by file name."""
    out = {}
    for persona in PERSONAS:
        for layer in layers(persona):
            out[_outfit_name(persona, layer.slot)] = _paint(layer, colours, outfit_size(), CELL, OUTFIT_HEADROOM)
    return out


def pet_outfits(colours: Colours):
    out = {}
    for persona in PERSONAS:
        for layer in layers(persona):
            out[_outfit_name(persona, layer.slot)] = _paint(layer, colours, PET_SIZE, PET_CELL, PET_HEADROOM)
    return out


def robo(top=None, body=None):
    """The robo: the recoloured layers stacked, a persona's layers between or
    over them, and the antenna last, standing on whatever is now the top of
    the head."""
    from PIL import Image, ImageDraw

    dressed = top is not None or body is not None
    headroom = OUTFIT_HEADROOM if dressed else HEADROOM
    size = outfit_size() if dressed else sprite_size()
    art = _layers()
    staged = Image.new("RGBA", size, (0, 0, 0, 0))
    staged.alpha_composite(_recolour_body(art["base"]), (0, headroom))
    if body is not None:
        staged.alpha_composite(body)
    staged.alpha_composite(_recolour_body(art["wing"]), (0, headroom))
    staged.alpha_composite(_recolour_shine(art["glasses"]), (0, headroom))
    if top is not None:
        staged.alpha_composite(top)

    crown = _crown_top(staged)
    d = ImageDraw.Draw(staged)
    stem_left = ANTENNA_X - STEM_WIDTH // 2
    bulb_top = crown - STEM_RISE - 2 * BULB
    d.rectangle((stem_left, crown - STEM_RISE, stem_left + STEM_WIDTH - 1, crown + 2), fill=OUTLINE)
    d.ellipse(
        (ANTENNA_X - BULB, bulb_top, ANTENNA_X + BULB, bulb_top + 2 * BULB),
        fill=CYAN,
        outline=OUTLINE,
        width=2,
    )
    return staged


def duck(top=None, body=None):
    """The feathered duck dressed, for the contact sheet only."""
    from PIL import Image

    art = _layers()
    staged = Image.new("RGBA", outfit_size(), (0, 0, 0, 0))
    staged.alpha_composite(art["base"], (0, OUTFIT_HEADROOM))
    if body is not None:
        staged.alpha_composite(body)
    staged.alpha_composite(art["wing"], (0, OUTFIT_HEADROOM))
    staged.alpha_composite(art["glasses"], (0, OUTFIT_HEADROOM))
    if top is not None:
        staged.alpha_composite(top)
    return staged


def sprite_size() -> tuple[int, int]:
    return (SOURCE_SIZE[0], SOURCE_SIZE[1] + HEADROOM)


def outfit_size() -> tuple[int, int]:
    return (SOURCE_SIZE[0], SOURCE_SIZE[1] + OUTFIT_HEADROOM)


def expected() -> dict[Path, tuple[int, int]]:
    sizes = {OUT / ROBO: sprite_size()}
    for persona in PERSONAS:
        slots = ("top", "body") if persona in BODY_PERSONAS else ("top",)
        for slot in slots:
            sizes[OUT / _outfit_name(persona, slot)] = outfit_size()
            sizes[PET_OUT / _outfit_name(persona, slot)] = PET_SIZE
        sizes[OUT / f"robo-{persona}.png"] = outfit_size()
    return sizes


def _dressed(images: dict, persona: str):
    return images[_outfit_name(persona, "top")], images.get(_outfit_name(persona, "body"))


def render() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    PET_OUT.mkdir(parents=True, exist_ok=True)
    art = _layers()
    colours = Colours(art["base"], art["glasses"])
    robo().save(OUT / ROBO)
    brand = outfits(colours)
    for name, img in brand.items():
        img.save(OUT / name)
    for name, img in pet_outfits(colours).items():
        img.save(PET_OUT / name)
    for persona in PERSONAS:
        top, body = _dressed(brand, persona)
        robo(top, body).save(OUT / f"robo-{persona}.png")
    for path in expected():
        print(f"wrote {path.relative_to(ROOT)}")


def sheet(path: Path) -> None:
    """A contact sheet of every persona on the duck and the robo, to look at
    before committing the art. Never committed itself."""
    from PIL import Image

    art = _layers()
    colours = Colours(art["base"], art["glasses"])
    brand = outfits(colours)
    w, h = outfit_size()
    scale = 2
    sheet_img = Image.new("RGBA", (w * scale * len(PERSONAS), h * scale * 2), (250, 250, 249, 255))
    for i, persona in enumerate(PERSONAS):
        top, body = _dressed(brand, persona)
        for row, img in enumerate((duck(top, body), robo(top, body))):
            big = img.resize((w * scale, h * scale), Image.NEAREST)
            sheet_img.alpha_composite(big, (i * w * scale, row * h * scale))
    sheet_img.save(path)
    print(f"wrote {path}")


def _png_size(path: Path) -> tuple[int, int]:
    header = path.read_bytes()[:24]
    if header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR":
        raise SystemExit(f"{path} is not a PNG")
    w, h = struct.unpack(">II", header[16:24])
    return (w, h)


def check() -> None:
    for path, size in expected().items():
        if not path.is_file():
            raise SystemExit(f"missing {path}; run `make mascots`")
        if _png_size(path) != size:
            raise SystemExit(f"{path} is {_png_size(path)}, expected {size}; run `make mascots`")
        print(f"{path.relative_to(ROOT)} OK ({size[0]}x{size[1]})")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="assert the committed output's structure")
    parser.add_argument("--sheet", type=Path, help="write a contact sheet of every persona here")
    args = parser.parse_args()
    if args.sheet:
        sheet(args.sheet)
    elif args.check:
        check()
    else:
        render()


if __name__ == "__main__":
    main()
