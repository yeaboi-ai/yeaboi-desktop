# WebGL Recipes — Implementation Code

> 12 proven WebGL recipes, load-on-demand when the brief calls for WebGL implementation. **Load only the recipes you need** — individually they are 150–300 lines; the full file is ~3k lines.

---

## Quick ref

- Each recipe is self-contained: problem statement, code, usage notes.
- R3F (React Three Fiber) is the default target — AI generates declarative JSX better than imperative Three.js.
- Always precede with `webgl-core.md`'s decision tree — don't ship a recipe if CSS suffices.
- Always respect `prefers-reduced-motion`; each recipe shows the fallback.

---

## Recipe index

| # | Name | Use when | Approx lines |
|---|---|---|---|
| **Subtle tier** | | | |
| 10 | GPU Tier Detection + Fallbacks | Always — runs first to decide whether to load others | ~200 |
| 6 | Shader Gradient Background | Want Stripe-style mesh gradient | ~235 |
| 11 | Parallax System | Multi-layer parallax tied to scroll | ~220 |
| 12 | Text Animation | Hero / headline text reveal with WebGL feel | ~275 |
| **Moderate tier** | | | |
| 5 | Scroll-Synced WebGL Canvas | Background canvas that reacts to scroll | ~295 |
| 7 | Mouse-Reactive Fluid Distortion | Hero hover / cursor-driven ripple | ~245 |
| 3 | Post-Processing Chain | Bloom, chromatic aberration, vignette | ~240 |
| 9 | Horizontal Scroll Timeline | Pinned horizontal section synced to vertical scroll | ~460 |
| **Heavy tier** | | | |
| 1 | Multi-Scene Render Target Transitions | Switch between 3D scenes with shader wipe | ~280 |
| 2 | Scroll Z-Depth Gallery | Camera flies through depth-arranged gallery | ~180 |
| 8 | Camera Spline Navigation | Camera follows a path through a 3D scene | ~280 |
| 4 | SDF Text in WebGL | Crisp, extrudable 3D text with lighting | ~175 |

## Default load bundles (by energy)

- **Subtle energy:** 10 + 6 + 11 + 12 (~930 lines)
- **Moderate energy:** +5 + 7 + 3 (~1710 lines total)
- **Heavy energy:** +1 + 2 + 8 + 4 (~2625 lines total)

---


Complete, self-contained HTML files. Open in a browser and they work. The AI should compose from these — select recipes that match the brief, adapt colors/content/timing, merge into a single output file.

### Recipe 10: GPU Tier Detection + Fallbacks
**When:** Always include — mandatory.
**Complexity:** Subtle
**Dependencies:** None (vanilla JS)
**Source:** Unseen 2025

