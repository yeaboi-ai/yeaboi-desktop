# Page Archetypes

> Different page types have different jobs. Don't apply the same template to every page.

---

## Quick ref

- **When to load:** SaaS, restaurant, real-estate, film, hardware, immersive, e-commerce, event, non-profit, education, local-biz, marketplace recipes.
- Covers: SaaS landing, product/hardware, long-form editorial, 404/error, about/team, pricing, landing vs. app shell distinction.
- Each archetype specifies purpose, core sections, anti-patterns.
- DIFFERENT page types have fundamentally different structures — don't force hero→features→footer on everything.
- Complements HARNESS recipes (recipe = the type; this file = the pattern detail per section).

---

## SaaS Landing Page

Based on analysis of top-performing SaaS pages (median 3.8% conversion):

### Optimal Section Sequence

1. **Hero:** Headline + product visual + primary CTA
2. **Credibility bar:** Enterprise logos
3. **Problem statement + solution explanation**
4. **Feature sections** with benefit-focused copy (bento grid)
5. **Product demo or interactive preview**
6. **Customer testimonials** with quantified results
7. **Pricing or offer presentation**
8. **FAQ** addressing objections
9. **Closing CTA** reinforcing primary action

### Copy Rules

- 250-725 words optimal total
- Maximum 7th-grade reading complexity
- Narrative: Problem → Agitation → Solution → Proof → CTA
- Core value proposition repeated identically across sections
- Single-focus pages: one objective = 13.5% conversion vs 10.5% for multi-CTA

### CTA Optimization

- First-person action phrases: "Start my free trial" outperforms "Start free trial"
- Dual-CTA: primary high-commitment + secondary low-friction ("Watch Demo")
- Placement: hero, mid-page (after key validation), near pricing, closing section
- "No credit card required" + timeframe ("Get started in 30 seconds") reduce friction
- Sticky headers maintain CTA visibility

### Social Proof Sequencing

- Enterprise logos early (after hero)
- Specific testimonials with measurable results after features
- Third-party ratings (G2, Capterra) before pricing
- Security badges (SOC 2, GDPR) near forms

### Hero Section Shift (2026)

Moving from abstract 3D graphics to showing actual product UI early and clearly. Interactive demos embedded directly on landing pages.

### Reference: Stripe

Hero-first with full-width centered messaging. Asymmetric bento cards in feature sections. Atmospheric motion (gradient wave), not decorative. Dense footer with multi-column navigation. Single font family (Sohne), hierarchy through weight/size only.

### Reference: Linear

Dark-first. One-directional flow (top-to-bottom, left-to-right). Single-focus sections with minimal CTAs per viewport. Bold typography as design hero. Animations serve information, not decoration.

---

## Hero Section Patterns

> Distilled from analysis of 30+ sites featured on heroinspo.com (March 2026). These represent the current state of hero design across SaaS, creative, and product sites.

### The Anatomy (Top to Bottom)

```
┌─────────────────────────────────────────┐
│              [Nav Bar]                   │
├─────────────────────────────────────────┤
│                                         │
│      ● Announcement pill (optional)     │
│                                         │
│         Hero Headline                   │
│         48-80px, tight tracking         │
│                                         │
│     Supporting subheadline              │
│     18-24px, reduced opacity            │
│                                         │
│    [Primary CTA]  [Secondary CTA]       │
│                                         │
│    ┌─────────────────────────────┐      │
│    │   Product visual / video /  │      │
│    │   atmospheric background    │      │
│    └─────────────────────────────┘      │
│                                         │
│   Logo bar: "Trusted by X companies"    │
└─────────────────────────────────────────┘
```

### Three Hero Archetypes

**1. Product-forward** — show the actual product
- Cal.com: interactive booking widget embedded live in hero
- Framer: screenshot of a website built with the tool
- Notion: autoplay MP4 of product in action + custom character animations
- Coda: video with poster fallback (2272x1520px), logo carousel
- Best for: conversion-focused SaaS, when the product IS the sell

**2. Atmospheric dark** — create mood, signal premium
- Reflect: cosmic particles, hue-rotating gradients on `#030014`
- ToDesktop: glassmorphic frames, rotating elements on `#0f071d`
- Linear: pulsing 25-cell grid dots, gradient orbs on `#222326`
- Raycast: WebGL 3D glass cube with chromatic aberration on `#070921`
- Markopolo: radial gradient glow (`radial-gradient(263% 170% at 50% 232%, #d8fe91, #000)`)
- Best for: developer tools, design tools, technical products

