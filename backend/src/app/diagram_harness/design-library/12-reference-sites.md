# Reference Sites

> Real websites to study. Each entry documents what makes the site distinctive and what principles to extract.
> This file is a growing list — add sites as you encounter great design.

---

## Quick ref

- **When to load:** when a recipe cites a reference site by name, or when matching a specific aesthetic.
- Captures in `~/.claude/design-library/captures/` contain scroll screenshots + animations.json + data.json.
- Current captures (~15): Adovasio, Aupale, Bec Restaurant, Dulcedo, Effecto, Good Fella, Joby, Neonrated, OceanX 2025, Springs Estate, Studio Dialect, Unseen (2025 / main / projects).
- Captures are creative-agency heavy — SaaS/dashboard/utility exemplars should be added (Linear, Stripe, Grafana, Bloomberg, Notion, Metabase, Retool).
- Each entry lists: why-it-matters, techniques-to-extract, font stack, colour system, motion signature.
- Use captures as visual prompt material only when the brief explicitly calls for a style match — not as default inspiration.

---

## How to Use This File

1. Identify your project's closest category
2. Study the relevant sites for applicable patterns
3. Extract the PRINCIPLE, not the pixel-perfect implementation
4. Combine principles from multiple references for originality

---

## Marketing / SaaS

### Stripe (stripe.com)

**Category:** Financial infrastructure marketing
**Steal this:** Restrained optimism — vivid colors with bold typography that conveys enthusiasm without chaos.
**Typography:** Sohne (Klim Type Foundry). Single family, hierarchy through weight/size only.
**Color:** "Always favor bright and vivid" — saturated hues, never muted. Signature animated gradient wave.
**Layout:** Hero-first, asymmetric bento cards in features, generous whitespace, dense footer.
**Motion:** Atmospheric (gradient backgrounds), never decorative.
**Tech:** React, heavy performance optimization, 18-month redesign cycle.
**Key principle:** "Less is more" with copy. Test at wireframe stage.

### Linear (linear.app)

**Category:** SaaS product design gold standard
**Steal this:** Dark-first, bold gradients, one-directional flow. The defining SaaS aesthetic of 2024-2026.
**Typography:** Inter Variable (body) + Inter Display (headings). Bold weight emphasis. `text-wrap: balance`.
**Color:** LCH color space. Mercury White #F4F5F8, Nordic Gray #222326. 3 variables generate entire theme.
**Layout:** One-directional (never zig-zagging). Single-focus sections with minimal CTAs.
**Motion:** `steps(1, end)` — discrete frame-based, not smooth. Animations serve information.
**Key principle:** "Don't compete for attention you haven't earned." Secondary elements dim.

### Vercel (vercel.com)

**Category:** Developer platform, Swiss-inspired
**Steal this:** The Geist design system — open-source type + components embodying Swiss principles.
**Typography:** Geist Sans + Geist Mono + Geist Pixel. Complete type scale with Tailwind classes.
**Color:** Dual theme via CSS classes. Dark: #0a0a0a. `color-scheme` property. localStorage theme storage.
**Layout:** CSS Grid + Flexbox. Centered hero, multi-column grids. Skip-to-content accessibility.
**Tech:** Next.js (RSC), open-source Geist fonts via npm.

### Raycast (raycast.com)

**Category:** macOS-native aesthetic on web
**Steal this:** Translucent glass + keyboard-first visual language that makes web feel like native app.
**Typography:** Modern sans-serif. Weight variations for hierarchy.
**Color:** Deep navy #070921. Brand-specific colors per extension card with consistent shadow.
**Motion:** `fadeInUp` reveals, 3D cube in hero (WebGL), animated keyboard representations.
**Key principle:** Mirror the product experience on the web.

### Arc Browser (arc.net)

**Category:** Custom typography as brand identity
**Steal this:** Proprietary typefaces + noise textures + SVG dividers = handcrafted digital feel.
**Typography:** Marlin (display), ABC Oracle, Inter Variable (body), ABC Favorit Mono. Hero: 45.51px, letter-spacing -0.04em to -0.1em.
**Color:** #3139FB (primary blue), #FFFCEC (off-white), #FFFADD (cream), #FB3A4D (red accent).
**Layout:** Full-bleed sections at 100vw. Desktop: 64px horizontal padding. Asymmetric.
**Motion:** Consistent 150ms ease everywhere. Scale 1.0→1.05 on hover. SVG squiggle dividers.
**Key principle:** Noise texture overlays on everything create craft that AI can't replicate.

