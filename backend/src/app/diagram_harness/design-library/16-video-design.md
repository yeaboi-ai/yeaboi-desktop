# Video Design: Programmatic Video Production with Remotion

> Principles, patterns, and specific values for creating high-quality SaaS product demo videos using Remotion (React-based video framework). Compiled from award-winning SaaS videos (Linear, Stripe, Figma), motion design research, and Remotion API documentation.

---

## Quick ref

- **When to load:** specifically when producing a product demo video or marketing motion piece. NOT for general UI/UX work.
- Remotion is React → MP4. Values go through frame numbers, not milliseconds.
- Typical product demo: 30–60s, 30–60fps, 1920×1080.
- Structure: hook (3–5s) → build (15–30s) → payoff (3–5s) → CTA (2–3s).
- Audio: voiceover + subtle music. Never music only.
- Typography: motion-friendly (heavy weights read on small screens).
- Easing: soft eases (out-cubic) for UI; snap for cuts.
- Avoid AI's tells: generic kinetic type, unmotivated parallax, "every element animates".

---

## The Problem with AI-Generated Video

Same patterns as AI-generated websites: generic compositions, flat layouts, no visual depth, amateur timing. The tells:
- Uniform spacing with no rhythm variation
- Spring animations with default configs on everything
- Text overlapping or poorly positioned
- No depth layers (everything on one flat plane)
- No breathing room between scenes
- Generic dark background with gold accent (the video equivalent of purple buttons)

---

## Core Principles

### 1. Pacing is Everything
A 30-second video at wrong pacing feels longer than a 90-second video at right pacing. The formula:

| Section | % of Total | For 30s (900fr) | For 60s (1800fr) |
|---------|-----------|-----------------|-------------------|
| Hook | 15% | 0-4.5s (0-135fr) | 0-9s (0-270fr) |
| Core message | 55% | 4.5-21s (135-630fr) | 9-42s (270-1260fr) |
| CTA/closing | 30% | 21-30s (630-900fr) | 42-60s (1260-1800fr) |

**Beat pattern:** Alternate fast sections (2-3s scenes) with slow holds (5-8s). Never maintain one pace throughout.

### 2. Three-Layer Depth
Every frame should have depth, not flat planes:

| Layer | Speed | Opacity | Blur | Content |
|-------|-------|---------|------|---------|
| Background | 0.3x | 0.03-0.08 | 0-4px | Gradient orbs, grain, subtle shapes |
| Midground | 0.6x | 0.15-0.4 | 0px | Decorative elements, grids, lines |
| Foreground | 1.0x | 1.0 | 0px | Text, UI mockups, primary content |

### 3. Typography Scale (1920x1080)

| Element | Size | Weight | Tracking | Line Height |
|---------|------|--------|----------|-------------|
| Hero headline | 80-120px | 300-400 | -0.04em | 0.9-0.95 |
| Section headline | 48-72px | 300-400 | -0.03em | 1.0-1.1 |
| Subheadline | 28-36px | 200-300 | -0.01em | 1.3 |
| Body text | 20-24px | 300 | 0em | 1.6 |
| Labels/mono | 12-14px | 400-500 | 0.15-0.25em | 1.4 |

**Font pairing for video:** Display serif (headlines) + geometric sans (body) + monospace (labels). Never use system-ui — it renders differently across machines during Remotion render.

### 4. Safe Areas (1920x1080)

| Zone | Margins |
|------|---------|
| Title safe | 192px sides, 108px top/bottom |
| Action safe | 96px sides, 54px top/bottom |

Never place important content outside title safe. Labels and secondary elements can extend to action safe.

### 5. Spacing System (8pt Grid)

| Token | Pixels | Use |
|-------|--------|-----|
| xs | 8 | Tight inline |
| sm | 16 | Related elements |
| md | 24-32 | Component gaps |
| lg | 48 | Section dividers |
| xl | 64-80 | Major sections |
| 2xl | 96-120 | Hero padding |

---

## Animation Reference

### Spring Configs (Remotion)

| Intent | damping | stiffness | mass | Character |
|--------|---------|-----------|------|-----------|
| Professional entrance | 200 | 100 | 1 | No overshoot, clean |
| Crisp pop | 200 | 200 | 0.5 | Fast, sharp |
| Logo/brand reveal | 100 | 200 | 1 | Crisp with minimal bounce |
| Gentle float | 15 | 60 | 1 | Slow, organic |
| Heavy/dramatic | 15 | 80 | 2 | Weighty, cinematic |
| Playful bounce | 10 | 100 | 1 | Noticeable overshoot |

### Easing Curves (for interpolate())

| Name | Bezier | Best For |
|------|--------|----------|
| easeOutCubic | (0.33, 1, 0.68, 1) | Standard entrance |
| easeInOutQuart | (0.76, 0, 0.24, 1) | Cinematic transitions |
| easeOutExpo | (0.16, 1, 0.3, 1) | Snappy stop |
| easeOutBack | (0.34, 1.56, 0.64, 1) | Playful arrival |
| easeInOutCubic | (0.65, 0, 0.35, 1) | Professional scene changes |

### Stagger Timing
- Related items: 6-10 frame delay
- Sequential reveal: 8-12 frame delay
- Character-by-character: 1-2 frame delay
- Word-by-word: 3-5 frame delay

### Transition Durations
- Fast (energetic): 10-15 frames
- Medium (professional): 15-25 frames
- Slow (cinematic): 25-40 frames
- Never exceed 40 frames