#### Working Code

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GPU Tier Detection</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0a0a0a;
    color: #e0e0e0;
    font-family: 'Courier New', monospace;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 2rem;
  }
  .card {
    background: #111;
    border: 1px solid #222;
    border-radius: 12px;
    padding: 2rem 2.5rem;
    max-width: 560px;
    width: 100%;
  }
  h1 { font-size: 1rem; color: #555; margin-bottom: 1.5rem; letter-spacing: 0.1em; text-transform: uppercase; }
  .tier-badge {
    display: inline-block;
    padding: 0.3rem 0.9rem;
    border-radius: 4px;
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 1.5rem;
  }
  .tier-high  { background: #1a3a1a; color: #4caf50; border: 1px solid #2d6e2d; }
  .tier-mid   { background: #3a2e0a; color: #e5a630; border: 1px solid #7a5e10; }
  .tier-low   { background: #3a1a0a; color: #ff7043; border: 1px solid #7a3010; }
  .tier-none  { background: #1a1a1a; color: #666;    border: 1px solid #333; }
  .row { display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid #1a1a1a; font-size: 0.82rem; }
  .row:last-child { border-bottom: none; }
  .label { color: #555; }
  .value { color: #ccc; }
  .value.on  { color: #4caf50; }
  .value.off { color: #444; }
  .config-block { margin-top: 1.5rem; }
  .config-block h2 { font-size: 0.75rem; color: #444; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.8rem; }
</style>
</head>
<body>
<div class="card">
  <h1>GPU Tier Detection</h1>
  <div id="badge"></div>
  <div id="rows"></div>
  <div class="config-block">
    <h2>Active Config</h2>
    <div id="config"></div>
  </div>
</div>

<script>
function detectGPUTier() {
  // --- GPU renderer string ---
  let renderer = 'unknown';
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || 'unknown';
      }
    }
  } catch (e) { /* blocked by privacy settings */ }

  // --- Device signals ---
  const cores   = navigator.hardwareConcurrency || 0;
  const memory  = navigator.deviceMemory        || 0; // GB, may be undefined
  const ua      = navigator.userAgent;
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);

  // --- Classify renderer ---
  const r = renderer.toLowerCase();
  const isHighEnd = /rtx|rx[\s_]?[56789]|radeon\s*(pro|rx)\s*[56789]|apple\s*m[23]|a16|a17/i.test(r);
  const isLowEnd  = /intel.*hd|mali|adreno\s*[0-3]|powervr|llvmpipe|swiftshader/i.test(r);
  const noWebGL   = renderer === 'unknown';

  // --- Assign tier ---
  let tier;
  if (noWebGL)                                           tier = 'none';
  else if (isLowEnd || isMobile || cores <= 2)           tier = 'low';
  else if (isHighEnd && !isMobile && cores >= 8)         tier = 'high';
  else                                                   tier = 'mid';

  // --- Tier configs ---
  const configs = {
    high: {
      particles:          150000,
      postProcessing:     true,
      bloom:              true,
      chromaticAberration:true,
      lensFlare:          true,
      dpr:                Math.min(window.devicePixelRatio, 2),
    },
    mid: {
      particles:          60000,
      postProcessing:     true,
      bloom:              true,
      chromaticAberration:false,
      lensFlare:          false,
      dpr:                Math.min(window.devicePixelRatio, 1.5),
    },
    low: {
      particles:          15000,
      postProcessing:     false,
      bloom:              false,
      chromaticAberration:false,
      lensFlare:          false,
      dpr:                1,
    },
    none: {
      particles:          0,
      postProcessing:     false,
      bloom:              false,
      chromaticAberration:false,
      lensFlare:          false,
      dpr:                1,
    },
  };

  return { tier, renderer, cores, memory, isMobile, config: configs[tier] };
}

// --- Render results ---
const result = detectGPUTier();

document.getElementById('badge').innerHTML =
  `<span class="tier-badge tier-${result.tier}">Tier: ${result.tier}</span>`;

const info = [
  ['Renderer',          result.renderer],
  ['CPU Cores',         result.cores || 'unknown'],
  ['Device Memory',     result.memory ? result.memory + ' GB' : 'unknown'],
  ['Mobile',            result.isMobile ? 'yes' : 'no'],
];
document.getElementById('rows').innerHTML = info
  .map(([label, value]) => `<div class="row"><span class="label">${label}</span><span class="value">${value}</span></div>`)
  .join('');

const cfg = result.config;
const cfgRows = [
  ['particles',           cfg.particles.toLocaleString()],
  ['postProcessing',      cfg.postProcessing],
  ['bloom',               cfg.bloom],
  ['chromaticAberration', cfg.chromaticAberration],
  ['lensFlare',           cfg.lensFlare],
  ['dpr',                 cfg.dpr],
];
document.getElementById('config').innerHTML = cfgRows
  .map(([k, v]) => {
    const cls = v === true ? 'on' : v === false ? 'off' : '';
    const display = v === true ? 'enabled' : v === false ? 'disabled' : v;
    return `<div class="row"><span class="label">${k}</span><span class="value ${cls}">${display}</span></div>`;
  }).join('');

// Expose globally so other scripts can consume it
window.GPU_TIER   = result.tier;
window.GPU_CONFIG = result.config;
</script>
</body>
</html>
```

#### Customization Points
- Adjust `particles` counts per tier to match your scene complexity
- Add/remove post-processing flags (`ssao`, `motionBlur`, `depthOfField`) to match your pipeline
- Extend `isHighEnd` / `isLowEnd` regex patterns as new GPUs emerge
- Change `dpr` caps — use `1.5` max on mid if perf is still tight
- Emit a custom event (`dispatchEvent(new CustomEvent('gpuTierReady', { detail: result }))`) so other modules can react

#### Combines With
- Recipe 11 (Parallax System) — skip parallax or reduce layer count on `low`/`none` tiers
- Recipe 12 (Text Animation) — disable per-char stagger on `low`, animate whole words instead
- Any Three.js / R3F scene — read `window.GPU_CONFIG` before creating the renderer

---

### Recipe 11: Parallax System
**When:** Adding layered depth to long-scroll pages.
**Complexity:** Subtle
**Dependencies:** None (vanilla JS)
**Source:** Unseen 2025

#### Working Code

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Parallax System</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  :root {
    --accent: #e5a630;
    --bg:     #0c0c0c;
    --text:   #d8d4cc;
  }

  html { scroll-behavior: smooth; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'Georgia', serif;
    overflow-x: hidden;
  }

  /* ─── Section layout ─── */
  .section {
    position: relative;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    padding: 6rem 2rem;
  }

  .section:nth-child(even) { background: #0f0f0f; }

  .content {
    position: relative;
    z-index: 10;
    max-width: 640px;
    text-align: center;
  }

  .content h1 {
    font-size: clamp(2.4rem, 6vw, 4.5rem);
    font-weight: 400;
    line-height: 1.1;
    margin-bottom: 1.2rem;
    color: #f0ece4;
  }

  .content h1 em {
    font-style: italic;
    color: var(--accent);
  }

  .content p {
    font-size: 1.05rem;
    line-height: 1.8;
    color: #8a8680;
    max-width: 480px;
    margin: 0 auto;
  }

  /* ─── Decorative shapes (parallax targets) ─── */
  .shape {
    position: absolute;
    border-radius: 50%;
    pointer-events: none;
    will-change: transform;
  }

  /* Section 1 shapes */
  .s1-circle-1 {
    width: 420px; height: 420px;
    border: 1px solid rgba(229,166,48,0.12);
    top: -80px; left: -160px;
  }
  .s1-circle-2 {
    width: 180px; height: 180px;
    background: radial-gradient(circle, rgba(229,166,48,0.07) 0%, transparent 70%);
    bottom: 60px; right: 80px;
  }
  .s1-dot {
    width: 6px; height: 6px;
    background: var(--accent);
    opacity: 0.5;
    top: 35%; right: 22%;
    border-radius: 50%;
  }

  /* Section 2 shapes */
  .s2-ring {
    width: 600px; height: 600px;
    border: 1px solid rgba(255,255,255,0.04);
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
  }
  .s2-arc {
    width: 260px; height: 260px;
    border: 1px solid rgba(229,166,48,0.15);
    border-bottom: none;
    border-radius: 50% 50% 0 0;
    bottom: 80px; left: 60px;
  }

  /* Section 3 shapes */
  .s3-square {
    width: 200px; height: 200px;
    border: 1px solid rgba(229,166,48,0.1);
    border-radius: 8px;
    top: 15%; right: 10%;
    transform: rotate(18deg);
  }
  .s3-circle {
    width: 80px; height: 80px;
    background: rgba(229,166,48,0.05);
    bottom: 20%; left: 8%;
  }
</style>
</head>
<body>

<!-- ─── Section 1 ─── -->
<section class="section" id="s1">
  <div class="shape s1-circle-1" data-parallax="0.8"></div>
  <div class="shape s1-circle-2" data-parallax="1.3"></div>
  <div class="shape s1-dot"      data-parallax="1.1"></div>
  <div class="content">
    <h1>The Weight of <em>Light</em></h1>
    <p>Parallax depth creates the illusion of a three-dimensional space. Slower elements feel distant; faster ones feel close enough to touch.</p>
  </div>
</section>

<!-- ─── Section 2 ─── -->
<section class="section" id="s2">
  <div class="shape s2-ring" data-parallax="0.9"></div>
  <div class="shape s2-arc" data-parallax="1.1"></div>
  <div class="content">
    <h1>Layers in <em>Motion</em></h1>
    <p>Each decorative element carries a speed multiplier. Values below 1 lag behind scroll — a background feel. Values above 1 race ahead — a foreground feel.</p>
  </div>
</section>

<!-- ─── Section 3 ─── -->
<section class="section" id="s3">
  <div class="shape s3-square" data-parallax="0.8"></div>
  <div class="shape s3-circle" data-parallax="1.3"></div>
  <div class="content">
    <h1>Depth Without <em>Cost</em></h1>
    <p>Pure CSS transforms on the GPU. No canvas, no WebGL. requestAnimationFrame with a ticking flag ensures one layout read and one paint per frame.</p>
  </div>
</section>

<script>
(function () {
  'use strict';

  // Collect all parallax elements once
  const items = Array.from(document.querySelectorAll('[data-parallax]')).map(el => ({
    el,
    speed: parseFloat(el.dataset.parallax),
  }));

  let ticking = false;
  let lastScrollY = window.scrollY;

  function applyParallax() {
    const viewH = window.innerHeight;

    items.forEach(({ el, speed }) {
      const rect   = el.getBoundingClientRect();
      // Distance of element centre from viewport centre
      const centre = rect.top + rect.height / 2;
      const offset = (centre - viewH / 2) * (1 - speed);
      el.style.transform = `translateY(${offset.toFixed(2)}px)`;
    });

    ticking = false;
  }

  function onScroll() {
    lastScrollY = window.scrollY;
    if (!ticking) {
      requestAnimationFrame(applyParallax);
      ticking = true;
    }
  }

  // Run once on load to position correctly before first scroll
  applyParallax();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', applyParallax, { passive: true });
}());
</script>
</body>
</html>
```

#### Customization Points
- `data-parallax="0.8"` — slower than scroll (background layers: 0.6–0.9)
- `data-parallax="1.1"` — faster than scroll (foreground layers: 1.1–1.5)
- Add `data-parallax-x` for horizontal drift alongside vertical
- Set `will-change: transform` only on elements that actually move — remove it from static shapes
- On mobile, set all speeds to `1.0` (read from `window.GPU_TIER === 'low'` via Recipe 10) to avoid jank
- Swap decorative shapes for actual images or SVGs — the system is element-agnostic

#### Combines With
- Recipe 10 (GPU Tier Detection) — disable or flatten on `low`/`none` tiers
- Recipe 12 (Text Animation) — content headings animate in; shapes drift behind them
- Any section-based long-scroll layout

---

### Recipe 12: Text Animation
**When:** Hero headings, section reveals.
**Complexity:** Subtle
**Dependencies:** GSAP 3 + ScrollTrigger (CDN), Google Fonts
**Source:** Unseen 2025

#### Working Code

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Text Animation</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  :root {
    --accent: #e5a630;
    --bg:     #0b0b0b;
    --text:   #d8d4cc;
  }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'Inter', sans-serif;
    overflow-x: hidden;
  }

  /* ─── Sections ─── */
  .section {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0 clamp(1.5rem, 8vw, 10rem);
    position: relative;
  }

  .section + .section {
    border-top: 1px solid rgba(255,255,255,0.05);
  }

  /* ─── Label ─── */
  .label {
    font-family: 'Inter', monospace;
    font-size: 0.72rem;
    letter-spacing: 0.18em;
    color: #444;
    text-transform: uppercase;
    margin-bottom: 1.6rem;
    font-variant-numeric: tabular-nums;
  }

  /* ─── Heading ─── */
  .heading {
    font-family: 'DM Serif Display', serif;
    font-size: clamp(3rem, 9vw, 7.5rem);
    font-weight: 400;
    line-height: 1.0;
    letter-spacing: -0.02em;
    margin-bottom: 2rem;
    overflow: hidden; /* contain char animations */
  }

  .heading .accent {
    color: var(--accent);
    font-style: italic;
  }

  /* char wrapper — injected by JS */
  .char {
    display: inline-block;
    /* initial state set by GSAP */
  }

  /* preserve spaces */
  .word {
    display: inline-block;
    white-space: nowrap;
  }

  /* ─── Subtitle ─── */
  .subtitle {
    font-size: clamp(0.95rem, 2vw, 1.15rem);
    font-weight: 300;
    line-height: 1.85;
    color: #6a6660;
    max-width: 520px;
  }

  .subtitle .word {
    /* initial state set by GSAP */
  }

  /* ─── Divider ─── */
  .divider {
    width: 40px;
    height: 1px;
    background: var(--accent);
    margin: 1.8rem 0;
    transform-origin: left;
    /* animated by GSAP */
  }
</style>
</head>
<body>

<!-- ─── Section 01 ─── -->
<section class="section" data-section="01">
  <p class="label">[01 — Introduction]</p>
  <h1 class="heading">
    The Art of<br>
    <span class="accent">Invisible</span> Motion
  </h1>
  <div class="divider"></div>
  <p class="subtitle">
    Good animation is felt, not watched. It guides attention without demanding it — a quiet architecture of time.
  </p>
</section>

<!-- ─── Section 02 ─── -->
<section class="section" data-section="02">
  <p class="label">[02 — Technique]</p>
  <h1 class="heading">
    Every Character<br>
    <span class="accent">Counts</span>
  </h1>
  <div class="divider"></div>
  <p class="subtitle">
    Split text into characters, animate from centre outward. The stagger creates a wave that feels organic rather than mechanical.
  </p>
</section>

<!-- ─── Section 03 ─── -->
<section class="section" data-section="03">
  <p class="label">[03 — Resolution]</p>
  <h1 class="heading">
    Scroll as<br>
    <span class="accent">Conductor</span>
  </h1>
  <div class="divider"></div>
  <p class="subtitle">
    ScrollTrigger ties each reveal to its section's position in the viewport. Animations fire once, at exactly the right moment.
  </p>
</section>

<!-- ─── GSAP ─── -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
<script>
gsap.registerPlugin(ScrollTrigger);

// ─── Manual char splitter (preserves <span class="accent"> tags) ───────────
function splitChars(headingEl) {
  // We need to handle mixed text nodes and <span> children
  const children = Array.from(headingEl.childNodes);
  headingEl.innerHTML = ''; // clear

  children.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      // Split plain text into chars, wrap each in .char
      const text = node.textContent;
      text.split('').forEach(ch => {
        if (ch === '\n') {
          headingEl.appendChild(document.createElement('br'));
        } else {
          const span = document.createElement('span');
          span.className = 'char';
          span.textContent = ch === ' ' ? '\u00A0' : ch; // preserve spaces
          headingEl.appendChild(span);
        }
      });
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // It's a <span class="accent"> or similar — split its text too
      const inner = node.textContent;
      inner.split('').forEach(ch => {
        const span = document.createElement('span');
        span.className = 'char ' + node.className;
        span.textContent = ch === ' ' ? '\u00A0' : ch;
        headingEl.appendChild(span);
      });
    }
  });

  return headingEl.querySelectorAll('.char');
}

// ─── Manual word splitter for subtitles ──────────────────────────────────────
function splitWords(el) {
  const text = el.textContent;
  el.innerHTML = text.trim().split(/\s+/).map(w =>
    `<span class="word">${w}</span>`
  ).join(' ');
  return el.querySelectorAll('.word');
}

// ─── Animate each section ────────────────────────────────────────────────────
document.querySelectorAll('.section').forEach(section => {
  const heading  = section.querySelector('.heading');
  const subtitle = section.querySelector('.subtitle');
  const divider  = section.querySelector('.divider');
  const label    = section.querySelector('.label');

  const chars = splitChars(heading);
  const words = splitWords(subtitle);

  // Set initial states
  gsap.set(chars, { opacity: 0, scale: 0.9, y: 30 });
  gsap.set(words, { opacity: 0, y: 18 });
  gsap.set(divider, { scaleX: 0, opacity: 0 });
  gsap.set(label, { opacity: 0, y: 10 });

  // Timeline per section
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: section,
      start: 'top 72%',
      once: true,       // fire only the first time
    },
  });

  tl
    .to(label, {
      opacity: 1,
      y: 0,
      duration: 0.5,
      ease: 'power2.out',
    })
    .to(chars, {
      opacity: 1,
      scale: 1,
      y: 0,
      duration: 0.75,
      ease: 'power3.out',
      stagger: { from: 'center', each: 0.03 },
    }, '-=0.2')
    .to(divider, {
      scaleX: 1,
      opacity: 1,
      duration: 0.6,
      ease: 'power2.inOut',
    }, '-=0.3')
    .to(words, {
      opacity: 1,
      y: 0,
      duration: 0.5,
      ease: 'power2.out',
      stagger: { each: 0.04 },
    }, '-=0.3');
});
</script>
</body>
</html>
```

#### Customization Points
- `stagger: { from: 'center', each: 0.03 }` — change `from` to `'start'` or `'end'` for different wave directions; increase `each` for slower cascades
- `scale: 0.9` + `y: 30` entrance — swap for `rotationX: 90` + clip-path for a flip-up effect
- `start: 'top 72%'` ScrollTrigger threshold — lower value (e.g. `60%`) fires earlier; `80%` fires late
- Remove `once: true` if you want animations to re-trigger on scroll-back
- Replace `DM Serif Display` with any serif; update `clamp()` sizes to match x-height
- Add `scrub: 0.5` to ScrollTrigger for scroll-linked (non-snappy) playback

#### Combines With
- Recipe 10 (GPU Tier Detection) — on `low` tier, animate whole words instead of chars (`splitWords` only, skip `splitChars`)
- Recipe 11 (Parallax System) — section decorative shapes drift while headings reveal
- Any Three.js background scene — headings sit in HTML overlay above the canvas (`z-index: 10`)

---

### Recipe 5: Scroll-Synced WebGL Canvas
**When:** Full-viewport 3D canvas that responds to page scroll
**Complexity:** Moderate
**Dependencies:** Three.js r162+ (CDN import map)
**Source:** Unseen main site, Lenis scroll pattern

#### Working Code

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Scroll-Synced WebGL Canvas</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

  :root {
    --accent: #e5a630;
    --bg: #0a0a0f;
    --text: #f0ede8;
    --muted: rgba(240, 237, 232, 0.45);
  }

  html { background: var(--bg); }

  body {
    font-family: 'Inter', sans-serif;
    color: var(--text);
    background: transparent;
  }

  canvas#scene {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 0;
    display: block;
  }

  .content {
    position: relative;
    z-index: 1;
  }

  section {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0 8vw;
  }

  section:not(:last-child) {
    border-bottom: 1px solid rgba(229, 166, 48, 0.12);
  }

  .label {
    font-size: 0.7rem;
    font-weight: 500;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 1.5rem;
    font-family: 'Inter', sans-serif;
  }

  h1, h2 {
    font-family: 'DM Serif Display', serif;
    line-height: 1.05;
    max-width: 700px;
  }

  h1 {
    font-size: clamp(3rem, 7vw, 6rem);
    mix-blend-mode: difference;
    color: #fff;
  }

  h2 {
    font-size: clamp(2rem, 4.5vw, 3.8rem);
    mix-blend-mode: difference;
    color: #fff;
  }

  p {
    margin-top: 1.5rem;
    font-size: clamp(1rem, 1.4vw, 1.125rem);
    line-height: 1.75;
    color: var(--muted);
    max-width: 520px;
  }

  .scroll-hint {
    position: fixed;
    bottom: 2rem;
    right: 2.5rem;
    z-index: 10;
    font-size: 0.65rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--accent);
    writing-mode: vertical-rl;
    opacity: 0.7;
    animation: fade-pulse 2s ease-in-out infinite;
  }

  @keyframes fade-pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.9; }
  }
</style>
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.162.0/build/three.module.js"
  }
}
</script>
</head>
<body>

<canvas id="scene"></canvas>

<div class="content">
  <section>
    <p class="label">001 — Presence</p>
    <h1>Space is not<br><em>empty</em></h1>
    <p>Geometry drifts at the edge of perception. Each scroll reorients the field — revealing new axes, new relationships between form and void.</p>
  </section>

  <section>
    <p class="label">002 — Motion</p>
    <h2>Objects in orbit<br>obey no clock</h2>
    <p>The wireframe lattice is a map of invisible forces. Scroll further and the camera descends — topology shifts underfoot.</p>
  </section>

  <section>
    <p class="label">003 — Depth</p>
    <h2>Fog is the medium,<br>not the absence</h2>
    <p>Distance collapses. Forms at the threshold dissolve into the field, recalled only by their silhouette.</p>
  </section>

  <section>
    <p class="label">004 — Gravity</p>
    <h2>Every system has<br>a strange attractor</h2>
    <p>The scene tilts. Rotation accumulates. What began as floating objects now compose a landscape viewed from above.</p>
  </section>

  <section>
    <p class="label">005 — Return</p>
    <h2>Scroll back.<br>Nothing repeats exactly.</h2>
    <p>The interpolation ensures smooth passage — but the state is continuous, not cyclical. Each visit traces a unique path through the space.</p>
  </section>
</div>

<span class="scroll-hint">Scroll</span>

<script type="module">
import * as THREE from 'three';

// ── Scene setup ──────────────────────────────────────────────────────────────
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x0a0a0f, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0a0a0f, 0.035);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 0, 18);

// ── Lights ───────────────────────────────────────────────────────────────────
const ambient = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambient);

const dirLight = new THREE.DirectionalLight(0xe5a630, 2.5);
dirLight.position.set(5, 10, 8);
scene.add(dirLight);

const fillLight = new THREE.DirectionalLight(0x4a90d9, 0.8);
fillLight.position.set(-8, -4, 6);
scene.add(fillLight);

// ── Icosahedrons ─────────────────────────────────────────────────────────────
const group = new THREE.Group();
scene.add(group);

const geo = new THREE.IcosahedronGeometry(1, 1);
const mat = new THREE.MeshBasicMaterial({
  color: 0xe5a630,
  wireframe: true,
  transparent: true,
  opacity: 0.45,
});

const COUNT = 15;
const meshes = [];

for (let i = 0; i < COUNT; i++) {
  const m = new THREE.Mesh(geo, mat.clone());
  const scale = 0.4 + Math.random() * 1.4;
  m.scale.setScalar(scale);
  m.position.set(
    (Math.random() - 0.5) * 40,
    (Math.random() - 0.5) * 30,
    (Math.random() - 0.5) * 30,
  );
  m.userData.speed = 0.0015 + Math.random() * 0.004;
  m.userData.axis = new THREE.Vector3(
    Math.random() - 0.5,
    Math.random() - 0.5,
    Math.random() - 0.5,
  ).normalize();
  m.material.opacity = 0.15 + Math.random() * 0.45;
  group.add(m);
  meshes.push(m);
}

// ── Scroll tracking ──────────────────────────────────────────────────────────
let scrollProgress = 0;
let smoothProgress = 0;

function getScrollProgress() {
  const maxScroll = document.documentElement.scrollHeight - innerHeight;
  return maxScroll > 0 ? scrollY / maxScroll : 0;
}

window.addEventListener('scroll', () => {
  scrollProgress = getScrollProgress();
}, { passive: true });

// ── Resize handler ────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
});

// ── Animation loop ────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();

  // Smooth scroll interpolation
  smoothProgress += (scrollProgress - smoothProgress) * 0.05;

  // Scroll-driven scene transforms
  group.rotation.y = smoothProgress * Math.PI * 1.8;
  group.rotation.x = smoothProgress * Math.PI * 0.4;
  camera.position.y = -smoothProgress * 14;

  // Individual mesh rotations
  for (const m of meshes) {
    m.rotateOnAxis(m.userData.axis, m.userData.speed);
  }

  // Gentle ambient drift
  group.rotation.z = Math.sin(elapsed * 0.08) * 0.05;

  renderer.render(scene, camera);
}

animate();
</script>
</body>
</html>
```

