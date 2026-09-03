"""Re-crisp the duck sprites.

Both sprite sets are pixel art that stopped being pixel art somewhere in the
pipeline, in two different ways, and both defects read as the same thing on
screen: a duck with soft, dirty edges.

**The design set** (`@yeaboi-ai/design/assets/duck`, 128x136) carries more
part-transparent pixels than solid ones — `base.png` is 3,931 opaque against
6,054 partial, and `wing.png` has *no* fully opaque pixel at all. Most of that
is not an edge: it is a band at alpha 254 and 244 across the sprite's interior,
which is a lossy re-encode rather than anti-aliasing.

**The pet set** (`renderer/public/pet/assets`, 480x509) was resampled up from a
small master with a smoothing filter. `duck-body.png` holds 19,651 distinct
colours where the art has about twenty, and its horizontal run lengths are
almost all 1 — there is no pixel grid left in it, so every hard edge in the
original is now a gradient.

Neither fix changes a sprite's dimensions: the pet rig measures its own
geometry off these files (`FEET_FRAC` is a measured 496/509), so a resize would
silently move the duck's feet.

  1. Snap alpha to fully on or fully off. Kills the fringe and the near-opaque
     band in one pass, and it is the whole of what the pet set needs.
  2. Quantise the opaque pixels back to a palette. Median cut, no dither —
     dithering would put the noise back. The design set needs this because
     step 1 turns thousands of blended edge pixels opaque, and they have to
     land back on the art's own colours.

**Only the design set is quantised.** The pet sprites' interiors are a
resampler's gradient rather than flat pixel-art fills, and a median cut over
that spends its palette on the ramp: the beak comes back amber instead of
orange and the sunglasses come back grey. Snapping their alpha is what fixes
the edges, and it leaves the colours alone.

The design sprites live inside the **vendored** `@yeaboi-ai/design` tarball,
whose source of truth is the yeaboi-frontend repo. Cleaning them here means
repacking that tarball, so the committed artefact deliberately differs from
what `make pack-design` would produce upstream. **Port the same pass to
yeaboi-frontend**, or the next design bump quietly puts the haze back — the
guard test is what will tell you it did.

Run with `make sprites-clean`, `make sprites-check` to assert. The output is
committed; this is not part of the build.
"""

from __future__ import annotations

import shutil
import sys
import tarfile
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent

#: The vendored design package. Its duck art is inside the tarball, so cleaning
#: it is unpack → clean → repack rather than a write in place.
DESIGN_TARBALL = ROOT / "vendor" / "yeaboi-ai-design-1.1.0-dev.1.tgz"

#: Alpha at or above this is solid; below it, gone. Halfway, because the art is
#: pixel art — every pixel was drawn either present or absent, and everything
#: between the two is something the pipeline added.
ALPHA_CUTOFF = 128

#: Sprites to clean, and the palette each is cut back to. `None` is snap-only —
#: see the note above on why every pet sprite is one. The design counts are the
#: art's own, measured from its fully-opaque pixels.
SPRITES: tuple[tuple[str, int | None], ...] = (
    ("src/renderer/public/pet/assets/duck-body.png", None),
    ("src/renderer/public/pet/assets/duck-wing.png", None),
    ("src/renderer/public/pet/assets/duck-glasses.png", None),
    ("src/renderer/public/pet/assets/duck-foot-front.png", None),
    ("src/renderer/public/pet/assets/duck-foot-back.png", None),
)

#: The same, inside the design tarball. Paths are relative to its `package/`.
DESIGN_SPRITES: tuple[tuple[str, int], ...] = (
    ("assets/duck/base.png", 20),
    ("assets/duck/wing.png", 10),
    ("assets/duck/glasses.png", 10),
)


def snap_alpha(image: Image.Image) -> Image.Image:
    """Every pixel fully present or fully absent — nothing in between."""
    alpha = image.getchannel("A").point(lambda a: 255 if a >= ALPHA_CUTOFF else 0)
    out = image.copy()
    out.putalpha(alpha)
    return out


