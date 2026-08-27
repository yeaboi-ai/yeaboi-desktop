# Advanced Animation & 3D

> Beyond CSS transitions. Parallax, Three.js, GSAP timelines, physics-based motion, custom shaders, and 3D model integration.

---

## Quick ref

- **When to load:** Energy=High recipes, specifically creative-studio, immersive, film, hardware, music, event, travel.
- GSAP timelines for multi-element choreography.
- ScrollTrigger for scroll-linked effects (pinning, scrubbing, snap).
- Physics-based motion (spring, inertia) for natural feel — not on utility UI.
- SVG path morphing via GSAP MorphSVG.
- SplitText for per-character / per-word / per-line reveals.
- Lottie for designer-created illustration animation (from After Effects).
- For WebGL / 3D decision + implementation: `webgl-core.md` + `webgl-recipes.md`.
- Always honour `prefers-reduced-motion`.

---

## When to Use What

| Technique | Use For | Library | Performance Cost |
|---|---|---|---|
| CSS `animation-timeline: scroll()` | Simple scroll-linked effects (progress bars, reveals) | None | Minimal |
| GSAP + ScrollTrigger | Complex scroll sequences, pinning, scrubbing | gsap, ScrollTrigger | Low-Medium |
| Parallax (CSS/JS) | Depth layers, hero backgrounds, image offset | None or GSAP | Low |
| Lenis | Smooth scroll feel | lenis | Minimal |
| Three.js / R3F | 3D scenes, product viewers, particle systems | three, @react-three/fiber | Medium-High |
| Spline | No-code 3D, embeddable scenes | @splinetool/runtime | Medium |
| Custom shaders (GLSL) | Unique visual effects, distortions, transitions | three (for WebGL context) | High |
| Physics (matter.js, cannon) | Realistic motion, gravity, collisions | matter-js, cannon-es | Medium |
| Framer Motion | React component animation, layout transitions | framer-motion | Low |
| Motion One | Lightweight JS animation, Web Animations API | motion | Minimal |

---

## Parallax

### CSS-Only Parallax (Simple)

```css
.parallax-container {
  height: 100vh;
  overflow-x: hidden;
  overflow-y: auto;
  perspective: 1px;
  perspective-origin: center center;
}

.parallax-layer-back {
  position: absolute;
  inset: -20%;  /* extra size to prevent edges showing */
  transform: translateZ(-2px) scale(3);
}

.parallax-layer-front {
  transform: translateZ(0);
  position: relative;
}
```

Limitation: CSS perspective parallax breaks with Lenis/smooth scroll libraries. Use JS approach instead.

### JS Parallax with Lerp (Production Pattern)

```javascript
// Elements with data-speed attribute move at different rates
// data-speed="0.5" = moves at half scroll speed (background)
// data-speed="1.5" = moves at 1.5x scroll speed (foreground)

const parallaxElements = document.querySelectorAll('[data-speed]');
let scrollY = 0;
let currentY = 0;

// Lerp for smooth interpolation
function lerp(start, end, factor) {
  return start + (end - start) * factor;
}

function updateParallax() {
  currentY = lerp(currentY, scrollY, 0.1);

  parallaxElements.forEach(el => {
    const speed = parseFloat(el.dataset.speed);
    const offset = currentY * (speed - 1); // relative to normal scroll
    el.style.transform = `translate3d(0, ${offset}px, 0)`;
  });

  requestAnimationFrame(updateParallax);
}

// If using Lenis:
lenis.on('scroll', ({ scroll }) => { scrollY = scroll; });
// If native scroll:
// window.addEventListener('scroll', () => { scrollY = window.scrollY; });

updateParallax();
```

```html
<section class="hero" style="position: relative; overflow: hidden;">
  <img data-speed="0.5" src="bg.jpg" style="position: absolute; inset: -20%; width: 140%; height: 140%; object-fit: cover;">
  <img data-speed="0.7" src="midground.png" style="position: absolute; inset: -10%;">
  <h1 data-speed="1.1">Hero Title</h1>  <!-- moves slightly faster than scroll -->
</section>
```

### Multi-Layer Parallax (Joby Pattern — 12+ Layers)