#### Customization Points
- `COUNT = 15` — increase to 30+ for a denser field; decrease to 6 for minimal look
- `scene.fog = new THREE.FogExp2(0x0a0a0f, 0.035)` — raise density (0.06) for heavy fog; lower (0.015) for deeper depth
- `smoothProgress += (scrollProgress - smoothProgress) * 0.05` — raise factor (0.1) for snappier tracking; lower (0.02) for dreamlike lag
- `group.rotation.y = smoothProgress * Math.PI * 1.8` — multiply PI factor to control total rotation across scroll
- `camera.position.y = -smoothProgress * 14` — change 14 to control how far the camera descends
- `mix-blend-mode: difference` on headings — swap to `exclusion` for subtler contrast inversion
- Replace `IcosahedronGeometry` with `OctahedronGeometry` or `TorusKnotGeometry` for different wireframe characters

#### Combines With
- Recipe 6 (Shader Gradient Background) — remove solid clear color and composite shader behind the icosahedrons
- Recipe 10 (GPU Tier Detection) — reduce COUNT to 6 on low-tier GPUs
- Recipe 12 (Scroll Text Reveal) — section headings animate in as you scroll into each section

---

### Recipe 6: Shader Gradient Background
**When:** Living, breathing background replacing static gradients. Any website.
**Complexity:** Subtle (but placed with moderate recipes for composition)
**Dependencies:** Three.js r162+ (CDN import map)
**Source:** Stripe mesh gradient technique

#### Working Code

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Shader Gradient Background</title>
<style>
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    background: #0a0a2e;
    color: #f0ede8;
    font-family: system-ui, sans-serif;
    min-height: 100vh;
  }

  canvas#bg {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 0;
    display: block;
  }

  .overlay {
    position: relative;
    z-index: 1;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 1rem;
    padding: 2rem;
  }

  .overlay h1 {
    font-size: clamp(2.5rem, 6vw, 5rem);
    font-weight: 300;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }

  .overlay p {
    font-size: 1.1rem;
    opacity: 0.6;
    max-width: 480px;
    line-height: 1.7;
  }

  .pill {
    display: inline-block;
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 999px;
    padding: 0.4rem 1.2rem;
    font-size: 0.75rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.6);
  }
</style>
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.162.0/build/three.module.js"
  }
}
</script>
</head>
<body>

<canvas id="bg"></canvas>

<div class="overlay">
  <span class="pill">Shader Gradient</span>
  <h1>Deep space.<br>Alive with motion.</h1>
  <p>A full-screen GLSL background using simplex noise and FBM. No images, no video — just mathematics running on the GPU.</p>
</div>

<script type="module">
import * as THREE from 'three';

const canvas = document.getElementById('bg');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// ── Shaders ───────────────────────────────────────────────────────────────────
const vertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */`
  uniform float uTime;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  varying vec2 vUv;

  // ── Simplex 2D noise ────────────────────────────────────────────────────────
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1  = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
              + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
              dot(x12.zw, x12.zw)), 0.0);
    m = m * m; m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  // ── FBM (6 octaves) ─────────────────────────────────────────────────────────
  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    for (int i = 0; i < 6; i++) {
      value += amplitude * snoise(p * frequency);
      frequency *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 uv = vUv;

    // Stripe sinusoidal UV modulation
    vec2 distUv = uv + vec2(
      sin(uv.y * 3.0 + uTime * 0.15) * 0.1,
      cos(uv.x * 3.0 + uTime * 0.12) * 0.1
    );

    float n  = fbm(distUv * 2.2 + uTime * 0.06);
    float n2 = fbm(distUv * 3.8 - uTime * 0.04 + vec2(5.2, 1.3));

    // Three-way color mix
    vec3 color = mix(
      mix(uColor1, uColor2, smoothstep(-0.3, 0.3, n)),
      uColor3,
      smoothstep(0.0, 0.6, n2)
    );

    // Subtle vignette
    float vignette = 1.0 - 0.3 * length(uv - 0.5);
    color *= vignette;

    gl_FragColor = vec4(color, 1.0);
  }
`;

// ── Uniforms ──────────────────────────────────────────────────────────────────
const uniforms = {
  uTime:   { value: 0 },
  uColor1: { value: new THREE.Color(0x0a0a2e) },
  uColor2: { value: new THREE.Color(0x1a0a2e) },
  uColor3: { value: new THREE.Color(0x0a1a2e) },
};

const material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms,
});

const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
scene.add(quad);

// ── Resize ────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
});

