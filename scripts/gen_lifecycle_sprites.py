#!/usr/bin/env python3
"""Render the onboarding wizard's lifecycle sprites from the website's duck art.

The first-run wizard's progress trail tells the mascot's life cycle in five
frames — egg, cracked egg, hatching, duckling, and the duck itself. The last
two are composited from the same 480x509 layers that draw the duck on yeaboi.ai
(and in this repo's dock icon), so the wizard's finale is literally the brand
bird; the egg frames are drawn here in the art's own outline colour and stroke
weight and downscaled through the same resampler, so the five read as one
sprite sheet.

**Not a build step.** This repo has no Python environment; Pillow arrives for
the length of one command. The output is committed and CI never re-renders it,
so ``--check`` asserts structure — the files exist with the right dimensions —
and never bytes. ``test/lifecycle-sprites.test.ts`` runs the same assertions in
the ordinary lane, with no Python at all.

Usage::

    make sprites
    uv run --with pillow --no-project python scripts/gen_lifecycle_sprites.py --check
"""

from __future__ import annotations

import argparse
import struct
import sys
from pathlib import Path

# scripts/ is not a package.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from _site_repo import site_assets  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "renderer" / "assets" / "onboarding"

#: The master art's own canvas; every frame is staged on it so the five sprites
#: share one scale and one baseline, and the egg is naturally smaller than the
#: grown duck.
CANVAS = (480, 509)
#: Rendered sprite height — 4x the 24px the footer displays at.
SPRITE_HEIGHT = 96
FRAMES = (
    "lifecycle-egg.png",
    "lifecycle-crack.png",
    "lifecycle-hatch.png",
    "lifecycle-duckling.png",
    "lifecycle-duck.png",
)

OUTLINE = (2, 5, 9)  # the art's own outline navy
SHELL = (238, 227, 205)
SHELL_SHADE = (215, 198, 165)
#: Outline stroke at canvas scale, matching the art's.
LINE = 11

EGG_BOX = (100, 90, 380, 470)
#: The cracked frame's zigzag, and where the hatched shell's rim sits.
CRACK_POINTS = ((104, 300), (160, 252), (216, 312), (272, 250), (326, 308), (377, 258))
RIM_Y = 300
RIM_TOOTH = 42
#: Head crop out of duck-base.png (the head and beak, no body).
HEAD_BOX = (0, 0, 275, 235)
HEAD_SCALE = 0.95
DUCKLING_SCALE = 0.72
#: The top of the shell, worn as a hat by the fresh duckling.
CAP_SCALE = 0.55
CAP_TILT = -12
CAP_POS = (105, 65)


def _canvas():
    from PIL import Image

    return Image.new("RGBA", CANVAS, (0, 0, 0, 0))


def _layers(*names):
    """Site art layers composited in order onto one transparent canvas."""
    from PIL import Image

    art = site_assets()
    out = _canvas()
    for name in names:
        out = Image.alpha_composite(out, Image.open(art / name).convert("RGBA"))
    return out


def _egg_shape():
    """The whole egg: shell fill, a lower-right shade crescent, navy outline."""
    from PIL import ImageDraw

    img = _canvas()
    d = ImageDraw.Draw(img)
    d.ellipse(EGG_BOX, fill=SHELL_SHADE)
    l, t, r, b = EGG_BOX
    d.ellipse((l, t, r - 26, b - 30), fill=SHELL)
    d.ellipse(EGG_BOX, outline=OUTLINE, width=LINE)
    return img


def egg():
    return _egg_shape()


def crack():
    from PIL import ImageDraw

    img = _egg_shape()
    ImageDraw.Draw(img).line(CRACK_POINTS, fill=OUTLINE, width=LINE, joint="curve")
    return img


