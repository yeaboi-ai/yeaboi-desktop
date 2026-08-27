# Layout

> Layout is how you control attention, create rhythm, and structure information. It's the invisible architecture of every page.

---

## Quick ref

- **When to load:** landing, editorial, e-commerce, portfolio, marketplace recipes.
- Principles: hierarchy, rhythm, proximity, negative space, break-the-grid moments.
- Grids: 12-column default; override per section — uniform grid across a page is a design failure.
- Bento grid = varying card sizes within a grid, used sparingly (not as default structure).
- Editorial grid: alternate layouts every section — no two rows of feed look the same.
- Spacing tokens: 4px base, exponential scale (4, 8, 12, 16, 20, 24, 32, 48, 64).
- Section rhythm matters — vary vertical heights, density, visual weight across sections.

---

## Principles

### Intentional Asymmetry

Instead of perfectly balanced 50/50, use 60/40 or 70/30 splits. Offset images from center. Let elements overlap. CSS Grid and Flexbox make asymmetrical layouts trivial.

### DO

- **Vary section heights and rhythms.** Not every section should be the same height. Alternate between tall and short, dense and sparse.
- **Let content dictate layout.** A testimonial section doesn't need to look like a feature section. Different content types deserve different visual treatments.
- **Use negative space as a design element.** Japanese "ma" — the space between elements is as important as the elements. Generous padding and margin direct attention and create breathing room.
- **Break the grid deliberately.** An element extending beyond its column, an image bleeding to the edge, a text block offset from alignment — these signal craft.
- **Use progressive disclosure.** Don't show everything at once. Reveal as the user scrolls or interacts.

### DO NOT

- Use the same 12-column grid for every section
- Center-align everything
- Make every section full-width
- Use identical padding on every section
- Place three equal-width columns side by side as your default

---

## The Editorial Grid

Magazine and newspaper layouts use multi-column grids where content spans different numbers of columns. A headline spans 8 columns while body text sits in 5. An image breaks out of the grid entirely. Study NYT, Bloomberg, ProPublica.

### Code Pattern

```css
.editorial-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 1.5rem;
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 2rem;
}

.headline { grid-column: 1 / 9; }
.body-text { grid-column: 2 / 7; }
.sidebar { grid-column: 8 / 13; }
.full-bleed { grid-column: 1 / -1; margin: 0 -2rem; }
.pull-quote { grid-column: 3 / 11; text-align: center; }
.image-breakout { grid-column: 1 / -1; margin: 0 calc(-50vw + 50%); }
```

---

## Bento Grid

67% of top 100 SaaS websites on ProductHunt use bento layouts. They increase dwell time by 47% and CTR by 38%.

```css
.bento-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.bento-card {
  border-radius: 16px; /* 12-24px range; Apple uses 20px */
  overflow: hidden;
}

.bento-card--featured {
  grid-column: span 2;
  grid-row: span 2;
}

.bento-card--wide { grid-column: span 2; }

@media (max-width: 1024px) {
  .bento-grid { grid-template-columns: repeat(3, 1fr); }
}

@media (max-width: 768px) {
  .bento-grid { grid-template-columns: 1fr; }
}
```

**Rules:**
- Uniform gaps create visual rhythm
- 4-column grid with 16px gaps, cards spanning 1, 2, or 4 columns
- Maintain proportional relationships across breakpoints
- Corner radius 12-24px; 20px correlates with 18% higher "professionalism" ratings
- Nielsen Norman Group: users scan F-patterns. Largest content in top-left captures prime attention.

---

## Responsive Design Patterns

### Breakpoints (Industry Standard)

```css
/* Mobile first */
@media (min-width: 640px)  { /* sm — large phones */ }
@media (min-width: 768px)  { /* md — tablets */ }
@media (min-width: 1024px) { /* lg — small laptops */ }
@media (min-width: 1280px) { /* xl — desktops */ }
@media (min-width: 1536px) { /* 2xl — large screens */ }
```

### Container Queries (Modern Approach)

Aupale Vodka uses container query units (`cqi`, `cqh`) for responsive scaling — components respond to their container, not the viewport:

```css
.card-container {
  container-type: inline-size;
}

.card-title {
  font-size: max(9cqi, var(--text-heading-xl));
}

.card-spacing {
  padding: min(10cqi, 10cqh);
}
```

### Mobile Ergonomics