// ── Loop ──────────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
(function animate() {
  requestAnimationFrame(animate);
  uniforms.uTime.value = clock.getElapsedTime();
  renderer.render(scene, camera);
})();
</script>
</body>
</html>
```

#### Customization Points
- `uColor1/2/3` uniforms — swap hex values to shift the entire palette; warm tones (0x2e1a0a, 0x2e0a0a) create an ember feel
- `fbm` octave count (6) — reduce to 3 for performance; increase to 8 for more micro-detail
- `sin(uv.y * 3.0 + uTime * 0.15) * 0.1` — increase frequency (3.0 → 6.0) for tighter ripples; increase amplitude (0.1 → 0.2) for more distortion
- `uTime * 0.06` FBM drift speed — raise to 0.15 for agitated motion; lower to 0.02 for glacial drift
- `vignette: 1.0 - 0.3 * length(uv - 0.5)` — raise 0.3 to 0.6 for heavy corner darkening
- `renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))` — cap at 1.0 for maximum GPU savings

#### Combines With
- Recipe 5 (Scroll-Synced Canvas) — layer icosahedrons on top using additive blending
- Recipe 7 (Mouse-Reactive Fluid) — replace this background or add a second pass
- Recipe 10 (GPU Tier Detection) — reduce FBM octaves to 2 on low tier; kill animation on `minimal`

---

### Recipe 7: Mouse-Reactive Fluid Distortion
**When:** Interactive cursor effect that makes the page feel alive
**Complexity:** Moderate
**Dependencies:** Three.js r162+ (CDN import map)
**Source:** Unseen main site cursor effect

#### Working Code

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Mouse-Reactive Fluid Distortion</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    background: #080810;
    overflow: hidden;
    cursor: none;
  }

  canvas#fluid {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
  }

  .dom-overlay {
    position: fixed;
    inset: 0;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    text-align: center;
    padding: 2rem;
  }

  .dom-overlay h1 {
    font-family: 'DM Serif Display', serif;
    font-size: clamp(3rem, 8vw, 7rem);
    line-height: 1.0;
    color: #ffffff;
    mix-blend-mode: difference;
    user-select: none;
  }

  .dom-overlay h1 em {
    font-style: italic;
    color: #e5a630;
  }

  .hint {
    position: fixed;
    bottom: 2.5rem;
    left: 50%;
    transform: translateX(-50%);
    font-size: 0.65rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.3);
    z-index: 2;
    pointer-events: none;
  }
</style>
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.162.0/build/three.module.js"
  }
}
</script>
</head>
<body>

<canvas id="fluid"></canvas>

<div class="dom-overlay">
  <h1>Move your<br><em>cursor.</em></h1>
</div>

<span class="hint">Move cursor to distort</span>

<script type="module">
import * as THREE from 'three';

const canvas = document.getElementById('fluid');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// ── Shaders ───────────────────────────────────────────────────────────────────
const vertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */`
  uniform float uTime;
  uniform vec2  uMouse;
  uniform vec2  uResolution;
  varying vec2  vUv;

  // ── Simplex 2D ──────────────────────────────────────────────────────────────
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1  = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
              + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
              dot(x12.zw, x12.zw)), 0.0);
    m = m * m; m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  void main() {
    vec2 uv    = vUv;
    vec2 mouse = uMouse;

    // Aspect-correct distance to cursor
    float aspect = uResolution.x / uResolution.y;
    vec2 uvAspect = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
    vec2 mAspect  = vec2((mouse.x - 0.5) * aspect, mouse.y - 0.5);
    float dist    = length(uvAspect - mAspect);

    // Mouse influence field
    float influence = smoothstep(0.4, 0.0, dist);

    // Noise-based UV distortion
    vec2 distortedUv = uv + snoise(uv * 5.0 + uTime * 0.3) * influence * 0.08;

    // Base gradient colors distorted by noise
    float n = snoise(distortedUv * 2.5 + uTime * 0.07);
    vec3 colA = vec3(0.04, 0.04, 0.18); // deep navy
    vec3 colB = vec3(0.12, 0.05, 0.22); // violet
    vec3 base = mix(colA, colB, smoothstep(-0.4, 0.4, n));

    // Gold glow around cursor
    float glow = smoothstep(0.3, 0.0, dist) * 0.4;
    base += vec3(0.9, 0.65, 0.2) * glow;

    // Ripple ring emanating from cursor
    float ring = smoothstep(0.01, 0.0, abs(dist - 0.15 + sin(uTime * 2.0) * 0.02));
    base += vec3(1.0, 0.85, 0.4) * ring * 0.6;

    gl_FragColor = vec4(base, 1.0);
  }
`;

// ── Uniforms ──────────────────────────────────────────────────────────────────
const uniforms = {
  uTime:       { value: 0 },
  uMouse:      { value: new THREE.Vector2(0.5, 0.5) },
  uResolution: { value: new THREE.Vector2(innerWidth, innerHeight) },
};

const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms });
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
scene.add(quad);

// ── Smooth mouse tracking ─────────────────────────────────────────────────────
const targetMouse  = new THREE.Vector2(0.5, 0.5);
const currentMouse = new THREE.Vector2(0.5, 0.5);

window.addEventListener('mousemove', (e) => {
  targetMouse.set(e.clientX / innerWidth, 1.0 - e.clientY / innerHeight);
});

window.addEventListener('touchmove', (e) => {
  const t = e.touches[0];
  targetMouse.set(t.clientX / innerWidth, 1.0 - t.clientY / innerHeight);
}, { passive: true });

// ── Resize ────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  uniforms.uResolution.value.set(innerWidth, innerHeight);
});

// ── Loop ──────────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
(function animate() {
  requestAnimationFrame(animate);
  uniforms.uTime.value = clock.getElapsedTime();

  // Smooth lerp toward target
  currentMouse.lerp(targetMouse, 0.05);
  uniforms.uMouse.value.copy(currentMouse);

  renderer.render(scene, camera);
})();
</script>
</body>
</html>
```

#### Customization Points
- `smoothstep(0.4, 0.0, dist)` influence radius — change first value (0.4) to shrink/grow the affected zone around the cursor
- `influence * 0.08` distortion strength — raise to 0.15 for aggressive warping; lower to 0.03 for subtle shimmer
- `currentMouse.lerp(targetMouse, 0.05)` — raise to 0.15 for tighter cursor tracking; lower to 0.02 for long trailing tail
- Gold glow color `vec3(0.9, 0.65, 0.2)` — swap to `vec3(0.5, 0.9, 1.0)` for cyan glow
- Ring expression `dist - 0.15 + sin(uTime * 2.0) * 0.02` — change 0.15 for ring radius; change 2.0 for pulse frequency
- `colA` and `colB` — swap for entirely different background palette
- `mix-blend-mode: difference` on `.dom-overlay h1` — remove for non-inverted white text

#### Combines With
- Recipe 6 (Shader Gradient Background) — use this as the base and layer text on top without the gradient
- Recipe 10 (GPU Tier Detection) — on low tier, render a CSS radial-gradient cursor glow instead of the WebGL quad
- Recipe 5 (Scroll-Synced Canvas) — add a Three.js scene on top with `THREE.AdditiveBlending`

---

### Recipe 9: Horizontal Scroll Timeline
**When:** Year-in-review, project timeline, portfolio reel, editorial narrative
**Complexity:** Moderate
**Dependencies:** GSAP 3.14+ (CDN)
**Source:** Unseen 2025 Year in Review