---

## Creative / Agency

### Unseen Studio (unseen.co)

**Category:** Award-winning motion/digital agency
**Steal this:** 3D spatial portfolio — projects exist in coordinate space, not traditional grids. Drag-to-explore.
**Typography:** Neue Montreal (sans, UI) + Saol Display (serif, editorial). Dramatic scale variation.
**Color:** Dark base #212121/#0a0a0a. Warm cream #efded9. Interactive orange #FF4E1B. Per-project custom backgrounds.
**Layout:** 3D coordinate system `position: {x, y, z}`. Depth layering. `transform-style: preserve-3d`, `perspective: 32rem`.
**Motion:** Rotating 3D cube loader. `cubic-bezier(.34,1.56,.64,1)` for playful transforms. Video layers at depth coordinates.
**Advanced:** WebGL GLB models with glass materials. R&D labs section. Sound design ("Enter without audio").
**Tech:** WordPress + Three.js/Babylon.js, vanilla JS, WOFF2 custom fonts.
**Key principle:** Portfolio IS the product demo. If you make immersive experiences, your site should BE one.

### Unseen 2025 Year-in-Review (2025.unseen.co)

**Category:** Chronological editorial portfolio
**Steal this:** Monthly narrative structure with progressive scroll disclosure.
**Typography:** Spaced-out letterforms ("J a n u a r y") for rhythmic section pacing.
**Layout:** Vertical scroll narrative, month-by-month. Mixed full-width and side-by-side imagery. White space dominance.
**Content strategy:** Shows R&D, experiments, and iterations — not just finals. Technical confidence.
**Key principle:** Transparency builds credibility. Show process, not just polish.

### Locomotive (locomotive.ca)

**Category:** 6x Awwwards Agency of the Year
**Steal this:** Theme-switching color system + custom scroll library + typography as primary element.
**Typography:** Custom typeface via CSS variables. Responsive: 15px base to 21px at 2400px+. Hierarchy through SIZE, not weight.
**Color:** Default black/white. Dark: inverted. Primary: red #DA382E. Secondary: blue #312DFB. Content-driven theme switching.
**Motion:** Created Locomotive Scroll (industry standard). Signature curve: `cubic-bezier(0.215, 0.61, 0.355, 1)` used everywhere.
**Tech:** No frontend frameworks — all custom. Complex preloader promise system.
**Key principle:** One easing curve, one typeface, one layout philosophy — consistency IS identity.

---

## Immersive / Storytelling

### OceanX 2025 (2025.oceanx.org)

**Category:** Immersive scroll-driven year-in-review
**Steal this:** Chapter-based scroll narrative with sticky WebGL canvas, clip-path text reveals, and cinematic pacing.
**Typography:** DM Mono (technical/navigation) + Zeist (editorial). Hero: 7.2rem with -0.216rem tracking. Line-height: 0.9 titles, 1.4 body.
**Color:** Navy #000d15, cyan accent #90e0ef (interaction), orange #ff7438 (CTAs), grays #bdcbd3/#7a8e9b.
**Layout:** 100svh sticky sections. 2500vh total scroll height. Drawer-based detail panels (right on desktop, bottom on mobile). Mobile carousel for chapter nav.
**Motion:** Clip-path inset reveals with `cubic-bezier(.445,.05,.55,.95)`. SVG orbit animation. Split-text line masking. Scale/opacity chains with 0.6-0.8s durations.
**Advanced:** Fixed WebGL canvas (z-index: -1) for ocean visualization. Custom scroll mechanics with CSS variables (--progress, --sw, --sh). 4px custom scrollbar.
**Tech:** Nuxt.js, Strapi CMS, Netlify image CDN, scoped Vue CSS.
**Key principle:** Total scroll height creates chapter pacing. Sticky elements + scroll position = cinematic control without hijacking scroll.

---

