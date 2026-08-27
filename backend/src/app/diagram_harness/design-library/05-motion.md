# Motion & Animation

> Motion is a strategic tool that shapes perception, navigation, and interaction. Less but meaningful.

---

## Quick ref

- **When to load:** creative-studio, luxury, real-estate, film, immersive, hardware, event, music, travel, editorial recipes.
- Purpose: feedback, attention, narrative. Never decoration.
- Motion budget varies by recipe — SaaS/Dashboard/Dev-Docs: LOW. Creative/Immersive/Music: HIGH.
- Consistent easing curve throughout a site — pick one cubic-bezier and reuse.
- UI transitions ≤300ms; page transitions ≤500ms; narrative scroll reveals 600–1200ms.
- `prefers-reduced-motion` is NON-NEGOTIABLE. Provide `--motion` toggle.
- Named easings: `--ease-snappy`, `--ease-smooth`, `--ease-dramatic`.
- Scrollytelling (pinned visual + scrolling text) = editorial/immersive/non-profit signature.
- GSAP + ScrollTrigger is the industry standard. Lenis for smooth scroll.

---

## Principles

### DO

- **Communicate system state.** Loading, success, error, transition — animation tells users what's happening.
- **Guide attention.** Subtle animations drawing the eye to important elements serve a function.
- **Support narrative with scrollytelling.** Scroll-driven animations revealing content progressively can transform complex information. But story comes first, not animation.
- **Respect `prefers-reduced-motion`.** Always provide a reduced-motion alternative.
- **Keep UI transitions under 300ms.** Anything longer feels sluggish.

### DO NOT

- Add animation just because you can
- Use bouncy, springy animations on every element
- Auto-play videos that can't be paused
- Add parallax to every section
- Animate elements the user can't see
- Add hover effects to every element

---

## Easing Curves from Top Sites

```css
:root {
  /* Locomotive's signature — used across ALL their animations */
  --ease-locomotive: cubic-bezier(0.215, 0.61, 0.355, 1);

  /* General-purpose */
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out-quad: cubic-bezier(0.45, 0, 0.55, 1);
  --ease-spring: cubic-bezier(0.175, 0.885, 0.32, 1.275);

  /* OceanX clip-path reveals */
  --ease-reveal: cubic-bezier(0.445, 0.05, 0.55, 0.95);

  /* Unseen Studio 3D transforms */
  --ease-playful: cubic-bezier(0.34, 1.56, 0.64, 1);

  /* NEON — named production curves */
  --ease-snappy: cubic-bezier(0.19, 1, 0.22, 1);
  --ease-anticipate: cubic-bezier(1, -0.4, 0.35, 0.95);

  /* Springs Estate — signature curve (used everywhere) */
  --ease-springs: cubic-bezier(0.25, 0.74, 0.22, 0.99);

  /* Bec Restaurant — dramatic reveals */
  --ease-dramatic: cubic-bezier(0.77, 0, 0.175, 1);

  /* Dulcedo — talent agency signature */
  --ease-dulcedo: cubic-bezier(0.38, 0.005, 0.215, 1);

  /* Studio Dialect — fast start, gentle land */
  --ease-dialect: cubic-bezier(0.22, 1, 0.36, 1);
}
```

### Named Speed Tokens (Studio Dialect Pattern)

Define transition speeds as tokens, not ad-hoc values:

```css
:root {
  --transition-fast: 0.2s ease;
  --transition-normal: 0.3s ease;
  --transition-slow: 0.5s ease;
}
```

### NEON's Spring Easing (104-Point Linear Function)

For true physics-based spring feel without JS:

```css
:root {
  --ease-spring-physics: linear(
    0, 0.006, 0.023, 0.048, 0.081, 0.119, 0.162, 0.209,
    0.257, 0.308, 0.358, 0.409, 0.459, 0.508, 0.556,
    0.602, 0.645, 0.687, 0.726, 0.762, 0.796, 0.827,
    0.856, 0.882, 0.905, 0.927, 0.946, 0.963, 0.977,
    0.990, 1.001, 1.011, 1.019, 1.026, 1.031, 1.035,
    1.038, 1.040, 1.043, 1.043, 1.043, 1.042, 1.041,
    1.037, 1.034, 1.030, 1.025, 1.021, 1.016, 1.012,
    1.008, 1.005, 1.002, 1.000
  );
}
```

**Key principle:** Pick ONE easing curve for your entire site and use it consistently. Locomotive uses the same cubic-bezier everywhere. Arc uses consistent 150ms ease for all micro-interactions.

---

## Duration Guidelines

