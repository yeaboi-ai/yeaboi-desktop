# Tools & Component Libraries

> Use tools for structure, then customize for identity. Never ship defaults.

---

## Quick ref

- **When to load:** when you need to pick a library/framework, or verify one against quality criteria.
- shadcn/ui = primitives for marketing + app. Copy/own the code, not install.
- Once UI = design-system-first alternative with better theming.
- Magic UI / Aceternity UI = pre-animated marketing components. Use 1–2 effects max per page, not every section.
- GSAP + ScrollTrigger = industry standard for complex scroll animation.
- Lenis = smooth scroll; Barba.js = page transitions (multi-page).
- Framer Motion / Motion = React-idiomatic animation.
- Tailwind 4 = CSS-in-CSS; arbitrary values with `[]`.
- Do NOT ship any library's defaults. Customize every token.

---

## Decision Matrix

| Need | Tool | When to Use |
|------|------|------------|
| Accessible component primitives | **shadcn/ui** | Most projects. Best starting point for React/Next.js. |
| Community component marketplace | **21st.dev** | Curated, polished shadcn-based components. Browse before building from scratch. |
| Animated UI effects | **Magic UI** | Landing pages, marketing sites. Adds motion to shadcn components. |
| Full design system with tokens | **Once UI** | Next.js projects where you want one config to control everything. |
| Claude frontend skill | **frontend-design** | When building interfaces in Claude Code. Invoke for creative, non-generic output. |
| Award-winning animation | **GSAP + ScrollTrigger** | Scroll-driven experiences, page transitions, complex sequences. |
| Smooth scrolling | **Lenis** | Sites needing smooth scroll feel (portfolios, storytelling). |
| 3D on web | **React Three Fiber / Spline** | Product visualization, immersive portfolios. |

---

## shadcn/ui

### What It Is

Copy-paste component library built on Radix UI primitives. Not a package — you own the code.

### How to Use with This Design Library

1. **Install components** you need: `npx shadcn@latest add button card dialog`
2. **Immediately override tokens** in your `globals.css` or `tailwind.config`:
   - Replace default purple/blue with your brand colors
   - Replace default border-radius with your chosen radius (8px, 12px, or 16px — pick ONE)
   - Replace default fonts
3. **Never ship the default shadcn theme.** It's recognizable. The defaults are a starting point.

### Token Customization (Critical)

```css
/* Override in globals.css */
@layer base {
  :root {
    --radius: 0.75rem;         /* Your border radius */
    --primary: 220 14% 10%;    /* Your brand, not shadcn default */
    --primary-foreground: 0 0% 98%;
    --accent: 25 95% 53%;      /* Your accent */
    --muted: 220 14% 96%;
    --border: 220 13% 91%;
  }
  .dark {
    --primary: 0 0% 98%;
    --background: 240 10% 4%;  /* Your dark bg, not default */
    --card: 240 10% 6%;
    --border: 240 10% 14%;
  }
}
```

### shadcn MCP Integration

When building in Claude Code, use the shadcn MCP tools:

- `get_project_registries` — discover available component registries
- `list_items_in_registries` — browse available components
- `search_items_in_registries` — find specific components
- `view_items_in_registries` — see component code and usage
- `get_add_command_for_items` — get install commands
- `get_audit_checklist` — verify implementation quality
- `get_item_examples_from_registries` — see usage examples

**Workflow:** Search → view examples → install → customize tokens → verify with audit checklist.

---

## 21st.dev

### What It Is

Community marketplace of curated, production-quality React components built on shadcn/ui + Tailwind + Radix. Think "npm for design engineers." Components are reviewed and must pass quality standards (a11y, dark/light theme, TypeScript, responsive) before being featured.

### How It Differs from shadcn/ui

shadcn gives you **primitives** (button, card, dialog). 21st.dev gives you **composed components** — polished, opinionated UI blocks built FROM shadcn primitives by the community. A shadcn button is unstyled. A 21st.dev hero section is a complete, reviewed, production-ready block.

