# WebGL & 3D on the Web — Core

> When to use WebGL, what tools make it possible, and design patterns. **Load this before deciding whether to use WebGL at all.** For implementation code (12 numbered recipes), load `webgl-recipes.md`.

---

## Quick ref

- **Don't use WebGL by default.** Decision tree + cheat sheet below. CSS handles far more than people realise.
- Three tasteful levels: **Subtle** (any site), **Moderate** (product / data), **Heavy** (creative / portfolio only).
- Four tech tiers by bundle cost: CSS (0kb) → CSS+JS (23–50kb) → Canvas 2D (0–80kb) → WebGL (150–600kb+).
- Core stack: Three.js + R3F + Drei + GSAP/ScrollTrigger + Lenis + Leva.
- WebGPU is the future — full browser support Jan 2026. TSL lets you write shaders as JS, LLM-friendlier than GLSL.
- **Always** respect `prefers-reduced-motion`, provide a static fallback, lazy-load WebGL.
- This file contains the DECISION LAYER. For implementation, see `webgl-recipes.md` (12 numbered recipes referenced by HARNESS).

---

# WebGL & 3D on the Web

> When to use WebGL, what tools make it possible (especially with AI), design patterns from award-winning sites, and practical R3F code patterns.
> Compiled March 2026 from Awwwards winners, Codrops tutorials, studio case studies, and direct site analysis.

---

## When to Use WebGL

### The Rendering Pipeline (Why This Matters)

Every visual change triggers: **Style → Layout → Paint → Composite**. Triggering an earlier step forces all subsequent steps.

| Tier | Properties | Thread | Cost |
|------|-----------|--------|------|
| **S (Compositor)** | `transform`, `opacity`, `filter`, `clip-path` | GPU compositor | Immune to main thread jank |
| **A (Main + Compositor)** | Same props via JS (GSAP, rAF) | Main thread | Still compositor-only rendering but interruptible |
| **B (FLIP)** | Layout props converted to transforms | One measurement + compositor | Approaches S-tier after initial frame |
| **C (Paint)** | `background-color`, `color`, `border-radius`, gradients | Main thread | Scales with layer size |
| **D (Layout)** | `width`, `height`, `padding`, `margin`, `font-size` | Main thread | Forces reflow of downstream elements |
| **WebGL** | GPU parallel, main-thread-scheduled | GPU + main | A-tier equivalent; massive parallelism |