```javascript
// Each layer has a different speed, creating depth
const layers = [
  { el: document.querySelector('.layer-sky'), speed: 0.1 },
  { el: document.querySelector('.layer-mountains'), speed: 0.3 },
  { el: document.querySelector('.layer-trees'), speed: 0.5 },
  { el: document.querySelector('.layer-building'), speed: 0.7 },
  { el: document.querySelector('.layer-foreground'), speed: 0.9 },
  { el: document.querySelector('.layer-text'), speed: 1.1 },
];

let scroll = 0;
let smoothScroll = 0;

lenis.on('scroll', ({ scroll: s }) => { scroll = s; });

function animate() {
  smoothScroll = lerp(smoothScroll, scroll, 0.08);
  layers.forEach(({ el, speed }) => {
    el.style.transform = `translate3d(0, ${smoothScroll * (speed - 1)}px, 0)`;
  });
  requestAnimationFrame(animate);
}
animate();
```

### GSAP ScrollTrigger Parallax (Easiest for Complex Scenes)

```javascript
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
gsap.registerPlugin(ScrollTrigger);

// Background moves slower than scroll
gsap.to('.hero-bg', {
  yPercent: -30,
  ease: 'none',
  scrollTrigger: {
    trigger: '.hero',
    start: 'top top',
    end: 'bottom top',
    scrub: true,  // ties animation to scroll position
  },
});

// Text moves faster than scroll
gsap.to('.hero-title', {
  yPercent: 50,
  opacity: 0,
  ease: 'none',
  scrollTrigger: {
    trigger: '.hero',
    start: 'top top',
    end: '60% top',
    scrub: 0.5,  // 0.5s lag for smoothness
  },
});
```

---

## GSAP Timeline Sequences

### Orchestrated Page Load

```javascript
const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

tl.from('.preloader', { opacity: 1, duration: 0.5 })
  .from('.hero-title .line', {
    yPercent: 110,
    duration: 1.2,
    stagger: 0.08,
  }, '-=0.3')
  .from('.hero-subtitle', {
    opacity: 0,
    y: 30,
    duration: 0.8,
  }, '-=0.6')
  .from('.hero-cta', {
    opacity: 0,
    y: 20,
    duration: 0.6,
  }, '-=0.4')
  .from('.nav', {
    opacity: 0,
    y: -20,
    duration: 0.5,
  }, '-=0.8');
```

### Scroll-Triggered Section Reveal

```javascript
// Each section gets its own timeline
document.querySelectorAll('.section').forEach(section => {
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: section,
      start: 'top 80%',
      end: 'top 20%',
      toggleActions: 'play none none reverse',
    },
  });

  tl.from(section.querySelector('.section-label'), {
    opacity: 0, x: -30, duration: 0.6,
  })
  .from(section.querySelectorAll('.card'), {
    opacity: 0, y: 40, duration: 0.8, stagger: 0.1,
  }, '-=0.3');
});
```

### Pinned Scroll Section (Product Reveal)

```javascript
// Section stays pinned while user scrolls through it
// Content transforms based on scroll progress
ScrollTrigger.create({
  trigger: '.product-reveal',
  start: 'top top',
  end: '+=300%', // 3x viewport height of scroll distance
  pin: true,
  scrub: 1,
  onUpdate: (self) => {
    const progress = self.progress; // 0 to 1

    // Rotate product based on scroll
    gsap.set('.product-model', {
      rotateY: progress * 360,
      scale: 1 + progress * 0.3,
    });

    // Show/hide feature labels at specific scroll points
    if (progress > 0.25) showLabel('.feature-1');
    if (progress > 0.5) showLabel('.feature-2');
    if (progress > 0.75) showLabel('.feature-3');
  },
});
```

---

## Three.js Basics

### Minimal Scene Setup

```javascript
import * as THREE from 'three';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById('webgl-canvas'),
  antialias: true,
  alpha: true, // transparent background — overlays on HTML
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // cap at 2x for performance

camera.position.z = 5;

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();

// Resize handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
```

### Loading a 3D Model (GLB/GLTF)