| | shadcn/ui | 21st.dev |
|---|---|---|
| Source | One maintainer (shadcn) | Community contributors, reviewed by founder |
| Components | Primitives (button, input, dialog) | Composed blocks (hero sections, pricing cards, navbars) |
| Quality gate | None (copy-paste) | Manual review: a11y, themes, TypeScript, responsive |
| Previews | Code only | Live preview + video demos |
| Discovery | Docs page list | Searchable marketplace with categories |

### How to Install Components

Same CLI as shadcn — components install directly into your project:

```bash
# Install a specific component from 21st.dev
npx shadcn@latest add "https://21st.dev/r/username/component-name"
```

The command downloads the component code + dependencies, creates files, and updates your Tailwind config if needed.

### When to Use

- **Before building a common pattern from scratch** — check 21st.dev first. Someone may have already built a polished version of that pricing table, testimonial carousel, or hero section.
- **When you need a composed block**, not just a primitive — a complete feature card with image, badge, title, description, and CTA, not just a Card component.
- **For inspiration** — browse the marketplace to see how other engineers compose shadcn primitives into production UI.

### When NOT to Use

- Don't install a 21st.dev component and ship it unmodified. **Always customize tokens** (colors, fonts, radius, spacing) to match your project's identity.
- Don't use it as a substitute for design thinking — it's components, not a design system. The harness and playbook files still drive the overall design direction.

### Integration with This Library

1. Choose your recipe + personality from `HARNESS.md`
2. Set up your project's design tokens (colors, fonts, easing, durations)
3. Browse 21st.dev for components matching your needs
4. Install them via CLI
5. Override all visual tokens to match your project
6. Verify against `13-checklist.md`

---

## Magic UI

### What It Is

Animated components and effects designed to layer on top of shadcn/ui. Landing page focused.

### Key Components

- **Animated borders, gradients, glowing effects** for cards and buttons
- **Text animations** (typewriter, word rotate, blur reveal)
- **Background effects** (particles, grid patterns, aurora)
- **Scroll-triggered reveals**
- **Number tickers, counters**

### When to Use

- Landing pages and marketing sites
- Hero sections needing visual punch
- Feature showcases
- **NOT:** Dashboards, forms, utility pages (too much motion)

### Integration Pattern

```bash
# Magic UI components layer on shadcn
npx shadcn@latest add "https://magicui.design/r/shimmer-button"
npx shadcn@latest add "https://magicui.design/r/animated-beam"
```

### Caution

Magic UI components are eye-catching but can tip into the "AI-generic" aesthetic if overused. Use ONE hero effect, not five. Pair with distinctive typography and color to maintain identity.

---

## Once UI

### What It Is

Next.js-exclusive design system with 100+ components. Single-file token configuration. Optimized for AI code generation.

### Design Token System

```typescript
// once-ui.config.ts — ONE file controls everything
{
  theme: 'system',        // system | light | dark
  brand: 'cyan',          // primary brand color
  accent: 'orange',       // secondary accent
  neutral: 'gray',        // grayscale palette
  solid: 'contrast',      // interactive element appearance
  solidStyle: 'flat',     // rendering mode
  border: 'playful',      // border style
  surface: 'filled',      // fill treatment
  transition: 'all',      // animation scope
  scaling: '100%',        // size adjustment
}
```

### Semantic Color Tokens

```
brand-solid-strong, brand-background-strong, brand-weak
accent-solid-weak
neutral-on-background-strong, neutral-on-background-weak
success-background-strong
[color]-alpha-weak, [color]-alpha-medium
```

### Layout Primitives

```jsx
// Semantic composition — AI-friendly
<Row gap="m" vertical="center">
  <Column fillWidth>
    <Text variant="heading-xl">Title</Text>
    <Text variant="body-default-m">Description</Text>
  </Column>
  <Button variant="primary" size="m">Action</Button>
</Row>
```

### Why It's Good for AI

- Minimal syntax reduces hallucination risk
- Composable Row/Column/Grid makes layout reasoning explicit
- Single config file = one place to adjust for global theming
- Named parameters (`paddingX`, `fillWidth`) avoid ambiguity
- Lower token usage = more budget for logic

