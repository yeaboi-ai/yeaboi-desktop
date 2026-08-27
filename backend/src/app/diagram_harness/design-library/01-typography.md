# Typography

> Typography is the single most powerful differentiator in web design. In 2026, it IS the backbone of visual identity.

---

## Quick ref

- **When to load:** every recipe references this file.
- Principles: hierarchy, measure (45–75ch), rhythm, contrast pair.
- Font pools: display sans, display serif, body sans, monospace, premium paid.
- Never Inter/Roboto as sole typeface unless brand-mandated.
- Use `text-wrap: balance` on headlines, `clamp()` or container queries for fluid scale.
- Pairing logic: pick one display + one body + one mono. Three roles, three personalities.
- Variable fonts preferred — a single weight axis beats 4 static weights.

---

## Principles

### Typography-Driven Layout

Build the layout around the type, not the other way around. Start with your headline and body copy, set them at the right size with the right measure, then build the layout around that. The type dictates the grid, not a pre-built grid dictating the type.

### DO

- **Use variable fonts.** A single file can express weight, width, slant, and custom axes. Type can respond to user interaction (scroll position, cursor, time of day).
- **Create contrast through type pairing.** Distinctive serif or display face for headlines + clean sans-serif for body.
- **Use type at extreme scales.** Oversized headlines (120px+) paired with small body text (14-16px) creates dramatic hierarchy AI rarely produces.
- **Let typography be the hero.** The best sites have minimal imagery — the type IS the design. Study Locomotive, Unseen Studio.
- **Explore unconventional foundries.** Avoid Google Fonts defaults.

### DO NOT