```javascript
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

const loader = new GLTFLoader();
loader.load('/models/product.glb', (gltf) => {
  const model = gltf.scene;
  model.scale.set(1, 1, 1);
  scene.add(model);

  // Rotate on scroll
  lenis.on('scroll', ({ scroll }) => {
    model.rotation.y = scroll * 0.002;
  });

  // Rotate on mouse move
  document.addEventListener('mousemove', (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 2;
    const y = (e.clientY / window.innerHeight - 0.5) * 2;
    gsap.to(model.rotation, {
      x: y * 0.3,
      y: x * 0.5,
      duration: 1,
      ease: 'power2.out',
    });
  });
});
```

### Particle System (Background Effect)

```javascript
const particleCount = 1000;
const geometry = new THREE.BufferGeometry();
const positions = new Float32Array(particleCount * 3);

for (let i = 0; i < particleCount * 3; i++) {
  positions[i] = (Math.random() - 0.5) * 20;
}

geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

const material = new THREE.PointsMaterial({
  size: 0.02,
  color: 0xe8943a, // accent color
  transparent: true,
  opacity: 0.6,
  sizeAttenuation: true,
});

const particles = new THREE.Points(geometry, material);
scene.add(particles);

function animate() {
  requestAnimationFrame(animate);
  particles.rotation.y += 0.0005;
  particles.rotation.x += 0.0002;
  renderer.render(scene, camera);
}
```

### Mouse-Reactive 3D (Unseen/Studio Dialect Pattern)

```javascript
let mouseX = 0, mouseY = 0;
let targetX = 0, targetY = 0;

document.addEventListener('mousemove', (e) => {
  targetX = (e.clientX / window.innerWidth - 0.5) * 2;
  targetY = (e.clientY / window.innerHeight - 0.5) * 2;
});

function animate() {
  requestAnimationFrame(animate);

  // Lerp for smooth follow
  mouseX += (targetX - mouseX) * 0.05;
  mouseY += (targetY - mouseY) * 0.05;

  // Apply to camera or scene
  camera.position.x = mouseX * 0.5;
  camera.position.y = mouseY * 0.3;
  camera.lookAt(scene.position);

  renderer.render(scene, camera);
}
```

---

## React Three Fiber (Three.js in React/Next.js)

```jsx
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF, Float } from '@react-three/drei';
import { useRef } from 'react';

function ProductModel() {
  const { scene } = useGLTF('/models/product.glb');
  const ref = useRef();

  useFrame((state) => {
    ref.current.rotation.y = state.clock.elapsedTime * 0.2;
    // Mouse follow
    ref.current.rotation.x = state.mouse.y * 0.2;
    ref.current.rotation.z = state.mouse.x * 0.1;
  });

  return (
    <Float speed={1.5} rotationIntensity={0.3} floatIntensity={0.5}>
      <primitive ref={ref} object={scene} scale={1.5} />
    </Float>
  );
}

function Scene() {
  return (
    <Canvas
      camera={{ position: [0, 0, 5], fov: 45 }}
      style={{ position: 'absolute', inset: 0, zIndex: 0 }}
      gl={{ alpha: true, antialias: true }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={1} />
      <ProductModel />
      <OrbitControls enableZoom={false} enablePan={false} />
    </Canvas>
  );
}
```

---

## Spline (No-Code 3D for Web)

### Embedding a Spline Scene

```html
<!-- As iframe -->
<iframe src="https://my.spline.design/your-scene-id/" style="width:100%; height:100vh; border:none;"></iframe>

<!-- As runtime (better performance, more control) -->
<canvas id="spline-canvas"></canvas>
<script type="module">
import { Application } from '@splinetool/runtime';

const canvas = document.getElementById('spline-canvas');
const app = new Application(canvas);
app.load('https://prod.spline.design/your-scene-id/scene.splinecode');

// Trigger animations on scroll
lenis.on('scroll', ({ scroll }) => {
  app.setVariable('scrollProgress', scroll / document.body.scrollHeight);
});
</script>
```

### When to Use Spline vs Three.js

