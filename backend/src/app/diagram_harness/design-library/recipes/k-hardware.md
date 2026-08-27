# Recipe K: Hardware / Physical Product

## Quick ref

- **When:** Vehicles, consumer electronics, devices, tools, physical goods.
- **Token budget:** ~15k (HARNESS + page-archetypes + motion + imagery + anti-similarity). +30k WebGL if High.
- **Files to read:** `07-page-archetypes.md` > Product/Hardware, `05-motion.md`, `06-imagery-texture.md`
- **Personality fit:** Primary — Professional, Technical. Strong — Luxury, Editorial, Bold. Bad fit — Playful, Organic.

## Page flow

```
[Cinematic video hero — looping, muted. Product in motion/context. Bold 4-word headline. Scroll indicator.]
    ↓ video PINNED — scroll causes it to zoom into product detail, transitioning to:
[Product reveal — scroll-driven: product rotates/zooms as user scrolls. Key specs appear at scroll positions like annotations. This section is 3-4 viewport heights tall but the product stays centered.]
    ↓ product fades, replaced by:
[Experience narrative — alternating layout:
  - Viewport 1: full-bleed lifestyle image + short text overlay
  - Viewport 2: white bg, specs + diagram
  - Viewport 3: full-bleed different context image
  Each viewport is a different visual treatment.]
    ↓
[Social proof — partner logos + one key stat ("10,000 pre-orders" or "FAA certified")]
    ↓
[App/ecosystem — if digital companion exists, show it. Product screenshot + key benefits.]
    ↓
[CTA — "Reserve" or "Pre-order" or "Learn more". Single action. Large. Centered.]
```

Key: SCROLL-DRIVEN product reveal is the signature. The product transforms as you scroll. Not just "scroll to the next section" — the scroll IS the interaction.

## Techniques

- Cinematic video hero — real footage, not renders (Joby)
- Multi-layer parallax (Joby: 12+ layers for depth)
- Photography-first: lifestyle context alongside product isolation (Apple)
- Scroll-based progressive disclosure (Apple: reveal specs as you scroll)
- Partner/validation logos as trust signals (Joby: Toyota, NASA)
- Dual CTA: "Learn more" + "Buy/Order"
- Lenis smooth scroll
- Bold minimal headlines (Apple: "Skip traffic. Time to fly.")

## Font direction

Strong sans-serif. Bold, confident, minimal words. See Apple and Joby entries.

## Color

Dark backgrounds for cinematic feel. Product imagery carries color. Near-monochromatic interface.

## Motion budget

HIGH. Parallax. Video. Scroll reveals. This sells a physical experience through digital means.

## Reference sites

Joby Aviation, Apple.

## Anti-patterns

3D renders instead of real photography. Spec-sheet layout. Technical jargon as hero copy.

## WebGL enhancement

See `webgl-recipes.md` — product reveal is the strongest 3D use case. Subtle (10, 6, 11, 12) for ambient; heavy (1, 2, 4, 8) for full 3D model viewer.