- **Thumb zone:** Primary actions in bottom 1/3 of screen (easy reach)
- **Minimum touch target:** 44x44px (Apple HIG) / 48x48px (Material)
- **Bottom navigation** for 3-5 primary destinations (don't use hamburger for primary nav)
- **One-handed use:** Critical controls within thumb reach arc
- **Spacing between touch targets:** Minimum 8px gap to prevent mis-taps

---

## Scanning Patterns

### F-Pattern (Text-Heavy Pages)

Users scan in an F shape: across the top, then down the left side with short horizontal forays. Place critical information along the F path. Used by news sites, blogs, search results.

### Z-Pattern (Marketing Pages)

On image-heavy or sparse pages, eyes follow a Z: top-left → top-right → diagonal to bottom-left → bottom-right. Place logo top-left, CTA top-right, key message bottom-left, primary action bottom-right.

### Gutenberg Diagram (Simple Layouts)

Four quadrants: Primary Optical Area (top-left), Strong Fallow (top-right), Weak Fallow (bottom-left), Terminal Area (bottom-right). Users' attention flows diagonally from primary to terminal. Place CTAs in the terminal area.

---

## Spacing System

### Consistent Scale

```css
:root {
  --space-1: 0.25rem;  /* 4px */
  --space-2: 0.5rem;   /* 8px */
  --space-3: 0.75rem;  /* 12px */
  --space-4: 1rem;     /* 16px */
  --space-6: 1.5rem;   /* 24px */
  --space-8: 2rem;     /* 32px */
  --space-12: 3rem;    /* 48px */
  --space-16: 4rem;    /* 64px */
  --space-24: 6rem;    /* 96px */
  --space-32: 8rem;    /* 128px */
}
```

### Section Spacing Rules

- Between major sections: `--space-24` to `--space-32` (96-128px)
- Between subsections: `--space-12` to `--space-16` (48-64px)
- Between related elements: `--space-4` to `--space-8` (16-32px)
- Internal component padding: `--space-3` to `--space-6` (12-24px)
- **Vary section spacing** — not every section gets the same margin. Dense sections need more breathing room after them.

---

## Layout Patterns from Reference Sites

### Joby Aviation — Cinematic Sections
Full-width hero sections with prominent imagery. 12+ parallax layers for depth. Alternating imagery-left/text-right. Each product gets dedicated real estate — never cramped. Lifestyle context alongside product isolation.

### OceanX — Sticky Scroll Narrative
`100svh` sections with sticky positioning. Scroll-driven parallax. 2500vh total scroll height creating chapter-based progression. Content tied to scroll position via visibility classes.

### Unseen Studio — 3D Spatial Grid
Projects positioned in 3D coordinate space (`position: {x, y, z}`). Drag-to-explore navigation. Depth layering replaces traditional grid. `transform-style: preserve-3d` with `perspective: 32rem`.

### Aupale Vodka — Container-Driven
Container query units throughout. Asymmetric layouts emphasizing negative space. Imagery breaking conventional grid boundaries. Generous vertical spacing (`min(10cqi, 10cqh)`).

---

## Hero Section Layout Patterns

> From analysis of 30+ sites on heroinspo.com. See `07-page-archetypes.md` for full hero guide.

### Spacing

| Property | Value | Source |
|----------|-------|--------|
| Top padding (desktop) | 100-173px | Reflect: 173px, Liftoff: 90px, Arc: 72px |
| Top padding (mobile) | 64-108px | Reflect: 108px |
| Content max-width | 600-700px | Text block constrained for readability |
| Container max-width | 1200-1440px | Liveblocks: 1280px, Beside: 1920px |
| Element gap | 1.5-2rem | Between headline, subheadline, CTAs |
| Below-hero spacing | 4-6rem | Before trust bar or next section |

### Container Pattern

```css
.hero-container {
  width: 100%;
  max-width: min(max(100vw - 80px, 1px), 1280px); /* Framer pattern */
  margin: 0 auto;
  padding: 0 var(--page-margin, 2rem);
}

/* Responsive page margins */
@media (max-width: 768px)  { :root { --page-margin: 1rem; } }
@media (min-width: 769px)  { :root { --page-margin: 2rem; } }
@media (min-width: 1280px) { :root { --page-margin: 3rem; } }
```

### Full-Viewport vs Auto-Height

**Full-viewport** (`height: 100dvh`) — cinematic sites (Joby, OceanX), background video heroes, brand/agency sites. Content anchored to bottom with `align-content: end`.

**Auto-height** (padding-based) — SaaS, conversion-focused. Content stacks naturally. Most sites use this.

### Breakpoints Observed

| Site | Mobile | Tablet | Desktop | Wide |
|------|--------|--------|---------|------|
| Linear | 640px | — | 1024px | — |
| Voiceflow | 479px | 767px | 991px | — |
| ToDesktop | 576px | 768px | 957px | 1040px |
| Liveblocks | — | — | — | 1280px (max-w) |
| Solidroad | 810px | — | 1200px | — |
| Markopolo | 810px | — | 1200px | 1440px |
| Joby | 768px | 1024px (portrait) | — | — |

---

## Anti-Patterns

- **Centered everything**: Best sites use centered heroes but asymmetric feature sections
- **Uniform card grids**: Bento grids VARY card sizes deliberately. Equal-sized grids = template fingerprint
- **Same rhythm throughout**: Vary visual density section to section
- **Grid for grid's sake**: Let content determine the layout, not a pre-built grid system
