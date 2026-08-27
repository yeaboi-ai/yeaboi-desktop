# Compositional Design: Combining Interactive Techniques

> How top creative studios think about weaving multiple interactive techniques -- scroll, WebGL, animation, parallax, micro-interactions -- into cohesive experiences rather than stacking individual effects. These are the rules that separate "a website with cool effects" from "an experience that feels inevitable."

Compiled from case studies, published processes, and design system specifications from Locomotive, Active Theory, Immersive Garden, Resn, Darkroom Engineering, Bruno Simon, Google Material Design, IBM Carbon Design System, Val Head, and multiple Awwwards/Codrops breakdowns.

---

## Quick ref

- **When to load:** creative-studio, immersive, film, music, hardware, event recipes where multiple techniques must coexist.
- Pick ONE signature idea per project; all other techniques serve it.
- Shared motion language: same easing, same timing tokens across every animated element.
- Hierarchy: one "star" effect per section. Never compete attention.
- Scroll is the spine — everything else rides on it.
- Test by removal: strip each technique, re-add only if the experience collapses without it.

---

### 1 The Cardinal Rule: Aligned Intent, Not Unified Systems

Bruno Simon's Three.js portfolio uses no real lights (only matcaps), fake shadows (PNG textures), and a physics engine (Cannon.js) completely decoupled from the visual models (Three.js). The antenna animation ignores the physics engine entirely. None of these systems are technically unified -- yet the experience feels seamless.

**The rule:** Cohesion emerges from aligned intent, not from running everything through one system. Every element must serve the same experiential goal even if the technical implementations are independent. Ask "does this serve the same feeling?" not "does this use the same framework?"