#### Working Code

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Horizontal Scroll Timeline</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@300;400&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

  :root {
    --accent: #e5a630;
    --bg: #0c0c10;
    --surface: #13131a;
    --border: rgba(229, 166, 48, 0.12);
    --text: #f0ede8;
    --muted: rgba(240, 237, 232, 0.45);
    --mono: 'DM Mono', monospace;
    --serif: 'DM Serif Display', serif;
    --sans: 'Inter', sans-serif;
  }

  html { background: var(--bg); }

  body {
    font-family: var(--sans);
    color: var(--text);
    background: var(--bg);
    overflow-x: hidden;
  }

  /* ── Progress bar ─────────────────────────────────────────────────────────── */
  #progress-bar {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 2px;
    background: rgba(229, 166, 48, 0.15);
    z-index: 100;
  }

  #progress-bar::after {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--accent);
    transform-origin: left center;
    transform: scaleX(0);
    transition: transform 0.05s linear;
  }

  #progress-bar.active::after {
    transform: scaleX(var(--progress, 0));
  }

  /* ── Nav ──────────────────────────────────────────────────────────────────── */
  nav {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem 3rem;
    pointer-events: none;
  }

  .nav-logo {
    font-family: var(--mono);
    font-size: 0.75rem;
    letter-spacing: 0.15em;
    color: var(--accent);
  }

  .nav-label {
    font-family: var(--mono);
    font-size: 0.65rem;
    letter-spacing: 0.18em;
    color: var(--muted);
    text-transform: uppercase;
  }

  /* ── Horizontal scroll wrapper ────────────────────────────────────────────── */
  .scroll-outer {
    /* height set by JS to create scroll distance */
  }

  .scroll-pin {
    position: sticky;
    top: 0;
    height: 100vh;
    overflow: hidden;
  }

  .horizontal-wrap {
    display: flex;
    width: fit-content;
    height: 100vh;
    will-change: transform;
  }

  /* ── Panels ───────────────────────────────────────────────────────────────── */
  .panel {
    width: 100vw;
    height: 100vh;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: 6rem 8vw 5rem;
    position: relative;
    border-right: 1px solid var(--border);
  }

  .panel:last-child { border-right: none; }

  /* Panel backgrounds */
  .panel-1 { background: linear-gradient(160deg, #0c0c10 60%, #12101a 100%); }
  .panel-2 { background: linear-gradient(160deg, #0c0c10 60%, #0a1018 100%); }
  .panel-3 { background: linear-gradient(160deg, #0c0c10 60%, #120a0a 100%); }
  .panel-4 { background: linear-gradient(160deg, #0c0c10 60%, #0a120a 100%); }
  .panel-5 { background: linear-gradient(160deg, #0c0c10 60%, #0c0c10 100%); }

  /* Decorative image placeholder */
  .panel-art {
    position: absolute;
    top: 8rem;
    right: 8vw;
    width: min(340px, 38vw);
    aspect-ratio: 4/3;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .panel-art::before {
    content: attr(data-label);
    font-family: var(--mono);
    font-size: 0.6rem;
    letter-spacing: 0.12em;
    color: var(--muted);
    text-transform: uppercase;
  }

  /* Art placeholder gradients per panel */
  .panel-1 .panel-art { background: linear-gradient(135deg, #1a1030 0%, #2a1060 100%); }
  .panel-2 .panel-art { background: linear-gradient(135deg, #0a1828 0%, #0a3050 100%); }
  .panel-3 .panel-art { background: linear-gradient(135deg, #280a10 0%, #501020 100%); }
  .panel-4 .panel-art { background: linear-gradient(135deg, #0a2010 0%, #103818 100%); }
  .panel-5 .panel-art { background: linear-gradient(135deg, #181018 0%, #2e1a30 100%); }

  /* ── Panel typography ─────────────────────────────────────────────────────── */
  .panel-label {
    font-family: var(--mono);
    font-size: 0.68rem;
    letter-spacing: 0.18em;
    color: var(--accent);
    text-transform: uppercase;
    margin-bottom: 1.2rem;
  }

  .panel-heading {
    font-family: var(--serif);
    font-size: clamp(2.2rem, 4.5vw, 4rem);
    line-height: 1.05;
    max-width: 560px;
    margin-bottom: 1.5rem;
  }

  .panel-heading .accent { color: var(--accent); }
  .panel-heading em { font-style: italic; color: rgba(240, 237, 232, 0.65); }

  .panel-body {
    font-size: clamp(0.875rem, 1.2vw, 1rem);
    line-height: 1.75;
    color: var(--muted);
    max-width: 420px;
    margin-bottom: 2rem;
  }

  .panel-stat {
    display: flex;
    gap: 3rem;
    margin-top: 0.5rem;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .stat-value {
    font-family: var(--mono);
    font-size: 1.4rem;
    color: var(--accent);
    letter-spacing: -0.02em;
  }

  .stat-label {
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }

  /* ── Divider ──────────────────────────────────────────────────────────────── */
  .divider {
    width: 40px;
    height: 1px;
    background: var(--accent);
    opacity: 0.5;
    margin-bottom: 1.5rem;
  }

  /* ── Panel index ──────────────────────────────────────────────────────────── */
  .panel-index {
    position: absolute;
    top: 6rem;
    left: 8vw;
    font-family: var(--mono);
    font-size: 0.6rem;
    letter-spacing: 0.2em;
    color: rgba(240, 237, 232, 0.2);
  }

  /* ── Outro section ────────────────────────────────────────────────────────── */
  .outro {
    min-height: 60vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 4rem 2rem;
    border-top: 1px solid var(--border);
  }

  .outro h2 {
    font-family: var(--serif);
    font-size: clamp(2rem, 4vw, 3.5rem);
    margin-bottom: 1rem;
  }

  .outro p {
    color: var(--muted);
    max-width: 440px;
    line-height: 1.7;
    font-size: 0.95rem;
  }
</style>
</head>
<body>

<!-- Progress bar -->
<div id="progress-bar"></div>

<!-- Navigation -->
<nav>
  <span class="nav-logo">Studio — 2025</span>
  <span class="nav-label">Year in Review</span>
</nav>

<!-- Horizontal scroll section -->
<div class="scroll-outer" id="scroll-outer">
  <div class="scroll-pin" id="scroll-pin">
    <div class="horizontal-wrap" id="horizontal-wrap">

      <!-- Panel 1 — January -->
      <div class="panel panel-1">
        <div class="panel-index">[01 — January]</div>
        <div class="panel-art" data-label="Campaign Launch"></div>
        <div class="panel-label">January — 2025</div>
        <div class="divider"></div>
        <h2 class="panel-heading">A year begins<br>with a <span class="accent">singular</span> focus</h2>
        <p class="panel-body">We entered January with one clear mandate: ship faster, think deeper, and build systems that compound over time rather than decay.</p>
        <div class="panel-stat">
          <div class="stat-item">
            <span class="stat-value">12</span>
            <span class="stat-label">Projects Started</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">4</span>
            <span class="stat-label">Clients Onboarded</span>
          </div>
        </div>
      </div>

      <!-- Panel 2 — March -->
      <div class="panel panel-2">
        <div class="panel-index">[02 — March]</div>
        <div class="panel-art" data-label="Research Sprint"></div>
        <div class="panel-label">March — 2025</div>
        <div class="divider"></div>
        <h2 class="panel-heading"><em>Research</em> as<br>the foundation</h2>
        <p class="panel-body">Two weeks of deep field research rewrote our assumptions. We paused three in-flight projects and emerged with sharper positioning and better questions.</p>
        <div class="panel-stat">
          <div class="stat-item">
            <span class="stat-value">38</span>
            <span class="stat-label">Interviews Conducted</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">6</span>
            <span class="stat-label">Pivots Avoided</span>
          </div>
        </div>
      </div>

      <!-- Panel 3 — June -->
      <div class="panel panel-3">
        <div class="panel-index">[03 — June]</div>
        <div class="panel-art" data-label="Product Launch"></div>
        <div class="panel-label">June — 2025</div>
        <div class="divider"></div>
        <h2 class="panel-heading">The <span class="accent">launch</span><br>that changed<br>everything</h2>
        <p class="panel-body">Six months of work shipped in a single week. The response exceeded every internal projection. We hit our Q3 goals by end of Q2.</p>
        <div class="panel-stat">
          <div class="stat-item">
            <span class="stat-value">2.4k</span>
            <span class="stat-label">Day-One Users</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">94%</span>
            <span class="stat-label">Retention at 30d</span>
          </div>
        </div>
      </div>

      <!-- Panel 4 — September -->
      <div class="panel panel-4">
        <div class="panel-index">[04 — September]</div>
        <div class="panel-art" data-label="Team Expansion"></div>
        <div class="panel-label">September — 2025</div>
        <div class="divider"></div>
        <h2 class="panel-heading">Growing<br>the <em>team</em></h2>
        <p class="panel-body">We doubled in size without doubling complexity. Deliberate hiring, strong onboarding, and ruthless process documentation made the difference.</p>
        <div class="panel-stat">
          <div class="stat-item">
            <span class="stat-value">+8</span>
            <span class="stat-label">New Team Members</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">3</span>
            <span class="stat-label">New Practice Areas</span>
          </div>
        </div>
      </div>

      <!-- Panel 5 — December -->
      <div class="panel panel-5">
        <div class="panel-index">[05 — December]</div>
        <div class="panel-art" data-label="Year Close"></div>
        <div class="panel-label">December — 2025</div>
        <div class="divider"></div>
        <h2 class="panel-heading">End of year.<br><span class="accent">Start</span> of something.</h2>
        <p class="panel-body">We close the year having shipped more than we planned, learned more than we expected, and built a team capable of far more than we imagined.</p>
        <div class="panel-stat">
          <div class="stat-item">
            <span class="stat-value">47</span>
            <span class="stat-label">Projects Shipped</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">100%</span>
            <span class="stat-label">Team Retained</span>
          </div>
        </div>
      </div>

    </div><!-- /.horizontal-wrap -->
  </div><!-- /.scroll-pin -->
</div><!-- /.scroll-outer -->

<!-- Outro -->
<section class="outro">
  <h2>Looking ahead to <span style="color:var(--accent)">2026</span></h2>
  <p>The foundation is set. The team is ready. The work begins again — and this time we know exactly what we're building toward.</p>
</section>

<!-- GSAP -->
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.0/dist/gsap.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.0/dist/ScrollTrigger.min.js"></script>

<script>
gsap.registerPlugin(ScrollTrigger);

const wrap   = document.getElementById('horizontal-wrap');
const outer  = document.getElementById('scroll-outer');
const bar    = document.getElementById('progress-bar');
bar.classList.add('active');

// Set the outer height to create enough scroll distance
function setup() {
  const scrollWidth = wrap.scrollWidth;
  const distance    = scrollWidth - innerWidth;

  // Give the outer element enough height to scroll
  outer.style.height = (innerHeight + distance) + 'px';

  // Kill any existing ScrollTrigger instances
  ScrollTrigger.getAll().forEach(st => st.kill());

  // Horizontal pin + scrub
  gsap.to(wrap, {
    x: -distance,
    ease: 'none',
    scrollTrigger: {
      trigger: outer,
      start: 'top top',
      end: () => '+=' + distance,
      scrub: 1,
      pin: '#scroll-pin',
      anticipatePin: 1,
      onUpdate: (self) => {
        bar.style.setProperty('--progress', self.progress);
      },
    },
  });
}

setup();
window.addEventListener('resize', () => {
  ScrollTrigger.refresh();
  setup();
});
</script>
</body>
</html>
```

#### Customization Points
- `scrub: 1` — lower to 0.3 for snappier response; raise to 2 for heavier, weighted feel
- Panel count — add or remove `.panel` divs; the `scrollWidth` calculation adapts automatically
- `panel-art` placeholder divs — replace with `<img>` or `<video>` elements; maintain `aspect-ratio: 4/3`
- `border-right: 1px solid var(--border)` on panels — change to vertical gradient fade for softer separators
- Progress bar height `2px` — increase to `3px` for more prominent tracking; add `border-radius: 999px` for capsule style
- `--accent: #e5a630` — change to brand color; all stats, labels, and accent spans inherit automatically
- `outer.style.height = (innerHeight + distance)` — this is the scroll budget; the distance equals total panel overhang

#### Combines With
- Recipe 12 (Scroll Text Reveal) — split `.panel-heading` chars and animate them in as each panel enters view via nested ScrollTrigger
- Recipe 11 (Parallax System) — `.panel-art` images drift at `0.5x` speed relative to the panel for depth
- Recipe 10 (GPU Tier Detection) — on low tier, remove `will-change: transform` and reduce scrub smoothness

---

### Recipe 1: Multi-Scene Render Target Transitions
**When:** Cinematic page transitions between distinct 3D scenes
**Complexity:** Heavy
**Dependencies:** Three.js r162+ (CDN import map)
**Source:** Unseen main site — the architectural centerpiece

#### Working Code

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Multi-Scene Render Target Transitions</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0a0a; overflow: hidden; font-family: 'Inter', sans-serif; }
  canvas { display: block; }
  #nav {
    position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%);
    display: flex; gap: 1rem; z-index: 10;
  }
  button {
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.15);
    color: rgba(255,255,255,0.6); padding: 0.6rem 1.4rem; border-radius: 2rem;
    font-size: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase;
    cursor: pointer; transition: all 0.2s;
  }
  button:hover { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.9); }
  button.active {
    background: rgba(229,166,48,0.2); border-color: #e5a630;
    color: #e5a630;
  }
</style>
</head>
<body>
<div id="nav">
  <button id="btn0" class="active">Scene A</button>
  <button id="btn1">Scene B</button>
  <button id="btn2">Scene C</button>
</div>

<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.162.0/build/three.module.js"
  }
}
</script>

<script type="module">
import * as THREE from 'three';

const W = window.innerWidth, H = window.innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(W, H);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.body.appendChild(renderer.domElement);

// --- Build three independent scenes ---
function makeScene(color, geo, fogColor) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(fogColor, 0.08);
  scene.background = new THREE.Color(fogColor);

  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color, roughness: 0.3, metalness: 0.7,
    emissive: color, emissiveIntensity: 0.15
  }));
  scene.add(mesh);

  const ambient = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambient);
  const dir = new THREE.DirectionalLight(0xffffff, 2.0);
  dir.position.set(3, 5, 3);
  scene.add(dir);

  const cam = new THREE.PerspectiveCamera(60, W / H, 0.1, 100);
  cam.position.set(0, 0, 4);

  return { scene, mesh, cam };
}

const sceneA = makeScene(0xe5a630, new THREE.IcosahedronGeometry(1.2, 2), 0x0a0805);
const sceneB = makeScene(0x6366f1, new THREE.TorusKnotGeometry(0.9, 0.3, 128, 32), 0x05050a);
const sceneC = makeScene(0x06b6d4, new THREE.OctahedronGeometry(1.3, 2), 0x03080a);
const scenes = [sceneA, sceneB, sceneC];

// --- Render targets ---
const rtOpts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat };
const rtA = new THREE.WebGLRenderTarget(W, H, rtOpts);
const rtB = new THREE.WebGLRenderTarget(W, H, rtOpts);

// --- Blend quad ---
const blendGeo = new THREE.PlaneGeometry(2, 2);
const blendMat = new THREE.ShaderMaterial({
  uniforms: {
    uTexA: { value: null },
    uTexB: { value: null },
    uProgress: { value: 0 },
    uMode: { value: 0 },
    uTime: { value: 0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D uTexA;
    uniform sampler2D uTexB;
    uniform float uProgress;
    uniform int uMode;
    uniform float uTime;
    varying vec2 vUv;

    // Inline simplex-style noise
    vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
    float snoise(vec2 v) {
      const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                          -0.577350269189626, 0.024390243902439);
      vec2 i  = floor(v + dot(v, C.yy));
      vec2 x0 = v -   i + dot(i, C.xx);
      vec2 i1 = (x0.x > x0.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;
      i = mod(i, 289.0);
      vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
               + i.x + vec3(0.0, i1.x, 1.0));
      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
                               dot(x12.zw,x12.zw)), 0.0);
      m = m*m; m = m*m;
      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314*(a0*a0+h*h);
      vec3 g;
      g.x  = a0.x  * x0.x   + h.x  * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }

    void main() {
      vec2 uv = vUv;
      vec4 colA = texture2D(uTexA, uv);
      vec4 colB = texture2D(uTexB, uv);
      float p = uProgress;

      if (uMode == 0) {
        // Dissolve: noise-based threshold
        float n = snoise(uv * 4.0 + uTime * 0.3) * 0.5 + 0.5;
        float edge = 0.08;
        float mask = smoothstep(p - edge, p + edge, n);
        gl_FragColor = mix(colA, colB, mask);

      } else if (uMode == 1) {
        // Fluid: UV distortion at mid-point
        float warp = sin(p * 3.14159);
        float n = snoise(uv * 3.0 + uTime * 0.5) * warp * 0.12;
        vec2 distortedUv = uv + vec2(n, n * 0.7);
        distortedUv = clamp(distortedUv, 0.0, 1.0);
        vec4 warpA = texture2D(uTexA, distortedUv);
        vec4 warpB = texture2D(uTexB, distortedUv);
        gl_FragColor = mix(warpA, warpB, smoothstep(0.0, 1.0, p));

      } else {
        // Distort: wave-based wipe with sine offset
        float wave = sin(uv.y * 12.0 + uTime * 2.0) * 0.04;
        float threshold = p + wave;
        float mask = smoothstep(threshold - 0.03, threshold + 0.03, uv.x);
        gl_FragColor = mix(colA, colB, mask);
      }
    }
  `,
  depthTest: false,
  depthWrite: false
});
const blendQuad = new THREE.Mesh(blendGeo, blendMat);
const blendScene = new THREE.Scene();
blendScene.add(blendQuad);
const blendCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// --- State ---
let current = 0, target = 0, transitioning = false, progress = 0, transitionMode = 0;

function goTo(idx) {
  if (idx === current || transitioning) return;
  target = idx;
  transitioning = true;
  progress = 0;
  // Cycle through modes: 0=dissolve, 1=fluid, 2=distort
  transitionMode = (transitionMode + 1) % 3;
  blendMat.uniforms.uMode.value = transitionMode;
  document.querySelectorAll('button').forEach((b, i) => b.classList.toggle('active', i === idx));
}

document.getElementById('btn0').onclick = () => goTo(0);
document.getElementById('btn1').onclick = () => goTo(1);
document.getElementById('btn2').onclick = () => goTo(2);

let t = 0;
function animate() {
  requestAnimationFrame(animate);
  t += 0.016;
  blendMat.uniforms.uTime.value = t;

  const cur = scenes[current];
  const tgt = scenes[target];

  cur.mesh.rotation.y = t * 0.4;
  cur.mesh.rotation.x = t * 0.15;
  tgt.mesh.rotation.y = t * 0.4;
  tgt.mesh.rotation.x = t * 0.15;

  // Render current scene into rtA
  renderer.setRenderTarget(rtA);
  renderer.render(cur.scene, cur.cam);

  if (transitioning) {
    // Render target scene into rtB
    renderer.setRenderTarget(rtB);
    renderer.render(tgt.scene, tgt.cam);

    progress += 0.015;
    if (progress >= 1) {
      progress = 1;
      transitioning = false;
      current = target;
    }
    blendMat.uniforms.uTexA.value = rtA.texture;
    blendMat.uniforms.uTexB.value = rtB.texture;
    blendMat.uniforms.uProgress.value = progress;

    renderer.setRenderTarget(null);
    renderer.render(blendScene, blendCam);
  } else {
    blendMat.uniforms.uTexA.value = rtA.texture;
    blendMat.uniforms.uTexB.value = rtA.texture;
    blendMat.uniforms.uProgress.value = 0;

    renderer.setRenderTarget(null);
    renderer.render(blendScene, blendCam);
  }
}
animate();

window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  rtA.setSize(w, h);
  rtB.setSize(w, h);
  scenes.forEach(({ cam }) => { cam.aspect = w / h; cam.updateProjectionMatrix(); });
});
</script>
</body>
</html>
```

#### Customization Points
- `progress += 0.015` — increase to 0.03 for a snappier cut; decrease to 0.008 for a slow dissolve
- `uMode` cycles 0→1→2 on each transition — pin it to one value for a consistent house style
- Noise scale `uv * 4.0` in dissolve mode — lower to 2.0 for large blobs; raise to 8.0 for fine grain
- Wave frequency `12.0` in distort mode — raise to 20.0 for tighter waves; lower to 4.0 for a broad wipe
- Geometry per scene — swap `IcosahedronGeometry` / `TorusKnotGeometry` / `OctahedronGeometry` for any Three.js primitives
- `FogExp2` density `0.08` — raise to 0.15 to push objects deeper into fog

#### Combines With
- Recipe 4 (SDF Text) — render troika-three-text into each scene before capturing to render target
- Recipe 3 (Post-Processing Chain) — run EffectComposer per scene before writing to rtA / rtB
- Recipe 8 (Camera Spline Navigation) — trigger a scene switch at scroll section boundaries

---

### Recipe 2: Scroll Z-Depth Gallery
**When:** Project gallery, portfolio showcase — content revealed through depth
**Complexity:** Heavy
**Dependencies:** Three.js r162+ (CDN import map)
**Source:** Unseen main site projects page

#### Working Code

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Scroll Z-Depth Gallery</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0a0a; height: 600vh; }
  #canvas-wrap {
    position: fixed; top: 0; left: 0; width: 100%; height: 100vh;
    pointer-events: none;
  }
  #hint {
    position: fixed; bottom: 2.5rem; left: 50%; transform: translateX(-50%);
    color: rgba(255,255,255,0.3); font-family: 'Inter', sans-serif;
    font-size: 0.7rem; letter-spacing: 0.2em; text-transform: uppercase;
    pointer-events: none;
    animation: fadeHint 2s ease-in-out infinite alternate;
  }
  @keyframes fadeHint { from { opacity: 0.3; } to { opacity: 0.7; } }
</style>
</head>
<body>
<div id="canvas-wrap"></div>
<div id="hint">Scroll to Explore</div>

<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.162.0/build/three.module.js"
  }
}
</script>

<script type="module">
import * as THREE from 'three';

const W = window.innerWidth, H = window.innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(W, H);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.getElementById('canvas-wrap').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0a0a0a, 2, 18);
scene.background = new THREE.Color(0x0a0a0a);

const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 60);
camera.position.set(0, 0, 2);

// Spot light follows camera
const spot = new THREE.SpotLight(0xffffff, 80, 30, Math.PI / 5, 0.4);
scene.add(spot);
scene.add(spot.target);

const ambient = new THREE.AmbientLight(0xffffff, 0.15);
scene.add(ambient);

// Project card data
const CARDS = [
  { title: 'Project 01', color: 0xe5a630 },
  { title: 'Project 02', color: 0x6366f1 },
  { title: 'Project 03', color: 0x06b6d4 },
  { title: 'Project 04', color: 0xec4899 },
  { title: 'Project 05', color: 0x10b981 },
  { title: 'Project 06', color: 0xf97316 },
  { title: 'Project 07', color: 0x8b5cf6 },
  { title: 'Project 08', color: 0x14b8a6 },
];
const spacing = 4;
const cardMeshes = [];

CARDS.forEach((card, i) => {
  const geo = new THREE.PlaneGeometry(3, 2);
  const mat = new THREE.MeshStandardMaterial({
    color: card.color,
    roughness: 0.4,
    metalness: 0.5,
    emissive: card.color,
    emissiveIntensity: 0.04,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geo, mat);

  // Alternating offset L/R
  const xOffset = (i % 2 === 0 ? 0.8 : -0.8);
  mesh.position.set(xOffset, 0, -(i * spacing));
  mesh.rotation.y = (i % 2 === 0 ? -0.12 : 0.12);

  // Edge border lines
  const edgeGeo = new THREE.EdgesGeometry(geo);
  const edgeMat = new THREE.LineBasicMaterial({
    color: card.color, opacity: 0.6, transparent: true
  });
  const edges = new THREE.LineSegments(edgeGeo, edgeMat);
  mesh.add(edges);

  scene.add(mesh);
  cardMeshes.push(mesh);
});

// Scroll state
let scrollY = 0, smoothScroll = 0;
window.addEventListener('scroll', () => { scrollY = window.scrollY; });

const totalScrollable = document.body.scrollHeight - window.innerHeight;
const totalDepth = (CARDS.length - 1) * spacing;

let t = 0;
function animate() {
  requestAnimationFrame(animate);
  t += 0.016;

  // Smooth scroll interpolation
  smoothScroll += (scrollY - smoothScroll) * 0.08;

  const progress = smoothScroll / totalScrollable;
  const targetZ = 2 + progress * (totalDepth + spacing * 0.5);

  camera.position.z += (targetZ - camera.position.z) * 0.1;
  // Subtle sway on x
  camera.position.x += (Math.sin(t * 0.3) * 0.1 - camera.position.x) * 0.05;
  camera.position.y = 0;

  // Spot follows camera
  spot.position.copy(camera.position);
  spot.position.y += 3;
  spot.target.position.copy(camera.position);
  spot.target.position.z -= 2;
  spot.target.updateMatrixWorld();

  // Fade hint once user starts scrolling
  const hint = document.getElementById('hint');
  if (scrollY > 50) hint.style.opacity = '0';
  else hint.style.opacity = '';

  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
});
</script>
</body>
</html>
```

#### Customization Points
- `spacing = 4` — increase to 6 for more breathing room between cards; decrease to 2 for a denser tunnel
- `PlaneGeometry(3, 2)` — change aspect ratio for landscape 16:9 (`3.2, 1.8`) or portrait (`2, 3`) card shapes
- `xOffset = 0.8` — increase to 1.5 for a more pronounced zigzag; set to 0 for a straight tunnel
- `scene.fog = new THREE.Fog(0x0a0a0a, 2, 18)` — near/far values control how quickly cards emerge from darkness
- `lerp factor 0.08` on scroll — lower to 0.04 for heavier, more cinematic drag
- `emissiveIntensity: 0.04` — raise to 0.2 to make cards glow in the fog
- Replace `MeshStandardMaterial` with `MeshBasicMaterial` + a canvas texture for actual project thumbnails

#### Combines With
- Recipe 8 (Camera Spline Navigation) — replace linear Z movement with a curved spline path for organic camera movement
- Recipe 3 (Post-Processing Chain) — add bloom so edges glow as they emerge from fog
- Recipe 1 (Render Target Transitions) — transition to a detail scene when a card is clicked

---

### Recipe 3: Post-Processing Chain
**When:** Adding cinematic polish — bloom, chromatic aberration, vignette, film grain
**Complexity:** Moderate-Heavy
**Dependencies:** Three.js r162+ with postprocessing addons (CDN import map)
**Source:** Both Unseen sites

#### Working Code

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Post-Processing Chain</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #06060a; overflow: hidden; font-family: 'Inter', sans-serif; }
  #controls {
    position: fixed; top: 1.5rem; right: 1.5rem; z-index: 10;
    display: flex; flex-direction: column; gap: 0.6rem;
  }
  label {
    display: flex; align-items: center; gap: 0.6rem;
    color: rgba(255,255,255,0.5); font-size: 0.72rem;
    letter-spacing: 0.08em; text-transform: uppercase;
    cursor: pointer; user-select: none;
  }
  input[type=checkbox] {
    accent-color: #e5a630; width: 14px; height: 14px; cursor: pointer;
  }
  label:hover { color: rgba(255,255,255,0.85); }
</style>
</head>
<body>
<div id="controls">
  <label><input type="checkbox" id="toggleBloom" checked> Bloom</label>
  <label><input type="checkbox" id="toggleChroma" checked> Chromatic Aberration</label>
  <label><input type="checkbox" id="toggleVignette" checked> Vignette + Grain</label>
</div>

<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.162.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.162.0/examples/jsm/"
  }
}
</script>

<script type="module">
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const W = window.innerWidth, H = window.innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(W, H);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x06060a);

const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 100);
camera.position.set(0, 0, 5);

// TorusKnot with emissive material (drives selective bloom)
const knot = new THREE.Mesh(
  new THREE.TorusKnotGeometry(1.1, 0.35, 200, 32),
  new THREE.MeshStandardMaterial({
    color: 0x6366f1,
    roughness: 0.2,
    metalness: 0.8,
    emissive: 0x6366f1,
    emissiveIntensity: 0.6
  })
);
scene.add(knot);

// Point light with accent color
const point = new THREE.PointLight(0xe5a630, 40, 20);
point.position.set(3, 2, 3);
scene.add(point);

const ambient = new THREE.AmbientLight(0xffffff, 0.1);
scene.add(ambient);

// 500 floating particles
const particleGeo = new THREE.BufferGeometry();
const particlePos = new Float32Array(500 * 3);
for (let i = 0; i < 500; i++) {
  particlePos[i * 3]     = (Math.random() - 0.5) * 20;
  particlePos[i * 3 + 1] = (Math.random() - 0.5) * 20;
  particlePos[i * 3 + 2] = (Math.random() - 0.5) * 20;
}
particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
const particles = new THREE.Points(particleGeo, new THREE.PointsMaterial({
  color: 0x8b8bff, size: 0.04, transparent: true, opacity: 0.6,
  sizeAttenuation: true
}));
scene.add(particles);

// --- Effect Composer ---
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// Bloom pass
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(W, H),
  0.4,   // strength
  0.4,   // radius
  0.85   // threshold
);
composer.addPass(bloomPass);

// Chromatic aberration pass
const chromaPass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uOffset:  { value: 0.003 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uOffset;
    varying vec2 vUv;
    void main() {
      vec2 dir = vUv - 0.5;
      float dist = length(dir) * 0.5;
      vec2 offset = normalize(dir) * uOffset * dist;
      float r = texture2D(tDiffuse, vUv + offset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - offset).b;
      gl_FragColor = vec4(r, g, b, 1.0);
    }
  `
});
composer.addPass(chromaPass);

// Vignette + film grain pass
const vignettePass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uTime:    { value: 0 },
    uStrength:{ value: 0.45 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uStrength;
    varying vec2 vUv;

    float random(vec2 co) {
      return fract(sin(dot(co * uTime, vec2(12.9898,78.233))) * 43758.5453);
    }

    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      // Vignette
      vec2 uv2 = vUv * (1.0 - vUv);
      float vig = uv2.x * uv2.y * 15.0;
      vig = pow(vig, uStrength);
      // Film grain
      float grain = random(vUv) * 0.06 - 0.03;
      col.rgb = col.rgb * vig + grain;
      gl_FragColor = col;
    }
  `
});
vignettePass.renderToScreen = true;
composer.addPass(vignettePass);

// Toggle controls
document.getElementById('toggleBloom').addEventListener('change', e => {
  bloomPass.enabled = e.target.checked;
});
document.getElementById('toggleChroma').addEventListener('change', e => {
  chromaPass.enabled = e.target.checked;
});
document.getElementById('toggleVignette').addEventListener('change', e => {
  vignettePass.enabled = e.target.checked;
});

let t = 0;
function animate() {
  requestAnimationFrame(animate);
  t += 0.01;
  knot.rotation.y = t * 0.5;
  knot.rotation.x = t * 0.2;
  particles.rotation.y = t * 0.03;
  point.position.x = Math.sin(t * 0.7) * 4;
  point.position.y = Math.cos(t * 0.4) * 3;
  vignettePass.uniforms.uTime.value = t;
  composer.render();
}
animate();

window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  composer.setSize(w, h);
  bloomPass.resolution.set(w, h);
});
</script>
</body>
</html>
```

#### Customization Points
- `bloomPass` strength `0.4` — raise to 0.8 for aggressive glow; lower to 0.15 for a subtle halo; strength 0 for off
- `bloomPass` threshold `0.85` — lower to 0.5 to bloom more of the scene; raise toward 1.0 for selective emissive-only bloom
- `chromaPass` uOffset `0.003` — raise to 0.008 for heavy fringing; animate it spiking on scene transitions
- Grain amplitude `0.06` — raise to 0.12 for heavy 35mm texture; lower to 0.02 for imperceptible texture
- Vignette `uStrength: 0.45` — lower to 0.25 for gentle darkening; raise to 0.7 for dramatic tunneling
- `emissiveIntensity: 0.6` on the knot — this is what crosses the bloom threshold; lower it to pull objects out of bloom

#### Combines With
- Recipe 1 (Render Target Transitions) — apply this composer to the final blend quad output
- Recipe 2 (Scroll Z-Depth Gallery) — wrap the gallery renderer with this composer chain
- Recipe 8 (Camera Spline Navigation) — bloom pulses can sync to section arrival via `bloomPass.strength` tweening

---

### Recipe 4: SDF Text in WebGL
**When:** Text that participates in the 3D scene — affected by fog, lighting, post-processing
**Complexity:** Moderate
**Dependencies:** Three.js r162+, troika-three-text (CDN)
**Source:** Unseen main site

#### Working Code

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SDF Text in WebGL</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #06060a; overflow: hidden; }
</style>
</head>
<body>
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.162.0/build/three.module.js",
    "troika-three-text": "https://cdn.jsdelivr.net/npm/troika-three-text@0.49.1/dist/troika-three-text.esm.js"
  }
}
</script>