def hatch():
    """The duck's head risen out of the egg's jagged lower half.

    The glasses layer is composited before the crop: the base layer's eye
    region is painted expecting the shades above it, so the bird is never
    rendered bare-headed — here or anywhere else the art appears.
    """
    from PIL import Image

    head = _layers("duck-base.png", "duck-glasses.png").crop(HEAD_BOX)
    head = head.resize(
        (round(head.width * HEAD_SCALE), round(head.height * HEAD_SCALE)),
        Image.Resampling.LANCZOS,
    )

    img = _canvas()
    cx = (EGG_BOX[0] + EGG_BOX[2]) // 2
    img.alpha_composite(head, (cx - head.width // 2, RIM_Y + 28 - head.height))
    img.alpha_composite(_shell_fragment(top=False))
    return img


def _rim_points():
    """The zigzag where the shell broke, left edge to right."""
    rim = [(EGG_BOX[0] - LINE, RIM_Y + RIM_TOOTH // 2)]
    x, up = EGG_BOX[0] + 20, True
    while x < EGG_BOX[2] - 10:
        rim.append((x, RIM_Y - RIM_TOOTH // 2 if up else RIM_Y + RIM_TOOTH // 2))
        x, up = x + 44, not up
    rim.append((EGG_BOX[2] + LINE, RIM_Y + RIM_TOOTH // 2))
    return rim


def _shell_fragment(top: bool):
    """The egg masked to one side of the zigzag rim, the rim then inked."""
    from PIL import Image, ImageChops, ImageDraw

    rim = _rim_points()
    shell = _egg_shape()
    mask = Image.new("L", CANVAS, 0)
    corner_y = 0 if top else CANVAS[1]
    ImageDraw.Draw(mask).polygon([*rim, (CANVAS[0], corner_y), (0, corner_y)], fill=255)
    shell.putalpha(ImageChops.multiply(shell.getchannel("A"), mask))
    ImageDraw.Draw(shell).line(rim, fill=OUTLINE, width=LINE, joint="curve")
    shell.putalpha(ImageChops.multiply(shell.getchannel("A"), _egg_alpha()))
    return shell


def _egg_alpha():
    """The egg's own silhouette, for clipping the rim ink to the shell."""
    from PIL import Image, ImageDraw

    mask = Image.new("L", CANVAS, 0)
    ImageDraw.Draw(mask).ellipse(EGG_BOX, fill=255)
    return mask


def duckling():
    """The young bird: duckling scale, the top of its shell still worn as a hat."""
    from PIL import Image

    bird = _layers("duck-base.png", "duck-wing.png", "duck-glasses.png")
    bird = bird.resize(
        (round(CANVAS[0] * DUCKLING_SCALE), round(CANVAS[1] * DUCKLING_SCALE)),
        Image.Resampling.LANCZOS,
    )
    img = _canvas()
    img.alpha_composite(bird, ((CANVAS[0] - bird.width) // 2, CANVAS[1] - bird.height - 4))

    cap = _shell_fragment(top=True)
    cap = cap.crop(cap.getbbox())
    cap = cap.resize(
        (round(cap.width * CAP_SCALE), round(cap.height * CAP_SCALE)),
        Image.Resampling.LANCZOS,
    )
    cap = cap.rotate(CAP_TILT, expand=True, resample=Image.Resampling.BICUBIC)
    img.alpha_composite(cap, CAP_POS)
    return img


def duck():
    return _layers("duck-base.png", "duck-wing.png", "duck-glasses.png")


def sprite_size() -> tuple[int, int]:
    return (round(CANVAS[0] * SPRITE_HEIGHT / CANVAS[1]), SPRITE_HEIGHT)


def render() -> None:
    from PIL import Image

    OUT.mkdir(parents=True, exist_ok=True)
    for name, build in zip(FRAMES, (egg, crack, hatch, duckling, duck)):
        frame = build().resize(sprite_size(), Image.Resampling.LANCZOS)
        frame.save(OUT / name)
        print(f"wrote {OUT.relative_to(ROOT) / name}")


def _png_size(path: Path) -> tuple[int, int]:
    header = path.read_bytes()[:24]
    if header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR":
        raise SystemExit(f"{path} is not a PNG")
    w, h = struct.unpack(">II", header[16:24])
    return (w, h)


def check() -> None:
    expected = sprite_size()
    for name in FRAMES:
        path = OUT / name
        if not path.is_file():
            raise SystemExit(f"missing {path}; run `make sprites`")
        if _png_size(path) != expected:
            raise SystemExit(f"{path} is {_png_size(path)}, expected {expected}; run `make sprites`")
    print(f"lifecycle sprites OK ({len(FRAMES)} files at {expected[0]}x{expected[1]})")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="assert the committed output's structure")
    args = parser.parse_args()
    check() if args.check else render()


if __name__ == "__main__":
    main()