**3. Typography-first** — the headline IS the visual
- Arc: bold centered text on brand-blue `#3139FB`, no hero image
- Cosmos: custom Oracle typeface, text-forward with smooth scroll
- Resend: "Email API for developers" — minimal, direct, one sentence
- Span: 136px headline on dark background, product photography below
- Best for: clear one-sentence value prop, strong brand identity, bold font investment

### Layout

**Centered flex column** (dominant — 80%+ of analyzed sites):
```css
.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: clamp(6rem, 12vh, 11rem) 0 clamp(4rem, 8vh, 6rem);
}

.hero-content {
  max-width: 700px;       /* constrain text for readability */
  margin: 0 auto;
  padding: 0 2rem;
}
```

**Split layout** (text + product demo — Cal.com, Framer, Liftoff):
```css
.hero-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  gap: 3rem;
  padding: 6rem 0;
}
@media (max-width: 768px) {
  .hero-split { grid-template-columns: 1fr; }
}
```

**Full-viewport cinematic** (Joby Aviation — 16-col grid, scroll-driven):
```css
.hero-cinematic {
  height: 100dvh;
  display: grid;
  grid-template-columns: repeat(16, 1fr);
  align-content: end;
  padding-bottom: 4rem;
}
```

### Typography

| Property | Range | Notes |
|----------|-------|-------|
| Heading (desktop) | 48-80px | 136px for cinematic/editorial (Span, Joby) |
| Heading (mobile) | 32-48px | Use `clamp(2.75rem, 5vw, 4.5rem)` |
| Letter-spacing | -0.02em to -0.05em | Tighter = more premium feel |
| Line-height | 95-115% | Tight, never browser default |
| Font weight | 500-700 | 550 with variable fonts trending |
| Subheading | 18-24px | Reduced to 50-70% opacity for hierarchy |
| Font rendering | Always | `-webkit-font-smoothing: antialiased` |

**Font choices from heroinspo sites:**
- Premium licensed: Aeonik Pro (Reflect, ToDesktop), Sohne (Stripe), NB International (Superpower), Cosmos Oracle (Cosmos), Sequel Sans (Atlascard)
- High-quality free: Geist Sans/Mono (Vercel, Solidroad), Inter Display (Linear), Cal Sans (Cal.com)
- Monospace accents: ApercuMono Pro (Atlascard), DM Mono (Voiceflow), Geist Mono (ToDesktop), Fragment Mono (Solidroad)

### Color

**Dark heroes** (dominant for dev/design tools):
| Site | Background | Character |
|------|-----------|-----------|
| Reflect | `#030014` | Deep navy, purple tint, cosmic |
| ToDesktop | `#0f071d` | Warm dark purple |
| Linear | `#222326` | Nordic Gray, sophisticated neutral |
| Raycast | `#070921` | Deep navy with blue undertone |
| Cosmos | `#0D0D0D` | Near-black minimal |
| Torch | `#101C36` | Dark navy, glassmorphism |
| Markopolo | `#000` + radial glow | Pure black with lime `#d8fe91` accent |

Rule: never pure `#000000` without a strong warm/bright accent. Deep navy (`#03-#0f` range) reads warmer than black.

**Light heroes:** White/off-white + single accent. Stripe, Cal.com, Framer, Durable, Liftoff.

**Bold single-color:** Arc `#3139FB` as entire background — strong opinion, instantly memorable.

**Text hierarchy via opacity** (not distinct gray values):
```css
--text-primary: #fff;                    /* headings */
--text-secondary: rgba(255,255,255,0.7); /* subheadings */
--text-tertiary: rgba(255,255,255,0.5);  /* captions */
```

### CTAs

**Two-tier is universal** across all 30 analyzed sites:
```
[Get started free]   Contact sales        ← SaaS standard
[Download for Mac]   Watch demo           ← desktop app
[Sign up with Google]  Sign up with email ← OAuth-first (Cal.com)
```

**Announcement pill** above headline (Raycast, Vercel, Liveblocks — see 04-components.md):
Small badge linking to latest feature/release. Creates topical urgency without polluting the headline.