| Interaction | Duration | Example |
|-------------|----------|---------|
| Button hover | 150ms | Arc: scale 1.0 → 1.05 |
| Color transition | 200-300ms | Locomotive: background color |
| Tooltip appear | 200ms | Fade + slight translateY |
| Modal open/close | 200-300ms | Scale 0.95→1.0 + fade |
| Page element reveal | 600-900ms | Locomotive: preloader |
| Scroll animation | 800-1200ms | Apple: parallax transitions |
| Complex sequence | 2800-3200ms | Linear: grid cascade |

### Animation Philosophy by Tier

- **Micro-interactions** (150-300ms): hover states, button feedback, toggles
- **Transitions** (300-600ms): page transitions, modals, navigation changes
- **Reveals** (600-1200ms): scroll-triggered content, hero animations, section entrances
- **Atmospheric** (2000ms+): background gradients, loading sequences, ambient motion

---

## Scroll-Driven Animations

### CSS Native (Modern)

```css
/* Progress indicator driven by scroll */
.progress-bar {
  animation: grow-width linear;
  animation-timeline: scroll();
}

@keyframes grow-width {
  from { width: 0%; }
  to { width: 100%; }
}

/* Element reveals on scroll into view */
.reveal {
  animation: fade-up linear both;
  animation-timeline: view();
  animation-range: entry 0% entry 100%;
}

@keyframes fade-up {
  from { opacity: 0; transform: translateY(2rem); }
  to { opacity: 1; transform: translateY(0); }
}
```

### Scrollytelling Pattern (The Pudding)

```html
<div class="scrolly-container">
  <div class="scrolly-graphic" style="position: sticky; top: 0;">
    <!-- Visualization that updates based on scroll -->
  </div>
  <div class="scrolly-steps">
    <div class="step" data-step="0">Narrative block 1...</div>
    <div class="step" data-step="1">Narrative block 2...</div>
  </div>
</div>
```

```javascript
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      updateVisualization(entry.target.dataset.step);
    }
  });
}, { threshold: 0.5 });

document.querySelectorAll('.step').forEach(el => observer.observe(el));
```

**Rules:**
- Chart stays fixed (`position: sticky`), text scrolls past
- Use `IntersectionObserver`, NOT scroll event listeners
- Calculate from `window.innerHeight` (not vh units — mobile issues)
- Don't alter scroll behavior — only monitor it

### OceanX Pattern: Clip-Path Reveals

```css
.reveal-line {
  clip-path: inset(0 100% 0 0);
  transition: clip-path 0.8s var(--ease-reveal);
}

.reveal-line.visible {
  clip-path: inset(0 0 0 0);
}
```

### OceanX Pattern: Split-Text Animation

```css
.split-text .line {
  overflow: hidden;
}

.split-text .line span {
  display: inline-block;
  transform: translateY(100%);
  transition: transform 0.6s var(--ease-reveal);
  transition-delay: calc(var(--line-index) * 0.08s);
}

.split-text.visible .line span {
  transform: translateY(0);
}
```

### Aupale Pattern: Staggered Clip + Skew

```css
.stagger-reveal {
  clip-path: inset(0);
  transform: skewY(12deg);
  opacity: 0;
  transition: all 0.6s var(--smooth-ease);
  transition-delay: calc(var(--stagger-delay) * var(--line-index, 0) + var(--default-delay));
}

.stagger-reveal.visible {
  clip-path: inset(0);
  transform: skewY(0deg);
  opacity: 1;
}
```

---

## Clip-Path Techniques (From Extraction Analysis)

### Springs Estate: Polygon Text-Swap Button Hover

Text physically slides away while a clone slides in from below. Creates a "physical" feel impossible with opacity alone:

```css
.btn-text {
  transition: transform 0.8s var(--ease-springs), clip-path 0.8s var(--ease-springs);
  clip-path: polygon(-100% -100%, 200% -100%, 200% 200%, -100% 200%);
  will-change: transform, clip-path;
}

.btn-text-clone {
  position: absolute;
  transform: translateY(300%);
  clip-path: polygon(-100% -400%, 200% -400%, 200% -100%, -100% -100%);
}

.btn:hover .btn-text {
  transform: translateY(-300%);
  clip-path: polygon(-100% 200%, 200% 200%, 200% 500%, -100% 500%);
}

.btn:hover .btn-text-clone {
  transform: translateY(0);
  clip-path: polygon(-100% -100%, 200% -100%, 200% 200%, -100% 200%);
}
```

### Bec Restaurant: Clip-Path Hero Image Transitions

Slideshow between hero images using clip-path instead of opacity:

```css
.hero-image {
  clip-path: inset(0 0 0 100%);
  transition: clip-path 1.2s cubic-bezier(0.77, 0, 0.175, 1);
}

.hero-image.active {
  clip-path: inset(0);
}

.hero-image.exiting {
  clip-path: inset(0 100% 0 0);
}
```