<script type="module">
import * as THREE from 'three';
import { Text } from 'troika-three-text';

const W = window.innerWidth, H = window.innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(W, H);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x06060a, 0.06);
scene.background = new THREE.Color(0x06060a);

const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 100);
camera.position.set(0, 0, 6);

// Spot light
const spot = new THREE.SpotLight(0xe5a630, 60, 30, Math.PI / 4, 0.5);
spot.position.set(0, 4, 6);
scene.add(spot);
scene.add(spot.target);

const ambient = new THREE.AmbientLight(0xffffff, 0.2);
scene.add(ambient);

// 300 floating particles behind text
const partGeo = new THREE.BufferGeometry();
const partPos = new Float32Array(300 * 3);
for (let i = 0; i < 300; i++) {
  partPos[i * 3]     = (Math.random() - 0.5) * 16;
  partPos[i * 3 + 1] = (Math.random() - 0.5) * 10;
  partPos[i * 3 + 2] = -2 - Math.random() * 10;
}
partGeo.setAttribute('position', new THREE.BufferAttribute(partPos, 3));
const particles = new THREE.Points(partGeo, new THREE.PointsMaterial({
  color: 0x4a4a8a, size: 0.05, transparent: true, opacity: 0.5,
  sizeAttenuation: true
}));
scene.add(particles);

