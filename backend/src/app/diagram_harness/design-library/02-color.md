# Color

> Color communicates state, hierarchy, brand, and meaning. Never decoration alone.

---

## Quick ref

- **When to load:** every recipe references this file.
- Three-to-five rule: ≤5 colours total including neutrals.
- Semantic palette (positive/negative/warning/info) with dim bg variants — mandatory for dashboards + utility.
- Surface hierarchy in dark mode: 3+ levels (base, surface, raised).
- Brand accent NEVER reused for semantic meaning.
- LCH / OKLCH preferred over HSL for perceptual uniformity.
- Two-colour constraint pattern: background + ONE saturated accent. Strongest distinctiveness signal.
- Dark mode requires explicit design — not just invert. Shadows → borders on dark.

---

## The Three-to-Five Rule

Premium brands work with 3-5 colors maximum: one or two primaries, one or two secondaries, and neutrals. A consistent palette improves brand recognition by up to 80%.

---

## Principles

### DO

- **Define brand color tokens before touching code.** Choose colors based on brand personality, not trends. A burnt orange and sage green communicates something entirely different from purple and teal.
- **Use perceptual color spaces.** OKLCH and LCH produce more consistent, accessible color ramps than HSL. Linear's LCH system generates entire themes from 3 variables.
- **Study brands outside tech.** News, hospitality, fashion, food — they use color vocabularies tech has forgotten. Warm cream, deep navy, muted terracotta stand out in a sea of indigo.
- **Use color functionally.** Color communicates state, hierarchy, and meaning — not just decoration.
- **Test everything for accessibility.** WCAG contrast minimums: 4.5:1 for body text, 3:1 for large text. Non-negotiable.

### DO NOT