| | Spline | Three.js |
|---|---|---|
| Learning curve | Low (visual editor) | High (code-based) |
| Customization | Limited to editor capabilities | Unlimited |
| Performance | Good for simple scenes | Optimizable for complex scenes |
| Interactivity | Built-in hover/click events | Full programmatic control |
| File size | Can be heavy (embeds runtime) | Tree-shakeable |
| Best for | Hero backgrounds, product showcases, decorative 3D | Complex interactive scenes, games, data viz |

---

## Custom Shaders (GLSL)

### Hover Distortion Effect

```javascript
// Vertex shader — passes UV coordinates to fragment
const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Fragment shader — creates distortion on hover
const fragmentShader = `
  uniform sampler2D uTexture;
  uniform float uHover;       // 0 to 1
  uniform vec2 uMouse;        // normalized mouse position
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    vec2 uv = vUv;

    // Distort UVs based on mouse proximity
    float dist = distance(uv, uMouse);
    float strength = smoothstep(0.3, 0.0, dist) * uHover;
    uv += strength * 0.05 * sin(uv * 10.0 + uTime);

    vec4 color = texture2D(uTexture, uv);
    gl_FragColor = color;
  }
`;

// Usage with Three.js
const material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms: {
    uTexture: { value: texture },
    uHover: { value: 0 },
    uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    uTime: { value: 0 },
  },
});

// Animate hover uniform
element.addEventListener('mouseenter', () => {
  gsap.to(material.uniforms.uHover, { value: 1, duration: 0.8 });
});
element.addEventListener('mouseleave', () => {
  gsap.to(material.uniforms.uHover, { value: 0, duration: 0.8 });
});
```

### Page Transition Shader (Curtain Wipe)

```glsl
// Fragment shader — reveals new page with noise-driven wipe
uniform float uProgress;    // 0 to 1 (transition progress)
uniform sampler2D uFrom;    // old page texture
uniform sampler2D uTo;      // new page texture

varying vec2 vUv;

// Simple noise function
float noise(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  float n = noise(vUv * 5.0);
  float threshold = uProgress * 1.2 - n * 0.4;
  float mixer = smoothstep(threshold - 0.1, threshold, vUv.x);

  vec4 fromColor = texture2D(uFrom, vUv);
  vec4 toColor = texture2D(uTo, vUv);

  gl_FragColor = mix(fromColor, toColor, mixer);
}
```

---

## Physics-Based Animation

### Gravity/Bounce with Matter.js

```javascript
import Matter from 'matter-js';

const { Engine, Render, World, Bodies, Mouse, MouseConstraint } = Matter;

const engine = Engine.create();
const render = Render.create({
  element: document.getElementById('physics-container'),
  engine,
  options: {
    width: window.innerWidth,
    height: 600,
    wireframes: false,
    background: 'transparent',
  },
});

// Floor
const floor = Bodies.rectangle(
  window.innerWidth / 2, 600, window.innerWidth, 20,
  { isStatic: true, render: { fillStyle: 'transparent' } }
);

// Falling elements (could be letters, icons, cards)
const items = [];
for (let i = 0; i < 20; i++) {
  items.push(Bodies.circle(
    Math.random() * window.innerWidth,
    -Math.random() * 500,
    15 + Math.random() * 20,
    {
      restitution: 0.6, // bounciness
      render: { fillStyle: '#e8943a' },
    }
  ));
}

// Mouse interaction — drag physics objects
const mouse = Mouse.create(render.canvas);
const mouseConstraint = MouseConstraint.create(engine, {
  mouse,
  constraint: { stiffness: 0.2, render: { visible: false } },
});

World.add(engine.world, [floor, ...items, mouseConstraint]);
Render.run(render);
Engine.run(engine);
```

### Spring Physics with Lerp (No Library)