- Use Inter, Roboto, or Poppins as your primary typeface (they're the Comic Sans of AI-generated design)
- Set all text at the same size with the same weight
- Use only one typeface family across the entire site
- Ignore line-height, letter-spacing, and measure (line length)
- Use Google Fonts as your only source

---

## Type Scale Reference

Based on analysis of Vercel Geist, Linear, Stripe, and Awwwards winners:

| Purpose | Size | Line Height | Letter Spacing | Usage |
|---------|------|-------------|----------------|-------|
| Marketing hero | 64-120px | 0.9-1.0 | -0.04 to -0.1em | Landing page main headline |
| Page heading | 48-64px | 0.95-1.1 | -0.03 to -0.04em | Section headers |
| Section heading | 32-40px | 1.1-1.2 | -0.02em | Feature section titles |
| Subsection | 20-24px | 1.2-1.3 | -0.01em | Card titles, callouts |
| Body large | 18-20px | 1.5-1.6 | 0 | Marketing copy, hero supporting |
| Body default | 14-16px | 1.5-1.7 | 0 | Most content |
| Caption/meta | 12-13px | 1.4-1.5 | 0.01-0.02em | Timestamps, secondary labels |
| Button large | 16px | 1.25 | 0 | Primary CTAs |
| Button default | 14px | 1.25 | 0 | Standard buttons |
| Label/overline | 11-12px | 1.3 | 0.05-0.1em | Section labels, uppercase tags |

### Key Rules from the Best Sites

- Letter-spacing tightens as size increases: -0.04em to -0.1em for headlines
- Line-height decreases for headlines (0.9-1.1), increases for body (1.5-1.7)
- Use `text-wrap: balance` on headlines (Linear uses this)
- Use `clamp()` for fluid type scaling: `clamp(2rem, 4vw, 2.5rem)`
- Variable fonts reduce HTTP requests: define axes `"wght" 100-900`
- Optimal reading measure: 45-75 characters per line (66 ideal)

---

## Font Pairing Reference

### SaaS / Tech Products

| Heading | Body | Vibe | Reference |
|---------|------|------|-----------|
| Geist Sans (bold) | Geist Sans (regular) | Developer-clean | Vercel |
| Inter Display | Inter | Professional-modern | Linear |
| Sohne | Sohne (lighter weight) | Geometric-premium | Stripe |
| Space Grotesk | Inter | Technical-friendly | Developer tools |
| Plus Jakarta Sans | DM Sans | Warm-approachable | Notion-like |
| Cabinet Grotesk | Satoshi | Contemporary-fresh | Agency/startup |

### Editorial / Content

| Heading | Body | Vibe |
|---------|------|------|
| Playfair Display | Source Serif 4 | Classic editorial |
| Fraunces | Libre Franklin | Modern editorial |
| GT Super | Graphik | Premium magazine |
| ABC Oracle | Inter | Distinctive digital editorial |
| InstrumentSerif | HelveticaNowDisplay | Luxury editorial (Aupale) |

### Creative / Agency

| Heading | Body | Vibe | Reference |
|---------|------|------|-----------|
| Marlin (custom) | Inter | Branded premium | Arc |
| Saol Display | Neue Montreal | Sophisticated avant-garde | Unseen |
| Girott (custom, 700) | Flatspot | Cinematic bold | NEON |
| Clash Display | General Sans | Bold creative | — |
| Basement Grotesque | Neue Montreal | Brutalist modern | — |

### Luxury / Editorial

| Heading | Body | Vibe | Reference |
|---------|------|------|-----------|
| InstrumentSerif | HelveticaNowDisplay | Luxury editorial | Aupale |
| PP Woodland (serif, 200-300) | Manrope | Warm fine dining | Bec Restaurant |
| BerlingskeSerif (300) | Inter | Elegant photography | Adovasio |
| Victor Serif (400) | TT Commons Pro | Nature luxury | Springs Estate |
| Saol Display (300, italic) | Helvetica Now Display (800) | Fashion/talent | Dulcedo |

### Data / Dashboards

| Display | Body | Data/Mono | Vibe | Reference |
|---------|------|-----------|------|-----------|
| Syne | DM Sans | JetBrains Mono | War room | — |
| Cabinet Grotesk | Outfit | IBM Plex Mono | Technical | — |
| General Sans | Plus Jakarta Sans | Geist Mono | Clean data | — |
| Geist (700) | Geist (500) | Geist Mono (600) | Command-line studio | Studio Dialect |

### Extreme Scale Typography (From Extractions)

| Site | Font | Hero Size | Letter-Spacing | Line-Height |
|------|------|-----------|---------------|-------------|
| Studio Dialect | Geist 700 | 209px | -16px | 169px |
| NEON | Girott 700 | 160px | -4.8px | 144px |
| Springs Estate | Victor Serif 400 | 180px | -3.6px | 160px |
| Bec Restaurant | PP Woodland 300 | 100px | normal | 90px |
| Dulcedo | Helvetica Now 800 | 50px | normal | 50px |
| Good Fella | Aktiv Grotesk 500 | 60px | -3px | 68px |

---

## Foundries Beyond Google Fonts

**Premium (paid, distinctive):**
- Pangram Pangram, Dinamo, Klim Type, Grilli Type, Sharp Type, Colophon, OR Type, Commercial Type, Production Type

**High-quality open source:**
- Inter, Geist (Vercel), Space Grotesk, DM Sans, Plus Jakarta Sans, Outfit, General Sans, Satoshi, Cabinet Grotesk

**Variable font resources:**
- [v-fonts.com](https://v-fonts.com) — Variable font playground
- Dinamo Typefaces — Excellent guide on using variable fonts on web
- [MDN Variable Fonts](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Fonts/Variable_fonts)

**Type pairing tools:** Fontjoy, Typewolf

---

## Code Patterns

### Fluid Typography with clamp()

```css
:root {
  --text-hero: clamp(3rem, 8vw, 7.5rem);
  --text-h1: clamp(2.5rem, 5vw, 4rem);
  --text-h2: clamp(1.75rem, 3vw, 2.5rem);
  --text-h3: clamp(1.25rem, 2vw, 1.75rem);
  --text-body: clamp(0.875rem, 1vw, 1rem);
  --text-caption: clamp(0.75rem, 0.8vw, 0.8125rem);
}

h1 {
  font-size: var(--text-hero);
  line-height: 0.95;
  letter-spacing: -0.04em;
  text-wrap: balance;
}
```

### Variable Font Setup

```css
@font-face {
  font-family: 'MyFont';
  src: url('/fonts/myfont-variable.woff2') format('woff2');
  font-weight: 100 900;
  font-display: swap;
}

.headline {
  font-variation-settings: 'wght' 800, 'wdth' 75;
}
```

### Responsive Type Scale (Tailwind)

```js
// tailwind.config.js
fontSize: {
  'hero': ['clamp(3rem, 8vw, 7.5rem)', { lineHeight: '0.95', letterSpacing: '-0.04em' }],
  'h1': ['clamp(2.5rem, 5vw, 4rem)', { lineHeight: '1.0', letterSpacing: '-0.03em' }],
  'h2': ['clamp(1.75rem, 3vw, 2.5rem)', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
  'body': ['clamp(0.875rem, 1vw, 1rem)', { lineHeight: '1.6' }],
}
```

### The Aupale Pattern: Container Query Typography

```css
.hero-heading {
  font-size: max(9cqi, var(--text-heading-xl));
  line-height: 0.85;
  letter-spacing: -0.03em;
  text-transform: capitalize;
}
```