- Use purple/indigo as your primary color (unless your brand genuinely calls for it)
- Apply gradient meshes as backgrounds
- Use more than 5 colors in your palette
- Choose colors because they look good in isolation — test in context with real content
- Use gradient overlays on paragraph-length text
- Use your accent color for semantic meaning (if accent is amber, don't also use amber for warnings)

---

## Color Restraint

Some of the most striking sites use near-monochromatic palettes. A white background with one strong accent color, applied sparingly, creates more impact than a rainbow gradient. Study how The New York Times, Stripe, and Linear use color — it's surgical, not decorative.

Aupale Vodka uses green iridescence tied to product identity (aurora/opal symbolism) with distinct gradients per product variant — color IS the product differentiator, not decoration.

---

## LCH Color System (Best Practice from Linear)

LCH (Lightness, Chroma, Hue) is perceptually uniform — a red and yellow at lightness 50 appear equally light to human eyes. HSL cannot do this.

```css
:root {
  /* 3 variables generate an entire theme */
  --base-color: lch(15% 5 250);     /* Near-black with subtle blue */
  --accent-color: lch(60% 40 250);  /* Desaturated blue accent */
  --contrast: 0.85;                  /* 0-1 scale */
}
```

Benefits:
- Automatic high-contrast variant generation for accessibility
- Perceptually uniform — equal lightness values look equally light
- 3 input variables generate entire theme instead of 98 individual tokens

---

## Dark Mode Implementation

Dark mode is expected in 2026, not optional.

### Surface Hierarchy (Critical for Dark Themes)

```css
:root[data-theme="dark"] {
  /* Background (deepest) — the void */
  --bg-base: #0a0a0c;
  /* Surface (cards) — one step up */
  --bg-surface: #111116;
  /* Surface raised (hover/active) — another step */
  --bg-raised: #18181f;
  /* Border — subtle */
  --border: #1e1e28;

  /* Text — 3 tiers minimum */
  --text-bright: #f4f5f8;    /* Headings */
  --text-default: #b0b0b8;   /* Body */
  --text-dim: #6b6b76;       /* Labels, timestamps */
}
```

### Dark Background References from Top Sites

| Site | Background | Vibe |
|------|-----------|------|
| Vercel | `#0a0a0a` | Pure near-black |
| Linear | `#222326` (Nordic Gray) | Warm charcoal |
| Raycast | `#070921` | Deep navy |
| OceanX | `#000d15` | Ocean midnight |
| Unseen | `#0a0a0a` to `#212121` | Layered dark |
| Aupale | Natural dark with green iridescence | Brand-driven dark |

### Implementation Checklist

- Use `prefers-color-scheme` media query for system detection
- Store preference in localStorage
- Set `color-scheme: light dark` in `<meta>` tag
- SVG assets need light/dark variants (Vercel uses `-light`/`-dark` filename suffixes)
- Images may need brightness reduction in dark mode
- Use `suppressHydrationWarning` on root (Next.js) for theme hydration
- Test WCAG contrast ratios in BOTH themes
- Never pure black (#000) — use 1-10% lightness brand colors

---

## Semantic Color Palette (For Dashboards and Products)

```css
:root {
  /* Positive / success / buy */
  --semantic-positive: #22c55e;
  --semantic-positive-dim: rgba(34, 197, 94, 0.12);

  /* Negative / error / sell */
  --semantic-negative: #ef4444;
  --semantic-negative-dim: rgba(239, 68, 68, 0.12);

  /* Warning / pending */
  --semantic-warning: #f59e0b;
  --semantic-warning-dim: rgba(245, 158, 11, 0.12);

  /* Info / neutral */
  --semantic-info: #3b82f6;
  --semantic-info-dim: rgba(59, 130, 246, 0.12);

  /* Brand accent — ONE color, used sparingly */
  --accent: #your-brand-color;
  --accent-dim: rgba(your-brand-color, 0.12);
}
```

Each semantic color needs TWO variants: full (for text/badges) and dim (8-15% opacity, for backgrounds). Keep brand accent separate from semantic meaning.

---

## Color Palettes from Reference Sites

### Stripe — Vivid Optimism
"Always favor bright and vivid colors, conveying enthusiasm." Bold, saturated hues. Signature animated gradient wave. Restraint within individual sections despite bright palette.

### Arc Browser — Craft and Warmth
- Primary blue: `#3139FB`
- Off-white: `#FFFCEC`
- Cream: `#FFFADD`
- Red accent: `#FB3A4D`
- Noise texture overlays for depth

### OceanX — Environmental Storytelling
- Dark navy: `#000d15`, `#00263e`
- Cyan accent: `#90e0ef` (interactive elements)
- Orange accent: `#ff7438` (CTAs)
- Color serves function — cyan guides hierarchy, orange emphasizes action

### Unseen Studio — Contextual Color
- Dark base: `#212121`, `#0a0a0a`
- Warm accent: `#efded9` (cream/beige)
- Interactive: `#FF4E1B` (vibrant orange)
- Per-project custom backgrounds — color reflects each client's identity

### Aupale Vodka — Product-Driven Color
- Green iridescence reflecting aurora/opal symbolism
- Distinct gradients per product variant (seltzer flavors)
- Minimal interface color — let product photography carry the palette

### NEON — Swappable Theme System
```css
:root {
  --background: #fff;
  --foreground: #000;
  --theme-primary: #fff;
  --theme-secondary: #000;
  --color-red: #E31612;    /* NEON red */
  --color-blue: #2416C4;   /* Deep blue for nav */
  --color-green: #aeff00;  /* Accent */
}
```
Theme variables swap per page/context — same tokens, different values.

### Bec Restaurant — Warm Provençal (Non-Obvious)
- Blush pink: `#FFF0F0` (background)
- Deep navy: `#003250` (text/buttons)
- Salmon: `#FABDB4` (accent/nav)
- Three colors with clear roles. NOT a typical restaurant palette.

### Good Fella — Two-Color Constraint
- Near-black: `rgb(20, 19, 20)` (background)
- Orange: `rgb(251, 70, 13)` (accent — the ONLY color)
- Grey surface: `rgb(51, 51, 51)` (cards)
- Muted text at 70% opacity via oklab

### Dulcedo — Black + Gold Luxury
- Near-black base
- Gold accent: `#C5AE79` (nav, headings) — warmth against black
- All photography B&W — zero competing color

### Studio Dialect — Technical Minimalism
- Charcoal: `#242424` (bg)
- Light grey: `#d2d2d2` (text)
- Electric yellow-green: `#dfff00` (highlight/active — the "digital" accent)
- Only 3 functional colors. Extreme restraint.

### Springs Estate — Nature Palette with RGB Variants
```css
:root {
  --c-dark-green: #162d24;
  --c-dark-green-rgb: 22,45,36;  /* enables rgba() */
  --c-green: #1b4732;
  --c-light-green: #a7b431;
  --c-dark-blue: #101e27;
  --c-blue: #005160;
  --c-light-blue: #67bfda;
  --c-sky: #bee5ee;
  --c-beige: #e0d1b6;
  --c-beige-background: #f5e8d1;
}
```
Every color has an RGB variant for transparency operations.

---

## Two-Color Constraint Pattern

Multiple extracted sites use only 2 functional colors (background + one accent). This forces clarity and creates a strong identity:

| Site | Background | Accent | Result |
|------|-----------|--------|--------|
| Good Fella | Near-black | Orange `#FB460D` | Technical, energetic |
| Dulcedo | Black | Gold `#C5AE79` | Luxury, fashion |
| Studio Dialect | Charcoal `#242424` | Yellow-green `#DFFF00` | Digital, technical |
| Apple | White | None (product photos carry color) | Premium, clean |

The pattern: dark base + ONE saturated accent = instant identity.

---

## 2026 Color Trends

- **Calm palettes:** Moving from bold saturation toward warm, breathable tones
- **Pantone 2026 Color of the Year:** "Cloud Dancer" (soft warm white)
- **Multi-tonal depth** over single-color blocks
- **Warm accents on neutral foundations**
- **OKLCH adoption** in CSS for better color manipulation
