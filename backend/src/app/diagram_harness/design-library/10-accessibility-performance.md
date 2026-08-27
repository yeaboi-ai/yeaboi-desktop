# Accessibility & Performance

> Accessibility is ergonomics for everyone. Performance is invisible UX.

---

## Quick ref

- **When to load:** e-commerce, local-business, dev-docs recipes. Also relevant for any utility/admin interface.
- WCAG contrast: 4.5:1 body text, 3:1 large text, 3:1 UI elements.
- Keyboard nav must work for all interactive elements. Skip-to-content as first focus.
- Semantic HTML: `button`, `nav`, `main`, `article`, `section`, `aside`. No div soup.
- `aria-live` for dynamic content. ARIA labels on icon-only controls.
- Focus trap in modals, Escape closes.
- Colour NEVER alone conveys information — pair with icon or text.
- Core Web Vitals targets: LCP <2.5s, INP <200ms, CLS <0.1.
- Fonts: WOFF2, preload, `font-display: swap`.
- Code-split by route; defer third-party scripts.
- Sub-3s load on 3G. Critical CSS inlined.

---

## Accessibility

### Keyboard Navigation

Every interactive element must be reachable and operable via keyboard:

- **Tab order** follows visual order (don't use `tabindex` > 0)
- **Focus styles** must be visible. Never `outline: none` without a replacement.
- **Skip links:** First focusable element should be "Skip to main content"
- **Focus trapping:** Modals trap focus inside. Tab cycles within the dialog, not behind it.
- **Escape key** closes modals, dropdowns, overlays
- **Arrow keys** navigate within components (tabs, menus, radio groups)
- **Enter/Space** activates buttons and links

```css
/* Visible focus — accessible AND designed */
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 4px;
}

/* Remove default outline only when focus-visible handles it */
:focus:not(:focus-visible) {
  outline: none;
}
```

### Screen Reader Patterns

```html
<!-- Announce dynamic content changes -->
<div aria-live="polite" aria-atomic="true">
  3 results found
</div>

<!-- Label icon-only buttons -->
<button aria-label="Close dialog">
  <svg>...</svg>
</button>

<!-- Describe complex controls -->
<input
  aria-describedby="password-hint"
  aria-invalid="true"
  aria-errormessage="password-error"
/>
<p id="password-hint">Must be 8+ characters</p>
<p id="password-error" role="alert">Password is too short</p>

<!-- Mark decorative images -->
<img src="decoration.svg" alt="" role="presentation" />

<!-- Semantic landmarks -->
<nav aria-label="Main navigation">...</nav>
<main>...</main>
<aside aria-label="Related content">...</aside>
```

### Color and Contrast

- **4.5:1** contrast ratio for body text (WCAG AA)
- **3:1** for large text (18px+ bold or 24px+ regular)
- **3:1** for UI components and graphical objects
- **Never use color alone** to convey information. Color-blind users need a secondary indicator (icon, pattern, label).
- Test with tools: WebAIM Contrast Checker, Stark plugin

### Reduced Motion

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

### Semantic HTML

```html
<!-- NOT this -->
<div class="button" onclick="submit()">Submit</div>
<div class="nav">
  <div class="nav-item">Home</div>
</div>

<!-- THIS -->
<button type="submit">Submit</button>
<nav aria-label="Main">
  <a href="/">Home</a>
</nav>
```

Use semantic elements: `<button>`, `<nav>`, `<main>`, `<article>`, `<section>`, `<aside>`, `<header>`, `<footer>`, `<dialog>`, `<details>`, `<summary>`. No div soup.

### ARIA Checklist

- [ ] All images have `alt` text (or `alt=""` for decorative)
- [ ] All form inputs have associated `<label>` elements
- [ ] Interactive elements have visible focus styles
- [ ] `aria-live` regions for dynamic content updates
- [ ] `aria-expanded` on toggleable elements (accordions, dropdowns)
- [ ] `aria-current="page"` on active navigation links
- [ ] `role="alert"` on error messages
- [ ] Skip-to-content link as first focusable element
- [ ] Custom 404 page exists and is helpful

---

## Performance

### Core Web Vitals Targets

| Metric | Good | What It Measures |
|--------|------|-----------------|
| **LCP** (Largest Contentful Paint) | < 2.5s | Loading speed of main content |
| **INP** (Interaction to Next Paint) | < 200ms | Responsiveness to user input |
| **CLS** (Cumulative Layout Shift) | < 0.1 | Visual stability during load |

### Loading Strategy

```
1. Critical CSS inlined in <head>
2. Above-fold content rendered first (SSR/SSG)
3. Fonts: font-display: swap + preload critical fonts
4. Images: lazy loading below fold, explicit width/height (prevents CLS)
5. JavaScript: defer non-critical, code-split by route
6. Third-party scripts: load after main content (analytics, chat widgets)
```

### Image Optimization

```html
<!-- Modern responsive image with format fallbacks -->
<picture>
  <source srcset="hero.avif" type="image/avif" />
  <source srcset="hero.webp" type="image/webp" />
  <img
    src="hero.jpg"
    alt="Description"
    width="1200"
    height="630"
    loading="lazy"
    decoding="async"
  />
</picture>
```

- **AVIF** > WebP > JPEG for photos (30-50% smaller than WebP)
- **SVG** for icons, logos, illustrations
- **Always set width/height** attributes to prevent CLS
- **Lazy load** everything below the fold
- **Responsive sizing** via `srcset` and `sizes`

### Font Loading

```css
/* Preload critical fonts */
<link rel="preload" href="/fonts/main.woff2" as="font" type="font/woff2" crossorigin />

@font-face {
  font-family: 'MyFont';
  src: url('/fonts/main.woff2') format('woff2');
  font-display: swap;    /* Show fallback immediately, swap when loaded */
  font-weight: 100 900;  /* Variable font — one file for all weights */
}
```

Rules:
- WOFF2 format only (best compression)
- `font-display: swap` to prevent invisible text
- Variable fonts reduce requests (one file for all weights)
- Preload the primary font only (not every variant)
- Subset fonts if only using Latin characters

### Skeleton Loading

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
  border-radius: inherit;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

Skeleton screens feel 20-30% faster than spinners because they set spatial expectations.

### Optimistic UI

Show success immediately, handle failure in background:

```javascript
// User clicks "Like"
setLiked(true);           // Instant visual feedback
setCount(count + 1);      // Optimistic update

try {
  await api.like(postId); // Server request
} catch {
  setLiked(false);        // Rollback on failure
  setCount(count);
  showError('Failed to like');
}
```

### Performance Checklist

- [ ] Lighthouse performance score > 90
- [ ] LCP < 2.5s, INP < 200ms, CLS < 0.1
- [ ] Sub-3-second load time on 3G
- [ ] Critical CSS inlined
- [ ] Fonts preloaded with `font-display: swap`
- [ ] Images lazy loaded with explicit dimensions
- [ ] AVIF/WebP with JPEG fallback
- [ ] JavaScript code-split by route
- [ ] No layout shifts during load
- [ ] Third-party scripts deferred
