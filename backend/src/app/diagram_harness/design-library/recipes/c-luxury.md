# Recipe C: Luxury Brand

## Quick ref

- **When:** Spirits, fashion, hospitality, high-end retail, watchmaking, perfume, jewellery.
- **Token budget:** ~19k (HARNESS + typography + color + motion + imagery + page-archetypes). +30k WebGL if High energy.
- **Files to read:** `01-typography.md` > Luxury/Editorial pairing, `02-color.md`, `05-motion.md`, `06-imagery-texture.md`, `07-page-archetypes.md` > Product/Hardware
- **Personality fit:** Primary — Luxury, Editorial. Strong — Professional, Organic/Natural.

## Page flow

```
[Age gate or "Enter experience" with brand wordmark — sets the tone]
    ↓ cinematic transition (fade through black)
[Full-viewport cinematic video — auto-plays, muted, with overlaid editorial serif headline. NO UI visible except a scroll indicator]
    ↓ scroll peels video away like a curtain
[Brand philosophy — massive text, one sentence per viewport height. Scroll reveals each word/line. No images competing.]
    ↓ color shift (dark → light or vice versa)
[Product showcase — NOT a grid. One product at a time, full-width. Image tilts/rotates on scroll (3D transform). Product name + one line of copy.]
    ↓ horizontal scroll or swipe between products
[Sourcing/craft story — editorial magazine layout: text wraps around images, pull quotes, varying column widths]
    ↓
[Sustainability/values — minimal: icon + one sentence each. Feels like footnotes, not a marketing section]
    ↓
[Where to buy — clean, single CTA. Maybe a map.]
```

Key: SLOW. Generous spacing. Each viewport shows ONE thing. User should feel unhurried. Scroll distances between content blocks are intentionally large.

## Techniques

- Cinematic video hero with text overlay (Aupale: "Born From The Untouched Wilderness")
- Container query fluid typography (Aupale: `max(9cqi, var(--text-heading-xl))`)
- Narrative-first structure: philosophy → product → commerce (Aupale pattern)
- Staggered clip-path + skew text reveals (Aupale)
- Product photography as palette carrier — minimal interface color
- Age gate or entry experience if appropriate
- Smooth scroll via Lenis
- Per-product gradient or color variant (Aupale: distinct gradient per seltzer)
- Extreme typographic restraint — serif at light weights, massive scale

## Font direction

Refined serif (display, light weight 200-400) + premium sans (body) + monospace (detail/metadata). Three fonts, three personalities. See `01-typography.md` > Luxury/Editorial table.

## Color

Product-driven. Let photography/video carry the palette. Interface is near-monochromatic. See `02-color.md` > Aupale pattern.

## Motion budget

MEDIUM. Slow, deliberate reveals. Long durations (1–1.4s). Smooth easing. No flashy effects — motion should feel "unhurried." Staggered text reveals are the star.

## Reference sites

Aupale Vodka, Springs Estate, Apple.

## Anti-patterns

Bright colors competing with product. Fast snappy animations. Dense layouts. Any hint of "tech startup" aesthetic.

## WebGL enhancement

When brief calls for immersive, cinematic, or award-quality, use `webgl-recipes.md`:
- **Subtle:** Recipes 10, 6, 11, 12.
- **Moderate:** + 5, 7, 3.
- **Heavy:** + 1, 2, 8, 4.