### Dulcedo: Image Reveal/Hide

```css
@keyframes showImage {
  from { clip-path: inset(0 0 100%); }
  to { clip-path: inset(0); }
}

@keyframes hideImage {
  from { clip-path: inset(0); }
  to { clip-path: inset(100% 0 0); }
}
```

### NEON: Underline Grow on Hover

Background-size animation creates an underline that grows from left:

```css
.text-underline {
  background-image: linear-gradient(currentColor, currentColor);
  background-size: 0% 2px;
  background-position: left bottom;
  background-repeat: no-repeat;
  transition: background-size 0.7s var(--ease-snappy);
}

.text-underline:hover {
  background-size: 100% 2px;
}
```

---

## Ambient Background Motion (No WebGL Required)

### Springs Estate: Gradient Blob Animation

4 gradient blobs moving on different paths create an organic, living background:

```css
.gradient-bg {
  position: relative;
  overflow: hidden;
}

.blob {
  position: absolute;
  width: 40vw;
  height: 40vw;
  border-radius: 50%;
  filter: blur(60px);
  opacity: 0.6;
}

.blob-1 {
  background: var(--c-green);
  animation: blob-1 8s ease-in-out infinite;
}

.blob-2 {
  background: var(--c-light-blue);
  animation: blob-2 6.4s ease-in-out infinite;
}

@keyframes blob-1 {
  0%, 100% { transform: translate(0); }
  50% { transform: translate(20vw, -5vw) rotate(45deg); }
}

@keyframes blob-2 {
  0%, 100% { transform: translate(0); }
  50% { transform: translateY(10vw) rotate(45deg); }
}
```

### Studio Dialect: Cookie Banner Blink Effect

Multi-step opacity flicker simulates a screen-glitch/digital aesthetic:

```css
@keyframes blink-in {
  0% { opacity: 0; }
  20% { opacity: 1; }
  30% { opacity: 1; }
  40% { opacity: 0.5; }
  50% { opacity: 0.5; }
  60% { opacity: 1; }
  70% { opacity: 1; }
  80% { opacity: 0.5; }
  90% { opacity: 0.5; }
  100% { opacity: 1; }
}

.element-blink {
  animation: blink-in 0.3s linear forwards;
  animation-delay: 4.5s; /* stagger multiple elements */
}
```

---

## Staggered Page Load

For dashboards and card-heavy pages:

```css
.card {
  opacity: 0;
  transform: translateY(1rem);
  animation: fade-in-up 0.4s ease forwards;
}

.card:nth-child(1) { animation-delay: 0ms; }
.card:nth-child(2) { animation-delay: 50ms; }
.card:nth-child(3) { animation-delay: 100ms; }
.card:nth-child(4) { animation-delay: 150ms; }

@keyframes fade-in-up {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

---

## Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## The Scrollytelling Distinction

**Good scrollytelling:** NYT "Snow Fall," Apple product pages, The Pudding's data journalism. Scroll reveals content serving comprehension.

**Bad scroll-jacking:** Sites hijacking native scroll, trapping users in "scroll scenes" they can't skip, parallax with no narrative function.

---

## Advanced: GSAP + ScrollTrigger

The industry standard for award-winning scroll experiences:

```javascript
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// Fade in on scroll
gsap.from('.section', {
  opacity: 0,
  y: 60,
  duration: 1,
  ease: 'power3.out',
  scrollTrigger: {
    trigger: '.section',
    start: 'top 80%',
    end: 'top 20%',
    toggleActions: 'play none none reverse',
  },
});
```

---

## Advanced: 3D and WebGL

### Unseen Studio Approach
- GLB models positioned in 3D coordinate space with rotation speeds and material properties
- `transform-style: preserve-3d` with `perspective: 32rem`
- Drag-to-explore spatial navigation
- Video layers embedded at specific depth coordinates

### When to Use 3D
- Creative portfolios and agency sites
- Product visualization (hardware)
- Immersive storytelling (OceanX)
- **NOT:** SaaS dashboards, documentation, blogs, e-commerce listings

### Micro Sound Design (2026 Trend)
Small interaction sounds for clicks, hovers, feedback. Must be optional, quiet, user-controllable. Unseen Studio offers "Enter without audio" option.

---

## Rules from the Best

- **Stripe:** Motion is atmospheric (backgrounds), never decorative (no bouncing)
- **Linear:** `steps(1, end)` for discrete grid animations — frame-based, not smooth
- **Arc:** Consistent 150ms ease for ALL micro-interactions
- **Locomotive:** Single easing curve across entire site for cohesion
- **Apple:** Scroll-triggered reveals, parallax at varying rates
- **OceanX:** Clip-path + split-text for cinematic text reveals
- **Aupale:** Staggered clip-path with skew transforms for luxury feel
