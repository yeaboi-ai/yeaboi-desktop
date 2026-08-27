# Recipe H: Photography / Portfolio

## Quick ref

- **When:** Photographer portfolio, fine-art portfolio, director reels, visual storytelling.
- **Token budget:** ~13k (HARNESS + imagery + typography + layout + anti-similarity). +30k WebGL if High.
- **Files to read:** `06-imagery-texture.md`, `01-typography.md` > Luxury/Editorial, `03-layout.md`
- **Personality fit:** Primary — Editorial. Strong — Luxury, Brutalist, Editorial, Warm/Human, Organic, Bold.

## Page flow

```
[Full-viewport featured image — NO text except photographer name in corner. The image IS the landing page. Scroll indicator only.]
    ↓ scroll triggers image to scale down and drift up, revealing:
[Project list — NOT a grid. Stacked project names (large serif, light weight) with hover-triggered image preview appearing alongside cursor or in a fixed column. Text on left, preview on right.]
    ↓ clicking a project:
[Project detail — full-screen slideshow. Images fill viewport. Arrow keys or swipe to advance. Minimal caption: location, couple name, date. No UI chrome.]

Back to list:
[About — NOT a section. A single paragraph in the project list's gutter. Maybe 3 lines. Link to full bio.]
    ↓
[Contact — email address, large, centered. Availability status ("Booking 2027"). Instagram link. That's it.]
```

Key: the portfolio is IMAGE-FIRST. Text is metadata, not content. The homepage is a list of names that reveal images, not a gallery grid. Study Adovasio.

## Techniques

- Full-bleed photography edge-to-edge — the photo IS the design (Adovasio)
- Serif typography overlaid on images at light weight (BerlingskeSerif 300)
- Asymmetric project grid: names offset left/right with image center (Adovasio)
- Letter-switching animation for project names
- Project image height expand on hover (Adovasio: 0.6s cubic-bezier)
- Custom power easing via `linear()` function
- Minimal chrome — navigation almost invisible
- Featured/category filter bar

## Font direction

Light-weight serif (display) + clean sans (body). Typography should feel like magazine captions, not headings. See Adovasio entry.

## Color

Near-monochromatic. Dark charcoal or warm white. Photography carries ALL color. Zero decorative color.

## Motion budget

LOW. Photography is the focus. Subtle hover expansions. Opacity transitions. Letter-switching. Nothing that competes with images.

## Reference sites

Adovasio, Apple.

## Anti-patterns

Equal-size thumbnail grid. Lightbox popup galleries. Watermarks. Visible UI competing with photos.

## WebGL enhancement

See `webgl-recipes.md` for immersive treatments. Subtle recipes (10, 6, 11, 12) work best — full-scene 3D usually competes with photography.