## Product / Hardware

### Joby Aviation (jobyaviation.com)

**Category:** Hardware product — aerial vehicle
**Steal this:** Experiential storytelling — sell the FEELING, not specs. Real footage over renders.
**Typography:** Bold large headlines ("Skip traffic. Time to fly"). Sans-serif, emphasis on impact.
**Color:** Dark/black backgrounds for premium. White type for contrast. Muted backgrounds with vibrant imagery.
**Layout:** Full-width hero with video. Modular partner cards. Asymmetric text+image sections.
**Motion:** Looping hero video. 12+ parallax layers in "Dream of Flight" section. Scroll-triggered progressive disclosure.
**Content:** Procedural "door to door" workflow diagrams. Partner logos as validation (Toyota, NASA). App-first UX section.
**Tech:** Next.js, Sanity CMS, Cloudflare R2 for video.
**Key principle:** Show the experience, not the machine. Lifestyle over specifications.

### Apple (apple.com)

**Category:** Product presentation mastery
**Steal this:** Product IS the design. Typography + whitespace = invisible scaffolding for photography.
**Typography:** San Francisco (SF Pro). Dynamic optical sizing. Bold minimal headlines.
**Color:** Near-monochromatic. Product imagery carries color. Zero decorative color.
**Layout:** Single-column with generous whitespace. Horizontal galleries. Alternating image/text layouts.
**Motion:** Parallax, rainbow color reveals on scroll, lazy-loading galleries, scroll-triggered reveals.
**Key principle:** Every pixel of whitespace communicates intentionality.

---

## Luxury / Spirits

### Aupale Vodka (aupalevodka.com/en)

**Category:** Premium spirits brand
**Steal this:** Extreme restraint as luxury signal. Narrative-first (philosophy before product). Container queries for fluid typography.
**Typography:** Martha (monospace/display) + HelveticaNowDisplay (sans/UI) + InstrumentSerif (serif/headings). Hero: `max(9cqi, var(--text-heading-xl))`, line-height 0.8-0.95, letter-spacing -0.03em. Three fonts, three personalities.
**Color:** Green iridescence (aurora/opal symbolism). Distinct gradients per product variant. Minimal interface color — product photography carries palette.
**Layout:** Container query units (cqi/cqh) throughout. Asymmetric with negative space. Imagery breaking grid. Generous spacing: `min(10cqi, 10cqh)`.
**Motion:** Staggered clip-path with skew transforms (12deg→0). Calculated delays: `calc(var(--stagger-delay) * var(--line-index) + var(--default-delay))`. Age-verification gate triggers animation state.
**Content:** Philosophy → The Bottle → Products (story before commerce). PPM water purity displayed. "Leave no trace" sustainability integrated. Limited quantities messaging.
**Tech:** Astro + Storyblok CMS + Tailwind v4. WOFF2 fonts. Modern CSS (container queries, custom properties).
**Key principle:** "No additives, no artifice" — the design philosophy mirrors the product philosophy. Restraint IS the luxury signal.

---

## SaaS / Health

### Effecto (effecto.app)

**Category:** Health/wellness SaaS
**Typography:** Poppins (primary) + multiple supporting fonts.
**Layout:** Carousel/swiper patterns for content.
**Motion:** Subtle transitions (0.25-0.3s ease).
**Tech:** Gatsby.js, Google Tag Manager, Microsoft Clarity.
**Note:** Needs deeper visual analysis via Playwright for full assessment.

---

## Editorial / Data Journalism

### The Pudding (pudding.cool)

**Category:** Data-driven visual storytelling
**Steal this:** Scrollytelling — fixed visualization updates as narrative text scrolls past.
**Color:** Per-story custom HSL colors. Consistent saturation/lightness across hues.
**Layout:** Sequential story feed. 216+ stories. Multi-level content filtering.
**Scrollytelling:** `position: sticky` graphic + `IntersectionObserver` text triggers. `window.innerHeight` not vh. Reusable `Scrolly.svelte` component.
**Tech:** SvelteKit + D3.js. Modular component patterns.
**Key principle:** Story drives the visualization, not the other way around.

### Bloomberg (bloomberg.com)

