# Recipe I: Film / Entertainment

## Quick ref

- **When:** Distributor, production company, streaming service, film festival, cinema.
- **Token budget:** ~15k (HARNESS + motion + typography + color + layout + anti-similarity). +30k WebGL if High.
- **Files to read:** `05-motion.md`, `01-typography.md`, `02-color.md`, `03-layout.md`
- **Personality fit:** Primary — Editorial. Strong — Luxury, Brutalist, Bold. Bad fit — Technical, Playful.

## Page flow

```
[Full-viewport featured film — parallax still behind massive title. Auto-rotating between 2-3 featured films (clip-path transitions, not fade). Watch Trailer + Find Screenings CTAs.]
    ↓ scroll compresses hero into a slim persistent "now showing" bar
[Film strip — horizontal scroll of poster cards (2:3 ratio). Cards bleed off right edge. Drag to explore. NOT a grid.]
    ↓
[Coming Soon — stacked full-width rows. Each row: date + title + type badge. Hover highlights entire row. Feels like a theater schedule board.]
    ↓
[Cinematic statement — centered, massive type. "We find the films the world needs to see." NO supporting content. Just the words and negative space.]
    ↓
[Marquee — film titles scrolling infinitely. Separates content from footer.]
    ↓
[Footer — cinema credits style. 3 columns: Navigate, Connect, Business. Dense mono type.]
```

Key: POSTER-FIRST. The page is a visual gallery of film art, not a text-based catalog. Horizontal scrolling for the primary content. Vertical stacking only for schedule/utilitarian content.

## Techniques

- Full-bleed parallax film stills as hero (NEON: `motion-parallax`)
- Custom display typeface at massive scale — 160px+, uppercase (NEON: Girott)
- Named easing variables as reusable system (NEON: `--ease-snappy`, `--ease-spring`)
- Swappable theme variables per page/film (NEON: `--theme-primary`/`--theme-secondary`)
- Horizontal scrolling film carousel
- Background-size underline grow on hover (NEON: 0.7s snappy ease)
- `--motion` toggle variable (0 or 1) for reduced motion
- Marquee for "Now Playing" or "Coming Soon"

## Font direction

Bold, heavy custom display font + refined sans body. The display font should feel like a movie poster. See NEON entry.

## Color

High contrast. Black/white base. ONE signature color (NEON red: `#E31612`). Swappable per film/show via CSS variables.

## Motion budget

HIGH. Cinematic. Parallax. Slow reveals. But controlled — never chaotic.

## Reference sites

NEON.

## Anti-patterns

Generic video player embed. Standard card grid for films. Muted corporate palette.

## WebGL enhancement

See `webgl-recipes.md`. Subtle recipes (10, 6, 11, 12) for ambient; moderate (+ 5, 7, 3) for trailer page; heavy (+ 1, 2, 8, 4) for immersive festival sites.
