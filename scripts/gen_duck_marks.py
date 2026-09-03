"""Re-draw the duck's UI sprites as curves instead of stairs.

The mascot is a 128x136 pixel drawing and it is used as a mark at 18-72px. At
those sizes its own outline staircase lands on roughly one to two screen
pixels, so it reads as jagged — and nothing about filtering fixes that. Scaling
a bigger copy of a staircase gives a softer staircase; anti-aliasing gives a
blurry one. The steps have to stop being steps.

So each layer is re-drawn: every colour in it is treated as a region, that
region's mask is blown up, blurred and re-thresholded — which rounds a stair
into an edge — and the regions are laid back down largest first. Blurring the
composite instead would bleed every colour into its neighbour; doing one mask
at a time moves an edge without touching what is either side of it.

`src/renderer/assets/duck-master/` holds the 128px drawing this renders from.
It is the mascot as drawn, kept here because the render is lossy and there
would otherwise be nothing to re-render from.

The canvas is 480x510, so the aspect stays exactly 136/128 —
`components/brand/team.tsx` hard-codes that ratio to size a three-duck cluster
to the same box as a single mark.

The design package is **vendored**, its source of truth the yeaboi-frontend
repo, so this rewrites the committed tarball. Port the same render upstream or
the next design bump puts the stairs back.

Run with `make duck-marks`. The output is committed; not part of the build.
"""

from __future__ import annotations

import shutil
import sys
import tarfile
import tempfile
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / "src" / "renderer" / "assets" / "duck-master"
DESIGN_TARBALL = ROOT / "vendor" / "yeaboi-ai-design-1.1.0-dev.1.tgz"
INSTALLED = ROOT / "node_modules" / "@yeaboi-ai" / "design"

LAYERS = ("base", "wing", "glasses")

#: The mark canvas. Height is width * 136/128 — the ratio team.tsx assumes.
CANVAS = (480, 510)

#: How far the masks are blown up before smoothing. Every source pixel becomes
#: this many, which is the resolution the reconstructed curve is drawn at.
FACTOR = 8

#: Blur radius as a fraction of FACTOR. Below about a third the stairs survive;
#: above about a half the beak's own corners start rounding off with them.
SOFTEN = 0.42


def smooth_layer(image: Image.Image) -> Image.Image:
    """Re-draw one pixel-art layer with curved edges."""
    image = image.convert("RGBA")
    width, height = image.size
    px = image.load()

    counts: dict[tuple[int, int, int], int] = {}
    for y in range(height):
        for x in range(width):
            r, g, b, a = px[x, y]
            if a < 128:
                continue
            counts[(r, g, b)] = counts.get((r, g, b), 0) + 1

    big = (width * FACTOR, height * FACTOR)
    out = Image.new("RGBA", big, (0, 0, 0, 0))
    radius = FACTOR * SOFTEN
    # Largest first, so the small details — the beak's highlight, the glare on
    # the lenses — are laid over the mass rather than swallowed by it.
    for colour in sorted(counts, key=lambda c: -counts[c]):
        mask = Image.new("L", (width, height), 0)
        mp = mask.load()
        for y in range(height):
            for x in range(width):
                r, g, b, a = px[x, y]
                if a >= 128 and (r, g, b) == colour:
                    mp[x, y] = 255
        grown = mask.resize(big, Image.NEAREST).filter(ImageFilter.GaussianBlur(radius))
        grown = grown.point(lambda v: 255 if v >= 128 else 0)
        out.paste(Image.new("RGBA", big, colour + (255,)), (0, 0), grown)
    return out


def render(name: str) -> Image.Image:
    return smooth_layer(Image.open(MASTER / f"{name}.png")).resize(CANVAS, Image.LANCZOS)


def main() -> int:
    check = "--check" in sys.argv
    if not DESIGN_TARBALL.exists():
        print(f"missing: {DESIGN_TARBALL}")
        return 1
    for name in LAYERS:
        if not (MASTER / f"{name}.png").exists():
            print(f"missing master: {MASTER / f'{name}.png'}")
            return 1

    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        with tarfile.open(DESIGN_TARBALL, "r:gz") as archive:
            members = archive.getmembers()
            archive.extractall(work, filter="data")

        dirty = False
        for name in LAYERS:
            target = work / "package" / "assets" / "duck" / f"{name}.png"
            fresh = render(name)
            existing = Image.open(target).convert("RGBA") if target.exists() else None
            same = (
                existing is not None
                and existing.size == fresh.size
                and existing.tobytes() == fresh.tobytes()
            )
            print(f"{name}.png  {'unchanged' if same else 'redrawn'}  {fresh.size[0]}x{fresh.size[1]}")
            if same:
                continue
            dirty = True
            if not check:
                fresh.save(target)

        if check:
            if dirty:
                print("\nduck marks are stale — run `make duck-marks`")
            return 1 if dirty else 0
        if not dirty:
            return 0

        # A .tgz is a stream, so three members cannot be replaced in place. The
        # members go back in their original order with their original metadata,
        # so the only difference is the three sprites.
        with tarfile.open(DESIGN_TARBALL, "w:gz") as archive:
            for member in members:
                source = work / member.name
                if member.isfile() and source.exists():
                    member.size = source.stat().st_size
                    with source.open("rb") as handle:
                        archive.addfile(member, handle)
                else:
                    archive.addfile(member)

        # The installed copy is a snapshot taken at install time, so it needs
        # the same files or the dev server keeps serving the old art.
        if INSTALLED.exists():
            for name in LAYERS:
                shutil.copyfile(
                    work / "package" / "assets" / "duck" / f"{name}.png",
                    INSTALLED / "assets" / "duck" / f"{name}.png",
                )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
