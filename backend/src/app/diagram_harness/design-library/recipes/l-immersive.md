# Recipe L: Immersive Storytelling

## Quick ref

- **When:** Year-in-review, annual report, cause campaign, interactive documentary, scrollytelling feature.
- **Token budget:** ~16k baseline. +30–40k WebGL (this recipe is typically WebGL-heavy).
- **Files to read:** `05-motion.md` > Scrollytelling, `03-layout.md`, `07-page-archetypes.md` > Immersive. If WebGL: `webgl-core.md` + `webgl-recipes.md`.
- **Personality fit:** Primary — Editorial. Strong — Playful, Luxury, Brutalist, Warm/Human, Bold, Organic.

## Page flow

```
[Branded preloader — animated logo or progress indicator. NOT a spinner. Sets the mood.]
    ↓ dissolves into:
[Chapter 1 — STICKY section. Background canvas/WebGL visualization FIXED. Text blocks scroll past it, each triggering a state change in the visualization. This is scrollytelling: the graphic stays, the narrative moves.]
    ↓ chapter transition (color shift or wipe)
[Chapter 2 — different visual treatment. Maybe full-bleed photography with overlaid text revealing on scroll. Or a map with animated routes.]
    ↓
[Chapter 3 — data visualization: numbers animate as they scroll into view. Charts draw themselves. Progress bars fill.]
    ↓
[Chapter 4 — video interlude. Auto-plays on scroll entry. Pauses on exit.]
    ↓
[Chapter 5+ — repeat pattern but NEVER same treatment twice]
    ↓
[Impact summary — key numbers at massive scale. Monospace. Centered.]
    ↓
[CTA — donation, signup, or share. Emotionally earned by this point.]

Navigation: persistent chapter dots on right edge (like OceanX). Click to jump.
```

Key: CHAPTERS, not sections. Each chapter is a different visual medium (scrollytelling, photography, video, data viz). The scroll IS the narrative pacing — total scroll height 2500vh+.

## Techniques

- 100vh sticky sections with scroll-driven progression (OceanX)
- Chapter-based navigation
- Clip-path + split-text animations for cinematic reveals (OceanX)
- Fixed WebGL/Canvas background layer
- DM Mono + serif pairing: technical + editorial (OceanX: DM Mono + Zeist)
- 2500vh+ total scroll height for pacing control
- Detail drawers that slide in from right (desktop) / bottom (mobile)
- Preloader with branded animation

## Font direction

Monospace for technical/navigation + serif for editorial narrative. The contrast says "rigorous + beautiful."

## Color

Environmental. Deep darks + one bright functional accent (OceanX: navy + cyan). Color guides interaction hierarchy.

## Motion budget

VERY HIGH. This IS the experience. Scroll-driven everything. But never hijack scroll — monitor it, don't alter it.

## Reference sites

OceanX 2025, The Pudding.

## Anti-patterns

Standard scrolling sections. Click-to-reveal instead of scroll. Loading spinners instead of branded preloader.

## WebGL enhancement

Core recipe for WebGL work. Load `webgl-core.md` + all relevant recipes from `webgl-recipes.md`:
- **Default:** Recipes 5 (scroll-sync), 6 (shader gradient), 10 (GPU detection), 11 (parallax), 12 (text animation)
- **Heavy (most immersive stories):** + 1 (scene transitions), 2 (Z-depth), 3 (post-processing), 4 (SDF text), 7 (mouse distortion), 8 (camera spline)
