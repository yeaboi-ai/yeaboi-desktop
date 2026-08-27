# Components

> Every component should feel intentional. Default components from a library are a starting point, not a destination.

---

## Quick ref

- **When to load:** SaaS, dashboard, e-commerce, education, local-business, marketplace recipes.
- Start with shadcn/Once UI primitives; override every visual token (colour, radius, shadow, font).
- Design ALL states first: hover, focus, active, disabled, loading, empty, error, success.
- Button hierarchy: primary (one per viewport) / secondary / tertiary / danger.
- Dark mode = borders not shadows. Shadows read wrong on dark.
- Forms: single column, labels above, inline validation on blur.
- Empty states: icon + explanation + action. Never just "No data."
- Loading states: skeleton screens, not spinners. Match final layout shape.
- Tables: monospace numerics, right-align numbers, sticky headers, row hover.

---

## Component Philosophy

1. **Start with primitives, customize tokens.** Use shadcn/ui or Once UI for structure, but override every visual token (color, radius, shadow, font).
2. **Design states first.** Before the "happy path," design: hover, focus, active, disabled, loading, empty, error, success.
3. **Consistency through tokens, not copying.** Components should share design tokens but don't need identical structures.
4. **Every component earns its place.** If it doesn't serve a function, remove it.

---

## Buttons

### Hierarchy

Every page needs a clear button hierarchy:

```
Primary   → One per viewport. The main action. Bold, filled, brand color.
Secondary → Supporting actions. Outlined or ghost.
Tertiary  → Navigation, less important. Text-only with subtle hover.
Danger    → Destructive actions. Red, but not the loudest element.
```

### Craft Details

```css
.btn-primary {
  /* Not just background-color — consider the full feel */
  background: var(--accent);
  color: var(--accent-contrast);
  padding: 0.625rem 1.25rem;
  border-radius: 8px;
  font-weight: 500;
  font-size: 0.875rem;
  line-height: 1.25;
  letter-spacing: -0.01em;

  /* Transition — match Arc's consistent 150ms */
  transition: all 150ms ease;

  /* Hover — subtle scale, not just color change */
  &:hover {
    transform: scale(1.02);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  /* Focus — visible, accessible, not ugly */
  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* Active — press feedback */
  &:active {
    transform: scale(0.98);
  }

  /* Disabled — not just opacity */
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
  }
}
```

### DO NOT
- Use the same button style for every action
- Make buttons too large (max height ~44px for standard, ~52px for hero CTAs)
- Use bouncy/springy hover animations on buttons
- Put more than 2 CTAs in a hero section
- Use generic text: "Submit", "Click Here". Use action verbs: "Start free trial", "Get started"

### Announcement Pill

A small badge above the hero headline linking to latest feature/release. Used by Raycast ("Introducing Glaze"), Vercel, Liveblocks. Creates topical urgency without polluting the main headline.

```css
.announcement-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.8125rem;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--text-secondary);
  transition: background 200ms ease;
}

.announcement-pill:hover {
  background: rgba(255, 255, 255, 0.12);
}

/* Light mode variant */
.announcement-pill--light {
  background: var(--bg-raised);
  border: 1px solid var(--border);
  color: var(--text-default);
}

/* With arrow indicator */
.announcement-pill .arrow {
  transition: transform 200ms ease;
}
.announcement-pill:hover .arrow {
  transform: translateX(2px);
}
```

### Glassmorphic Button (Dark Heroes)

Used by Reflect and ToDesktop for hero CTAs on dark backgrounds. Gradient border via CSS mask, blur backdrop.

```css
.btn-glass {
  padding: 0.5rem 1rem;
  border-radius: 8px;
  color: var(--text-primary);
  background: rgba(60, 8, 126, 0.3);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  transition: all 0.45s cubic-bezier(.6,.6,0,1);
}

.btn-glass:hover {
  background: rgba(60, 8, 126, 0.5);
  border-color: rgba(255, 255, 255, 0.2);
}
```

### Hero Button Sizing

Hero CTAs are typically larger than in-page buttons:

```css
.btn-hero {
  padding: 0.75rem 1.5rem;        /* standard hero */
  font-size: 1rem;
  height: 48px;
}

.btn-hero--large {
  padding: 1rem 2rem;             /* premium hero (Joby, Span) */
  font-size: 1.125rem;
  height: 56px;
}

/* Joby-style text-slide hover */
.btn-slide {
  overflow: hidden;
  position: relative;
}
.btn-slide .text-default,
.btn-slide .text-hover {
  transition: transform 0.35s var(--ease-out-cubic);
}
.btn-slide:hover .text-default { transform: translateY(-100%); }
.btn-slide:hover .text-hover { transform: translateY(0); }
```

### Trending Easing Curves (2026)

From heroinspo analysis — the most common custom curves:

```css
:root {
  /* Reflect + ToDesktop shared curve — smooth deceleration */
  --ease-hero: cubic-bezier(.6,.6,0,1);

  /* Joby Aviation — crisp out-cubic */
  --ease-out-cubic: cubic-bezier(0.33, 1, 0.68, 1);

  /* Span — slight overshoot, playful */
  --ease-bounce: cubic-bezier(0.5, 0, 0, 1.25);
}
```

---

## Cards

### Standard Card

