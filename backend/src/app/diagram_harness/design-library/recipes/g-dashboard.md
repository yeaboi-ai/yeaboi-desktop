# Recipe G: Dashboard / Data Product

## Quick ref

- **When:** Admin panels, analytics, monitoring, operational UIs. For CRUD-heavy / inventory / forms-first tools ALSO read `utility-interfaces.md`.
- **Token budget:** ~14k (HARNESS + dashboards + components + color + anti-similarity).
- **Files to read:** `08-dashboards.md` (end-to-end), `08a-dashboard-palettes.md` (PICK ONE PALETTE VERBATIM), `04-components.md`. Skip `02-color.md` — palette is locked. If admin/CRUD: `utility-interfaces.md`.
- **Personality fit:** Primary — Professional, Technical. Strong — Editorial. Bad fit — Bold, Organic.

## Page flow

```
[Persistent shell — sidebar left + header top. Content area right. This layout NEVER changes between pages.]

Sidebar (fixed):
  Logo
  Nav sections (icon + label)
  Active state = accent color + filled bg
  User avatar at bottom

Header (sticky):
  Page title (display font)
  Breadcrumb
  Global actions (search, notifications, settings)

Content area (scrolls):
  [Metric cards row — 3-4 KPIs across top]
  [Primary chart — takes 60% width]  [Secondary panel — 40% width, list or small charts]
  [Data table — full width, filterable, sortable]
  [Activity feed or logs — chronological]

NO section-based vertical scrolling. It's an APPLICATION layout: fixed shell, scrolling content.
```

## Techniques

This recipe has its own complete guide in `08-dashboards.md`. Read it end-to-end. Key points:
- Dark theme with 3+ surface levels
- Monospace for ALL numeric data
- Sidebar navigation, not top nav
- Metric cards with label/value/delta pattern
- Semantic colors with dim background variants
- Staggered fade-in on page load (cards 50ms apart)
- Skeleton loading states
- Status dots + labels (never color alone)

For CRUD / admin / inventory additions (list/detail shells, bulk operations, wizards, forms, permissions, audit trails, density toggles, command palette): read `utility-interfaces.md`.

## Font direction

Monospace for ALL data. Distinctive display sans for page titles. Clean workhorse sans for body (not Inter).

## Color

**LOCKED PALETTE — see `08a-dashboard-palettes.md`.** Pick ONE of the five named palettes (`indigo-pro`, `electric-blue`, `slate-sage`, `magenta-tech`, `clean-light`) by name and copy its `colors` block verbatim. Do NOT improvise, do NOT tint backgrounds with the accent, do NOT substitute the accent for semantic colors. Backgrounds are neutral grays regardless of accent — a violet accent does NOT make the background purple-tinted.

## Motion budget

LOW. Staggered fade-in on load. Skeleton shimmer. Micro-animations on state changes. No parallax, no bounce.

## Reference sites

Linear (product), Bloomberg Terminal, Grafana, Datadog.

## Anti-patterns

Purple gradients. Glassmorphism. Bento grids as primary structure. Proportional fonts in data columns. Bouncy animations. Shadows on dark (use borders).
