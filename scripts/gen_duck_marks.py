"""Render the in-app duck's sprites at the resolution the UI actually needs.

The duck is drawn as a UI mark at 18-72px. Its art was 128x136, which is
*below* every one of those sizes only in the sense that matters least: the
staircase in a 128px outline is still a staircase at 72px, and no filter
removes it — smoothing it just trades a hard stair for a blurry one. The
corner duck looked jagged for that reason and no other.

The same duck already exists at 480x509, as the desktop pet's layer set, and
their geometry lines up: every layer's bounding box matches the design set's
to within half a percent, because they are one drawing exported twice. So the
mark sprites are rendered from the pet art rather than redrawn.

  base    = foot-back + body + foot-front, composited
  wing    = the pet's wing layer
  glasses = the pet's glasses layer

The canvas is 480x510 rather than the pet's 480x509, so the aspect stays
exactly 136/128 — `components/brand/team.tsx` hard-codes that ratio to size a
three-duck cluster to the same box as one mark, and a sprite an eighth of a
percent off would put the Team card's text off its neighbours' baseline.

Edges are deliberately left anti-aliased. This art is a smooth render of a
pixel drawing, not pixel art to be preserved: `DuckMark` stamps
`data-duck-mark`, and the rule that hangs off it in globals.css hands these
images to the browser's own filter at every size they are drawn.

The design package is **vendored** — its source of truth is the yeaboi-frontend
repo — so this rewrites the committed tarball. Port the same render upstream,
or the next design bump puts the 128px art back.

Run with `make duck-marks`. The output is committed; not part of the build.
"""

from __future__ import annotations

import shutil
import sys
import tarfile
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PET = ROOT / "src" / "renderer" / "public" / "pet" / "assets"
DESIGN_TARBALL = ROOT / "vendor" / "yeaboi-ai-design-1.1.0-dev.1.tgz"
INSTALLED = ROOT / "node_modules" / "@yeaboi-ai" / "design"

#: The mark canvas. Width is the pet art's; height is width * 136/128, which is
#: the ratio team.tsx assumes. See the module docstring.
CANVAS = (480, 510)

#: Which pet layers make each design layer, in composite order.
LAYERS: dict[str, tuple[str, ...]] = {
    "base": ("duck-foot-back", "duck-body", "duck-foot-front"),
    "wing": ("duck-wing",),
    "glasses": ("duck-glasses",),
}


def render(sources: tuple[str, ...]) -> Image.Image:
    """Composite the named pet layers and fit them to the mark canvas."""
    out = Image.open(PET / f"{sources[0]}.png").convert("RGBA")
    for name in sources[1:]:
        out = Image.alpha_composite(out, Image.open(PET / f"{name}.png").convert("RGBA"))
    if out.size != CANVAS:
        out = out.resize(CANVAS, Image.LANCZOS)
    return out


def main() -> int:
    check = "--check" in sys.argv
    if not DESIGN_TARBALL.exists():
        print(f"missing: {DESIGN_TARBALL}")
        return 1

    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        with tarfile.open(DESIGN_TARBALL, "r:gz") as archive:
            members = archive.getmembers()
            archive.extractall(work, filter="data")

        dirty = False
        for name, sources in LAYERS.items():
            target = work / "package" / "assets" / "duck" / f"{name}.png"
            fresh = render(sources)
            existing = Image.open(target).convert("RGBA") if target.exists() else None
            same = existing is not None and existing.size == fresh.size and existing.tobytes() == fresh.tobytes()
            before = f"{existing.size[0]}x{existing.size[1]}" if existing else "absent"
            print(f"{name}.png  {before} -> {fresh.size[0]}x{fresh.size[1]}")
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
        # members are re-added in their original order with their original
        # metadata, so the only difference is the three sprites.
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