**Hero CTAs are larger than body buttons:**
- Standard hero: height 48-52px, padding `0.75rem 1.5rem`
- Premium hero: height 64-88px, padding `1.45rem 2.6rem` (Joby, Span)
- Shape: moderate rounded (8-12px) or full pill (`border-radius: 9999px`)

**Hover patterns observed:**
- Scale pulse: `scale(1.02)` hover / `scale(0.98)` active, 150ms ease (Arc — most common)
- Glassmorphic glow: `backdrop-filter: blur(8px)` + gradient border (Reflect)
- Text-slide reveal: dual text layers sliding vertically on hover (Joby — most sophisticated)
- Icon shift: arrow slides `left: 4px` on hover (Voiceflow)
- Trending easing: `cubic-bezier(.6,.6,0,1)` at 0.45s (Reflect, ToDesktop — shared DNA)

### Media Treatment

**Hierarchy of effectiveness (2026):**
1. **Live product demo** (Cal.com) — highest conversion signal
2. **Product video/autoplay** (Notion, Coda, Beside, Atlascard) — dynamic but passive
3. **Product screenshot** (Framer) — clear but static
4. **Atmospheric ambient** (Reflect particles, Linear dots, ToDesktop glow) — mood-building
5. **WebGL 3D scene** (Raycast cube) — impressive but heavy, needs fallback
6. **Typography only** (Arc, Cosmos, Resend) — bold, requires strong brand
7. **Abstract illustration** (old Stripe wave) — increasingly dated, being replaced by product-forward

### Trust Bar

Present on 70%+ of SaaS heroes. Immediately below fold:
- **Logo carousel:** horizontal marquee, `gap: 1.5rem`, pause on hover (Coda, Voiceflow, Durable)
- **"Trusted by X":** Durable ("3M business owners"), Cal.com ("fast-growing companies")
- **Third-party badges:** Trustpilot gold (Durable), G2 ratings
- **Logo treatment:** grayscale + reduced opacity, colorize on hover

### Load Animation Sequence

Consensus pattern from 30 sites:
1. Nav appears first (instant or `t1` 100ms)
2. Announcement pill fades in (if present)
3. Headline fades up (`translateY(20px)` → `0`, 400-600ms)
4. Subheadline follows (50-100ms stagger after headline)
5. CTAs appear (50-100ms after subheadline)
6. Media/visual loads last (lazy, 500ms+ after CTAs)

```css
.hero-stagger {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.6s cubic-bezier(.6,.6,0,1),
              transform 0.6s cubic-bezier(.6,.6,0,1);
}
.hero-stagger.visible { opacity: 1; transform: translateY(0); }
.hero-stagger:nth-child(1) { transition-delay: 0.1s; }
.hero-stagger:nth-child(2) { transition-delay: 0.2s; }
.hero-stagger:nth-child(3) { transition-delay: 0.3s; }
.hero-stagger:nth-child(4) { transition-delay: 0.4s; }
```

**Ambient effects** (dark heroes only):
- Grid dots: `3200ms steps(1, end) infinite`, opacity 0.3→1 (Linear)
- Hue rotation: `@keyframes hue { to { filter: hue-rotate(360deg) } }` (Reflect)
- Slow rotation: `@keyframes spin { to { rotate: 360deg } }` (ToDesktop)
- Parallax layers: 0.1x-1.1x speed ratios, 11 layers (Joby)

### Hero Anti-Patterns

- Centered H1 + subtitle + gradient + two buttons **with no distinctive choice** — the AI default
- Abstract 3D blob as hero — trend is product-forward (2026)
- Hero image that doesn't earn its space — if not the product and not atmospheric, remove it
- Loading screen before the hero — only acceptable for full 3D environments
- More than 2 CTAs — creates choice paralysis
- Auto-playing sound — never

---

## Agency / Portfolio

### Structure

1. **Hero:** Studio name + reel or statement (not "Welcome to our agency")
2. **Selected work:** Grid with varying card sizes, project thumbnails
3. **Capabilities:** What you do (brief, not a wall of text)
4. **About/philosophy:** What makes you different
5. **Contact:** Simple, direct

### Reference: Unseen Studio

- 3D spatial portfolio — projects in coordinate space, drag to explore
- Minimal self-promotion — work speaks, only footer logo
- Project filtering: All, Branding, Digital, Motion, Experiment
- Separate R&D/labs section showing technical innovation
- Sound design consideration ("Enter without audio" option)
- Per-project custom backgrounds reflecting each client's identity

