# Recipe M: E-commerce / Online Store

## Quick ref

- **When:** Product listings, checkout, DTC brand, online retail, shop.
- **Token budget:** ~18k (HARNESS + components + ergonomics + color + a11y/perf + anti-similarity).
- **Files to read:** `04-components.md`, `09-ergonomics.md`, `02-color.md`, `10-accessibility-performance.md`
- **Personality fit:** Primary — Professional. Strong — Playful, Luxury, Editorial, Warm/Human, Organic.

## Page flow

```
Homepage:
[Hero — featured product or collection. NOT a banner carousel. One hero image + headline + "Shop now". Maybe a looping product video.]
    ↓
[Category navigation — visual cards (not text links). 3-4 categories with lifestyle photography. Varying card sizes (bento).]
    ↓
[Featured products — horizontal scroll. Price + name visible without hover. Quick-add button appears on hover.]
    ↓
[Brand story strip — single sentence + link to about. NOT a full about section.]
    ↓
[Social proof — reviews or UGC photos. Minimal.]

Product page (separate structure entirely):
[Split: product images LEFT (gallery with zoom) + product info RIGHT (sticky on scroll)]
  Product info: name, price, color swatches, size selector, Add to Bag (sticky on mobile), description accordion, reviews
[Related products below — horizontal scroll, not grid]
```

Key: TWO different page structures (homepage vs product). Homepage is a discovery experience. Product page is a conversion machine. Don't conflate them.

## Techniques

- Product photography as hero — studio-quality, edge-to-edge (Apple pattern)
- Horizontal product carousel with snap scrolling
- Quick-view cards with hover-reveal add-to-cart
- Sticky "Add to Bag" bar on product pages
- Skeleton loading for product grids
- Color swatches as interactive buttons (not dropdowns)
- Zoom on hover for product images
- Trust signals near CTA (shipping, returns, reviews)
- Bento grid for featured collections (varying card sizes)

## Font direction

Clean contemporary sans for UI + serif or display for brand personality moments (collection names, hero headlines).

## Color

Brand-forward but never competing with product photography. Neutral base + ONE brand accent for CTAs/prices. Semantic colors for sale/new/low-stock badges.

## Motion budget

LOW-MEDIUM. Performance is critical — every ms matters for conversion. Subtle hover states, skeleton loading, smooth page transitions. No scroll-driven effects on listing pages.

## Anti-patterns

Cluttered product cards. Popup everything. Auto-playing carousels. Tiny add-to-cart buttons (Fitts's Law). More than 2 CTAs per product card.
