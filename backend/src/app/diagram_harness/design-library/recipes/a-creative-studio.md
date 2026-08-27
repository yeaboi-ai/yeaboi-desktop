# Recipe A: Creative Studio / Agency

## Quick ref

- **When:** Portfolio, case studies, agency sites, "we make cool stuff". Anywhere the work itself is the pitch.
- **Token budget:** ~18k baseline (HARNESS + philosophy + typography + layout + motion + imagery + anti-similarity). +30k if Energy=High (WebGL recipes).
- **Files to read:** `00-philosophy.md`, `01-typography.md`, `03-layout.md`, `05-motion.md`, `06-imagery-texture.md`
- **Personality fit:** Primary — Brutalist, Editorial. Strong — Professional, Playful, Luxury, Bold.

## Page flow

```
[Preloader with branded animation]
    ↓
[Full-viewport canvas/WebGL world — NOT a hero section, an ENVIRONMENT]
    ↓ scroll triggers transition
[Work: drag-to-explore spatial layout OR pinned horizontal scroll — projects float, overlap, move at different parallax speeds]
    ↓ seamless transition (no section break)
[Philosophy statement — single massive sentence pinned during scroll, words highlighting sequentially]
    ↓
[Capabilities — NOT a list. Interactive: hover one, the others dim. Or: scattered across the viewport at angles]
    ↓
[Contact — full-screen takeover with mouse-reactive background. Email as the ONLY element.]
```

Key: NO visible section breaks. The page is one continuous scroll experience. Sections blend into each other through scroll-driven transitions, not padding gaps.

## Techniques

- Viewport-filling display typography in hero (Studio Dialect: 150px+ uppercase)
- Canvas or WebGL background layer (Unseen: Three.js, Studio Dialect: Canvas)
- Mouse-follow interaction with lerp tracking in hero
- Custom cursor (Unseen pattern)
- Clip-path text reveals on scroll (Bec Restaurant, Dulcedo)
- Staggered card entrance with varying sizes (asymmetric grid)
- Clip-path polygon button hovers (Springs Estate)
- Smooth scroll via Lenis
- Page transitions via Barba.js if multi-page
- Grain/noise overlay (Arc pattern)
- Coordinate display or spatial UI elements (Studio Dialect: X/Y tracker)
- Ambient gradient blob background (Springs Estate)
- Named speed tokens for all transitions (Studio Dialect: fast/normal/slow)

## Font direction

Bold grotesque or geometric sans (display) + monospace (labels). Consider: variable weight sans at extreme sizes. Do NOT use Inter, Space Grotesk, or Poppins.

## Color

Two-color constraint. Dark background + ONE saturated accent. See `02-color.md` > Two-Color Constraint Pattern.

## Motion budget

HIGH. This is your showreel. Use every motion technique that serves the narrative. But pick ONE easing curve and use it everywhere.

## Reference sites

Studio Dialect, Unseen, Good Fella, Locomotive.

## Anti-patterns

Generic project grid with equal-sized cards. Centered hero with gradient. Stock photography. More than 3 colors.

## WebGL enhancement

When the brief calls for immersive, cinematic, or award-winning quality, use WebGL recipes from `webgl-recipes.md`:
- **Subtle:** Recipes 10 (GPU detection) + 6 (shader gradient) + 11 (parallax) + 12 (text animation)
- **Moderate:** + Recipes 5 (scroll-sync) + 7 (mouse distortion) + 3 (post-processing)
- **Heavy:** + Recipes 1 (scene transitions) + 2 (Z-depth gallery) + 8 (camera spline) + 4 (SDF text)

Output as self-contained HTML with inline Three.js/GSAP/GLSL via CDN import maps.