### Reference: Locomotive

- Typography as primary design element
- Theme-switching: different projects trigger different color themes
- Custom scroll library (Locomotive Scroll) for smooth feel
- No frontend frameworks — custom solutions built from scratch
- Language toggle (EN/FR)

### Portfolio Grid Anti-Pattern

Avoid: equal-size cards in a perfect grid. Do: vary sizes, one featured project larger, hover reveals project details, video on hover.

---

## Product / Hardware

### Structure

1. **Cinematic hero:** Video or high-quality image of product in context
2. **Value proposition:** What it does for the user (not specs)
3. **Feature sections:** Each capability with its own visual treatment
4. **Social proof / validation:** Partners, certifications, press
5. **CTA:** Clear path to purchase or learn more

### Reference: Joby Aviation

- Photography-first: real flight footage, not renders
- 12+ parallax layers for depth and cinematic feel
- Lifestyle positioning: "Skip traffic. Time to fly."
- Third-party validation: Toyota, NASA, airline logos substitute for technical specs
- App-first UX section: positions the experience beyond the aircraft
- Next.js + Sanity CMS, Cloudflare R2 for video

### Reference: Apple

- Product IS the design. Layout is invisible scaffolding for imagery
- Extreme whitespace signals intentionality
- Horizontal galleries with numbered carousel items
- "Learn more" / "Buy" dual CTAs on every product
- Bold, minimal headlines: "Amazing Mac. Surprising price."
- Scroll-based progressive disclosure

### Reference: Aupale Vodka

- Narrative-first: Philosophy → Bottle → Products (story before commerce)
- Extreme minimalism: text emphasis over imagery
- Geological/glacial metaphors: "ripples frozen in time"
- Technical authenticity: 32 PPM water purity metric displayed
- Sustainability messaging integrated, not sidelined
- Per-product gradients as visual differentiator

---

## Immersive / Storytelling

### Structure

1. **Preloader** with branded animation
2. **Introduction** with character-by-character or line-by-line reveal
3. **Chapter-based sections** tied to scroll position
4. **Detail drawers or expandable panels** for depth
5. **Closing with CTA or call to action**

### Reference: OceanX 2025

- Scroll-driven vertical narrative, viewport-height sections
- DM Mono (technical) + Zeist (editorial) type pairing
- 2500vh total scroll height with sticky sections
- WebGL canvas overlay for ocean visualization
- Chapter-based navigation (7 chapters)
- Clip-path + split-text animations for cinematic reveals
- Nuxt.js + Strapi CMS, Netlify image optimization

### When to Use This Pattern

- Year-in-review / annual reports
- Documentary or journalism sites
- Product launches with narrative arc
- Non-profit / cause-driven storytelling
- **NOT:** Utility sites, dashboards, e-commerce, docs

---

## About Page

### DO

- Show real team photos (not stock)
- Tell a specific founding story (not generic mission statement)
- Include timeline or milestones
- Show office/workspace if it has personality
- Include career/hiring CTA if relevant

### DO NOT

- Use "We are a passionate team of innovators" or equivalent
- Put everyone in matching headshots against white backgrounds
- Write a mission statement that could belong to any company
- Hide the team behind stock imagery

---

## Pricing Page

### DO

- Show 2-3 tiers maximum (too many creates choice paralysis — Hick's Law)
- Highlight recommended tier visually
- Feature comparison table for detailed comparison
- Include FAQ below pricing
- Show annual/monthly toggle with savings percentage
- Put "Start free" or "Try free" as primary CTA (lower friction)

### DO NOT

- Hide pricing behind "Contact sales" unless truly enterprise
- Use confusing feature matrices with 30+ rows
- Make the free tier look deliberately crippled
- Use dark patterns (pre-selecting annual billing, confirmshaming)

---

## Blog / Content

### DO

- Large featured image or hero treatment for latest post
- Clean reading experience: max 680px content width, 1.6-1.8 line height
- Estimated reading time
- Table of contents for long posts (sticky sidebar)
- Author attribution with avatar
- Related posts at bottom

### DO NOT

- Clutter the reading experience with sidebars, popups, newsletter bars
- Use tiny fonts (min 16px for body text on blog)
- Auto-play video ads between paragraphs
- Put social share buttons that obscure content on mobile
