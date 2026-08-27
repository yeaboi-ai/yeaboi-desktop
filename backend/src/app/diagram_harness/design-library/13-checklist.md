# Pre-Ship Checklist

> Run through this before shipping ANY frontend. Catches AI-generic patterns and quality gaps.

---

## Quick ref

- **When to load:** ALWAYS, before shipping any output. This file is the pre-flight check.
- Covers: typography, colour, layout, motion, imagery, components, ergonomics, personality, accessibility, performance, technical.
- Dashboard-specific additions at the end.
- Tool verification section at the end for library-specific checks.
- If an item cannot be checked because the output doesn't touch that area, skip it. Don't fake pass.
- Any unchecked item = block on ship OR surface as known-gap in the output's design memo.

---

## Typography

- [ ] Primary typeface is NOT Inter, Roboto, or Poppins
- [ ] Visible contrast between headline and body type (different families or dramatic size difference)
- [ ] Type hierarchy has at least 3 distinct levels with clear visual differentiation
- [ ] Line height, letter spacing, and measure are intentionally set (not defaults)
- [ ] At least one moment of "type as hero" (large-scale typography carrying the design)
- [ ] Optimal reading measure: 45-75 characters per line
- [ ] `text-wrap: balance` on headlines
- [ ] Fluid type scaling with `clamp()` or container queries

## Color

- [ ] Palette has 5 or fewer colors (including neutrals)
- [ ] Primary color is NOT purple/indigo unless brand-mandated
- [ ] Colors derived from brand intent, not framework defaults
- [ ] All text passes WCAG contrast (4.5:1 body, 3:1 large)
- [ ] Color used functionally (state, hierarchy, meaning), not just decoratively
- [ ] Dark mode implemented with system preference detection
- [ ] 3+ surface levels in dark theme (base, surface, raised)
- [ ] Semantic colors (success/error/warning/info) with dim background variants
- [ ] Brand accent color NOT reused for semantic meaning

## Layout

- [ ] Not every section uses the same grid structure
- [ ] At least one section breaks the grid (bleeding, overlapping, asymmetric)
- [ ] Section heights vary — not every section is the same vertical size
- [ ] Whitespace is generous and intentional
- [ ] Content dictates layout, not layout dictating content
- [ ] No three-column feature grid with icon + title + description
- [ ] Mobile layout is DESIGNED, not just responsive-shrunk
- [ ] Touch targets minimum 44x44px on mobile
- [ ] Spacing system is consistent (using defined tokens, not arbitrary values)

## Motion

- [ ] Every animation serves a purpose (feedback, attention, narrative)
- [ ] `prefers-reduced-motion` is respected
- [ ] No animation exists purely for decoration
- [ ] UI transitions under 300ms
- [ ] Scroll animations reveal content, not just move things around
- [ ] Consistent easing curve used throughout the site
- [ ] Staggered load animation for card/grid layouts
- [ ] No bouncy/springy animations on utility interfaces

## Imagery

- [ ] No stock photos of people at laptops or shaking hands
- [ ] No AI-generated images
- [ ] Photography (or illustration) has consistent editorial style
- [ ] Images are not purely decorative — they convey meaning
- [ ] Images have explicit width/height (prevents CLS)
- [ ] Using AVIF/WebP with fallbacks
- [ ] Lazy loading below-fold images

## Components

- [ ] Button hierarchy is clear (primary/secondary/tertiary)
- [ ] All interactive elements have hover, focus, active, and disabled states
- [ ] Focus styles are visible and designed (not default browser outline)
- [ ] Forms use single-column layout with labels above fields
- [ ] Inline validation on blur with clear error messages
- [ ] Empty states have icon + explanation + action (never just "No data")
- [ ] Loading states use skeleton screens, not spinners
- [ ] Tables have monospace numbers, right-aligned numerics, sticky headers

## Ergonomics

- [ ] Primary CTA is the most visually prominent element per viewport
- [ ] Navigation has 7 or fewer top-level items
- [ ] Progressive disclosure used — not everything shown at once
- [ ] Related elements are visually grouped (proximity principle)
- [ ] Link text describes the destination (not "Click here")
- [ ] Confirmation dialogs only for destructive/irreversible actions
- [ ] No dark patterns (confirmshaming, hidden costs, forced continuity)
- [ ] Information scent is strong — users know what each link/button will do

## Personality

- [ ] Error states and empty states have designed personality
- [ ] Loading states are not generic spinners
- [ ] Copy has a distinct voice (not generic marketing language)
- [ ] At least one "moment of delight" that surprises the user
- [ ] The site could not be mistaken for any other brand's site
- [ ] Custom 404 page exists

## Accessibility

- [ ] All images have `alt` text (or `alt=""` for decorative)
- [ ] All form inputs have associated `<label>` elements
- [ ] Keyboard navigation works for all interactive elements
- [ ] Skip-to-content link exists as first focusable element
- [ ] `aria-live` regions for dynamic content changes
- [ ] Semantic HTML throughout (no div soup)
- [ ] ARIA labels on icon-only buttons
- [ ] Focus trap in modals with Escape to close
- [ ] Color alone never conveys information

## Performance

- [ ] Lighthouse performance score > 90
- [ ] LCP < 2.5s, INP < 200ms, CLS < 0.1
- [ ] Critical CSS inlined
- [ ] Fonts preloaded with `font-display: swap`
- [ ] JavaScript code-split by route
- [ ] Third-party scripts deferred
- [ ] No layout shifts during load
- [ ] Sub-3-second load time on 3G

## Technical

- [ ] Semantic HTML (button, nav, main, article, section, aside)
- [ ] Mobile experience is designed (not just responsive)
- [ ] Component library tokens customized (not shipping defaults)
- [ ] Design tokens are consistent (one border-radius, one spacing scale)
- [ ] No unused CSS/JS shipped
- [ ] Meta tags set (title, description, OG image)
- [ ] Favicon and apple-touch-icon set

---

## Dashboard-Specific Additions

If building a dashboard, also verify:

- [ ] Monospace font for ALL numeric/tabular data
- [ ] Sidebar navigation with clear active states
- [ ] Metric cards with label/value/delta hierarchy
- [ ] Row hover highlighting on tables
- [ ] Status indicators use dot + label (not color alone)
- [ ] Section headers: small, uppercase, letterspaced, dim
- [ ] Brand accent used sparingly — only nav active + primary actions
- [ ] No glassmorphism, no bento grids, no purple gradients
- [ ] Page titles in distinctive display font

---

## Tool Verification

Before shipping, verify against available tools:

- [ ] If using shadcn: ran `get_audit_checklist` to verify implementation
- [ ] If using Magic UI: limited to 1-2 effects (not every section)
- [ ] If using Once UI: token config reflects brand (not defaults)
- [ ] If using GSAP: `prefers-reduced-motion` fallback implemented
- [ ] If using custom fonts: WOFF2 format, preloaded, `font-display: swap`