**Category:** Information density
**Steal this:** Enormous content volume without overwhelm. Strict typographic hierarchy. Column-based layouts.
**Key patterns:** Color coding by section. Data/editorial content separation. Progressive density (curated above fold, dense grid below). Time-based content updates.

---

## Product / Workspace

### Notion (notion.so)

**Category:** Flexible workspace
**Steal this:** Mascot-driven humanization. One capability per card (bento isolation).
**Typography:** Large bold sans-serif. Supporting copy in lighter weights.
**Color:** Vibrant accents (teal, red, blue, yellow) on neutral backgrounds.
**Layout:** Modular bento cards. Full-width hero alternating with narrow containers. Autoplay video on product cards.
**Content:** Never silos products. Benefit-first, feature-second copy. Dual CTA (free + demo).
**Key principle:** Present extreme flexibility without overwhelming — isolate one capability per visual unit.

---

## Frontend Dev Studio

### Good Fella (good-fella.com)

**Category:** Frontend development studio, subscription model
**Purpose:** Sells "Your Frontend team. One monthly fee." — subscription dev studio specializing in animation and interaction.
**Steal this:** The "spaceship instruction manual" dark aesthetic with monospace labels and orange accent. Dev studio that looks like a dev tool.
**Typography:** Aktiv Grotesk (body/headings, weight 300-500) + Geist Mono (labels, uppercase). Headlines at 60px, -3px letter-spacing. Mono labels at 13.7px, uppercase, -0.27px tracking. The mono/sans pairing creates a technical-yet-polished feel.
**Color:** Near-black base `rgb(20, 19, 20)`. Orange brand accent `rgb(251, 70, 13)` / `rgb(253, 85, 29)`. Light text `rgb(238, 238, 238)`. Muted text at 70% opacity via oklab. Grey surface `rgb(51, 51, 51)`. Two-color system: black + orange. Nothing else.
**Layout:** 12-column grid (`--site-grid-columns: 12`), 1rem gutters, max-width 1920px. Hero padding 256px top. Work section uses device mockups (laptops, phones) showing actual project screenshots — portfolio as product demo. Pricing section: two-column cards, light bg contrast against dark body.
**Motion:** Padding transitions at 0.5s `cubic-bezier(0, 0, 0.2, 1)`. Color transitions at 0.3s `cubic-bezier(0.4, 0, 0.2, 1)` — consistent easing throughout. Canvas element for background effects. Pulse keyframes for live status indicators.
**Tech:** Next.js (Turbopack), Canvas element, 12-column CSS Grid + Flexbox.
**Key principle:** A frontend studio's site IS their portfolio. Device mockups showing real work > abstract case study cards. Two-color constraint (black + one accent) forces clarity.

---

## Film / Entertainment

### NEON (neonrated.com)

**Category:** Independent film distributor and merch retailer
**Purpose:** Distributes award-winning independent films (Parasite, Anora, Spencer) + sells branded merchandise.
**Steal this:** Custom display typeface at massive scale + parallax film stills as hero. Film industry branding that feels like a movie poster, not a corporate site.
**Typography:** Girott (display, 700 weight) at 160px hero / 41px secondary, uppercase, -4.8px letter-spacing, line-height 0.9. Flatspot (body/UI, 400-700) at 14px with -0.14px tracking. The Girott display font is aggressively bold and compressed — unmistakable identity.
**Color:** White background `#fff` with black foreground `#000`. NEON red `rgb(227, 22, 18)` — `#E31612`. Blue accent `rgb(36, 22, 196)` — `#2416C4`. Green `#aeff00`, pink `#ec71da` used sparingly. CSS vars: `--background`, `--foreground`, `--theme-primary`, `--theme-secondary` — theming is swappable.
**Layout:** Full-bleed film stills as parallax hero (`.motion-parallax`). Horizontal scrolling film carousel. Merch grid with consistent card radius (`0.8rem`). `--page-gap-x: 3rem`, `--page-gap-y: 14rem` (massive vertical rhythm).
**Motion:** Named easing variables: `--ease-out: cubic-bezier(0.16,1,0.3,1)`, `--ease-snappy: cubic-bezier(0.19,1,0.22,1)`, `--ease-spring: linear(...)` (104-point spring curve). Background-size underline animation at 0.7s snappy ease. `--motion: 0/1` toggle for reduced motion. Marquee translateX for ticker.
**Tech:** Next.js, Microsoft Clarity, GTM. Tailwind classes throughout.
**Key principle:** A film distributor's site should feel cinematic. Massive type + full-bleed photography + parallax = movie poster energy. The named easing variables (`--ease-snappy`, `--ease-spring`) are excellent reusable patterns.

