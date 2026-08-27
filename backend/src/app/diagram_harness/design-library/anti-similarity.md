# Anti-Similarity — Variation Directives

> Forces stylistic variation across outputs so repeated briefs produce different designs. Load for every generation. Operates at the constraint level, not the recipe level.

---

## Quick ref

- **Goal:** 10 users with "make me a SaaS landing page" should get 10 visibly different outputs.
- **Mechanism:** before generation, pick N constraints from pools below, inject them as fixed rules, honour a forbid-list of recently-used patterns.
- **Scope:** applies on top of the recipe + personality + modifier selection. The recipe says *what* the page is; the personality says *how* it feels; the modifiers scale density/energy/era; the variation constraints are the fingerprint that differentiates this output from the last one.
- **Pipeline expectation:** the app layer is responsible for (1) picking constraints via the app's RNG/seed, (2) maintaining the recent-output forbid-list per team, (3) injecting both into the prompt. This file is the pool.

---

## How to use this file in the generation prompt

When building the generator prompt, include this block:

```
VARIATION CONSTRAINTS — you MUST honour all of these:
- <constraint 1, picked from a pool>
- <constraint 2, picked from a different pool>
- <constraint 3, picked from a different pool>

FORBID LIST — these patterns were used in the team's last 3 outputs, do NOT use them:
- <pattern A>
- <pattern B>
```

Pick one constraint from at least three different pools below. Pools are intentionally orthogonal so the combination is uncorrelated.

---

## Pool 1 — Layout signatures

Pick ONE. Determines the structural fingerprint of the primary viewport / hero / list.

1. **Asymmetric split** — 60/40 or 70/30. Primary content left-heavy or right-heavy, never centred.
2. **Off-grid drop caps** — first letter of primary heading breaks the grid (oversized, bleeds left).
3. **Diagonal zoning** — a ≤10° rotation or skew on one hero element (image, headline, accent block).
4. **Horizontal rail** — a scroll-sideways element among vertical content (carousel, chip rail, trail of cards).
5. **Overlap stack** — hero image overlaps headline by ≥15%; depth via z-index not drop shadow.
6. **Grid with intentional gap** — 12-column grid with one column deliberately left empty (rhythm break).
7. **Full-bleed interruption** — one section breaks out of max-width, bleeds edge to edge, then return.
8. **Margin note column** — right margin reserved for dates, captions, metadata (editorial style).
9. **Two-line split headline** — headline splits across two lines with different alignment (L + R).
10. **Centred but constrained** — everything centred, but content width varies per section (narrow intro, wide hero, narrow pull-quote).

---

## Pool 2 — Type treatments

Pick ONE. Determines the typographic signature.

1. **Extreme scale contrast** — hero 5–8× body size; nothing middle.
2. **Weight-only hierarchy** — single family; hierarchy by weight (200 / 500 / 800) not size.
3. **Mixed-case hero** — headline in lowercase except proper nouns (e.g., "we build software for humans").
4. **Uppercase labels everywhere** — all section labels, button text, meta UPPERCASE with 0.05–0.1em tracking.
5. **Letter-spaced body** — body copy tracked +0.02em for reading calm (luxury / editorial).
6. **Display serif + mono body** — unusual pairing; serif for warmth, mono for data-feel.
7. **Italic display** — hero in italic cut of the display face (not a bold-italic — the italic is the statement).
8. **Variable weight axis** — single variable font, weight changes per section (header lighter than hero).
9. **Numbers in display face** — prices, counts, years rendered in display/serif at dramatic scale, not body or mono.
10. **Heading with inline accent colour** — one word in the headline gets the accent colour; rest is default text.

---

## Pool 3 — Colour signatures

Pick ONE. Determines the palette fingerprint.

1. **Two-colour constraint** — background + ONE saturated accent. No third colour permitted.
2. **Monochromatic tint ladder** — 5 tints of a single hue; accent comes from saturation, not hue shift.
3. **Warm + single cool accent** — everything warm (creams, sands, terracottas) except one cool accent (slate, steel).
4. **Cool + single warm accent** — inverse of above.
5. **Saturated dark** — dark mode where the "dark" is saturated (deep green, aubergine, indigo-night) not neutral black.
6. **Newsprint** — off-white base, near-black text, one red or one blue accent. Feels editorial.
7. **Photograph-driven** — UI is monochrome; all colour comes from the content photography.
8. **Gradient-as-brand** — one continuous gradient is the brand. No flat accent colour; the gradient appears on every surface that would normally be flat.
9. **Pastel constraint** — all colours desaturated to pastel (≤40% saturation). No high-saturation accents.
10. **High-contrast poster** — 2–3 flat saturated colours, no gradients, no tints, no transparency. Reads as a silkscreen.

---

## Pool 4 — Motion signatures

Pick ONE. Determines how the interface moves.

1. **Static** — no motion beyond state transitions. The calm is the statement.
2. **Single signature easing** — pick one cubic-bezier and use it on every animated property.
3. **Slow reveals** — all scroll reveals ≥800ms. Interface feels unhurried.
4. **Snap transitions** — no easing; instant state changes. Brutalist / technical feel.
5. **Magnetic cursor** — buttons + links subtly attract the cursor on hover (≤8px pull).
6. **Text split-reveal** — hero headline reveals word-by-word or line-by-line on load.
7. **Staggered grid** — cards / list items enter with 40–80ms stagger between them.
8. **Background drift** — ambient, slow gradient or blob motion in the background (landscape scale).
9. **Scroll-linked scale** — hero element scales or shifts with scroll depth (subtle).
10. **Cursor as tool** — custom cursor (dot / circle / text) with specific hover states per element type.

