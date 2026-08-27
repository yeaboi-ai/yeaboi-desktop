# Imagery, Texture & Editorial Design

> Texture signals human involvement. Photography conveys authenticity. Editorial design transforms pages into experiences.

---

## Quick ref

- **When to load:** luxury, restaurant, real-estate, photography, music, non-profit, travel, construction, editorial, personal recipes.
- Photography first-party ≫ stock. If stock, curate for consistent editorial style.
- Grain / noise overlay 3–15% opacity = warmth + analog feel. Use sparingly.
- AVIF / WebP with fallbacks; explicit width/height to prevent CLS.
- Alt text: describe content, not appearance. Decorative images get `alt=""`.
- Lazy-load below fold; preload hero.
- Editorial layout = varying column spans, pull quotes, full-bleed breaks.
- Per-story accent colour (HSL variable) adds identity without template weight.

---

## Photography

### The Data on Authentic Photography

- 83% of consumers trust companies more with real photos vs stock imagery
- 71% can immediately identify stock photos on business websites
- 65% say recognizing stock photos negatively impacts brand credibility
- Sites with authentic photography: 42% longer time on site, 35% lower bounce rates, 58% more page views

### DO

- **Use real photography.** Even smartphone photos outperform stock if authentic.
- **Show imperfect, human moments.** Natural lighting, natural cropping, real people.
- **Make photography the hero.** Some editorial sites let photography drive the entire experience — layout serves the images.
- **Invest in one good photoshoot** rather than licensing 50 stock images.
- **Use photography with editorial intent.** Crop dramatically, bleed to edges, overlay text, use duotone treatments.

### DO NOT

- Use AI-generated images (users can tell; they look uncanny)
- Use stock photos of people smiling at laptops, shaking hands, looking at whiteboards
- Use the same stock image that appears on 300+ other sites
- Apply the same filter to every image
- Use images purely as decoration without editorial intent

### Product Photography Approaches

**Apple:** Product IS the design. Typography, color, layout serve as invisible scaffolding for photography. High-res product isolation + lifestyle context. Scroll-triggered reveals.

**Joby Aviation:** Real flight footage instead of 3D renders. Lifestyle imagery over technical specs. "Breathtaking views," stress-free commute — selling the feeling, not the machine.

**Aupale Vodka:** Minimal interface — let product photography carry the palette. Gradient overlays unique to each product variant. Narrative-first: origin story before product specs.

---

## Texture, Grain & Materiality

Textures signal a human hand was involved. Paper grain, ink bleed, pencil lines, subtle noise — these create tactile quality flat AI output cannot replicate.

### SVG Noise/Grain Overlays

```css
/* SVG feTurbulence grain overlay */
.grain-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
  opacity: 0.08;
  mix-blend-mode: overlay;
}
```

```html
<svg class="grain-overlay" width="100%" height="100%">
  <filter id="grain">
    <feTurbulence baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/>
  </filter>
  <rect width="100%" height="100%" filter="url(#grain)"/>
</svg>
```

Tools: [fffuel nnnoise](https://www.fffuel.co/nnnoise/), [fffuel gggrain](https://www.fffuel.co/gggrain/)

**Performance note:** SVG filter-based textures are small but CPU-intensive. For complex pages, convert to raster (WebP, AVIF).

### Paper and Material Textures

Subtle backgrounds mimicking paper, linen, or concrete. Use at very low opacity (5-15%) so they're felt rather than seen.

### Hand-Drawn Elements

Hand-drawn SVG icons, rough underlines, sketchy borders. They communicate personality. They don't need to look "polished" — that's the point.

### Arc Browser Pattern: Noise + Blur + Gradient

Arc layers noise texture overlays on backgrounds globally, creating a handcrafted feel. Combined with SVG squiggle dividers between sections (not straight lines), multiple layered backgrounds: noise + blur + gradient.

### The Photocopier Aesthetic (2026)

Deliberately using photocopier imperfections — low-resolution grain, debris, scanning artifacts, fading ink — as design features. AI generators still struggle with layered, mixed-media styles.

---

## Editorial and Print-Inspired Design

Editorial design — inspired by print magazines and newspapers — transforms websites into immersive reading experiences. The antithesis of the AI template.

### Core Principles

- **Contrasting typography:** Large decorative headlines + small, legible body text
- **Multilayer composition:** Overlapping elements, pull quotes, sidebars, footnotes
- **Visual hierarchy through scale:** Some images full-bleed, others thumbnails
- **Content-first:** Layout serves the story, not the reverse
- **Generous whitespace:** "Slow" content in the face of modern attention spans

### The Magazine Spread Technique

Design each page section as a magazine spread. Vary layout dramatically from section to section:
- One section: full-bleed image with overlaid text
- Next: tight two-column text layout
- Next: single large pull quote in serif font
- Next: asymmetric image grid with caption

This variation creates rhythm and keeps users engaged.

### Studios Doing This Well

- **Bloomberg, NYT, ProPublica:** Master class in editorial web layout
- **The Pudding:** Data journalism with scroll-driven narratives
- **CLAIRE:** Product-focused with minimalist editorial aesthetics
- **Unseen Studio:** Year-in-review as chronological editorial narrative

---

## The "Spaceship Instruction Manual" Aesthetic

Technical documentation aesthetics as design: thin guiding lines, informational labels, diagrams replacing product images, monospace fonts. Signals depth, expertise, attention to detail.

Works for: dev tools, fintech, technical products, dashboards.

### Translating Immersive Sites to AI-Generated Code

Sites like Unseen, OceanX, and Aupale use techniques that go beyond standard HTML/CSS:

**What CAN be translated:**
- Typography systems (font stacking, clamp(), variable fonts)
- Color palettes and token systems
- CSS animations (clip-path reveals, staggered fades, transforms)
- Layout patterns (CSS Grid, asymmetry, container queries)
- Texture overlays (SVG noise, grain)

**What requires specialized tools:**
- WebGL/Three.js 3D scenes → use React Three Fiber or Spline
- Spatial/drag navigation → custom JS with physics libraries
- Complex scroll-driven parallax → GSAP ScrollTrigger
- Video compositing → native HTML5 video with CSS positioning

**The principle transfers even when the technique doesn't:** Unseen's "explore a world" principle can translate to a grid with hover-reveal depth effects. OceanX's scroll narrative can translate to `position: sticky` sections with IntersectionObserver. You don't need WebGL to create an immersive feeling.