---

## Wedding / Photography

### Adovasio (adovasio.it)

**Category:** Luxury destination wedding photographer
**Purpose:** Portfolio and booking for high-end Italian wedding photography (Tuscany, Lake Como).
**Steal this:** Full-bleed editorial photography with overlaid serif typography. The page IS a photo album — text floats over images like magazine captions.
**Typography:** BerlingskeSerif (display, 300 weight) at 35px for project names — light, elegant, editorial. Inter (body/UI, variable 100-900). The serif/sans pairing: BerlingskeSerif for romance, Inter for utility. Hero text at 44.6px, weight 375 (variable font fine-tuning).
**Color:** Dark charcoal base `rgb(35, 35, 35)`. White text on dark. Cream/warm white sections create alternating rhythm. Near-monochromatic — photography carries ALL color. Off-white project list sections against dark header.
**Layout:** Full-viewport hero with photography bleeding edge-to-edge. Asymmetric project grid: names left + right with offset image in center + small thumbnail. The offset composition ("Caterina & Griffin" — name left, name right, image center-offset) is editorial magazine layout on web. Sticky navigation with `Featured Weddings` tab.
**Motion:** Letter-switching animation at 1.1s `cubic-bezier(0.445, 0.05, 0.55, 0.95)`. Opacity transitions at 0.3-0.5s with `cubic-bezier(0.25, 0.46, 0.45, 0.94)`. Project image height transition at 0.6s `cubic-bezier(0.87, 0, 0.13, 1)` — likely expand-on-hover. Custom power easing: `--power1-out` and `--power3-out` defined as `linear()` functions.
**Tech:** Next.js (confirmed via `__NEXT_DATA__`), CSS modules, Turbopack.
**Key principle:** For photography portfolios, the photography IS the design. Minimal chrome, maximum image. Serif typography at light weight adds elegance without competing. Asymmetric name-and-image compositions feel editorial, not template.

---

## Restaurant / Hospitality

### Bec Restaurant (bec-restaurant.com)

**Category:** Fine dining restaurant, Provence, France
**Purpose:** Gastronomic restaurant near Baux de Provence. Menu, reservations, brand experience.
**Steal this:** Warm color palette (blush pink + deep navy + salmon) with serif display type — luxury dining that feels warm, not cold.
**Typography:** PP Woodland (serif display, 200-700) at 100px hero, line-height 0.9 — elegant, organic serif. Manrope (sans body, 300-800) for UI/buttons at 13-18px, uppercase buttons at 700 weight. The serif display + geometric sans pairing: classic fine dining.
**Color:** Blush pink `rgb(255, 240, 240)` — `#FFF0F0`. Deep navy `rgb(0, 50, 80)` — `#003250`. Salmon accent `rgb(250, 189, 180)` — `#FABDB4`. White `#FFFFFF`. This is NOT a typical restaurant palette — warm, feminine, Provençal. Three-color system with clear roles: pink (background), navy (text/buttons), salmon (accent/nav).
**Layout:** Hero with clip-path image transitions between background slides. 4-column grid (`--grid-columns: 4`), 10px gutters, 25px margins. Modal overlay for Wellington special menu. Marquee text ticker. Rotating decorative shapes (`shape-rotate` keyframe).
**Motion:** Hero background clip-path transitions at 1.2s `cubic-bezier(0.77, 0, 0.175, 1)` — slow, dramatic reveal between hero images. Navbar transform at 0.8s `cubic-bezier(0.23, 1, 0.32, 1)`. Heading transforms at 1.4s `cubic-bezier(0.19, 1, 0.22, 1)`. Scroll button at 0.6s same curve. Blink and spin keyframes for decorative elements.
**Tech:** WordPress + custom theme, Contact Form 7.
**Key principle:** Restaurants don't need to be dark and moody. This blush/navy/salmon palette is warm, inviting, and distinctly Provençal. PP Woodland serif at 100px feels hand-lettered. Clip-path hero transitions between food/interior photos create a slideshow feel without a carousel.