---

## Pool 5 — Micro-signatures

Pick ONE. Small details that differentiate at the pixel level.

1. **Tabular numerics everywhere** — `font-variant-numeric: tabular-nums` on all number display.
2. **Underline on hover** — links get a drawing-in underline on hover, not colour-shift.
3. **Hand-drawn icon set** — SVG paths with irregular stroke widths, not perfect geometrics.
4. **Grainy texture overlay** — subtle grain (3–6% opacity) on hero + background. Adds analog feel.
5. **Border-as-accent** — borders in the accent colour (hairline) instead of the usual dim border.
6. **Square corners** — `border-radius: 0` throughout. No rounded anything.
7. **Soft shadows, no blur** — shadows with 0 blur, 4–8px offset, dim colour. Feels printed.
8. **Neon edge glow** — accent-coloured 0-blur shadow on interactive elements on hover/focus.
9. **Typographic punctuation** — use real typographic marks (“ ” ‘ ’ — … ×) never straight quotes, never hyphens as em-dashes.
10. **Coordinate / frame numbers** — visible coordinate labels, frame numbers, section IDs in corners (spatial UI / editorial).

---

## Pool 6 — Content density signatures

Pick ONE. Determines how much content is shown at once.

1. **One-concept-per-viewport** — every viewport height has a single focus. Scroll-driven narrative.
2. **Dense above-the-fold** — hero + first meaningful content all visible without scroll.
3. **Margin note density** — primary content is sparse; supporting info lives in right / left margin.
4. **Data-forward** — numbers, counts, specs dominate hero. Small display type, big data.
5. **Photography-forward** — ≥60% of each viewport is imagery.
6. **Type-forward** — text-only hero, images deferred to later sections.
7. **Progressive density** — starts sparse, gets denser as user scrolls (narrative crescendo).
8. **Tabular hero** — the hero is a comparison table, spec sheet, or data grid.
9. **List-as-landing** — the page is a long list (projects, clients, essays) — no traditional hero.
10. **Dashboard hero** — the hero is a live data panel (active users, recent events, status indicators).

---

## The Forbid List (app-side)

The application layer should maintain a rolling list of patterns used in a team's last N outputs. Inject them as explicit negative constraints.

**Suggested window:** last 3 outputs per team per recipe. So a team's 4th SaaS landing page can't reuse patterns from outputs 1–3, but can reuse from the same team's restaurant output or a different team's SaaS output.

**Granularity:** record the specific constraint value picked from each pool, plus the recipe + personality. Don't forbid whole pools, just specific picks within them.

Example state:

```json
{
  "team_id": "...",
  "recipe": "B",
  "recent_outputs": [
    {
      "at": "2026-04-18T10:00:00Z",
      "layout": "asymmetric-split",
      "type": "extreme-scale-contrast",
      "color": "two-colour-constraint",
      "motion": "single-signature-easing",
      "micro": "tabular-numerics",
      "density": "dense-above-fold"
    },
    "..."
  ]
}
```

When generating output N, forbid all values appearing in the last 3 outputs' `layout`, `type`, `color`, `motion`, `micro`, `density` fields.

---

## Uniqueness budget

If a recipe + personality has fewer distinguishable variations than you have recent outputs, degrade gracefully:

- First fallback: forbid only the most recent output (not last 3).
- Second fallback: allow repetition but require a different personality / modifier combination.
- Third fallback: accept repetition, flag it in the design memo ("this output reuses the asymmetric-split layout used 2 outputs ago — low variation budget on Recipe B + Professional personality").

Don't silently ship a near-duplicate.

---

## What this file does NOT do

- Does not replace the recipe. The recipe says what the page is; this file differentiates *within* a recipe.
- Does not override the personality. Personality constrains compatible pools (e.g., Luxury personality is incompatible with `high-contrast poster` from Pool 3).
- Does not guarantee aesthetic cohesion. The design memo (see pipeline) is responsible for explaining why the chosen combination is coherent.

---

## Compatibility notes (pool × personality)

Some picks clash with certain personalities. When generating, prune pools first:

| Personality | Layout avoid | Type avoid | Colour avoid | Motion avoid | Micro avoid | Density avoid |
|---|---|---|---|---|---|---|
| Professional | Diagonal zoning | Italic display, Mixed-case hero | Gradient-as-brand, High-contrast poster | Magnetic cursor | Hand-drawn icons, Grain overlay | List-as-landing |
| Playful | — | — | Monochromatic tint | Static | Square corners | — |
| Luxury | Full-bleed interruption | — | High-contrast poster, Saturated dark | Snap transitions | Hand-drawn icons | Dashboard hero |
| Brutalist | Centred but constrained | Letter-spaced body | Pastel constraint | Slow reveals | — | — |
| Editorial | — | — | Gradient-as-brand | — | — | Dashboard hero |
| Warm/Human | Diagonal zoning | — | Saturated dark, High-contrast poster | Snap transitions | Neon edge glow, Square corners | Dashboard hero |
| Technical | Diagonal zoning | Italic display, Mixed-case hero | Pastel constraint, Photograph-driven | Magnetic cursor | Hand-drawn icons | Photography-forward |
| Bold/Adventurous | — | Letter-spaced body | Pastel constraint | Static | — | — |
| Organic/Natural | — | — | Saturated dark, High-contrast poster | Snap transitions | Neon edge glow, Square corners | Dashboard hero |

Read as: "for Luxury personality, the High-contrast poster colour pick is incompatible — prune it before picking."