- Source: [Bruno Simon, Portfolio Case Study](https://medium.com/@bruno_simon/bruno-simon-portfolio-case-study-960402cc259b)

---

### 2 The Easing Family: Your Motion DNA

Every animated element in a composition should share timing DNA -- the same easing family, not the same easing curve. Define exactly three custom cubic-bezier curves for your entire project:

| Purpose | Name | Curve | Use For |
|---------|------|-------|---------|
| **Entrance** | Ease-Out | `cubic-bezier(0.16, 1, 0.3, 1)` | Elements appearing, modals opening, content revealing |
| **Exit** | Ease-In | `cubic-bezier(0.4, 0, 1, 1)` | Elements leaving, closing, dismissing |
| **Traversal** | Ease-In-Out | `cubic-bezier(0.4, 0, 0.2, 1)` | Point-to-point motion, repositioning, state changes |

**Do not use CSS defaults** (`ease`, `ease-in-out`). Custom curves build "motion equity" -- a distinctive feel that becomes as recognizable as your typography. The Smashing Magazine recommendation: "build motion equity by customizing easing rather than relying on browser defaults."

For spring-like/playful brands, add a fourth curve with slight overshoot: `cubic-bezier(0.34, 1.56, 0.64, 1)`. Use sparingly -- only for button presses, success states, and micro-interactions.

- Source: [Smashing Magazine, "Including Animation in Your Design System"](https://www.smashingmagazine.com/2019/02/animation-design-system/)
- Source: [Web Animation Best Practices](https://gist.github.com/uxderrick/07b81ca63932865ef1a7dc94fbe07838)
- Source: [DesignSystems.com, "5 Steps for Including Motion Design"](https://www.designsystems.com/5-steps-for-including-motion-design-in-your-system/)

---

### 3 The Duration Scale: Timing as Typography

Just as typography has h1-h6, motion needs a duration scale. Assign tokens, not arbitrary millisecond values:

| Token | Duration | Use For |
|-------|----------|---------|
| `t1` (instant) | 80-100ms | Button press, toggle, tooltip |
| `t2` (fast) | 150-200ms | Hover states, micro-interactions, icon transitions |
| `t3` (normal) | 250-300ms | Modal entrance, page content reveal, dropdown open |
| `t4` (deliberate) | 400-500ms | Page transitions, large movements, hero animations |
| `t5` (dramatic) | 600-800ms | Success celebrations, onboarding sequences, cinematic reveals |

**The 300ms rule:** Keep UI interactions under 300ms for perceived responsiveness. Anything above 300ms is deliberate -- used for narrative, not for feedback. Anything above 800ms risks feeling sluggish unless it is explicitly cinematic.

**Distance-based scaling:** Carbon Design System's rule: "motion's duration should be dynamic based on the size of the animation; the larger the change in distance or size, the longer the animation takes." Formula: approximately 50ms per 10% of viewport traveled.

- Source: [Carbon Design System, Motion Overview](https://carbondesignsystem.com/elements/motion/overview/)
- Source: [Material Design, Duration & Easing](https://m1.material.io/motion/duration-easing.html)

---

### 4 The Three-Layer Depth Model

Interactive depth layers should not exceed three. More than three creates visual noise that the eye cannot parse during scroll:

| Layer | Role | Motion Speed | Interaction Level | Example |
|-------|------|-------------|-------------------|---------|
| **Foreground** | Content | 1.0x (normal scroll) | Fully interactive | Text, CTAs, forms, navigation |
| **Midground** | Decorative/structural | 0.5-0.7x | Hover-reactive or passively animated | Floating shapes, typographic elements, section dividers |
| **Background** | Ambient | 0.2-0.3x | Non-interactive | Gradients, grain textures, slow-moving particles, color shifts |

**Speed ratios that feel natural:** 0.3x background, 0.5x midground, 1.0x foreground. Differences of 0.2-0.5x between adjacent layers create convincing depth without motion sickness.

**The foreground-first rule:** Content (foreground) must remain legible and interactive at all times. If a midground or background element competes with content readability, remove it. Ambient layers exist to create atmosphere, never to demand attention.

- Source: [Clay Global, "Parallax Scrolling"](https://clay.global/blog/web-design-guide/parallax-scrolling)
- Source: [Sketch Blog, "What is a Parallax Effect?"](https://www.sketch.com/blog/what-is-a-parallax-effect/)

---

### 5 Motion Hierarchy: Primary, Secondary, Tertiary

Not all motion is equal. Every animated composition needs a clear hierarchy:

**Primary motion** is the core purposeful movement -- the thing the user is supposed to notice. A modal sliding in, a page transitioning, a hero element revealing. Primary motion gets the longest duration, the most prominent easing, and animates first.

**Secondary motion** is consequential -- it happens because of the primary motion. A card's shadow adjusting, text fading in after a container appears, a subtle bounce on landing. Secondary motion overlaps with primary, uses shorter duration, and should never upstage it.

**Tertiary motion** is atmospheric -- background particles adjusting, a gradient shifting, ambient elements reacting to scroll. Tertiary motion is continuous and subtle. If the user notices it consciously, it is too prominent.

**The hierarchy rule from Jedi Principles of UI Animation:** "Secondary actions should never detract attention from the primary ones." Ease-out objects you want people to notice (new UI elements), and let unimportant objects exit at top velocity with ease-in.

**Choreography sequencing rule (Carbon Design System):**
1. Most stable content loads first (header, static elements)
2. Primary content loads second (main information, hero)
3. Most important interactive element loads last (CTA, calculation result) -- to focus the user's attention where it matters

- Source: [Jedi Principles of UI Animation](https://medium.com/@fiorine/jedi-principles-of-ui-animation-10f26b52beec)
- Source: [Carbon Design System, Choreography](https://carbondesignsystem.com/elements/motion/choreography/)

---

### 6 The Stagger: Creating Visual Rhythm

Staggered animations -- elements appearing sequentially rather than simultaneously -- create rhythm and guide the eye. The rules:

**Delay sweet spot:** 50-200ms between elements. Below 50ms, elements appear simultaneous. Above 200ms, elements feel disconnected.

**Delay-to-duration ratio:** The stagger delay should be 30-70% of the individual element's animation duration. For a 300ms animation, stagger at 90-210ms.

**Direction matters:** Start position creates meaning:
- **Top-to-bottom:** Natural reading flow, content hierarchy
- **Left-to-right:** Narrative progression, timeline
- **Center-outward:** Ripple/expansion, drawing attention to center
- **Edge-inward:** Convergence, focusing

**Mathematical rhythm:** Use sine-wave distribution for organic feel rather than linear spacing. GSAP's `stagger.ease` can accelerate or decelerate the rhythm of start times, preventing mechanical uniformity.

**The rhythm principle:** Stagger creates comfort through predictability. Once you establish a stagger pattern in one section, maintain it throughout the page. Changing stagger patterns between sections signals a deliberate shift in energy, not inconsistency.

- Source: [GSAP Staggers Documentation](https://gsap.com/resources/getting-started/Staggers/)
- Source: [Motion.dev Stagger Documentation](https://motion.dev/docs/stagger)

---

### 7 The Locomotive Principle: Build from Scratch, Constraint Through Systems

Locomotive's main guideline has always been a "build from scratch" approach: technologies are reusable but projects should always start with a clean slate. Their case studies reveal a specific compositional method:

**Constraint through systems, not individual flourishes.** Instead of deciding animation per element, Locomotive defines:
- CSS custom properties for all spacing (`--gutter`, `--pad-inner`, `--innerWidth`)
- Fluid typography via `clamp()` that adapts without breakpoint jumps
- Exactly two transition durations: `.3s` for hover/simple states, `.6s` for complex reveals
- Z-index architecture mapped before development (modals: 15, overlays: 3, interactive: 1)
- Semantic color variables applied consistently -- hover states shift opacity/brightness, never introduce new colors

This means every element automatically inherits the same rhythm. Designers never decide "how fast should this hover be?" -- the system already answered that.

- Source: [Awwwards, "Locomotive Wins Site of the Month"](https://www.awwwards.com/locomotive-by-locomotive-wins-site-of-the-month-june-a-case-study.html)
- Source: [Awwwards, "Baillat Studio by Locomotive"](https://www.awwwards.com/case-study-baillat-studio-by-locomotive.html)

---

### 8 The Active Theory Principle: Scene-Graph Thinking

Active Theory's Hydra framework treats every project as a branching tree of scenes, each with its own graph hierarchy. A node within a graph could be another scene entirely. This architecture enforces composition:

**Designer-developer feedback loop:** Artists create and manipulate nodes (geometry + shader + position) via GUI. Developers add functionality and expose parameters back to the GUI. This prevents the "developer builds one thing, designer imagined another" problem.

**Scene containment:** Each section is its own self-contained scene with internal coherence. Transitions between scenes are explicit, designed moments -- not CSS class toggles. This ensures each section has its own internal logic while the transitions between them are choreographed as first-class design elements.

**Low-level control over high-level abstractions:** Active Theory deliberately maintains technology "as close to the OS/hardware as possible" rather than relying on third-party abstractions. This allows precise control over rendering order, compositing, and performance -- the building blocks of visual coherence.

- Source: [Active Theory, "The Story of Technology Built at Active Theory"](https://medium.com/active-theory/the-story-of-technology-built-at-active-theory-5d17ae0e3fb4)

---

### 9 The Emergence Workflow: Let One Effect Suggest the Next

A Codrops case study on a creative developer's WebGL portfolio reveals a critical creative process insight: do not plan all effects upfront. Instead:

1. **Start with one effect.** Build it in isolation without a predetermined purpose.
2. **Let it suggest the next.** A fold effect evolved into a screen portal, which prompted a character, which inspired morphing shapes.
3. **Apply thematic constraint.** Each section transforms the same core element (a screen-as-plane) differently based on a unifying metaphor -- home, projects, about, contact.
4. **Test structural transitions.** Animate the core element between sections; refine how it morphs from one purpose to another.
5. **Remove what does not serve coherence.** The developer rejected his original "centerpiece" effect during development, later reintroducing it as a subtle Easter egg.

**The key insight:** "Watching things reveal themselves organically, guiding the creative journey rather than dictating it from the start." Composition is emergent, not predetermined -- but constraint is applied retroactively and ruthlessly.

**Specific easing choices from this project:**
- `power3.out` / `expo.inOut` for portal transitions
- `back.out(1.2)` for letter morphing ("creates that satisfying bounce that makes letters feel like they're popping into place")
- `smoothstep()` in shaders for non-linear scroll intensity

- Source: [Codrops, "Letting the Creative Process Shape a WebGL Portfolio"](https://tympanus.net/codrops/2025/11/27/letting-the-creative-process-shape-a-webgl-portfolio/)

---

### 10 Val Head's Animation Design Language

Val Head (author of "Designing Interface Animation," speaker at An Event Apart) provides the framework for ensuring animation consistency across a project:

**Each animation tells a micro story.** As users encounter more animations, these micro stories accumulate to reveal brand personality. If the micro stories contradict each other (one bouncy, one rigid, one elastic), the brand feels incoherent.

**Two approaches to building an animation language:**
- **Bottom-up:** Audit all existing animations. Screen-record every interaction. Group by type and purpose. Extract patterns that work. Build guidelines from observed success.
- **Top-down:** Define brand personality traits first ("energetic," "calm," "decisive"). Map each trait to animation properties. Then evaluate every animation against those traits.

**Animation-to-personality mapping:**

| Brand Trait | Easing | Distance | Speed | Effects |
|------------|--------|----------|-------|---------|
| Energetic | Overshoots, follow-through | Large | Fast | Bounce, squash-stretch |
| Playful/Friendly | Squash-stretch, bouncy | Medium-large | Varied | Elastic curves |
| Stable/Decisive | Standard ease-in-out | Moderate | Consistent | Clean, no overshoot |
| Calm/Premium | Opacity/blur changes | Small | Slow | Minimal positional motion |

**Real-world reference strategy:** IBM referenced typewriter mechanics and tape drive movements to inform their interface animations. Find a physical-world analog for your brand's motion and use it as a north star.

- Source: [Val Head, "Designing Interface Animation" (A List Apart)](https://alistapart.com/article/designing-interface-animation/)
- Source: [Val Head, "Web Animation in the Design Process" (Zeldman)](https://zeldman.com/2016/11/08/val-head-animation-style-guides-design-process/)

---

### 11 Composite Rendering: How Studios Layer Complex Scenes

When a creative website combines WebGL 3D, DOM-based UI, scroll effects, and shader transitions, they use composite rendering -- rendering scenes to off-screen textures first, then combining them:

**The two-scene pattern:** One scene renders content to a render target texture. A second scene displays that texture on plane geometry, applying effects and transitions. This isolates visual concerns and prevents one layer from breaking another.

**Transition coordination via shared uniforms:** `uFromTexture` and `uToTexture` references animate a `uTransition` parameter from 0 to 1, using `mix()` or `step()` in shaders for varied transition effects. This gives precise control over how two visual states blend.

**Consolidation over multiplication:** Rather than multiple render passes, consolidate post-processing into a single composite shader. This reduces GPU load, centralizes effect logic, and makes debugging manageable.

**Alpha channel preservation:** When applying blur, distortion, or color effects in a composite pass, explicitly preserve alpha channels. Moving effect logic into the composite shader prevents channel overwrites that cause visual artifacts at layer boundaries.

- Source: [Codrops, "Composite Rendering: The Brilliance Behind Inspiring WebGL Transitions"](https://tympanus.net/codrops/2026/02/23/composite-rendering-the-brilliance-behind-inspiring-webgl-transitions/)

---

### 12 The Immersive Garden Method: Modular Asset Pipeline

Immersive Garden (one of the most awarded studios globally) combines Three.js, GSAP, Lenis, Vue/Nuxt, and Blender/Houdini assets. Their composition method:

**Modular workflow:** Design is modular, allowing quick iterations across multiple model variations. Export is automated with gltf-transform and custom scripts. This means visual consistency is maintained at the asset level -- every 3D model, texture, and animation shares the same export pipeline and optimization settings.

**Tech stack coherence:** Three.js for rendering, GSAP for DOM/timeline animation, Lenis for scroll normalization. Each tool has exactly one responsibility. They never use GSAP for what Three.js should handle, or vice versa. Clear tool boundaries prevent conflicting animation systems from fighting each other.

**The backstage principle:** Their site includes a dedicated "backstage section" documenting technical breakdowns. This self-imposed documentation discipline forces clarity -- if you cannot explain why a technique is there, it probably should not be.

- Source: [Awwwards, "Immersive Garden Case Study"](https://www.awwwards.com/case-study-immersive-gardens-new-website.html)

---

### 13 The Darkroom Principle: Same Experience, Every Input

Darkroom Engineering's Lenis philosophy: "Smoothing the scroll pulls users into the flow of the experience that feels so substantial that they forget they're navigating a web page."

**Input normalization:** A compositionally cohesive site must feel the same whether the user is on a trackpad, mouse wheel, touch screen, or keyboard. Lenis provides this by normalizing all scroll inputs into a consistent, controllable velocity curve. Without this, the same scroll-driven animation feels jerky on mouse wheel and butter-smooth on trackpad -- destroying the illusion of coherence.

**The Lenis rule:** Before layering scroll-based effects, normalize the scroll input. Control how silky, heavy, or responsive the scroll feels as a foundational decision, not an afterthought. This is infrastructure, not decoration.

- Source: [Darkroom Engineering, Lenis](https://lenis.darkroom.engineering/)
- Source: [GitHub: darkroomengineering/lenis](https://github.com/darkroomengineering/lenis)

---

### 14 Disney's 12 Principles Applied to Web Composition

The 12 principles from Frank Thomas and Ollie Johnston's "The Illusion of Life" (1981) apply directly to composing interactive web experiences:

| Principle | Web Application | Compositional Rule |
|-----------|----------------|-------------------|
| **Anticipation** | Hover states preview what clicking will do | Every interactive element must telegraph its behavior before activation |
| **Staging** | Motion directs the eye to what matters | Only one element should demand attention at any moment; everything else is subordinate |
| **Follow-Through** | Elements settle after movement (slight overshoot, then rest) | Stopping abruptly signals mechanical failure; always include a settling phase |
| **Overlapping Action** | Sub-elements move at slightly different rates | A card's shadow, text, and image should not move in perfect lockstep |
| **Slow In / Slow Out** | Easing curves on all motion | Nothing in a premium interface starts or stops instantaneously |
| **Arcs** | UI elements follow curved paths, not straight lines | Organic interfaces use arcs; only mechanical/robotic interfaces use linear paths |
| **Secondary Action** | Background responds to primary interaction | Primary motion drives attention; secondary motion confirms the world is alive |
| **Timing** | Duration communicates importance | Important animations get more time; routine interactions are fast |
| **Exaggeration** | Subtle amplification of state changes | A toggle does not just flip -- it stretches slightly, communicating effort |
| **Squash and Stretch** | Elements deform slightly under motion | Communicates material weight -- is your UI made of glass, rubber, or paper? |

**The staging rule is paramount for composition:** "A well-staged animated transition directs the user's eye to exactly where it needs to be." If two elements compete for attention simultaneously, the composition fails regardless of how beautiful each individual animation is.

- Source: [IxDF, "UI Animation: Disney's 12 Principles Applied to UI Design"](https://ixdf.org/literature/article/ui-animation-how-to-apply-disney-s-12-principles-of-animation-to-ui-design)
- Source: [Dribbble, "Applying Disney's Principles to UI Design"](https://dribbble.com/stories/2020/07/27/disney-principles-of-animation-ui-interactions)

---

### 15 Material Design & Carbon: The Two-Mode Motion Model

Both Google (Material Design 3) and IBM (Carbon Design System) use a productive/expressive duality:

**Productive motion** is fast, functional, minimal. For frequent interactions -- toggles, dropdowns, data table sorting. Duration: 100-300ms. Easing: standard `cubic-bezier(0.4, 0, 0.2, 1)`.

**Expressive motion** is slower, emotional, delightful. For infrequent moments -- onboarding, success celebrations, first-time interactions. Duration: 300-500ms+. Easing: more dramatic curves with acceleration emphasis.

**The rule:** Classify every animation as productive or expressive before implementing it. Productive animations should feel invisible -- they serve comprehension. Expressive animations should feel intentional -- they serve emotion. Mixing the two modes within the same interaction feels incoherent.

**Carbon's stagger choreography rule:** When expanding or moving elements across the screen, stagger the timing of horizontal and vertical animations to create a path with a rounded corner rather than moving in a straight diagonal line.

**Material Design's focal point rule:** Maintain a clear focal point during transitions by carefully selecting the number and type of elements shared across transitions. New surfaces should emerge from the element or action that creates them, usually via radial or rectangular expansion from the point of touch.

- Source: [Material Design 3, Easing and Duration](https://m3.material.io/styles/motion/easing-and-duration/tokens-specs)
- Source: [Carbon Design System, Motion](https://carbondesignsystem.com/elements/motion/overview/)
- Source: [Google Design, "Making Motion Meaningful"](https://design.google/library/making-motion-meaningful)

---

### 16 Apple's Motion Discipline: When NOT to Animate

Apple's Human Interface Guidelines provide the counterweight to creative exuberance:

**Do not add motion to frequent interactions.** The system already provides subtle animations for standard elements. Adding custom animation on top creates visual noise.

**Do not add motion for the sake of motion.** "Gratuitous or excessive animation can distract people or make them feel disconnected, especially in an app that doesn't provide an immersive experience."

**Timing guidance:** Simple transitions: 200-300ms. Animations requiring comprehension: 300-500ms. Anything shorter feels jarring; anything longer feels sluggish.

**Physics must be believable.** "Motion that doesn't make sense -- or appears to defy physical laws -- can make people feel disoriented." If an element slides in from the left, it should exit to the left. If gravity pulls something down, it should not float upward without cause.

**The directional consistency rule:** Motion should flow in consistent directions within a section. If elements enter from left, they exit left. If content reveals top-to-bottom, it dismisses bottom-to-top. Mixing directions within the same interaction context creates spatial confusion.

- Source: [Apple Human Interface Guidelines, Motion](https://developer.apple.com/design/human-interface-guidelines/motion)

---

### 17 The Pre-Ship Composition Checklist

Before declaring an interactive composition complete, verify:

| # | Check | Pass Criteria |
|---|-------|---------------|
| 1 | **Easing consistency** | All animations use curves from your defined family of 3-4 easings |
| 2 | **Duration scale** | Every duration maps to a named token (t1-t5), no arbitrary ms values |
| 3 | **Depth layers** | Maximum 3 interactive depth layers (foreground, midground, background) |
| 4 | **Motion hierarchy** | Every section has clear primary, secondary, tertiary motion |
| 5 | **Staging** | Only one element demands attention at any given moment |
| 6 | **Directional consistency** | Motion flows in consistent directions within each section |
| 7 | **Stagger rhythm** | Staggers use 50-200ms delays at 30-70% of element duration |
| 8 | **Origin awareness** | Elements animate from contextually relevant locations, not center |
| 9 | **Interruptibility** | All animations can be smoothly interrupted mid-sequence |
| 10 | **Scroll normalization** | Scroll input is normalized across devices (trackpad, wheel, touch) |
| 11 | **Productive vs expressive** | Every animation is classified and consistent within its category |
| 12 | **Performance** | Only `transform` and `opacity` animated; 60fps on mid-range devices |
| 13 | **Reduced motion** | `prefers-reduced-motion` respected with functional fallbacks |
| 14 | **Brand coherence** | Animation personality matches brand traits consistently |
| 15 | **Restraint** | Removing any single effect would noticeably diminish the experience |

**The final test (rule 15):** If you can remove an animated effect and nobody notices, it should not have been there. Every effect must earn its place. As Resn demonstrates: "Nothing on this page was wasted, every pixel of space had intent."

---

### 18 The Composition Mindset: Summary of Hard Rules

These are the non-negotiable rules distilled from the research above. Reference them when composing any interactive web experience:

1. **Three easing curves maximum.** One entrance (ease-out), one exit (ease-in), one traversal (ease-in-out). Optional fourth for spring effects. Never use CSS defaults.

2. **Five duration tokens.** Map every animation to t1 (80-100ms) through t5 (600-800ms). No arbitrary millisecond values. UI feedback stays under 300ms.

3. **Three depth layers maximum.** Foreground (content, 1.0x), midground (decorative, 0.5x), background (ambient, 0.3x). Never let midground or background compete with foreground.

4. **One focal point per moment.** Staging dictates that only one element should demand attention at any given time. If two elements compete, the composition fails.

5. **Consistent motion direction.** If elements enter from left, they exit left. If content reveals downward, it dismisses upward. Never mix directions within the same context.

6. **Stagger at 30-70% of duration.** For a 300ms animation, stagger elements at 90-210ms. Below 50ms feels simultaneous. Above 200ms feels disconnected.

7. **Productive or expressive, never both.** Classify each animation. Productive: fast, invisible, functional. Expressive: slower, emotional, intentional. Do not mix within the same interaction.

8. **Systems over decisions.** Define spacing, color, timing, and z-index as system variables before building. Every element inherits rhythm from the system, not from individual choices.

9. **Each tool has one job.** Three.js renders. GSAP animates timelines. Lenis normalizes scroll. CSS handles hover states. Never use two tools for the same concern.

10. **Earn every effect.** If removing an animation would go unnoticed, remove it. Restraint is what separates premium from chaotic.