---

## Talent / Fashion

### Dulcedo (dulcedo.com)

**Category:** Talent management agency — models, influencers, athletes, gamers
**Purpose:** Talent representation, brand partnerships, casting. Offices in LA/NYC/Miami/Toronto/Montreal.
**Steal this:** Black + gold luxury with editorial B&W photography. Canvas animation behind hero. Helvetica Now Display at extreme weights.
**Typography:** Helvetica Now Display (UI/nav, 500 weight at 16px; mega-nav at 800 weight, 50px, uppercase). Saol Display (serif accent, 300 italic + 400 regular) for editorial contrast — likely used for "We Are" / section intros. The Helvetica Now at 800 weight uppercase is brutally bold — fashion-magazine energy.
**Color:** Near-black base `rgb(244, 244, 244)` light sections / dark hero. Gold accent `rgb(197, 174, 121)` — `#C5AE79` — used for nav text, creating luxury warmth against black. Dark text `rgb(10, 10, 10)`. Two-color: black + gold. B&W photography means zero competing color.
**Layout:** 12-column grid (`--grid-columns: 12`), 60px margins (`--unit-xl`), 20px gutters. Hero: centered portrait photo with concentric circle canvas animation behind. Talent grid: varying image sizes (editorial asymmetry), B&W photography. "How It Works" section: numbered cards (One/Two/Three) with Saol Display italic numbers + Helvetica Now bold titles. Category filtering in nav: Fashion, Food, Haircare, Skincare, etc.
**Motion:** Custom easing throughout: `cubic-bezier(0.38, 0.005, 0.215, 1)` — Dulcedo's signature curve. Header color transition at 0.4s. Panel clip-path transitions at 0.6s with stagger. `showImage`/`hideImage` keyframes using `clip-path: inset()` reveals. Dialog open/close at translate3d + opacity. SplitLine module for text animations.
**Tech:** Custom build (Vite — `/dist/` paths), Canvas element, ShapeAnimation module, SplitLine text animation, CastCount/CastClear casting system.
**Key principle:** Black + one metallic accent (gold) = instant luxury. B&W photography eliminates color competition and unifies diverse talent portraits. clip-path inset reveals for images create editorial unveiling. The serif italic for numbering + sans bold for titles is a classic fashion editorial move.

---

## Design Studio

### Studio Dialect (studiodialect.com)

