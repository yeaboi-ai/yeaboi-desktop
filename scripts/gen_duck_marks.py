"""Re-draw the duck's UI sprites as curves, at a resolution worth having.

The mascot was a 128x136 pixel drawing used as a mark at 18-72px. At those
sizes its own stair steps land on about a screen pixel each, and nothing about
filtering or scaling fixes that: the steps are the drawing. Raising the sprite
to 480px changed nothing for the same reason, and it made things worse — a
6.7:1 reduction sends Chromium's scaler down a cheap path that aliases hard
edges badly.

So the drawing is re-drawn. Each region of the master is traced to a contour,
the contour is smoothed by corner-cutting until the staircase converges on the
curve it was approximating, and the result is filled at high resolution. What
ships has no pixel grid in it, so there is nothing left to alias.

Two things make the trace behave. Near-duplicate shades are merged first — the
master carries a dozen greys within a few values of each other, and tracing
each separately gives a cloud of slivers rather than a shape. And the outline
is painted as the whole silhouette rather than traced as a one-pixel ring,
which collapses the moment it is smoothed.

`src/renderer/assets/duck-master/` holds the 128px drawing this renders from.

The canvas keeps the aspect at exactly 136/128 — `components/brand/team.tsx`
hard-codes that ratio to size a three-duck cluster to the same box as a single
mark.

The design package is **vendored**, its source of truth the yeaboi-frontend
repo, so this rewrites the committed tarball. Port the same render upstream, or
the next design bump puts the pixel grid back.

Run with `make duck-marks`. The output is committed; not part of the build.
"""

from __future__ import annotations

import shutil
import sys
import tarfile
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from skimage import measure

ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / "src" / "renderer" / "assets" / "duck-master"
DESIGN_TARBALL = ROOT / "vendor" / "yeaboi-ai-design-1.1.0-dev.1.tgz"
INSTALLED = ROOT / "node_modules" / "@yeaboi-ai" / "design"

LAYERS = ("base", "wing", "glasses")

#: The mark canvas. Twice the 72px the dock duck is drawn at, so the browser is
#: left with a 2:1 reduction — a bigger sprite means a bigger reduction, and
#: Chromium's scaler is what put the steps back last time. Height is
#: width * 136/128, the ratio team.tsx assumes.
CANVAS = (144, 153)

#: Supersampling for the fill. The polygon filler has no anti-aliasing at all,
#: so this is the only thing standing between a curve and a staircase: every
#: edge pixel is averaged from 64 samples on the way down.
SS = 8

#: Corner-cutting passes. Each one halves the remaining stair; four is where
#: the outline stops visibly stepping and the beak still has a point.
ROUNDS = 4

#: Contours smaller than this are dropped. Below it a contour is a stray pixel
#: or two, and smoothing turns those into specks.
MIN_AREA = 2.0

#: How many shades survive the merge, per layer. Enough that the beak and feet
#: keep their orange — 354 pixels between them — and few enough that the dozen
#: near-identical greys become one region.
KEEP = {"base": 11, "wing": 4, "glasses": 3}


def _chaikin(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Corner-cutting. Each pass replaces a corner with two points along its
    edges, so a staircase converges on the curve it was approximating."""
    for _ in range(ROUNDS):
        out: list[tuple[float, float]] = []
        count = len(points)
        for i in range(count):
            ax, ay = points[i]
            bx, by = points[(i + 1) % count]
            out.append((ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25))
            out.append((ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75))
        points = out
    return points


def _area(points: list[tuple[float, float]]) -> float:
    total = 0.0
    for i in range(len(points)):
        x1, y1 = points[i]
        x2, y2 = points[(i + 1) % len(points)]
        total += x1 * y2 - x2 * y1
    return abs(total) / 2


def _merge_shades(arr, opaque, keep: int):
    """Every colour snapped to one of the `keep` most common ones."""
    counts: dict[tuple[int, int, int], int] = {}
    height, width = opaque.shape
    for y in range(height):
        for x in range(width):
            if opaque[y, x]:
                colour = tuple(int(v) for v in arr[y, x, :3])
                counts[colour] = counts.get(colour, 0) + 1
    anchors = [c for c, _ in sorted(counts.items(), key=lambda kv: -kv[1])[:keep]]
    lut = {
        c: min(anchors, key=lambda a: sum((a[i] - c[i]) ** 2 for i in range(3))) for c in counts
    }
    flat = np.zeros((height, width, 3), np.uint8)
    for y in range(height):
        for x in range(width):
            if opaque[y, x]:
                flat[y, x] = lut[tuple(int(v) for v in arr[y, x, :3])]
    return flat, anchors


def trace(path: Path, keep: int) -> Image.Image:
    """One layer of the master, re-drawn as filled curves."""
    image = Image.open(path).convert("RGBA")
    arr = np.array(image)
    height, width = arr.shape[:2]
    opaque = arr[:, :, 3] >= 128
    flat, anchors = _merge_shades(arr, opaque, keep)

    scale = CANVAS[0] / width
    canvas = Image.new("RGBA", (CANVAS[0] * SS, CANVAS[1] * SS), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)

    def paint(mask, colour) -> None:
        for contour in measure.find_contours(np.pad(mask.astype(float), 1), 0.5):
            points = [(px - 1.0, py - 1.0) for py, px in contour]
            if len(points) < 8 or _area(points) < MIN_AREA:
                continue
            draw.polygon(
                [(x * scale * SS, y * scale * SS) for x, y in _chaikin(points)],
                fill=tuple(int(v) for v in colour) + (255,),
            )

    # The silhouette in the darkest shade is the outline. Painted whole, because
    # a one-pixel ring traced as its own region collapses when it is smoothed.
    darkest = min(anchors, key=sum)
    paint(opaque, darkest)
    areas = {a: int((opaque & np.all(flat == a, axis=2)).sum()) for a in anchors}
    for colour in sorted(anchors, key=lambda a: -areas[a]):
        if colour == darkest:
            continue
        paint(opaque & np.all(flat == colour, axis=2), colour)
    return canvas.resize(CANVAS, Image.LANCZOS)


def render(name: str) -> Image.Image:
    return trace(MASTER / f"{name}.png", KEEP[name])


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