Source: [Motion Magazine Performance Tier List](https://motion.dev/magazine/web-animation-performance-tier-list)

### The Decision Tree

```
START: What effect do you need?

Is it a UI state change (hover, focus, toggle, enter/exit)?
  YES → CSS transitions/animations. Done.
  NO  → Continue.

Is it a scroll-linked effect (parallax, reveal, progress)?
  YES → Simple progress/reveal?
    YES → CSS scroll-driven animations (animation-timeline: scroll()). Done.
    NO  → Needs pinning, scrubbing, complex choreography?
      YES → GSAP ScrollTrigger. Done.

Is it a multi-element choreographed sequence?
  YES → GSAP timeline or Motion (React). Done.

Is it a designer-created illustration/icon animation?
  YES → Lottie (from AE) or CSS SVG animation (if simple). Done.

Does it involve 2D drawing or data visualization?
  YES → Under 10,000 data points?
    YES → Canvas 2D. Done.
    NO  → WebGL. Done.

Does it need 3D models, custom shaders, 1000+ particles,
fluid simulation, post-processing, or texture displacement?
  YES → WebGL (Three.js / R3F). Done.
  NO  → CSS/JS is enough. Do not add WebGL.
```

### "Can I Do This Without WebGL?" Cheat Sheet

| Effect | Without WebGL? | How |
|--------|:---:|-----|
| Hover/focus transitions | Yes | CSS transitions |
| Entrance/exit animations | Yes | CSS animations, Motion |
| Parallax scrolling | Yes | CSS `animation-timeline: scroll()` |
| Glassmorphism / frosted glass | Yes | CSS `backdrop-filter: blur()` |
| Card flip (front/back) | Yes | CSS 3D transforms |
| Text reveal per character | Yes | GSAP SplitText or Motion |
| SVG path drawing | Yes | CSS `stroke-dashoffset` |
| SVG shape morphing | Yes | GSAP MorphSVG |
| Image duotone/filters | Yes | CSS `filter` + `mix-blend-mode` |
| Scroll pin + scrub | Yes | GSAP ScrollTrigger |
| Confetti / simple particles | Yes | CSS (<50) or Canvas 2D (<500) |
| Animated gradient background | Yes | CSS gradients + `background-position` |
| Spring/physics easing | Yes | Motion or GSAP |
| Liquid glass distortion | Yes | CSS + SVG filters (feTurbulence) |
| **3D product model viewer** | **No** | Three.js / R3F / model-viewer |
| **1000+ particles** | **No** | WebGL vertex shaders |
| **Bloom / chromatic aberration** | **No** | WebGL post-processing |
| **Fluid simulation** | **No** | WebGL fragment shaders |
| **Image displacement/warp** | **No** | WebGL displacement maps |
| **3D text with lighting** | **No** | WebGL extruded geometry |
| **Globe visualization** | **No** | Three.js globe |
| **Morphing 3D shapes** | **No** | WebGL vertex interpolation |
| **Real-time noise/metaballs** | **No** | GLSL fragment shaders |
| **100k+ data point charts** | **No** | WebGL rendering |

### The Four Technology Tiers

| Tier | Bundle Cost | Use When |
|------|-----------|----------|
| **CSS Only** | 0KB | UI micro-interactions, state changes, simple parallax, glassmorphism |
| **CSS + JS** (GSAP, Motion, Lottie) | 23-50KB | Complex choreography, scroll narratives, SVG morphing |
| **Canvas 2D** | 0-80KB | 2D games, drawing tools, charts <10k points, simple generative art |
| **WebGL** (Three.js, R3F) | 150-600KB+ | 3D visualization, shader effects, massive particle systems, simulations |

### The One-Line Rules

1. **Start with CSS.** It is free, performant, and compositor-optimized.
2. **Add GSAP/Motion when CSS keyframes become unwieldy** (complex timing, scroll, state-driven).
3. **Use Canvas 2D for 2D pixel work** under 10k elements.
4. **Reach for WebGL only when you need 3D geometry, custom shaders, or massive parallelism.**
5. **Always lazy-load WebGL.** Never put Three.js in your critical path.
6. **Always handle `prefers-reduced-motion`.** WebGL does not get a pass.
7. **Always provide a static fallback.** The 3D scene is an enhancement, not a gate.

### Performance Reality Check

| Concern | Mitigation |
|---------|-----------|
| Three.js is ~150-170kb min+gzip (~563kb uncompressed) | Not truly tree-shakeable; budget for full cost |
| Mobile GPU is weak | Adaptive DPR (`dpr={[1, 2]}`), <100 draw calls, `mediump` precision, 512px shadow maps |
| Battery drain | `frameloop="demand"` for static scenes; pause when off-screen |
| No WebGL support (~2%) | Fallback to static image or CSS alternative |
| Accessibility | Keep real HTML text in DOM; canvas is opaque to screen readers |
| Load time | Lazy-load 3D below fold; show content instantly, load 3D async via dynamic import |
| Device support | WebGL2: 92% global. WebGPU: ~70% (full cross-browser Jan 2026) |

---

## The Tasteful Spectrum

### Level 1: SUBTLE (Any Website)

Enhances without demanding attention. User may not consciously notice.

- Shader gradient backgrounds (Stripe-style mesh, ~10kb, 60fps)
- Gentle particle fields (low-count stars, drifting dots)
- Mouse-reactive depth shifts on cards/images
- Noise-based texture generation (organic quality to flat backgrounds)
- Soft bloom/glow on hover states

**Performance cost:** Minimal. <10kb shader code. No model loading.

### Level 2: MODERATE (Product Sites, Data Platforms)

Deliberate interactive moments that serve content goals.

- Scroll-driven 3D product reveals (Apple-style, below fold)
- Image hover distortion/displacement effects
- 3D product configurators
- Globe/map data visualizations (Stripe, GitHub)
- Shader-based page transitions

**Rule:** The WebGL element should be removable without losing critical information. It enhances understanding, never gates it.

**Performance cost:** Moderate. Model loading required. Progressive loading + device detection needed.

### Level 3: HEAVY (Creative/Portfolio/Luxury Only)

The 3D IS the experience. The audience expects and appreciates craft.

- Navigable 3D worlds (Bruno Simon's car portfolio)
- Full-scene compositions with lighting, physics, audio
- Game-like mechanics (first-person controls, collectibles)
- Interactive storytelling through 3D space

**Loading screens acceptable here.** Custom engine optimizations (Active Theory's Hydra). Device-adaptive rendering. NOT for information-seeking users.

### Level 4: OVERDONE (When It Hurts UX)

- **Scroll-jacking the entire page** — NNGroup: causes disorientation, users interpret as malfunction
- **Forced loading screen for basic content** — if users wait 5s for a gradient, ROI is negative
- **Auto-playing sound** — universally unwanted
- **3D replacing readable content** — text in scrolljacks creates worst usability
- **Changing scroll direction** — vertical-to-horizontal confuses users most
- **No graceful degradation** — canvas is opaque to assistive tech by default

**The test:** Remove all WebGL. Can users still accomplish their goals? If "no" and it's not a creative showcase, it's overdone.

---

## The Tool Ecosystem

### Core Stack (2026)

| Layer | Tool | Why |
|-------|------|-----|
| 3D rendering | **Three.js** (~3.5M weekly NPM) | The standard. WebGPU-ready since r171 |
| React wrapper | **React Three Fiber (R3F)** | Declarative JSX. Best for AI generation |
| Helpers | **Drei** (100+ components) | Float, MeshTransmissionMaterial, ScrollControls, Html, Environment, etc. |
| Animation | **GSAP + ScrollTrigger** | Industry standard for scroll-synced 3D |
| Smooth scroll | **Lenis** (Darkroom Engineering) | Dominant smooth scroll library for WebGL sync |
| Prototyping | **Leva** (GUI controls) | Real-time parameter tuning in browser |
| Cinematic | **Theatre.js** | Visual keyframe editor, exports JSON |

### Visual/No-Code Tools

**Spline** (spline.design)
- Browser-based 3D design tool ("Figma for 3D"). Model, light, animate, interact — visually.
- AI features (2026): text-to-3D, image-to-3D, generative expand.
- Export: HTML embed, React component, **experimental R3F export** (generates JSX from Spline scene), GLTF/GLB.
- Engine uses WebGPU (3x faster). Supports visionOS export.

**Unicorn Studio** (unicorn.studio)
- No-code WebGL with Photoshop-like layer canvas. 70+ shader effects (aurora, blob, distortion, grain, gradients).
- Output: **36kb gzipped** embed. Works with Framer, Webflow, Wix, custom HTML.
- Pricing: Free (10 publishes), $14/mo unlimited.
- Best for: designers wanting WebGL backgrounds without code.

**Rive** (rive.app)
- Interactive, state-driven animations (not WebGL-focused but competes in rich motion).
- Key difference from Lottie: built-in state machines, data binding, binary .riv format 10-15x smaller than Lottie JSON.
- Best for: UI micro-interactions, animated icons, illustrations. Not 3D.

### Alternative 3D Engines

| Engine | Best For | Size |
|--------|----------|------|
| **Babylon.js** | Full game engine (physics, audio, XR, GUI) | ~168kb gzip |
| **PlayCanvas** | Collaborative game dev, mobile-optimized | Cloud-based |
| **OGL** | Learning WebGL, minimal bundle, custom shaders | ~8kb (math only) |
| **p5.js** | Creative coding, generative art, teaching | Moderate |

### The Future: WebGPU + TSL

**WebGPU** — full cross-browser support since January 2026 (~70% global). 2-10x performance over WebGL in draw-call-heavy scenes. Three.js handles fallback automatically via `WebGPURenderer`.

**TSL (Three.js Shading Language)** — write shaders as JavaScript functions instead of GLSL strings. Compiles to GLSL (WebGL) or WGSL (WebGPU) automatically. Far more AI-friendly than raw GLSL:

```javascript
import { color, mix, sin, timerLocal } from 'three/tsl'
const material = new MeshStandardNodeMaterial()
material.colorNode = mix(color(0xff0000), color(0x0000ff), sin(timerLocal()))
```

---

## AI-Friendly WebGL Creation

### Why R3F is the Best Target for AI

1. **Declarative JSX** — LLMs generate component trees better than imperative state management
2. **Self-contained components** — each 3D element is isolated, AI can reason about it
3. **Familiar React patterns** — hooks, props, composition map to how LLMs understand React
4. **Drei shortcuts** — pre-built components reduce code AI needs to generate
5. **Hot reload** — immediate visual feedback for iteration

### AI Shader Generation (14islands Benchmark)

| Model | Quality | Consistency | Notes |
|-------|---------|-------------|-------|
| **Claude** | High | **Most consistent** | Best for iterative shader workflows |
| **GPT** | High | Good | Occasionally over-complex |
| **Deepseek R1** | Medium | Variable | Good reasoning, too slow for iteration |
| **Mistral Codestral** | Low | Poor | Fast but most broken code |

### The AI + WebGL Workflow

```
1. DESIGN      Spline AI (text-to-3D objects) + Unicorn Studio (no-code shader backgrounds)
2. SCAFFOLD    Prompt Claude/v0 for R3F component structure (scene, camera, lights, geometry)
3. SHADERS     Two-step: plan algorithm first, then generate GLSL. Or use TSL for cross-renderer
4. ANIMATE     GSAP ScrollTrigger for scroll, useFrame for per-frame, Theatre.js for cinematic
5. REFINE      Leva controls for parameter tuning. Human eye for artistic quality
```

### MCP Servers & Skills for 3D

| Tool | What It Does |
|------|-------------|
| **three-js-mcp** | Real-time Three.js scene manipulation via WebSocket |
| **mcp-three** (basementstudio) | GLTF/GLB → R3F JSX conversion, structure analysis |
| **mcp-game-asset-gen** | Generate images, audio, 3D models for game dev |
| **Three.js Skills for Claude Code** | 10 skill files (geometry, materials, shaders, etc.). Install to `.claude/skills` |

### Text-to-3D Model Tools

- **Hyper3D Rodin** — text/image to 3D
- **Tripo3D** — text to 3D with good topology
- **Meshy.ai** — text/image to textured 3D models
- **Hunyuan3D-2** (open source) — high-fidelity from text

---

## Design Patterns

### A. Shader Gradient Backgrounds (Stripe-Style)

The Stripe gradient: Fractal Brownian Motion (layered simplex noise) modulated by sinusoidal mesh. ~800 lines, ~10kb via minigl. Replicated open-source: `stripe-mesh-gradient` (GitHub gist by jordienr).

**Tools for non-coders:**
- Shader Gradient (tools.theblanck.co) — noise, dither, mesh, aurora presets
- WebGL Gradient Generator (gradients.juangarcia.ch) — custom animated gradients, export 4K
- Fluid Scroll Mesh (Framer component) — simplex noise at 60fps

### B. Floating 3D Hero Objects

Subtle rotation or mouse-reactive 3D model in hero section. Communicates premium quality without demanding interaction. Risk: becomes generic if it's just a floating laptop.

```jsx
import { Float, MeshWobbleMaterial } from '@react-three/drei'

<Float speed={1.5} rotationIntensity={0.5} floatIntensity={0.5}>
  <mesh>
    <icosahedronGeometry args={[0.8, 1]} />
    <meshStandardMaterial color="#6366f1" roughness={0.2} metalness={0.8} />
  </mesh>
</Float>
```

### C. Particle Backgrounds

Thousands of particles in one draw call. Stars, dots, flowing streams.

```jsx
function ParticleField({ count = 2000 }) {
  const points = useRef()
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 10
      pos[i * 3 + 1] = (Math.random() - 0.5) * 10
      pos[i * 3 + 2] = (Math.random() - 0.5) * 10
    }
    return pos
  }, [count])

  useFrame(({ clock }) => {
    points.current.rotation.y = clock.elapsedTime * 0.05
  })

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.015} color="#8b5cf6" sizeAttenuation depthWrite={false} transparent opacity={0.6} />
    </points>
  )
}
```

### D. Glass / Crystal Refraction

```jsx
import { MeshTransmissionMaterial, Environment } from '@react-three/drei'

<mesh>
  <sphereGeometry args={[1, 64, 64]} />
  <MeshTransmissionMaterial
    transmission={1} thickness={0.5} roughness={0}
    chromaticAberration={0.03} distortion={0.1} distortionScale={0.2}
    backside backsideThickness={0.3} resolution={256} samples={6}
  />
</mesh>
```

### E. Scroll-Driven 3D (Apple-Style)

Two approaches:
1. **Image sequence on canvas** — 60-120 JPEG/AVIF frames rendered to canvas synced to scroll (Apple's actual technique)
2. **3D model transform** — Three.js model rotates/zooms as user scrolls via GSAP ScrollTrigger

```jsx
import { ScrollControls, useScroll } from '@react-three/drei'

function ScrollScene() {
  return (
    <Canvas>
      <ScrollControls pages={3} damping={0.25}>
        <ProductModel />
      </ScrollControls>
    </Canvas>
  )
}

function ProductModel() {
  const scroll = useScroll()
  const ref = useRef()

  useFrame(() => {
    const offset = scroll.offset // 0 to 1
    ref.current.rotation.y = offset * Math.PI * 2
    ref.current.position.y = offset * -2
  })

  return <Gltf ref={ref} src="/models/product.glb" />
}
```

**Caution:** NNGroup research shows scroll-jacking causes disorientation. Best used below the fold, in limited sections, never for the entire page.

### F. Globe Visualizations

**Stripe Globe:** ~80k dots with pole-compensation. 5 layers (halo, sphere, regions, spikes, arcs). Zero textures — 4 lights + custom shaders. ~10kb via minigl.

**GitHub Globe:** PR data as arcs between countries. JSON-fed. Three.js.

```jsx
import R3fGlobe from 'r3f-globe'

const arcsData = [
  { startLat: 51.5, startLng: -0.1, endLat: 40.7, endLng: -74.0, color: '#6366f1' },
]

<Canvas>
  <R3fGlobe
    globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
    arcsData={arcsData}
    arcColor="color"
    arcDashLength={0.4}
    arcDashGap={0.2}
    arcDashAnimateTime={1500}
  />
</Canvas>
```

### G. Image Distortion on Hover

Displacement map drives pixel offset during hover. A grayscale image controls warp direction.

**Libraries:** hover-effect, Codrops "WebGL Distortion Hover Effects" (2018, still the reference).

### H. Morphing Blobs / Metaballs

Marching cubes or SDF blending. SmoothMin function merges shapes organically.

### I. 3D Text

| Approach | Pros | Cons |
|----------|------|------|
| Font geometry | True 3D, lighting/shadows | Heavy mesh, not scalable |
| MSDF/SDF fonts | Sharp at any size, single texture | No true depth |
| ztext.js | HTML layers faking 3D, no canvas | Limited effects |
| Shader-driven | Full control | Complex GLSL |

**SEO tip:** Keep real HTML text in DOM for crawlers, render visual effects in canvas overlay.

---

## Shader Patterns (GLSL)

### Essential Noise Functions

```glsl
// Simplex 2D noise (compact version)
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                      -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
```

### FBM (Fractional Brownian Motion) — Layered Noise

```glsl
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 6; i++) {
    value += amplitude * snoise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}
```

### Common Fragment Shader Effects

```glsl
// Vignette
float vignette(vec2 uv, float intensity) {
  return smoothstep(0.8, 0.2, length(uv - 0.5) * intensity);
}

// Color grading
vec3 adjustContrast(vec3 color, float contrast) {
  return 0.5 + contrast * (color - 0.5);
}

vec3 adjustSaturation(vec3 color, float saturation) {
  float gray = dot(color, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(gray), color, saturation);
}
```

### Shader Resources

| Resource | What | URL |
|----------|------|-----|
| **Book of Shaders** | Definitive beginner-to-intermediate guide | thebookofshaders.com |
| **Shadertoy** | Online editor + community gallery | shadertoy.com |
| **Lygia** | Reusable shader function library ("lodash for shaders") | lygia.xyz |
| **glsl.app** | Modern editor with IntelliSense | glsl.app |
| **Inigo Quilez** | Mathematical foundations (SDF, noise, raymarching) | iquilezles.org/articles |
| **Three.js Journey** | 90+ lessons, R3F + shaders (Bruno Simon) | threejs-journey.com |
| **Codrops WebGL** | 51 tutorials in 2025 alone | tympanus.net/codrops/tag/webgl |
| **Wawa Sensei** | Free R3F + TSL + WebGPU tutorials | wawasensei.dev |

---

## R3F Essentials

### Minimal Scene

```jsx
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment } from '@react-three/drei'

export default function Scene() {
  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 75 }} shadows dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={Math.PI / 2} />
      <directionalLight position={[5, 5, 5]} intensity={1} castShadow />
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="hotpink" />
      </mesh>
      <OrbitControls enableDamping dampingFactor={0.05} />
      <Environment preset="city" />
    </Canvas>
  )
}
```

### Post-Processing

```jsx
import { EffectComposer, Bloom, Vignette, ChromaticAberration } from '@react-three/postprocessing'

<EffectComposer>
  <Bloom luminanceThreshold={1} luminanceSmoothing={0.9} intensity={0.5} />
  <Vignette offset={0.3} darkness={0.9} />
  <ChromaticAberration offset={[0.002, 0.002]} />
</EffectComposer>
```

Selective bloom: lift emissive above 1.0 range:
```jsx
<meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={2} toneMapped={false} />
```

### Mounting R3F with Regular React/Next.js

```jsx
'use client'
export default function HeroSection() {
  return (
    <section className="relative h-screen">
      {/* Regular HTML content */}
      <div className="absolute inset-0 z-0">
        <Canvas>
          <Suspense fallback={null}>
            <Scene3D />
          </Suspense>
        </Canvas>
      </div>
      <div className="relative z-10 flex flex-col items-center justify-center h-full">
        <h1>Your headline here</h1>
        <p>WebGL renders behind the text</p>
      </div>
    </section>
  )
}
```

### Performance Patterns

```jsx
// Adaptive quality
<Canvas dpr={[1, 2]}>
  <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(2)} />
</Canvas>

// Static scene — don't render every frame
<Canvas frameloop="demand">

// Instanced rendering — 100k objects in 1 draw call
<instancedMesh args={[geometry, material, 100000]}>

// Lazy loading — 3D scene loads after page content
<Suspense fallback={<LoadingPlaceholder />}>
  <HeavyScene />
</Suspense>
```

**Key rules:**
- `useFrame` for mutations (animation), `useEffect` for setup only
- Never create `new Vector3()` inside `useFrame` — reuse refs
- R3F auto-disposes on unmount; toggle `visible` instead of mount/unmount for performance
- Use `maath` library for smooth damped animations (exponential decay, not lerp)

---

## Studios to Study

### Tier 1: Industry Leaders

| Studio | Known For | Key Detail |
|--------|-----------|-----------|
| **Active Theory** | Custom Hydra engine, multi-platform WebGL | Built WebGL outside browsers for max GPU throughput |
| **Locomotive** | Awwwards Agency of Year 2024 | Created locomotive-scroll (now superseded by Lenis) |
| **Immersive Garden** | Awwwards Studio of Year 2024 | Restraint — 3D serves design, never dominates |
| **Lusion** | Buttery motion, 3D storytelling | Worldcoin Globe, CSS Design Awards WOTY |
| **Darkroom Engineering** | Open-source (Lenis, Satus) | Performance-obsessed, dev-first |

### Tier 2: Consistently Excellent

| Studio | Known For |
|--------|-----------|
| **Unseen Studio** | Bold creative + solid engineering |
| **Resn** | High-impact 3D with Core Web Vitals compliance |
| **Bruno Simon** | Gamified portfolios, Three.js Journey course |
| **Jesper Landberg** | Awwwards Independent of Year 2024 |
| **Garden Eight** | Minimal Japanese design + illustration storytelling |

### Award-Winning References

| Site | Award | Tech |
|------|-------|------|
| **Igloo Inc** | Awwwards SOTY 2024 | Three.js + Svelte + Houdini + custom fluid sim |
| **Bruno Simon** | Awwwards SOTM | Three.js + Cannon.js physics |
| **Lusion v3** | CSS Design Awards WOTY | Custom Three.js + AR |
| **Corentin Bernadou** | Codrops feature | Swiss-editorial + WebGL geometry |

### Pricing Framework

| Tier | Budget | Scope |
|------|--------|-------|
| Hero accent | $20k-$40k | 3D accents in classic layouts |
| Advanced 3D site | $50k-$200k | Primarily 3D or simple games |
| Configurator / complex | $200k-$500k+ | Product configurators, advanced games |

---

## Accessibility & Progressive Enhancement

### Non-Negotiable Rules

1. **WebGL adds to, never replaces, core content.** All text stays in DOM. All navigation works without JS.
2. **`prefers-reduced-motion`** — disable all 3D animation, show static fallback.
3. **`<canvas>` needs ARIA** — `role="img"` + `aria-label` describing the visual. Canvas is invisible to screen readers by default.
4. **Keyboard navigation** — 3D interactive elements need focus states and keyboard controls.
5. **Fallback images** — for the ~2% without WebGL and for slow connections.
6. **Lazy load below fold** — hero content loads first, 3D assets load async after.

### Device Detection Pattern

```javascript
const isLowEnd = navigator.hardwareConcurrency <= 4
  || navigator.deviceMemory <= 4
  || /Android|iPhone/i.test(navigator.userAgent)

// Reduce quality on low-end
const dpr = isLowEnd ? 1 : Math.min(window.devicePixelRatio, 2)
const particleCount = isLowEnd ? 500 : 5000
const postProcessing = !isLowEnd
```

---

## Codrops Highlights (2025-2026)

Key tutorials worth studying — the most impactful WebGL work published:

**Scroll patterns:**
- Scroll-Revealed WebGL Gallery (GSAP + Three.js + Astro + Barba.js)
- Scroll-Driven 3D Image Tube (R3F)
- Scroll-Reactive 3D Gallery with Velocity-Based Backgrounds

**Shader techniques:**
- WebGL Shader Techniques for Dynamic Image Transitions
- Animate WebGL Shaders with GSAP: Ripples, Reveals, Dynamic Blur
- Composite Rendering: WebGL Transitions (render targets)

**Text:**
- Animating Letters with Shaders (Three.js + GLSL)
- Responsive and SEO-friendly WebGL Text
- WebGPU Gommage Effect: Dissolving MSDF Text into Dust

**Materials & effects:**
- Interactive Metaballs with Three.js and GLSL
- Stylized Water Effects with R3F
- Glass Sphere with Procedural Vortex (TSL)
- Dual-Scene Fluid X-Ray Reveal

**Retro/dithering:**
- Efecto: ASCII and Dithering Effects with WebGL Shaders
- Real-Time Dithering Shader
- Interactive WebGL Backgrounds: Bayer Dithering

All available at tympanus.net/codrops/tag/webgl/

---

## Full R3F Code Reference

Detailed code patterns (GPU-animated particles, custom ShaderMaterial setup, Zustand state bridging, ScrollControls integration, smooth damping with maath, disposal patterns) are in the extended reference files:

- `~/.claude/projects/-Users-neakoh/memory/webgl_r3f_patterns.md` — practical code patterns
- `~/.claude/projects/-Users-neakoh/memory/webgl_3d_design_research.md` — design patterns, studios, Codrops catalogue

---

## Proven Code Recipes