**Category:** Award-winning digital production studio — motion, design, interactive experiences
**Purpose:** "Expert Digital Production" — connects culture, technology, and contemporary aesthetics.
**Steal this:** Massive viewport-filling typography with pixelation effect + coordinate display (X: 0, Y: 0) + crosshair markers. The entire hero IS the type — no images, no illustrations, just 209px bold uppercase Geist filling the screen.
**Typography:** Geist (variable 100-900) for all text. Hero title: 209px, weight 700, uppercase, line-height 169px, letter-spacing -16px (!). Secondary h1: 138px, weight 700, -11px tracking. Body: 12px weight 500, -0.48px tracking. Geist Mono for UI labels/buttons: 10.8px, weight 600, uppercase, 0.17px tracking. All sizing in `vw` units — `--font-size-base: .7292vw`.
**Color:** Dark charcoal `#242424` (bg). Light grey `#d2d2d2` (text/primary). Highlight active: `#dfff00` (electric yellow-green). Black `#000`. Only 3 functional colors — extreme restraint. The `#dfff00` accent screams "technical/digital."
**Layout:** Full-viewport hero with text bleeding edges. Crosshair icons (`+`) as decorative spatial markers. `X: 0 Y: 0` coordinate display in nav bar — real-time cursor tracking. `[ MENU ]` button with bracket notation — code aesthetic. Canvas element for background effects.
**Motion — The Animation System:**
- Named speed tokens: `--transition-fast: .2s ease`, `--transition-normal: .3s ease`, `--transition-slow: .5s ease`
- Cookie banner uses `clip-path: inset()` reveals with staggered delays (4.5-5s)
- Button blink effect: 10-step opacity keyframe (1→0.5→1→0.5→1 flicker pattern)
- Pop-in: `scale(0)→scale(1)` with 0.3s ease + staggered delays (2.2s for hero icons)
- Globe marker corners: complex 11-step keyframe with blink effect (opacity 1→0→1→0→1)
- Menu reveal: 0.35s ease-in-out with 2.25s delay (synchronized with preloader)
- Primary easing: `cubic-bezier(0.22, 1, 0.36, 1)` — fast start, gentle land
- Spring easing: `cubic-bezier(0.175, 0.885, 0.42, 1.275)` — slight overshoot
- Scroll is JS-controlled (content doesn't respond to native scroll — full takeover)
**Tech:** Canvas element, custom JS scroll system, Geist fonts (Vercel). No detected framework — likely custom build.
**Key principle:** Typography IS the entire design. 209px text filling the viewport, no images in hero, coordinate tracking for spatial awareness. The `[ BRACKET ]` notation on buttons and electric yellow-green accent create an unmistakable "command line meets design studio" identity. Three transition speed tokens (fast/normal/slow) keep all motion consistent.

---

## Luxury Real Estate

### Springs Estate (springs.estate)

**Category:** Luxury residential development — wellness-focused
**Purpose:** "Splendor of Renewal" — exclusive residence with wellness infrastructure next to Nature Park.
**Steal this:** Overlapping image mosaic with parallax depth + animated gradient blobs + serif display type on nature photography. Real estate that feels like a spa, not a brochure.
**Typography:** Victor Serif (display, 400 weight) at 125px hero (h1), 180px for giant display (g1 class), 70px preloader, 50px h2 — all with negative letter-spacing (-1px to -3.6px). TT Commons Pro (sans, 400-500) for body at 20px/-0.4px tracking, uppercase labels at 12px/0.96px tracking. The serif at massive scale + tight tracking creates elegance without weight.
**Color — Nature Palette:**
- Dark green: `#162d24` (primary text on light)
- Green: `#1b4732` (buttons, accents)
- Light green: `#a7b431` (highlights)
- Olive: `#758535`
- Dark blue: `#101e27` (dark sections)
- Blue: `#005160`, Light blue: `#67bfda`, Sky: `#bee5ee`
- Beige: `#e0d1b6` (text on dark), Beige background: `#f5e8d1` (light sections)
- Full RGB variants for each (`--c-green-rgb: 27,71,50`) enabling rgba() transparency
**Layout:** Overlapping image grid — photos at various sizes overlap with parallax offset, creating depth. Beige background sections alternate with dark blue-green sections. Locomotive Scroll for smooth scrolling with `[data-scroll-container]`. Splitting.js for character/word/line animation targets.
**Motion — The Animation System:**
- Primary easing: `cubic-bezier(0.25, 0.74, 0.22, 0.99)` — Springs' signature curve. Used everywhere.
- Secondary: `cubic-bezier(0.55, 0, 0.1, 1)` — snappier variant
- Button hover: `clip-path: polygon()` text swap — current text clips up while clone clips in from below. 0.8s at signature curve. The polygon values create a "window" effect:
  ```css
  /* Resting */ clip-path: polygon(-100% -100%, 200% -100%, 200% 200%, -100% 200%);
  /* Hover out */ clip-path: polygon(-100% 200%, 200% 200%, 200% 500%, -100% 500%);
  /* Clone in */ transform: translateY(0px);
  ```
- 4 gradient blob keyframes (`grad_1` through `grad_4`): translate + rotate over 4.8-8s loops, creating organic background movement
- `moveInCircle` (full rotation), `moveVertical` (±50%), `moveHorizontal` (±50% + ±10%) — 3 ambient motion patterns
- Durations: 0.8s (standard transitions), 1.4s (reveals), 4.8-8s (ambient blobs)
- `will-change: transform, clip-path` on interactive elements for GPU acceleration
- Barba.js for page transitions (cross-page animation continuity)
**Tech:** Locomotive Scroll, Barba.js (page transitions), Splitting.js (text animation), Canvas element. Custom build (no detected framework).
**Key principle:** The clip-path polygon button hover is the standout technique — text physically slides away while replacement slides in, creating a "physical" feel impossible with opacity alone. The 4 gradient blob animations create living, breathing backgrounds without WebGL. One signature easing curve (`0.25, 0.74, 0.22, 0.99`) across everything creates cohesion. Nature palette with full RGB variants enables sophisticated transparency effects.

---

## Cross-Reference: Design Principles by Site

| Principle | Best Example |
|-----------|-------------|
| Typography as primary design element | Locomotive, Unseen |
| Dark-first with LCH color | Linear |
| Photography-first storytelling | Apple, Joby |
| Scroll-driven narrative | OceanX, The Pudding |
| 3D spatial navigation | Unseen |
| Single easing curve consistency | Locomotive, Arc |
| Container query fluid typography | Aupale |
| Theme switching per content | Locomotive |
| Narrative before commerce | Aupale |
| Information density | Bloomberg |
| Mascot humanization | Notion |
| Restrained optimism | Stripe |
| macOS-native web aesthetic | Raycast |
| Custom typeface as identity | Arc |
| Noise texture for craft | Arc, Aupale |
| Monospace + sans pairing (technical feel) | Good Fella |
| Two-color constraint (black + one accent) | Good Fella, Dulcedo |
| Custom display typeface at massive scale | NEON |
| Named reusable easing variables | NEON |
| Photography-as-design (minimal chrome) | Adovasio |
| Warm non-obvious color palette | Bec Restaurant |
| Clip-path hero image transitions | Bec Restaurant |
| Black + gold luxury | Dulcedo |
| B&W photography for unity | Dulcedo |
| Serif italic numbers + sans bold titles | Dulcedo |
| Typography filling entire viewport | Studio Dialect |
| Named transition speed tokens | Studio Dialect |
| Coordinate/spatial UI elements | Studio Dialect |
| Clip-path polygon button hovers | Springs Estate |
| Animated gradient blobs (no WebGL) | Springs Estate |
| One signature easing curve everywhere | Springs Estate, Locomotive |
| Nature/wellness color palette | Springs Estate |
| Locomotive Scroll + Barba.js | Springs Estate |

---

## All Sites (Quick Links)

### User-Submitted (Playwright + deep CSS/animation extraction)
- https://unseen.co
- https://2025.unseen.co
- https://unseen.co/projects
- https://2025.oceanx.org
- https://www.jobyaviation.com
- https://www.aupalevodka.com/en
- https://effecto.app
- https://good-fella.com
- https://springs.estate
- https://www.neonrated.com
- https://www.adovasio.it
- https://www.bec-restaurant.com
- https://dulcedo.com
- https://studiodialect.com

### Research-Sourced (analyzed from articles, docs, brand guidelines — not Playwright)
- https://stripe.com
- https://linear.app
- https://vercel.com
- https://raycast.com
- https://arc.net
- https://locomotive.ca
- https://apple.com
- https://pudding.cool
- https://bloomberg.com
- https://notion.so

### Extraction Status
- https://unseen.co — **FULL.** Headed Playwright with GPU. 3D WebGL world captured. 50 transforms, 8 easings, custom cursor, canvas. Neue Montreal + Saol Display.
- https://2025.unseen.co — CSS extracted (6 KF, 16 easings, 4 clip-paths, Lenis). Heavy asset loading prevents full visual capture. WebFetch content analysis covers structure.
- https://unseen.co/projects — CSS extracted. Same codebase as main.
- https://2025.oceanx.org — CSS extracted (55 transitions, 6 clip-paths, 52 transforms, Zeist + DM Mono). Preloader + heavy assets. WebFetch analysis covers full content/structure.
- https://www.jobyaviation.com — **FULL.** 193 KF, 137 transitions, 248 transforms, Lenis, Next.js.
- https://www.aupalevodka.com/en — **FULL.** Age gate bypassed. Cinematic video hero, bottle product shots, seltzers, sustainability. 8 fonts, Lenis, Astro.
- https://effecto.app — **FULL.** 51 fonts loaded, minimal animation. Gatsby.
