# Dashboards & Data-Dense Interfaces

> Users visit dashboards daily. First impressions matter less than sustained readability, information hierarchy, and operational clarity.

---

## How Dashboards Differ from Landing Pages

| Landing Page | Dashboard |
|---|---|
| First impression, storytelling | Repeated daily use, glanceability |
| Scrollytelling, narrative flow | Spatial layout, everything visible |
| Conversion-focused | Efficiency-focused |
| Hero section, CTA buttons | Status indicators, metric cards |
| Photography as hero | Data as hero |
| Progressive disclosure via scroll | Progressive disclosure via navigation/tabs |
| Entertainment | Operational clarity |

---

## The "War Room" Aesthetic

Bloomberg Terminal, Grafana, Linear, Datadog share common DNA: dark backgrounds, high information density, monospace data, semantic color coding, restrained accent colors. This is the "spaceship instruction manual" — dashboards ARE control panels. Lean into it.

---

## Dashboard Typography

- **Display/headings:** Distinctive sans-serif for page titles and section headers (Syne, Satoshi, Cabinet Grotesk, General Sans). Your personality layer.
- **Body/UI:** System sans stack or clean workhorse — not Inter. Try DM Sans, Plus Jakarta Sans, Outfit. Your readability layer.
- **Data/numbers:** Monospace is MANDATORY for all tabular data, prices, counts, timestamps, IDs. JetBrains Mono, IBM Plex Mono, Geist Mono. Monospace alignment makes columns scannable — proportional fonts in data tables are a readability crime.
- **Scale:** Dashboard headings smaller than landing page headings. 1.25-1.75rem for page titles, not 4rem heroes. Save drama for the data.

---

## Dashboard Color Strategy

Dashboards need MORE colors than landing pages, with stricter rules:

### Semantic Palette (Non-Negotiable)

```css
:root {
  /* Each needs full + dim (8-15% opacity background) variants */
  --positive: #22c55e;
  --positive-dim: rgba(34, 197, 94, 0.12);

  --negative: #ef4444;
  --negative-dim: rgba(239, 68, 68, 0.12);

  --warning: #f59e0b;
  --warning-dim: rgba(245, 158, 11, 0.12);

  --info: #3b82f6;
  --info-dim: rgba(59, 130, 246, 0.12);
}
```

### Accent Color

ONE brand accent, used sparingly: active nav states, selected items, primary actions. This is your identity color.

### Surface Hierarchy

```css
:root {
  --bg-base: #0a0a0c;      /* Background (deepest) — the void */
  --bg-surface: #111116;    /* Cards — one step up */
  --bg-raised: #18181f;     /* Hover/active — another step */
  --border: #1e1e28;        /* Subtle borders */
  --border-hover: #2a2a38;  /* Interactive border state */

  --text-bright: #f4f5f8;   /* Headings */
  --text-default: #b0b0b8;  /* Body */
  --text-dim: #6b6b76;      /* Labels, timestamps */
}
```

**DO NOT** use your accent color for semantic meaning. Separate brand from function.

---

## Dashboard Layout

### Sidebar Navigation

Not top nav. Dashboards have 5-15 pages — a sidebar scales, a top bar doesn't.

```css
.sidebar {
  width: 15rem;
  background: var(--bg-base);
  border-right: 1px solid var(--border);
  padding: 1rem 0;
  position: fixed;
  height: 100vh;
  overflow-y: auto;
}

.sidebar-link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
  color: var(--text-dim);
  font-size: 0.875rem;
  transition: color 150ms ease;
}

.sidebar-link:hover { color: var(--text-default); }
.sidebar-link.active {
  color: var(--text-bright);
  background: var(--bg-raised);
}
```

### Metric Cards

The dashboard equivalent of the landing page hero:

```css
.metric-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1.25rem;
}

.metric-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-dim);
  margin-bottom: 0.25rem;
}

.metric-value {
  font-family: var(--font-mono);
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--text-bright);
  font-variant-numeric: tabular-nums;
}

.metric-delta {
  font-size: 0.75rem;
  font-family: var(--font-mono);
  margin-top: 0.25rem;
}
.metric-delta--up { color: var(--positive); }
.metric-delta--down { color: var(--negative); }
```

### Cards, Not Sections

Landing pages have full-width sections. Dashboards have cards in grids:
- Consistent border radius (6-8px)
- Subtle borders (not shadows — shadows look wrong on dark)
- Consistent internal padding
- Slight hover state (border brightens or background lifts)

### Section Headers

```css
.section-header {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-dim);
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 1rem;
}
```

---

## Dashboard Motion

Less motion than landing pages, but what exists matters more:

### DO

- Staggered fade-in on page load (cards appear 50ms apart)
- Smooth transitions between page views (opacity + subtle translate)
- Micro-animations on status changes (number updating, status dot pulsing)
- Skeleton loading states matching final layout shape

### DO NOT

- Parallax anything
- Scroll-triggered reveals
- Bouncy spring animations (toy-like in operational contexts)
- Animate every hover (just tables and interactive elements)

---

## Charts and Data Visualization

```css
.chart-grid-line {
  stroke: var(--border);
  stroke-opacity: 0.3;
  stroke-dasharray: 4 4;
}

.chart-axis-label {
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  fill: var(--text-dim);
}

.chart-tooltip {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
}
```

Rules:
- Match chart colors to semantic palette (not random)
- Area/line for time series, bar for comparison, NEVER pie charts
- Grid lines: very subtle (5-8% opacity), dashed
- Gradient fills from accent to transparent add depth
- Axis labels: dim color, small monospace

---

## The Dashboard Checklist

- [ ] Dark theme with 3+ surface levels (background, card, raised)
- [ ] Monospace font for ALL numeric/tabular data
- [ ] Semantic color palette (green/red/amber/blue) with dim variants
- [ ] Sidebar navigation with clear active states
- [ ] Metric cards with label/value/delta hierarchy
- [ ] Tables with row hover, sticky headers, right-aligned numbers
- [ ] Status indicators (dots + labels, not color alone)
- [ ] Empty states with icon + explanation + action
- [ ] Staggered fade-in on page load
- [ ] Consistent card styling (border, radius, padding, hover)
- [ ] Brand accent used sparingly — only nav active + primary actions
- [ ] Section headers: small, uppercase, letterspaced, dim color
- [ ] No purple gradients, no glassmorphism, no bento grids
- [ ] `prefers-reduced-motion` respected
- [ ] Page titles in distinctive display font (not body font)