```css
.card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.5rem;
  transition: border-color 150ms ease;

  /* Hover — border brightens, NOT shadow on dark mode */
  &:hover {
    border-color: var(--border-hover);
  }
}
```

### Rules
- On dark backgrounds: borders, not shadows. Shadows look wrong on dark.
- Consistent border-radius across ALL cards (pick 8px, 12px, or 16px — one value)
- Consistent internal padding
- Cards should group related information — don't put unrelated content in one card
- Vary card sizes in grids (see bento layout in 03-layout.md)

---

## Navigation

### Sidebar (Products/Dashboards)
- Width: 14-16rem (narrow), dark background
- Icon + label links with clear active state (accent color or bright text + indicator)
- Collapsible on mobile
- Linear principle: sidebar dims after user reaches destination — secondary chrome doesn't compete

### Top Navigation (Marketing Sites)
- Fixed/sticky with blur background on scroll
- Logo left, nav links center or right, CTA far right
- Mobile: hamburger → slide-out menu (NOT a dropdown)
- Max 5-7 top-level items
- Raycast pattern: Store, Pro, AI, iOS, Windows — minimal

### Bottom Navigation (Mobile)
- 3-5 items maximum
- Icon + label (never icon-only for primary nav)
- Active state: filled icon + accent color
- 48px minimum touch target height

---

## Forms

### Layout Rules
- **Single column always.** Multi-column forms reduce completion by 15%.
- **Labels above fields**, not beside or inside (placeholder-as-label is an accessibility failure)
- **Group related fields** with subtle section dividers
- **Progressive disclosure** — don't show all fields at once if there are many

### Input Fields

```css
.input {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.625rem 0.75rem;
  font-size: 0.875rem;
  color: var(--text-default);
  transition: border-color 150ms ease;

  &::placeholder {
    color: var(--text-dim);
  }

  &:focus {
    border-color: var(--accent);
    outline: none;
    box-shadow: 0 0 0 3px var(--accent-dim);
  }

  &[aria-invalid="true"] {
    border-color: var(--semantic-negative);
    box-shadow: 0 0 0 3px var(--semantic-negative-dim);
  }
}
```

### Validation
- **Inline validation on blur**, not on every keystroke
- Error messages below the field, in red, with icon
- Success state: green border + checkmark (brief, then return to normal)
- Never clear the form on error — preserve user input

---

## Modals / Dialogs

- **Backdrop:** Dark overlay (rgba(0,0,0,0.5)) with blur
- **Animation:** Scale from 0.95 + fade in, 200ms ease-out
- **Close:** X button top-right + Escape key + click outside
- **Focus trap:** Tab cycles within modal, focus returns to trigger on close
- **Max width:** 480px for confirmations, 640px for forms, 800px for content
- **Mobile:** Full-screen or bottom sheet, not centered float

---

## Status Indicators

```css
/* Pulsing dot — live/active/connected */
.status-live::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--semantic-positive);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* Static dot — state indicator */
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.status-dot--healthy { background: var(--semantic-positive); }
.status-dot--error { background: var(--semantic-negative); }
.status-dot--warning { background: var(--semantic-warning); }
.status-dot--inactive { background: var(--text-dim); }
```

### Badges
Use dim background + colored text, not solid background. Solid badges dominate; dim badges inform.

```css
.badge {
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
}

.badge--success {
  background: var(--semantic-positive-dim);
  color: var(--semantic-positive);
}
```

---

## Empty States

Dashboards and apps hit empty states constantly. Design them well:

```
┌─────────────────────────────┐
│         📊 (icon)           │
│                             │
│   No data yet               │  ← heading font
│                             │
│   Connect a data source to  │  ← dim text
│   see metrics appear here.  │
│                             │
│   [Connect source]          │  ← action button
└─────────────────────────────┘
```

- Contextual icon (not generic)
- Short explanation in heading font
- Dimmer description of what would appear or how to fix it
- Action button if applicable
- **Never just "No data."** — that tells the user nothing

---

## Loading States

- **Skeleton screens** that match final layout shape (not generic spinners)
- Subtle shimmer animation (left-to-right gradient sweep)
- Staggered appearance (cards appear 50ms apart)
- Keep layout stable — no content shift when data loads (CLS = 0)

```css
.skeleton {
  background: linear-gradient(
    90deg,
    var(--bg-surface) 0%,
    var(--bg-raised) 50%,
    var(--bg-surface) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: 8px;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

---

## Tables (Dashboard Backbone)

```css
.table {
  width: 100%;
  border-collapse: collapse;
}

.table th {
  text-align: left;
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-dim);
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  background: var(--bg-surface);
}

.table td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
  font-size: 0.875rem;
}

/* Numeric columns — always monospace, right-aligned */
.table td.numeric {
  font-family: var(--font-mono);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.table tr:hover td {
  background: var(--bg-raised);
}

/* Sort indicator */
.table th[data-sort]::after {
  content: '↕';
  margin-left: 0.25rem;
  opacity: 0.3;
}
.table th[data-sort="asc"]::after { content: '↑'; opacity: 1; }
.table th[data-sort="desc"]::after { content: '↓'; opacity: 1; }
```

Rules:
- Monospace for ALL numeric columns
- Right-align numbers, left-align text
- Row hover highlighting
- Sticky headers on scroll
- Zebra striping OR borders, not both
- Compact but not cramped (0.75rem vertical padding)