### When to Choose Over shadcn

- You want a complete system out of the box (not assembling pieces)
- Building with Next.js exclusively
- Want AI agents to generate consistent layouts quickly
- Prefer token-first over CSS-first customization

---

## Claude Frontend Design Skill

### What It Is

A Claude Code skill that generates distinctive, production-grade frontend interfaces. Invoke before building any UI.

### How to Invoke

```
/frontend-design
```

### What It Does

- Generates creative, polished code avoiding generic AI aesthetics
- Applies anti-pattern awareness (no purple gradients, no Inter, no identical card grids)
- Creates responsive, accessible components
- Produces distinctive visual identity per project

### Integration with This Library

The frontend-design skill and this design library are complementary:
- **This library** = the reference material (principles, patterns, code snippets)
- **The skill** = the execution engine (applies principles to specific tasks)

When building UI: invoke the skill AND reference relevant sections of this library for specific guidance (typography from 01, color from 02, etc.)

---

## GSAP + ScrollTrigger

### When to Use

- Scroll-driven animations (section reveals, parallax, pinning)
- Complex animation sequences
- Page transitions
- Timeline-based choreography

### Basic Setup

```javascript
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
gsap.registerPlugin(ScrollTrigger);

// Section reveal
gsap.from('.section', {
  opacity: 0,
  y: 60,
  duration: 1,
  ease: 'power3.out',
  scrollTrigger: {
    trigger: '.section',
    start: 'top 80%',
    toggleActions: 'play none none reverse',
  },
});

// Pinned scrollytelling
ScrollTrigger.create({
  trigger: '.story-container',
  pin: '.story-graphic',
  start: 'top top',
  end: 'bottom bottom',
});
```

### Reference Easing Curves

```javascript
// Locomotive's signature
gsap.to(el, { ease: 'cubic-bezier(0.215, 0.61, 0.355, 1)' });

// General high-quality
gsap.to(el, { ease: 'power3.out' });    // Fast start, gentle end
gsap.to(el, { ease: 'expo.out' });      // Snappy
gsap.to(el, { ease: 'back.out(1.7)' }); // Subtle overshoot
```

---

## Tool Combination Patterns

### Pattern A: SaaS Product (Most Common)

```
shadcn/ui (components) + Tailwind (styling) + Geist or custom font
→ Override all shadcn color tokens
→ Add Magic UI for landing page hero only
→ GSAP ScrollTrigger for scroll reveals
```

### Pattern B: Agency Portfolio

```
Custom components (no library) + GSAP + Lenis (smooth scroll)
→ Three.js or Spline for 3D elements
→ Custom easing curves throughout
→ Theme switching per project (Locomotive pattern)
```

### Pattern C: Dashboard / Data Product

```
shadcn/ui (tables, forms, cards) + Recharts or D3
→ Heavy token customization for dark theme
→ Monospace font for data
→ Minimal animation (stagger load only)
```

### Pattern D: Immersive Storytelling

```
Nuxt/Astro + GSAP ScrollTrigger + custom components
→ Scroll-driven narrative sections
→ Video + WebGL canvas layers
→ Split-text animations (OceanX pattern)
→ Chapter-based navigation
```

### Pattern E: Luxury / Brand

```
Astro (performance) + custom components + Storyblok CMS
→ Container queries for fluid typography (Aupale pattern)
→ Staggered clip-path reveals
→ 3 custom font families (display + body + mono)
→ Product-driven color system
```

---

## Anti-Patterns

- **Using Magic UI effects on every section** — one hero effect, not five
- **Shipping default shadcn theme** — always customize tokens
- **Using Once UI with non-Next.js** — it's Next.js exclusive
- **GSAP for simple hovers** — CSS transitions are cheaper and simpler
- **Multiple animation libraries** — pick one approach, not GSAP + Framer Motion + CSS
- **3D for utility pages** — Three.js on a settings page is absurd
