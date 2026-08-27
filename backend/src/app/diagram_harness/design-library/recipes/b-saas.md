# Recipe B: SaaS Product

## Quick ref

- **When:** Landing page selling software, product marketing, signup flow, dev tools with marketing chrome.
- **Token budget:** ~20k (HARNESS + page-archetypes + components + ergonomics + typography + color + anti-similarity).
- **Files to read:** `07-page-archetypes.md` > SaaS Landing Page, `04-components.md`, `09-ergonomics.md`, `01-typography.md`, `02-color.md`
- **Personality fit:** Primary — Professional. Strong — Playful, Editorial, Warm/Human, Technical.

## Page flow

```
[Sticky header: logo + nav + CTA — slims on scroll]
    ↓
[Hero: product UI screenshot/demo as focal point + headline + dual CTA — NOT centered text over gradient]
    ↓
[Logo bar — 1 row, grayscale, no section heading]
    ↓
[Feature showcase: each feature gets its OWN visual treatment:
  - Feature 1: left text + right product screenshot
  - Feature 2: FULL WIDTH product UI, text overlaid
  - Feature 3: bento grid of sub-features
  No two features should look the same.]
    ↓
[Interactive demo or video — pinned during scroll, controls advance it]
    ↓
[Testimonials — NOT a carousel. Staggered asymmetric quotes with company logos]
    ↓
[Pricing — 2-3 cards, one highlighted, toggle annual/monthly]
    ↓
[FAQ accordion]
    ↓
[Final CTA — mirrors hero messaging, single button]
```

Key: each feature section has a DIFFERENT layout. Rhythm changes section to section. Dense → spacious → dense.

## Techniques

- Product UI screenshot/demo as hero visual (not abstract illustration)
- Bento grid for features with varying card sizes (03-layout.md)
- Single-focus sections with ONE message per viewport (Linear principle)
- Social proof bar (logos) immediately after hero
- Dual CTA: primary high-commitment + secondary low-friction
- Dark mode with LCH color system (Linear pattern)
- Sticky header that slims on scroll
- Metric cards with monospace numbers if showing stats
- FAQ accordion before pricing
- Skeleton loading states for interactive demos

## Font direction

Clean modern sans (display) + same family lighter weight (body). One family is fine — hierarchy through weight/size. Pair with monospace for code/data elements.

## Color

Restrained. 3-4 colors max. Use semantic colors (success/error/warning) functionally. Dark mode expected. See `02-color.md` > LCH Color System.

## Motion budget

LOW-MEDIUM. Staggered reveals on scroll. Subtle hover states. No parallax, no scroll hijacking. Animations serve information, not decoration (Linear: "don't compete for attention you haven't earned").

## Reference sites

Linear, Stripe, Vercel, Notion.

## Anti-patterns

Purple gradients. Three-column icon+title+description grid. Bouncy animations. Glassmorphism on everything. "Unlock your potential" copy.
