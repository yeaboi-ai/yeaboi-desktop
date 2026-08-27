# Recipe Q: Developer Docs / Technical

## Quick ref

- **When:** API documentation, SDK reference, developer tools, technical libraries.
- **Token budget:** ~14k (HARNESS + dashboards + components + typography + a11y/perf + anti-similarity).
- **Files to read:** `08-dashboards.md`, `04-components.md`, `01-typography.md`, `10-accessibility-performance.md`
- **Personality fit:** Primary — Technical. Strong — Professional, Brutalist. Bad fit — Luxury, Bold, Playful, Organic.

## Page flow intent

This is an APPLICATION, not a marketing page. Persistent sidebar + header shell. Content area scrolls. Same structure as Recipe G (Dashboard) but optimized for reading and code.

Key: `sidebar tree nav (collapsible) + sticky TOC on right + content center`.

No sections, no hero, no scroll animations. Instant navigation. Search is the #1 interaction.

## Techniques

- Sidebar navigation with tree structure and search
- Code blocks with syntax highlighting + copy button
- "Spaceship instruction manual" aesthetic (thin lines, monospace labels, diagrams)
- Tabbed code examples (cURL / Python / Node / etc.)
- Sticky table of contents highlighting current section
- Dark/light theme toggle
- Version selector in nav
- Breadcrumbs for deep nesting
- API endpoint cards with method badges (GET/POST/PUT/DELETE)

## Font direction

Monospace for ALL code. Clean sans for prose. The monospace IS the identity — choose a distinctive one (JetBrains Mono, Geist Mono, not Courier).

## Color

Dark-first. Syntax highlighting palette must be accessible. Semantic colors for HTTP methods (green GET, blue POST, orange PUT, red DELETE).

## Motion budget

MINIMAL. Docs are utility. Instant transitions. No scroll reveals. The only animation: smooth scroll to anchors and code copy feedback.

## Anti-patterns

Motion-heavy page transitions. Scroll-triggered reveals on docs (users are searching, not browsing). Poor mobile code block handling.