def quantise(image: Image.Image, colours: int) -> Image.Image:
    """Collapse the opaque pixels onto `colours` colours, keeping the alpha.

    Quantising the RGBA image directly would let the transparent pixels — which
    still carry whatever RGB the resampler left in them — claim palette slots
    that the visible art needs. So the colour reduction runs on RGB alone and
    the snapped alpha is put back afterwards.
    """
    alpha = image.getchannel("A")
    flat = Image.new("RGB", image.size, (0, 0, 0))
    flat.paste(image.convert("RGB"), mask=alpha)
    reduced = flat.quantize(colors=colours, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    out = reduced.convert("RGB").convert("RGBA")
    out.putalpha(alpha)
    return out


def describe(image: Image.Image) -> str:
    px = image.load()
    width, height = image.size
    opaque = partial = 0
    colours: set[tuple[int, int, int]] = set()
    for y in range(height):
        for x in range(width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if a == 255:
                opaque += 1
                colours.add((r, g, b))
            else:
                partial += 1
    return f"opaque={opaque} partial={partial} colours={len(colours)}"


def clean_file(path: Path, colours: int | None) -> bool:
    """Clean one sprite in place. True when it actually changed."""
    before = Image.open(path).convert("RGBA")
    after = snap_alpha(before)
    if colours is not None:
        after = quantise(after, colours)
    print(f"{path.name}\n  before {describe(before)}\n  after  {describe(after)}")
    if after.tobytes() == before.tobytes():
        return False
    after.save(path)
    return True


def clean_design_tarball(check: bool) -> bool:
    """Unpack the vendored design package, clean its duck, repack it.

    Repacked rather than patched: a .tgz is a stream, so there is no way to
    replace three members of one without writing the whole file again. Members
    are re-added in their original order with their original metadata, so the
    only difference between the old archive and the new one is the three
    sprites.
    """
    if not DESIGN_TARBALL.exists():
        print(f"missing, skipped: {DESIGN_TARBALL.name}")
        return False
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        with tarfile.open(DESIGN_TARBALL, "r:gz") as archive:
            members = archive.getmembers()
            archive.extractall(work, filter="data")
        dirty = False
        for relative, colours in DESIGN_SPRITES:
            path = work / "package" / relative
            if not path.exists():
                print(f"missing, skipped: {relative}")
                continue
            if clean_file(path, colours):
                dirty = True
        if not dirty or check:
            return dirty
        with tarfile.open(DESIGN_TARBALL, "w:gz") as archive:
            for member in members:
                source = work / member.name
                if member.isfile() and source.exists():
                    member.size = source.stat().st_size
                    with source.open("rb") as handle:
                        archive.addfile(member, handle)
                else:
                    archive.addfile(member)
        # The installed copy is a snapshot of the tarball taken at install
        # time, so it has to be refreshed too or the dev server keeps serving
        # the old art until the next `npm install`.
        installed = ROOT / "node_modules" / "@yeaboi-ai" / "design"
        if installed.exists():
            for relative, _ in DESIGN_SPRITES:
                shutil.copyfile(work / "package" / relative, installed / relative)
        return True


def main() -> int:
    check = "--check" in sys.argv
    dirty = clean_design_tarball(check)
    for relative, colours in SPRITES:
        path = ROOT / relative
        if not path.exists():
            print(f"missing, skipped: {relative}")
            continue
        if check:
            before = Image.open(path).convert("RGBA")
            after = snap_alpha(before)
            if colours is not None:
                after = quantise(after, colours)
            print(f"{relative}\n  before {describe(before)}\n  after  {describe(after)}")
            if after.tobytes() != before.tobytes():
                dirty = True
        elif clean_file(path, colours):
            dirty = True
    if check and dirty:
        print("\nsprites are not clean — run `make sprites-clean`")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