### Text Display Minimums
- After animation settles: hold for 1s minimum (30 frames)
- Short phrase (< 15 chars): hold 1.5s (45 frames)
- Full sentence: hold 2.5s+ (75+ frames)

---

## Visual Effects

### Glow (CSS-in-Remotion)

```css
/* Subtle element glow */
box-shadow: 0 0 40px rgba(accent, 0.15), 0 0 80px rgba(accent, 0.05);

/* Text glow */
text-shadow: 0 0 20px rgba(accent, 0.3), 0 0 40px rgba(accent, 0.1);

/* Strong accent glow */
box-shadow: 0 0 60px rgba(accent, 0.25), 0 0 120px rgba(accent, 0.08);
```

### Depth & Atmosphere
- **Gradient orbs:** Radial gradients at 400-800px, opacity 0.03-0.10, blurred 40-80px
- **Noise/grain:** Random pixel overlay at 0.04-0.08 intensity, animated per frame
- **Vignette:** Radial gradient from transparent center to rgba(0,0,0,0.4) edges
- **Grid lines:** 1px lines at 0.02-0.04 opacity for spatial reference
- **Scan lines:** Horizontal lines at 1px with 0.02 opacity for retro/tech feel

### Color Grading for Dark Product Videos

| Element | Hex | Usage |
|---------|-----|-------|
| Deep bg | #08080a or #0a0a0a | Main background |
| Surface | #111114 | Cards, panels |
| Elevated | #1a1a1f | Hover states, highlights |
| Primary text | #e8e8e8 | Headlines |
| Secondary text | #888 | Descriptions |
| Muted text | rgba(255,255,255,0.3) | Labels, timestamps |
| Accent | Project-specific | CTAs, highlights |
| Success | #4ade80 | Positive states |
| Warning | #f59e0b | Attention states |
| Error | #f43f5e | Negative states |

---

## Scene Archetypes

### 1. Title Card
- Centered or left-aligned hero text
- Background: gradient orbs + grain
- Mono label above headline
- Subtitle below with delayed entrance
- Accent line or divider element
- Duration: 90-150 frames (3-5s)

### 2. Product Showcase (Split)
- Left: copy (headline + description)
- Right: product mockup with shadow/glow
- Mockup enters with scale + slight rotation
- Copy enters with staggered text reveal
- Duration: 120-180 frames (4-6s)

### 3. Feature Walkthrough
- Full-width mockup (browser/phone frame)
- Animated cursor showing interaction
- Callout labels appearing sequentially
- Highlight glow on active areas
- Duration: 150-240 frames (5-8s)

### 4. Stats/Social Proof
- 3-4 stat cards with count-up animation
- Use tabular-nums for number stability
- Stagger card entrances
- Duration: 90-120 frames (3-4s)

### 5. CTA/Closing
- Centered layout, maximum breathing room
- Text enters slowly (dramatic timing)
- Button/CTA with glow pulse
- Tagline or URL below
- Duration: 90-120 frames (3-4s)

---

## Composition Structure (Remotion)

```
Root
├── Composition (id, fps, dimensions, duration)
│   └── TransitionSeries
│       ├── Scene 1 (Title Card) — 120fr
│       ├── Transition (fade, 15fr)
│       ├── Scene 2 (Problem) — 90fr
│       ├── Transition (slide, 12fr)
│       ├── Scene 3 (Solution Demo) — 180fr
│       ├── Transition (fade, 15fr)
│       ├── Scene 4 (Features) — 150fr
│       ├── Transition (fade, 15fr)
│       └── Scene 5 (CTA) — 120fr
```

### Per-Scene Structure
```
Scene (AbsoluteFill)
├── Background Layer (orbs, grain, grid)
├── Midground Layer (decorative elements)
├── Foreground Layer
│   ├── Sequence (from=0) → Mono label
│   ├── Sequence (from=10) → Headline
│   ├── Sequence (from=25) → Subtitle
│   └── Sequence (from=40) → Supporting content
└── Overlay Layer (vignette, scan lines)
```

---

## Production Checklist

### Visual Quality
- [ ] No content outside title safe (192px margins)
- [ ] Three depth layers in every scene (bg, mid, fg)
- [ ] Consistent spacing on 8pt grid
- [ ] Font sizes minimum 20px for any readable text
- [ ] Gradient orbs/atmospheric elements in background
- [ ] Vignette on every scene
- [ ] Film grain overlay (subtle, 0.04-0.06 intensity)

### Animation Quality
- [ ] No default spring configs — all intentional
- [ ] Stagger delays between related elements
- [ ] Text holds for 1s+ after animation settles
- [ ] Breathing room between scenes (no rapid-fire)
- [ ] Easing family consistent throughout (pick one: cubic, expo, or quart)
- [ ] Exit animations before transitions (elements leave, don't just cut)

### Pacing
- [ ] Hook in first 3-5 seconds
- [ ] Pace varies — fast sections + slow holds
- [ ] Total duration matches format (30s social, 60-90s demo)
- [ ] CTA holds long enough to register (2s minimum)

### Technical
- [ ] Render at 30fps, 1920x1080
- [ ] No CSS transitions (flicker during render) — use useCurrentFrame
- [ ] All animations driven by frame, not time
- [ ] extrapolateRight: "clamp" on all interpolate calls
- [ ] AbsoluteFill for all layers (no vertical stacking)