// Text group for float animation
const textGroup = new THREE.Group();
scene.add(textGroup);

// Main title: "UNSEEN"
const titleText = new Text();
titleText.text = 'UNSEEN';
titleText.font = 'https://fonts.gstatic.com/s/dmserifdisplay/v15/-nFnOHM81r4j6k0gjALR8uVua8M_8rj5.woff2';
titleText.fontSize = 2;
titleText.letterSpacing = 0.15;
titleText.color = 0xfaf9f7;
titleText.anchorX = 'center';
titleText.anchorY = 'middle';
titleText.position.set(0, 0.3, 0);
titleText.sync();
textGroup.add(titleText);

// Subtitle
const subtitleText = new Text();
subtitleText.text = 'Studio — Design & Technology';
subtitleText.font = 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2';
subtitleText.fontSize = 0.4;
subtitleText.letterSpacing = 0.04;
subtitleText.color = 0x6b7280;
subtitleText.anchorX = 'center';
subtitleText.anchorY = 'middle';
subtitleText.position.set(0, -0.8, 0);
subtitleText.sync();
textGroup.add(subtitleText);

// Monospaced label
const labelText = new Text();
labelText.text = '[ STUDIO — 2026 ]';
labelText.font = 'https://fonts.gstatic.com/s/dmmono/v14/aFTU7PB1QTsUX8KYvrGyIYetlL21.woff2';
labelText.fontSize = 0.22;
labelText.letterSpacing = 0.18;
labelText.color = 0xe5a630;
labelText.anchorX = 'center';
labelText.anchorY = 'middle';
labelText.position.set(0, -1.35, 0);
labelText.sync();
textGroup.add(labelText);