```javascript
// Damped spring for smooth, physics-like movement
class Spring {
  constructor({ stiffness = 0.1, damping = 0.8 } = {}) {
    this.value = 0;
    this.target = 0;
    this.velocity = 0;
    this.stiffness = stiffness;
    this.damping = damping;
  }

  update() {
    const force = (this.target - this.value) * this.stiffness;
    this.velocity += force;
    this.velocity *= this.damping;
    this.value += this.velocity;
    return this.value;
  }
}

// Usage: mouse-follow with spring physics
const springX = new Spring({ stiffness: 0.08, damping: 0.85 });
const springY = new Spring({ stiffness: 0.08, damping: 0.85 });

document.addEventListener('mousemove', (e) => {
  springX.target = e.clientX;
  springY.target = e.clientY;
});

function animate() {
  const x = springX.update();
  const y = springY.update();
  cursor.style.transform = `translate(${x}px, ${y}px)`;
  requestAnimationFrame(animate);
}
animate();
```

---

## Scroll-Driven 3D Product Viewer

Combines GSAP ScrollTrigger + Three.js for Apple-style product reveals:

```javascript
// Pin the 3D canvas while user scrolls through feature descriptions
const canvas = document.getElementById('product-canvas');
// ... Three.js setup with loaded model ...

ScrollTrigger.create({
  trigger: '.product-section',
  start: 'top top',
  end: '+=400%',
  pin: '.product-canvas-container',
  scrub: 1,
  onUpdate: (self) => {
    const p = self.progress;

    // Phase 1 (0-0.25): rotate to show front
    if (p < 0.25) {
      model.rotation.y = p * 4 * Math.PI * 0.5;
    }
    // Phase 2 (0.25-0.5): zoom into detail
    else if (p < 0.5) {
      camera.position.z = 5 - (p - 0.25) * 4 * 3;
    }
    // Phase 3 (0.5-0.75): rotate to show back
    else if (p < 0.75) {
      model.rotation.y = Math.PI * 0.5 + (p - 0.5) * 4 * Math.PI;
    }
    // Phase 4 (0.75-1): zoom out, full view
    else {
      camera.position.z = 2 + (p - 0.75) * 4 * 3;
    }
  },
});
```

---

## Performance Rules

1. **Always cap `devicePixelRatio` at 2** — `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))`
2. **Use `will-change: transform`** on parallax elements — hints GPU compositing
3. **Throttle mousemove** for complex calculations — 60fps max, use rAF not event handler
4. **Dispose Three.js resources** on page leave — `renderer.dispose()`, `geometry.dispose()`, `material.dispose()`
5. **Lazy-load 3D** — don't load Three.js on pages that don't use it. Dynamic import: `const THREE = await import('three')`
6. **Provide fallback** — detect WebGL support: `const hasWebGL = !!document.createElement('canvas').getContext('webgl2')`
7. **Respect `prefers-reduced-motion`** — disable parallax, simplify particle counts, disable shader effects
8. **Test on mobile** — disable heavy 3D on mobile or reduce particle count by 75%

```javascript
// Reduced motion detection
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (reducedMotion) {
  // Skip parallax, simplify or disable 3D
  particleCount = 0;
  gsap.globalTimeline.timeScale(100); // instant all GSAP
}

// Mobile detection for performance
const isMobile = window.innerWidth < 768;
if (isMobile) {
  particleCount = Math.floor(particleCount * 0.25);
  renderer.setPixelRatio(1); // force 1x on mobile
}
```

---

## Reference: Which Sites Use What

| Technique | Sites Using It |
|---|---|
| Multi-layer parallax | Joby (12+ layers), OceanX, Springs Estate |
| Three.js / WebGL scene | Unseen (3D world), Studio Dialect (canvas) |
| GLB model loading | Unseen (glass material models at coordinates) |
| GSAP ScrollTrigger | OceanX (sticky chapters), Joby (scroll reveals) |
| Lenis smooth scroll | Joby, Aupale, Springs Estate, Unseen 2025 |
| Barba.js page transitions | Springs Estate |
| Splitting.js text animation | Springs Estate |
| Canvas 2D particles | Studio Dialect, Good Fella |
| Custom cursor with lerp | Unseen (custom cursor), our sample sites |
| Clip-path scroll reveals | OceanX, Bec Restaurant, Dulcedo, Aupale |
| Gradient blob animation (CSS) | Springs Estate (4 blobs, 6-12s loops) |
| Matter.js physics | Not yet extracted — common on creative portfolios |
| Spline embeds | Not yet extracted — growing trend 2025-2026 |
