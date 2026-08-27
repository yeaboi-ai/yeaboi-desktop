# Recipe J: Talent / Fashion Agency

## Quick ref

- **When:** Model agency, influencer management, talent representation, casting agency.
- **Token budget:** ~15k (HARNESS + color + typography + motion + components + anti-similarity).
- **Files to read:** `02-color.md`, `01-typography.md`, `05-motion.md`, `04-components.md`
- **Personality fit:** Primary — Professional, Editorial. Strong — Luxury, Brutalist, Bold. Bad fit — Technical, Organic.

## Page flow

```
[Hero — single hero talent portrait (B&W), centered, with concentric circle canvas animation behind. Brand tagline flanks the image: "WE ARE" left, "DULCEDO" right. Massive gold headline below viewport: scrolling reveals it.]
    ↓ scroll reveals headline word by word
[Talent showcase — NOT a grid. One talent at a time, full width. Image left (clip-path reveals from bottom), name + category + social reach right. Scroll advances to next talent. Feels like flipping magazine pages.]
    ↓
[Category filter — sticky horizontal bar. Tapping a category reshuffles visible talent with clip-path exit/enter animations.]
    ↓
[How it works — 3-step numbered process. Numbers in large serif italic. Steps in sans bold. Side-by-side, not stacked.]
    ↓
[Client logos — minimal strip, grayscale]
    ↓
[Contact — split screen: left is dark bg with CTA, right is form or casting submission link]
```

Key: ONE talent at a time, magazine-style. Never show a grid of faces — that reduces people to thumbnails.

## Techniques

- Black + metallic accent (gold/silver) as two-color constraint (Dulcedo: `#C5AE79`)
- B&W photography for talent portraits — unifies diverse subjects (Dulcedo)
- Clip-path inset image reveals on scroll (Dulcedo: `showImage`/`hideImage` keyframes)
- Serif italic for numbering + sans bold for titles (fashion editorial move)
- Canvas animation behind hero portrait
- SplitLine text animations
- Mega-nav with category filtering (Fashion, Lifestyle, Fitness, etc.)
- "How It Works" numbered process section

## Font direction

Premium sans at extreme weight (800, uppercase) for headings + serif italic for accent/numbering. See Dulcedo entry.

## Color

Black + ONE metallic/luxury accent. B&W photography eliminates color competition. See `02-color.md` > Two-Color Constraint.

## Motion budget

MEDIUM. Clip-path image reveals. Panel sliding transitions. Subtle hover states. Nothing playful — this is fashion, not tech.

## Reference sites

Dulcedo.

## Anti-patterns

Colorful talent cards. Headshot grids with matching backgrounds. Bright playful UI.