// Mouse tracking
let mouseX = 0, mouseY = 0;
let targetRotX = 0, targetRotY = 0;
window.addEventListener('mousemove', e => {
  mouseX = (e.clientX / W - 0.5) * 2;
  mouseY = (e.clientY / H - 0.5) * 2;
});

let t = 0;
function animate() {
  requestAnimationFrame(animate);
  t += 0.016;

  // Subtle float on text group
  textGroup.position.y = Math.sin(t * 0.5) * 0.1;

  // Camera follows mouse smoothly
  targetRotY += (mouseX * 0.4 - targetRotY) * 0.05;
  targetRotX += (-mouseY * 0.25 - targetRotX) * 0.05;
  camera.rotation.y = targetRotY;
  camera.rotation.x = targetRotX;

  particles.rotation.y = t * 0.02;
  particles.rotation.x = t * 0.008;

  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
});
</script>
</body>
</html>
```

#### Customization Points
- `fontSize = 2` on title — scale by viewport width for responsive sizing: `fontSize = Math.max(0.8, W / 400)`
- `letterSpacing = 0.15` — reduce to 0.05 for tighter tracking; raise to 0.3 for very open, editorial spacing
- `color = 0xfaf9f7` — use a warm off-white to avoid the harshness of pure white against dark backgrounds
- Font URL — any `.woff2` URL works; self-host for production to avoid CORS and latency
- Mouse influence `0.4` / `0.25` — reduce both to 0.15 for a subtler parallax; raise for aggressive head-tracking feel
- `FogExp2` density `0.06` — raise to 0.1 to push subtitle into fog while keeping title sharp
- `troika` `anchorX: 'center'` / `anchorY: 'middle'` — essential for centering; never position from top-left origin

#### Combines With
- Recipe 3 (Post-Processing Chain) — bloom the title by setting `emissive` on a TextMaterial and raising emissiveIntensity
- Recipe 1 (Render Target Transitions) — render this scene to a render target and blend with a product scene
- Recipe 8 (Camera Spline Navigation) — mount text as floating labels at spline waypoints in a larger scene

---

### Recipe 8: Camera Spline Navigation
**When:** Cinematic dolly movement through a 3D scene, driven by scroll
**Complexity:** Heavy
**Dependencies:** Three.js r162+ (CDN import map)
**Source:** Unseen main site — camera paths exported from Blender

#### Working Code

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Camera Spline Navigation</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #07070d; height: 500vh; font-family: 'Inter', sans-serif; }
  #canvas-wrap { position: fixed; top: 0; left: 0; width: 100%; height: 100vh; }
  #section-markers {
    position: fixed; right: 1.8rem; top: 50%; transform: translateY(-50%);
    display: flex; flex-direction: column; gap: 0.8rem; z-index: 10;
  }
  .dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: rgba(255,255,255,0.2);
    transition: background 0.3s, transform 0.3s;
    cursor: pointer;
  }
  .dot.active { background: #e5a630; transform: scale(1.6); }
  #section-label {
    position: fixed; bottom: 3rem; left: 3rem; z-index: 10;
    pointer-events: none;
  }
  #section-title {
    color: rgba(255,255,255,0.9); font-size: 1.1rem;
    letter-spacing: 0.06em; text-transform: uppercase;
    transition: opacity 0.4s;
  }
  #section-sub {
    color: rgba(255,255,255,0.35); font-size: 0.72rem;
    letter-spacing: 0.14em; text-transform: uppercase;
    margin-top: 0.3rem;
    transition: opacity 0.4s;
  }
</style>
</head>
<body>
<div id="canvas-wrap"></div>
<div id="section-markers">
  <div class="dot active" data-idx="0"></div>
  <div class="dot" data-idx="1"></div>
  <div class="dot" data-idx="2"></div>
  <div class="dot" data-idx="3"></div>
  <div class="dot" data-idx="4"></div>
</div>
<div id="section-label">
  <div id="section-title">Origin</div>
  <div id="section-sub">Begin the journey</div>
</div>

<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.162.0/build/three.module.js"
  }
}
</script>

<script type="module">
import * as THREE from 'three';

const W = window.innerWidth, H = window.innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(W, H);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.getElementById('canvas-wrap').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x07070d, 0.045);
scene.background = new THREE.Color(0x07070d);

const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 100);

// --- Camera spline (5 control points sweeping through 3D space) ---
const camSpline = new THREE.CatmullRomCurve3([
  new THREE.Vector3( 0,  0,  10),
  new THREE.Vector3( 4,  1.5, 5),
  new THREE.Vector3(-3, -1,   0),
  new THREE.Vector3( 2,  2,  -5),
  new THREE.Vector3( 0,  0, -10),
], false, 'catmullrom', 0.5);

// --- LookAt target spline (independent path) ---
const lookSpline = new THREE.CatmullRomCurve3([
  new THREE.Vector3( 0,  0,   5),
  new THREE.Vector3(-2,  0.5, 2),
  new THREE.Vector3( 1, -0.5, -2),
  new THREE.Vector3(-1,  1,  -7),
  new THREE.Vector3( 0,  0, -15),
], false, 'catmullrom', 0.5);

// --- Section data ---
const SECTIONS = [
  { title: 'Origin',     sub: 'Begin the journey',        color: 0xe5a630, geo: new THREE.IcosahedronGeometry(1.0, 2),        pos: new THREE.Vector3( 2.5,  0.5,  7) },
  { title: 'Structure',  sub: 'Form follows function',     color: 0x6366f1, geo: new THREE.TorusGeometry(0.9, 0.3, 32, 64),    pos: new THREE.Vector3(-2.5, -0.5,  3) },
  { title: 'Tension',    sub: 'Between order and chaos',   color: 0x06b6d4, geo: new THREE.OctahedronGeometry(1.1, 2),         pos: new THREE.Vector3( 1.5,  1.0, -1) },
  { title: 'Complexity', sub: 'Layered systems emerge',    color: 0xec4899, geo: new THREE.TorusKnotGeometry(0.8, 0.25, 128, 32), pos: new THREE.Vector3(-2.0, -1.0, -6) },
  { title: 'Resolve',    sub: 'Clarity from complexity',   color: 0x10b981, geo: new THREE.SphereGeometry(1.0, 64, 32),        pos: new THREE.Vector3( 0.5,  0.5, -9.5) },
];

const sectionMeshes = SECTIONS.map(s => {
  const mat = new THREE.MeshStandardMaterial({
    color: s.color,
    roughness: 0.25,
    metalness: 0.7,
    wireframe: true
  });
  const mesh = new THREE.Mesh(s.geo, mat);
  mesh.position.copy(s.pos);
  scene.add(mesh);

  // Point light near each object
  const light = new THREE.PointLight(s.color, 25, 12);
  light.position.copy(s.pos);
  scene.add(light);

  return mesh;
});

const ambient = new THREE.AmbientLight(0xffffff, 0.12);
scene.add(ambient);

// --- Scroll state ---
let scrollY = 0, smoothProgress = 0;
window.addEventListener('scroll', () => { scrollY = window.scrollY; });

const dots = document.querySelectorAll('.dot');
const titleEl = document.getElementById('section-title');
const subEl   = document.getElementById('section-sub');
let lastSection = -1;

// Dot click: scroll to section
dots.forEach(dot => {
  dot.addEventListener('click', () => {
    const idx = parseInt(dot.dataset.idx);
    const totalScrollable = document.body.scrollHeight - window.innerHeight;
    window.scrollTo({ top: (idx / (SECTIONS.length - 1)) * totalScrollable, behavior: 'smooth' });
  });
});

const camPos = new THREE.Vector3();
const lookPos = new THREE.Vector3();

let t = 0;
function animate() {
  requestAnimationFrame(animate);
  t += 0.016;

  const totalScrollable = document.body.scrollHeight - window.innerHeight;
  const rawProgress = totalScrollable > 0 ? scrollY / totalScrollable : 0;

  // Smooth progress
  smoothProgress += (rawProgress - smoothProgress) * 0.06;
  const p = Math.max(0, Math.min(1, smoothProgress));

  // Sample splines
  camSpline.getPointAt(p, camPos);
  lookSpline.getPointAt(p, lookPos);
  camera.position.copy(camPos);
  camera.lookAt(lookPos);

  // Rotate scene objects
  sectionMeshes.forEach((mesh, i) => {
    mesh.rotation.y = t * (0.2 + i * 0.05);
    mesh.rotation.x = t * 0.1;
  });

  // Update active section
  const sectionIdx = Math.min(SECTIONS.length - 1, Math.round(p * (SECTIONS.length - 1)));
  if (sectionIdx !== lastSection) {
    lastSection = sectionIdx;
    dots.forEach((d, i) => d.classList.toggle('active', i === sectionIdx));
    titleEl.style.opacity = '0';
    subEl.style.opacity = '0';
    setTimeout(() => {
      titleEl.textContent = SECTIONS[sectionIdx].title;
      subEl.textContent   = SECTIONS[sectionIdx].sub;
      titleEl.style.opacity = '1';
      subEl.style.opacity   = '1';
    }, 200);
  }

  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
});
</script>
</body>
</html>
```

#### Customization Points
- `CatmullRomCurve3` control points — export from Blender as JSON and paste directly; the spline auto-interpolates
- `curveType: 'catmullrom'` with `tension: 0.5` — lower tension to 0.0 for looser curves; raise to 1.0 for tighter
- `camSpline` and `lookSpline` are independent — offsetting the lookAt target creates natural camera drift and parallax
- `smoothProgress` lerp factor `0.06` — lower to 0.03 for heavier, more cinematic drag; raise to 0.15 for responsive tracking
- `wireframe: true` on section meshes — remove for solid objects; add `emissive` for bloom compatibility
- Section count — add control points to both splines and a new entry in `SECTIONS`; dot markers add automatically
- `FogExp2` density `0.045` — raise to 0.08 for tighter depth; objects near the far end of the spline will disappear into darkness

#### Combines With
- Recipe 3 (Post-Processing Chain) — wrap renderer in EffectComposer; bloom pulses on section arrival
- Recipe 4 (SDF Text) — place troika Text objects at each `SECTIONS[i].pos` as floating labels in the scene
- Recipe 2 (Scroll Z-Depth Gallery) — replace the linear Z tunnel with this spline approach for organic gallery paths
