# Wireframe & UI Design Patterns Reference

> Comprehensive reference for AI-generated HTML/CSS wireframe mockups across mobile, tablet, and desktop platforms.

---

## Table of Contents

1. [Mobile Patterns (iOS + Android)](#1-mobile-patterns)
2. [Tablet Patterns](#2-tablet-patterns)
3. [Desktop/Web Patterns](#3-desktopweb-patterns)
4. [Dark Theme Design System](#4-dark-theme-design-system)
5. [Device Dimensions Reference](#5-device-dimensions-reference)
6. [HTML/CSS Component Library](#6-htmlcss-component-library)
7. [Screen Flow Conventions](#7-screen-flow-conventions)
8. [Common Screen Templates](#8-common-screen-templates)

---

## 1. Mobile Patterns

### 1.1 iOS Navigation Patterns

**Bottom Tab Bar**
- Height: 49pt (content area) + 34pt (home indicator safe area) = 83pt total
- Max 5 tabs; icon 25x25pt with 10pt label below
- Active state: filled icon + accent color; inactive: outline icon + secondary text
- Labels always visible (unlike Android which can hide them)

**Navigation Bar (Top)**
- Standard height: 44pt (compact) or 96pt (large title)
- Large title row: 52pt; transitions to inline 17pt title on scroll
- Back button: chevron + previous screen title (or "Back")
- Right side: up to 2 action buttons (SF Symbols, 22pt)

**Status Bar**
- Dynamic Island devices (iPhone 14 Pro+, 15, 16): 54pt status bar height
- Safe area top inset: 59pt (standard), 62pt (Pro models iPhone 16)
- Contains: time (left), camera/mic indicators (center), cellular/wifi/battery (right)

**Gesture Navigation**
- Home indicator: 5x134pt bar, 8pt from bottom, within 34pt safe area
- Swipe from left edge: back navigation
- Swipe down from top-left: Notification Center
- Swipe down from top-right: Control Center

**iOS-Specific Rules**
- Minimum touch target: 44x44pt
- System font: SF Pro (Text for <=19pt, Display for >=20pt)
- SF Symbols: 9 weights x 3 scales; default rendering size matches text
- Corner radius: 10pt for small elements, 13pt for cards, continuous (superellipse) corners
- Spacing unit: 8pt grid (with 4pt half-grid for fine adjustments)

### 1.2 Android / Material Design 3 Navigation

**Bottom Navigation Bar**
- Height: 80dp
- 3-5 destinations; icon 24dp with 12dp label below
- Active: filled icon in pill-shaped indicator (64x32dp); inactive: outlined icon
- No elevation shadow in M3 (uses surface tint instead)

**Top App Bar**
- Small: 64dp height
- Medium: 112dp (two-line)
- Large: 152dp (prominent title)
- Padding: 16dp horizontal, icons 48dp touch target

**Floating Action Button (FAB)**
- Standard: 56x56dp, icon 24dp, corner radius 16dp
- Small: 40x40dp, corner radius 12dp
- Large: 96x96dp, icon 36dp, corner radius 28dp
- Extended: 56dp height, variable width, 16dp horizontal padding, icon + label
- Position: 16dp from edge (mobile), 24dp from edge (tablet/desktop)
- Elevation: Level 3 (6dp shadow)

**Bottom Sheet**
- Peek height: varies by content (typically 56-96dp for handle + title)
- Handle: 32x4dp, centered, 22dp from top, corner radius 2dp
- Corner radius: 28dp top corners
- Can be modal (with scrim) or standard (persistent)

**Navigation Drawer**
- Width: screen width minus 56dp (max 360dp on mobile, 400dp on desktop)
- Header height: 64dp minimum
- List item height: 56dp, icon 24dp, 16dp padding
- Active item: pill background with primary color

**Android System Bars**
- Status bar: 24dp
- Navigation bar (3-button): 48dp
- Gesture navigation bar: ~16dp (thin line indicator)

### 1.3 Common Mobile Screens

**Login/Signup**
- Logo/branding at top (centered, ~80pt from safe area top)
- Email field + password field (56dp/50pt height, full width minus 24dp margins)
- Primary CTA button (50pt/56dp height, full width or centered pill)
- Social login options (Apple, Google, Facebook icons in 44pt circles)
- "Forgot password?" link, "Sign up" / "Log in" toggle at bottom
- Keyboard-aware: content scrolls up to keep active field visible

**Dashboard / Home**
- Greeting + user avatar in top bar
- Summary cards row (horizontal scroll or 2-column grid)
- KPI metrics: large number + label + trend indicator
- Recent activity list (avatar + title + subtitle + timestamp)
- Quick action FAB or bottom action bar

**Settings**
- Grouped table/list with section headers
- Each row: icon (optional) + label + value/chevron (right-aligned)
- Toggle switches for on/off settings (51x31pt iOS, 52x32dp Android)
- Destructive actions at bottom (red text, e.g., "Delete Account")

**Profile**
- Large avatar (80-120pt), centered or left-aligned
- Name + handle/email below avatar
- Stats row (posts, followers, following) - evenly spaced
- Bio/description text
- Action button (Edit Profile / Follow)
- Content tabs below (grid/list toggle)

**List/Detail**
- List: 72-88dp rows with left avatar/image, title+subtitle, right accessory
- Pull-to-refresh indicator (circular spinner, 40dp)
- Detail: hero image/header, title, metadata row, body content
- Sticky bottom action bar for primary CTA

**Onboarding**
- 3-5 step carousel with page indicator dots
- Each step: illustration (top 60%), title + description (bottom 40%)
- Page dots: 8pt diameter, 8pt spacing, active dot wider (24pt pill)
- "Skip" top-right, "Next" bottom-right, "Get Started" on final step
- Progress bar alternative: thin line at top

**Empty States**
- Centered illustration/icon (120-160pt)
- Headline: 20pt semibold
- Description: 15pt regular, secondary color, 2-3 lines max
- CTA button: primary style, centered below text
- Total block height: ~300pt, vertically centered in available space

### 1.4 Mobile Gestures

| Gesture | Action | Visual Feedback |
|---------|--------|----------------|
| Pull down | Refresh content | Spinner appears at top, content rubber-bands |
| Swipe left on row | Delete/archive | Red/green background reveals, action icon |
| Swipe right on row | Mark read/pin | Blue/green background reveals |
| Long press | Context menu | Haptic + dimmed background + action sheet |
| Pinch | Zoom in/out | Content scales with gesture |
| Double tap | Like/zoom | Heart animation / zoom toggle |

---

## 2. Tablet Patterns

### 2.1 iPad Layout Patterns

**Split View / Master-Detail**
- Primary (master) pane: 320pt default width (adjustable, max ~40% of screen)
- Detail pane: remaining width
- In portrait: master slides over as overlay or hides to sidebar button
- Three-column layout available: sidebar (200-320pt) + content + detail

**Sidebar Navigation**
- Width: 320pt expanded, collapses to 68pt icon-only rail
- Grouped sections with headers
- Active item: filled background with accent color
- Footer: settings gear + user avatar

**Popovers (instead of full-screen modals)**
- Arrow pointing to trigger element
- Max width: 375pt (phone-width content)
- Corner radius: 13pt
- Drop shadow for depth
- Dismiss on tap outside

**Multi-Column Layouts**
- 2-column grid for cards/content at 768pt width
- 3-column grid at 1024pt+ width
- Consistent gutter: 16-20pt between columns
- Margins: 20pt on regular, 24pt on larger iPads

### 2.2 Standard Tablet Dimensions

| Device | Points | Pixels | Scale |
|--------|--------|--------|-------|
| iPad mini (6th gen) | 744 x 1133 | 1488 x 2266 | 2x |
| iPad (10th gen) | 820 x 1180 | 1640 x 2360 | 2x |
| iPad Air (M2) | 820 x 1180 | 1640 x 2360 | 2x |
| iPad Pro 11" | 834 x 1194 | 1668 x 2388 | 2x |
| iPad Pro 13" | 1024 x 1366 | 2048 x 2732 | 2x |
| Android tablet (common) | 800 x 1280 dp | varies | varies |
| Android tablet (large) | 1280 x 800 dp | varies | varies |

### 2.3 Android Tablet / Material Patterns

**Navigation Rail (for tablets)**
- Width: 80dp
- Icon: 24dp in 56x32dp pill indicator
- Label below icon: 12dp
- FAB can be placed at top of rail

**Responsive Layout Grid**
- Compact (0-599dp): 4 columns, 16dp margins
- Medium (600-839dp): 12 columns, 24dp margins (tablet portrait)
- Expanded (840dp+): 12 columns, 24dp margins (tablet landscape, desktop)

---

## 3. Desktop/Web Patterns

### 3.1 Common Viewport Sizes

| Resolution | Usage |
|-----------|-------|
| 1280 x 800 | Small laptops, older displays |
| 1366 x 768 | Common laptop resolution |
| 1440 x 900 | MacBook Pro 15" scaled |
| 1512 x 982 | MacBook Pro 14" default |
| 1920 x 1080 | Full HD desktop |
| 2560 x 1440 | QHD/2K monitors |

### 3.2 Responsive Breakpoints

```
xs:  0 - 575px    (mobile portrait)
sm:  576 - 767px  (mobile landscape)
md:  768 - 991px  (tablet)
lg:  992 - 1199px (small desktop)
xl:  1200 - 1399px (desktop)
xxl: 1400px+      (large desktop)
```

### 3.3 Desktop Navigation Patterns

**Top Navigation Bar**
- Height: 56-64px
- Logo left, nav links center or right, user/actions far right
- Dropdown menus: 240-320px width, 8px corner radius, shadow
- Mega menu: full-width or constrained to content width
- Sticky on scroll (optional: shrink from 64 to 48px)

**Sidebar + Content Layout**
- Sidebar width: 240-280px expanded, 64-72px collapsed (icon-only)
- Content area: remaining width, max-width 1200-1440px centered
- Sidebar sections with group headers
- Active item: left border accent + filled background
- Collapse trigger: hamburger icon or hover edge

**Multi-Panel Dashboards**
- Grid system: 12 columns, 24px gutter, 32px outer margin
- Widget cards: span 3 (25%), 4 (33%), 6 (50%), or 12 (100%) columns
- Minimum widget height: 200px for charts, 120px for KPI cards
- Drag-to-reorder with ghost placeholder

### 3.4 Desktop Component Patterns

**Modal Dialogs**
- Width: 480px (small), 640px (medium), 800px (large)
- Max height: 80vh with internal scroll
- Scrim/overlay: rgba(0,0,0,0.5)
- Corner radius: 12-16px
- Header + body + footer layout
- Close: X button top-right + Escape key + click outside

**Drawers / Slide Panels**
- Width: 320-480px (standard), up to 50% of viewport (large)
- Slides from right (detail/edit) or left (navigation)
- Push content or overlay with scrim
- Same scrim behavior as modals

**Data Tables**
- Header row: 48-56px height, bold text, sort indicators (arrows)
- Body rows: 48-52px height, hover state background
- Checkbox column: 48px width, left-most
- Action column: right-most, icon buttons or "..." menu
- Pagination: 48px bar at bottom, rows-per-page selector
- Sticky header on scroll, horizontal scroll for many columns
- Alternating row backgrounds (optional): subtle 2-3% opacity difference

---

## 4. Dark Theme Design System

### 4.1 Color Tokens

```css
:root {
  /* Surface hierarchy (darkest to lightest) */
  --bg-base:       #0a0a0a;    /* Page background */
  --bg-surface:    #111111;    /* Card/container background */
  --bg-raised:     #1a1a1a;    /* Elevated elements (modals, popovers) */
  --bg-overlay:    #222222;    /* Highest elevation (dropdowns, tooltips) */
  --bg-hover:      #2a2a2a;    /* Hover state for interactive surfaces */
  --bg-active:     #333333;    /* Active/pressed state */

  /* Text hierarchy */
  --text-primary:   rgba(255, 255, 255, 0.90);  /* Headings, primary content */
  --text-secondary: rgba(255, 255, 255, 0.60);  /* Descriptions, metadata */
  --text-tertiary:  rgba(255, 255, 255, 0.40);  /* Placeholders, captions */
  --text-disabled:  rgba(255, 255, 255, 0.20);  /* Disabled labels */

  /* Accent */
  --accent:         #e5a630;   /* Primary accent (amber) */
  --accent-hover:   #d4951f;   /* Accent hover */
  --accent-muted:   rgba(229, 166, 48, 0.15);  /* Accent background tint */

  /* Semantic */
  --success:        #34d399;   /* Green */
  --warning:        #fbbf24;   /* Yellow */
  --error:          #f87171;   /* Red */
  --info:           #60a5fa;   /* Blue */

  /* Borders & dividers */
  --border:         rgba(255, 255, 255, 0.08);
  --border-strong:  rgba(255, 255, 255, 0.15);
  --divider:        rgba(255, 255, 255, 0.06);

  /* Shadows */
  --shadow-sm:      0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md:      0 2px 8px rgba(0, 0, 0, 0.3);
  --shadow-lg:      0 8px 24px rgba(0, 0, 0, 0.4);
  --shadow-xl:      0 16px 48px rgba(0, 0, 0, 0.5);
}
```

### 4.2 Spacing Scale

```
4px   - tight (icon-to-label, inline elements)
8px   - compact (between related items, padding-xs)
12px  - default inner padding (chips, badges)
16px  - standard padding (cards, inputs, list items)
20px  - comfortable padding (section content)
24px  - section gaps, card padding
32px  - between sections
48px  - major section dividers
64px  - page-level spacing
```

### 4.3 Typography Scale

```css
/* Font stack */
font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', 'Segoe UI', system-ui, sans-serif;

/* Scale */
--text-xs:   11px;  /* Badges, fine print */
--text-sm:   12px;  /* Captions, metadata */
--text-base: 14px;  /* Body text, inputs, buttons */
--text-md:   16px;  /* Emphasized body, subheadings */
--text-lg:   20px;  /* Card titles, section headers */
--text-xl:   24px;  /* Page subtitles */
--text-2xl:  32px;  /* Page titles */
--text-3xl:  40px;  /* Hero headings */

/* Weights */
--font-regular:  400;
--font-medium:   500;
--font-semibold: 600;
--font-bold:     700;

/* Line heights */
--leading-tight:  1.2;   /* Headings */
--leading-normal: 1.5;   /* Body text */
--leading-relaxed: 1.7;  /* Long-form text */
```

### 4.4 Border Radius Scale

```
4px   - small elements (badges, chips, small buttons)
6px   - inputs, small cards
8px   - cards, containers
12px  - modals, large cards
16px  - bottom sheets, large containers
100px - pills, fully rounded buttons, avatars
```

### 4.5 Dark Theme Best Practices

- **Never use pure black (#000000)** as background; use #0a0a0a or #09111A for softer feel
- **Surface elevation = brightness**: Higher surfaces are lighter (not shadowed like light theme)
- **Text at 87% / 60% / 38% opacity** (high / medium / disabled emphasis per Material)
- **Desaturate brand colors** for dark backgrounds; fully saturated colors vibrate
- **Minimum contrast ratio**: 4.5:1 for body text, 3:1 for large text (WCAG AA)
- **Avoid pure white text on dark backgrounds** for body; use 87-90% opacity
- **Icons**: Use 60-70% white opacity for secondary, 87% for primary/active

---

## 5. Device Dimensions Reference

### 5.1 iPhone Models (Current)

| Model | Points | Pixels | Scale | Status Bar | Safe Area Top | Safe Area Bottom |
|-------|--------|--------|-------|-----------|---------------|-----------------|
| iPhone SE (3rd) | 375 x 667 | 750 x 1334 | 2x | 20pt | 20pt | 0pt |
| iPhone 14 | 390 x 844 | 1170 x 2532 | 3x | 47pt | 47pt | 34pt |
| iPhone 14 Plus | 428 x 926 | 1284 x 2778 | 3x | 47pt | 47pt | 34pt |
| iPhone 14 Pro | 393 x 852 | 1179 x 2556 | 3x | 54pt | 59pt | 34pt |
| iPhone 14 Pro Max | 430 x 932 | 1290 x 2796 | 3x | 54pt | 59pt | 34pt |
| iPhone 15 | 393 x 852 | 1179 x 2556 | 3x | 54pt | 59pt | 34pt |
| iPhone 15 Plus | 430 x 932 | 1290 x 2796 | 3x | 54pt | 59pt | 34pt |
| iPhone 15 Pro | 393 x 852 | 1179 x 2556 | 3x | 54pt | 59pt | 34pt |
| iPhone 15 Pro Max | 430 x 932 | 1290 x 2796 | 3x | 54pt | 59pt | 34pt |
| iPhone 16 | 393 x 852 | 1179 x 2556 | 3x | 54pt | 59pt | 34pt |
| iPhone 16 Plus | 430 x 932 | 1290 x 2796 | 3x | 54pt | 59pt | 34pt |
| iPhone 16 Pro | 402 x 874 | 1206 x 2622 | 3x | 54pt | 62pt | 34pt |
| iPhone 16 Pro Max | 440 x 956 | 1320 x 2868 | 3x | 54pt | 62pt | 34pt |

**Key iPhone dimensions for wireframes (most common):**
- Standard: 393 x 852pt (iPhone 15/16)
- Large: 430 x 932pt (iPhone 15/16 Plus)
- Pro: 402 x 874pt (iPhone 16 Pro)
- Pro Max: 440 x 956pt (iPhone 16 Pro Max)

### 5.2 iOS UI Element Heights

| Element | Height (pt) | Notes |
|---------|------------|-------|
| Status bar | 54pt | Dynamic Island era |
| Navigation bar (compact) | 44pt | Standard top bar |
| Navigation bar (large title) | 96pt | First row 44 + second row 52 |
| Search bar | 36pt | Inside nav bar adds 48pt row |
| Tab bar | 49pt | Content area only |
| Tab bar + safe area | 83pt | With 34pt home indicator |
| Toolbar | 44pt | Bottom toolbar content area |
| Keyboard (portrait) | ~291pt | Varies by language, includes suggestions |
| Keyboard (landscape) | ~209pt | Varies |
| Home indicator | 34pt | Bottom safe area |

### 5.3 Android Common Devices

| Category | Viewport (dp) | Notes |
|----------|--------------|-------|
| Compact phone | 360 x 640 | Older/smaller phones |
| Standard phone | 360 x 800 | Most common (10% market share) |
| Large phone | 412 x 915 | Pixel 7, Samsung S series |
| Small tablet | 600 x 960 | 7-8" tablets |
| Standard tablet | 800 x 1280 | 10" tablets |
| Large tablet | 1280 x 800 | Landscape 10" tablet |

### 5.4 Android UI Element Heights

| Element | Height (dp) | Notes |
|---------|------------|-------|
| Status bar | 24dp | System status |
| Top app bar (small) | 64dp | Standard toolbar |
| Top app bar (medium) | 112dp | Two-line title |
| Top app bar (large) | 152dp | Prominent title |
| Bottom navigation bar | 80dp | M3 spec |
| Bottom app bar | 80dp | With FAB cutout |
| Navigation drawer item | 56dp | Single list item |
| Navigation rail | 80dp wide | Tablet/desktop sidebar |
| 3-button nav bar | 48dp | System navigation |
| Gesture nav bar | ~16dp | Thin line indicator |
| FAB (standard) | 56dp | Floating action button |
| FAB (small) | 40dp | Compact variant |
| FAB (large) | 96dp | Prominent variant |

---

## 6. HTML/CSS Component Library

All components use the dark theme design system tokens. Each is self-contained with inline styles for direct use in wireframe mockups.

### 6.1 Buttons

```html
<!-- Primary Button -->
<button style="
  background: #e5a630;
  color: #0a0a0a;
  border: none;
  padding: 12px 24px;
  border-radius: 8px;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background 0.15s;
">Primary Action</button>

<!-- Secondary Button -->
<button style="
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.9);
  border: 1px solid rgba(255,255,255,0.08);
  padding: 12px 24px;
  border-radius: 8px;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
">Secondary</button>

<!-- Outline / Ghost Button -->
<button style="
  background: transparent;
  color: #e5a630;
  border: 1px solid rgba(229,166,48,0.3);
  padding: 12px 24px;
  border-radius: 8px;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
">Outline</button>

<!-- Icon Button -->
<button style="
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.9);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
">
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 5v14M5 12h14"/>
  </svg>
</button>

<!-- Destructive Button -->
<button style="
  background: rgba(248,113,113,0.1);
  color: #f87171;
  border: 1px solid rgba(248,113,113,0.2);
  padding: 12px 24px;
  border-radius: 8px;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
">Delete</button>
```

### 6.2 Input Fields

```html
<!-- Text Input -->
<div style="display: flex; flex-direction: column; gap: 6px;">
  <label style="
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
    font-size: 12px;
    font-weight: 500;
    color: rgba(255,255,255,0.6);
    letter-spacing: 0.02em;
  ">Email address</label>
  <input type="email" placeholder="you@example.com" style="
    background: #111111;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 6px;
    padding: 0 16px;
    height: 44px;
    color: rgba(255,255,255,0.9);
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
    font-size: 14px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
  "/>
</div>

<!-- Password Input with toggle -->
<div style="display: flex; flex-direction: column; gap: 6px;">
  <label style="
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
    font-size: 12px;
    font-weight: 500;
    color: rgba(255,255,255,0.6);
  ">Password</label>
  <div style="position: relative;">
    <input type="password" placeholder="Enter password" style="
      background: #111111;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 6px;
      padding: 0 44px 0 16px;
      height: 44px;
      color: rgba(255,255,255,0.9);
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
      font-size: 14px;
      outline: none;
      width: 100%;
      box-sizing: border-box;
    "/>
    <button style="
      position: absolute;
      right: 4px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      color: rgba(255,255,255,0.4);
      cursor: pointer;
      padding: 8px;
    ">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
    </button>
  </div>
</div>

<!-- Search Input with icon -->
<div style="position: relative;">
  <svg style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: rgba(255,255,255,0.4);" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
  <input type="search" placeholder="Search..." style="
    background: #111111;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 100px;
    padding: 0 16px 0 40px;
    height: 40px;
    color: rgba(255,255,255,0.9);
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
    font-size: 14px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
  "/>
</div>

<!-- Textarea -->
<div style="display: flex; flex-direction: column; gap: 6px;">
  <label style="
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
    font-size: 12px;
    font-weight: 500;
    color: rgba(255,255,255,0.6);
  ">Description</label>
  <textarea placeholder="Enter description..." rows="4" style="
    background: #111111;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 6px;
    padding: 12px 16px;
    color: rgba(255,255,255,0.9);
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
    font-size: 14px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    line-height: 1.5;
  "></textarea>
</div>
```

### 6.3 Card

```html
<!-- Card with image, title, description, actions -->
<div style="
  background: #111111;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  overflow: hidden;
  width: 340px;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
">
  <!-- Card Image -->
  <div style="
    background: #1a1a1a;
    height: 180px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255,255,255,0.2);
    font-size: 14px;
  ">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" style="color: rgba(255,255,255,0.15);">
      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>
    </svg>
  </div>
  <!-- Card Content -->
  <div style="padding: 20px;">
    <div style="font-size: 16px; font-weight: 600; color: rgba(255,255,255,0.9); margin-bottom: 8px;">
      Card Title
    </div>
    <div style="font-size: 14px; color: rgba(255,255,255,0.6); line-height: 1.5; margin-bottom: 16px;">
      A brief description of the card content that provides context and supporting information.
    </div>
    <!-- Card Actions -->
    <div style="display: flex; gap: 8px;">
      <button style="
        background: #e5a630;
        color: #0a0a0a;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      ">View Details</button>
      <button style="
        background: transparent;
        color: rgba(255,255,255,0.6);
        border: 1px solid rgba(255,255,255,0.08);
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
      ">Share</button>
    </div>
  </div>
</div>

<!-- KPI / Metric Card (no image) -->
<div style="
  background: #111111;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  padding: 24px;
  width: 240px;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
">
  <div style="font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">
    Total Revenue
  </div>
  <div style="font-size: 32px; font-weight: 700; color: rgba(255,255,255,0.9); margin-bottom: 8px;">
    $24,500
  </div>
  <div style="display: flex; align-items: center; gap: 4px;">
    <span style="color: #34d399; font-size: 13px; font-weight: 500;">+12.5%</span>
    <span style="color: rgba(255,255,255,0.4); font-size: 13px;">vs last month</span>
  </div>
</div>
```

### 6.4 Navigation Bars

```html
<!-- Top Navigation Bar (Desktop) -->
<nav style="
  background: #111111;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  height: 56px;
  display: flex;
  align-items: center;
  padding: 0 24px;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
  position: sticky;
  top: 0;
  z-index: 100;
">
  <!-- Logo -->
  <div style="font-size: 18px; font-weight: 700; color: #e5a630; margin-right: 32px;">
    AppName
  </div>
  <!-- Nav Links -->
  <div style="display: flex; gap: 4px; flex: 1;">
    <a style="color: rgba(255,255,255,0.9); text-decoration: none; font-size: 14px; font-weight: 500; padding: 8px 12px; border-radius: 6px; background: rgba(255,255,255,0.06);">Dashboard</a>
    <a style="color: rgba(255,255,255,0.5); text-decoration: none; font-size: 14px; font-weight: 500; padding: 8px 12px; border-radius: 6px;">Projects</a>
    <a style="color: rgba(255,255,255,0.5); text-decoration: none; font-size: 14px; font-weight: 500; padding: 8px 12px; border-radius: 6px;">Settings</a>
  </div>
  <!-- Right Actions -->
  <div style="display: flex; align-items: center; gap: 12px;">
    <button style="background: none; border: none; color: rgba(255,255,255,0.5); cursor: pointer; padding: 8px;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
    </button>
    <div style="width: 32px; height: 32px; border-radius: 100px; background: #e5a630; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; color: #0a0a0a;">J</div>
  </div>
</nav>

<!-- Mobile Bottom Tab Bar (iOS-style) -->
<nav style="
  background: rgba(17,17,17,0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top: 1px solid rgba(255,255,255,0.08);
  display: flex;
  align-items: flex-start;
  justify-content: space-around;
  padding: 8px 0 34px 0;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
">
  <!-- Active Tab -->
  <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 4px 0; min-width: 64px;">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="#e5a630" stroke="#e5a630" stroke-width="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
    <span style="font-size: 10px; font-weight: 500; color: #e5a630;">Home</span>
  </div>
  <!-- Inactive Tab -->
  <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 4px 0; min-width: 64px;">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
    <span style="font-size: 10px; font-weight: 500; color: rgba(255,255,255,0.4);">Search</span>
  </div>
  <!-- Inactive Tab -->
  <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 4px 0; min-width: 64px;">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
    <span style="font-size: 10px; font-weight: 500; color: rgba(255,255,255,0.4);">Alerts</span>
  </div>
  <!-- Inactive Tab -->
  <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 4px 0; min-width: 64px;">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    <span style="font-size: 10px; font-weight: 500; color: rgba(255,255,255,0.4);">Profile</span>
  </div>
</nav>

<!-- Sidebar Navigation (Desktop) -->
<aside style="
  background: #111111;
  border-right: 1px solid rgba(255,255,255,0.08);
  width: 260px;
  height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 16px 12px;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
  box-sizing: border-box;
">
  <!-- Logo -->
  <div style="padding: 8px 12px 24px; font-size: 18px; font-weight: 700; color: #e5a630;">
    AppName
  </div>
  <!-- Section -->
  <div style="font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.3); text-transform: uppercase; letter-spacing: 0.08em; padding: 8px 12px 4px;">
    Main
  </div>
  <!-- Active Item -->
  <a style="
    display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px;
    background: rgba(229,166,48,0.1); color: #e5a630; text-decoration: none; font-size: 14px; font-weight: 500; margin-bottom: 2px;
  ">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
    Dashboard
  </a>
  <!-- Inactive Item -->
  <a style="
    display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px;
    color: rgba(255,255,255,0.5); text-decoration: none; font-size: 14px; font-weight: 500; margin-bottom: 2px;
  ">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
    Documents
  </a>
  <!-- Inactive Item -->
  <a style="
    display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px;
    color: rgba(255,255,255,0.5); text-decoration: none; font-size: 14px; font-weight: 500; margin-bottom: 2px;
  ">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    Team
  </a>
  <!-- Spacer -->
  <div style="flex: 1;"></div>
  <!-- Footer -->
  <div style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 12px; margin-top: 12px;">
    <a style="
      display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px;
      color: rgba(255,255,255,0.5); text-decoration: none; font-size: 14px; font-weight: 500;
    ">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      Settings
    </a>
  </div>
</aside>
```

### 6.5 List Items

```html
<!-- Standard List Item (with avatar, title, subtitle, action) -->
<div style="
  display: flex;
  align-items: center;
  padding: 12px 16px;
  gap: 12px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
  cursor: pointer;
">
  <!-- Avatar -->
  <div style="
    width: 40px; height: 40px; border-radius: 100px;
    background: linear-gradient(135deg, #e5a630, #d4951f);
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: 600; color: #0a0a0a;
    flex-shrink: 0;
  ">JD</div>
  <!-- Content -->
  <div style="flex: 1; min-width: 0;">
    <div style="font-size: 15px; font-weight: 500; color: rgba(255,255,255,0.9); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
      John Doe
    </div>
    <div style="font-size: 13px; color: rgba(255,255,255,0.4); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
      Updated the project settings
    </div>
  </div>
  <!-- Metadata / Action -->
  <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
    <span style="font-size: 12px; color: rgba(255,255,255,0.3);">2m ago</span>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  </div>
</div>

<!-- Settings List Item (with toggle) -->
<div style="
  display: flex;
  align-items: center;
  padding: 14px 16px;
  gap: 12px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
">
  <!-- Icon -->
  <div style="
    width: 32px; height: 32px; border-radius: 8px;
    background: rgba(96,165,250,0.1);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  ">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/></svg>
  </div>
  <!-- Content -->
  <div style="flex: 1;">
    <div style="font-size: 15px; font-weight: 500; color: rgba(255,255,255,0.9);">Push Notifications</div>
    <div style="font-size: 13px; color: rgba(255,255,255,0.4);">Receive alerts for new activity</div>
  </div>
  <!-- Toggle (ON state) -->
  <div style="
    width: 51px; height: 31px; border-radius: 100px;
    background: #34d399;
    position: relative;
    cursor: pointer;
    flex-shrink: 0;
  ">
    <div style="
      width: 27px; height: 27px; border-radius: 100px;
      background: white;
      position: absolute;
      top: 2px; right: 2px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    "></div>
  </div>
</div>
```

### 6.6 Modal / Dialog

```html
<!-- Modal Overlay + Dialog -->
<div style="
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 24px;
">
  <div style="
    background: #1a1a1a;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 16px;
    width: 480px;
    max-width: 100%;
    max-height: 80vh;
    overflow: hidden;
    box-shadow: 0 16px 48px rgba(0,0,0,0.5);
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
    display: flex;
    flex-direction: column;
  ">
    <!-- Header -->
    <div style="
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 24px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    ">
      <h2 style="margin: 0; font-size: 18px; font-weight: 600; color: rgba(255,255,255,0.9);">Confirm Action</h2>
      <button style="
        background: none; border: none; color: rgba(255,255,255,0.4);
        cursor: pointer; padding: 4px; border-radius: 6px;
      ">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <!-- Body -->
    <div style="padding: 24px; overflow-y: auto;">
      <p style="margin: 0; font-size: 14px; color: rgba(255,255,255,0.6); line-height: 1.6;">
        Are you sure you want to proceed? This action cannot be undone and will permanently remove the selected items from your workspace.
      </p>
    </div>
    <!-- Footer -->
    <div style="
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 16px 24px 20px;
      border-top: 1px solid rgba(255,255,255,0.06);
    ">
      <button style="
        background: rgba(255,255,255,0.06);
        color: rgba(255,255,255,0.7);
        border: 1px solid rgba(255,255,255,0.08);
        padding: 10px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
      ">Cancel</button>
      <button style="
        background: #f87171;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
      ">Delete</button>
    </div>
  </div>
</div>
```

### 6.7 Tab Bar / Segmented Control

```html
<!-- Tab Bar (underline style) -->
<div style="
  display: flex;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
  gap: 0;
">
  <!-- Active Tab -->
  <button style="
    background: none;
    border: none;
    border-bottom: 2px solid #e5a630;
    color: #e5a630;
    font-size: 14px;
    font-weight: 600;
    padding: 12px 20px;
    cursor: pointer;
    margin-bottom: -1px;
  ">Overview</button>
  <!-- Inactive Tab -->
  <button style="
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: rgba(255,255,255,0.4);
    font-size: 14px;
    font-weight: 500;
    padding: 12px 20px;
    cursor: pointer;
    margin-bottom: -1px;
  ">Analytics</button>
  <!-- Inactive Tab -->
  <button style="
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: rgba(255,255,255,0.4);
    font-size: 14px;
    font-weight: 500;
    padding: 12px 20px;
    cursor: pointer;
    margin-bottom: -1px;
  ">Settings</button>
</div>

<!-- Segmented Control (iOS-style pill) -->
<div style="
  display: inline-flex;
  background: rgba(255,255,255,0.06);
  border-radius: 8px;
  padding: 2px;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
">
  <!-- Active Segment -->
  <button style="
    background: rgba(255,255,255,0.12);
    color: rgba(255,255,255,0.9);
    border: none;
    padding: 8px 20px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  ">Day</button>
  <!-- Inactive Segment -->
  <button style="
    background: transparent;
    color: rgba(255,255,255,0.4);
    border: none;
    padding: 8px 20px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
  ">Week</button>
  <!-- Inactive Segment -->
  <button style="
    background: transparent;
    color: rgba(255,255,255,0.4);
    border: none;
    padding: 8px 20px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
  ">Month</button>
</div>
```

### 6.8 Toggle / Switch

```html
<!-- Toggle Switch (ON) -->
<label style="display: inline-flex; align-items: center; gap: 12px; cursor: pointer; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;">
  <div style="
    width: 51px; height: 31px; border-radius: 100px;
    background: #34d399;
    position: relative;
    transition: background 0.2s;
  ">
    <div style="
      width: 27px; height: 27px; border-radius: 100px;
      background: white;
      position: absolute;
      top: 2px; right: 2px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
      transition: transform 0.2s;
    "></div>
  </div>
  <span style="font-size: 14px; color: rgba(255,255,255,0.9);">Enabled</span>
</label>

<!-- Toggle Switch (OFF) -->
<label style="display: inline-flex; align-items: center; gap: 12px; cursor: pointer; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;">
  <div style="
    width: 51px; height: 31px; border-radius: 100px;
    background: rgba(255,255,255,0.15);
    position: relative;
  ">
    <div style="
      width: 27px; height: 27px; border-radius: 100px;
      background: white;
      position: absolute;
      top: 2px; left: 2px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    "></div>
  </div>
  <span style="font-size: 14px; color: rgba(255,255,255,0.5);">Disabled</span>
</label>
```

### 6.9 Badge / Chip / Tag

```html
<!-- Status Badge -->
<span style="
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 100px;
  background: rgba(52,211,153,0.1);
  color: #34d399;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
  font-size: 12px;
  font-weight: 500;
">
  <div style="width: 6px; height: 6px; border-radius: 100px; background: #34d399;"></div>
  Active
</span>

<!-- Warning Badge -->
<span style="
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 100px;
  background: rgba(251,191,36,0.1);
  color: #fbbf24;
  font-size: 12px;
  font-weight: 500;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
">
  <div style="width: 6px; height: 6px; border-radius: 100px; background: #fbbf24;"></div>
  Pending
</span>

<!-- Error Badge -->
<span style="
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 100px;
  background: rgba(248,113,113,0.1);
  color: #f87171;
  font-size: 12px;
  font-weight: 500;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
">
  <div style="width: 6px; height: 6px; border-radius: 100px; background: #f87171;"></div>
  Error
</span>

<!-- Chip (removable tag) -->
<span style="
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 100px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.7);
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
  font-size: 13px;
  font-weight: 500;
">
  Design
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="cursor: pointer; opacity: 0.5;"><path d="M18 6 6 18M6 6l12 12"/></svg>
</span>

<!-- Notification Count Badge -->
<div style="position: relative; display: inline-block;">
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
  <span style="
    position: absolute;
    top: -4px; right: -6px;
    background: #f87171;
    color: white;
    font-size: 10px;
    font-weight: 700;
    min-width: 18px;
    height: 18px;
    border-radius: 100px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 4px;
    border: 2px solid #0a0a0a;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
  ">3</span>
</div>
```

### 6.10 Empty State

```html
<!-- Empty State -->
<div style="
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 32px;
  text-align: center;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
  max-width: 400px;
  margin: 0 auto;
">
  <!-- Icon -->
  <div style="
    width: 80px; height: 80px;
    border-radius: 100px;
    background: rgba(255,255,255,0.04);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 24px;
  ">
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
      <polyline points="13 2 13 9 20 9"/>
    </svg>
  </div>
  <!-- Headline -->
  <h3 style="
    margin: 0 0 8px;
    font-size: 20px;
    font-weight: 600;
    color: rgba(255,255,255,0.9);
  ">No documents yet</h3>
  <!-- Description -->
  <p style="
    margin: 0 0 24px;
    font-size: 14px;
    color: rgba(255,255,255,0.4);
    line-height: 1.6;
  ">Get started by creating your first document. You can import existing files or start from scratch.</p>
  <!-- CTA Button -->
  <button style="
    background: #e5a630;
    color: #0a0a0a;
    border: none;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  ">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
    Create Document
  </button>
</div>
```

### 6.11 Loading Skeleton

```html
<!-- Skeleton Loader (Card) -->
<div style="
  background: #111111;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  overflow: hidden;
  width: 340px;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
">
  <!-- Skeleton Image -->
  <div style="
    height: 180px;
    background: linear-gradient(90deg, #1a1a1a 25%, #222222 50%, #1a1a1a 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
  "></div>
  <div style="padding: 20px;">
    <!-- Skeleton Title -->
    <div style="
      height: 16px; width: 70%;
      background: linear-gradient(90deg, #1a1a1a 25%, #222222 50%, #1a1a1a 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
      border-radius: 4px;
      margin-bottom: 12px;
    "></div>
    <!-- Skeleton Lines -->
    <div style="
      height: 12px; width: 100%;
      background: linear-gradient(90deg, #1a1a1a 25%, #222222 50%, #1a1a1a 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
      border-radius: 4px;
      margin-bottom: 8px;
    "></div>
    <div style="
      height: 12px; width: 85%;
      background: linear-gradient(90deg, #1a1a1a 25%, #222222 50%, #1a1a1a 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
      border-radius: 4px;
      margin-bottom: 16px;
    "></div>
    <!-- Skeleton Button -->
    <div style="
      height: 36px; width: 120px;
      background: linear-gradient(90deg, #1a1a1a 25%, #222222 50%, #1a1a1a 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
      border-radius: 6px;
    "></div>
  </div>
</div>

<!-- Skeleton List Item -->
<div style="
  display: flex;
  align-items: center;
  padding: 12px 16px;
  gap: 12px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
">
  <!-- Skeleton Avatar -->
  <div style="
    width: 40px; height: 40px; border-radius: 100px;
    background: linear-gradient(90deg, #1a1a1a 25%, #222222 50%, #1a1a1a 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    flex-shrink: 0;
  "></div>
  <div style="flex: 1;">
    <div style="
      height: 14px; width: 50%;
      background: linear-gradient(90deg, #1a1a1a 25%, #222222 50%, #1a1a1a 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
      border-radius: 4px;
      margin-bottom: 8px;
    "></div>
    <div style="
      height: 12px; width: 75%;
      background: linear-gradient(90deg, #1a1a1a 25%, #222222 50%, #1a1a1a 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
      border-radius: 4px;
    "></div>
  </div>
</div>

<!-- CSS Animation (include once in <style> or <head>) -->
<style>
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
</style>
```

### 6.12 Toast / Snackbar Notification

```html
<!-- Success Toast -->
<div style="
  position: fixed;
  top: 24px;
  right: 24px;
  background: #1a1a1a;
  border: 1px solid rgba(255,255,255,0.08);
  border-left: 3px solid #34d399;
  border-radius: 8px;
  padding: 14px 16px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 320px;
  max-width: 420px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
  z-index: 9999;
">
  <!-- Icon -->
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2" style="flex-shrink: 0; margin-top: 1px;">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
  <!-- Content -->
  <div style="flex: 1;">
    <div style="font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.9); margin-bottom: 4px;">
      Changes saved
    </div>
    <div style="font-size: 13px; color: rgba(255,255,255,0.4); line-height: 1.4;">
      Your settings have been updated successfully.
    </div>
  </div>
  <!-- Close -->
  <button style="
    background: none; border: none; color: rgba(255,255,255,0.3);
    cursor: pointer; padding: 2px; flex-shrink: 0;
  ">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
  </button>
</div>

<!-- Error Toast -->
<div style="
  position: fixed;
  top: 24px;
  right: 24px;
  background: #1a1a1a;
  border: 1px solid rgba(255,255,255,0.08);
  border-left: 3px solid #f87171;
  border-radius: 8px;
  padding: 14px 16px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 320px;
  max-width: 420px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
  z-index: 9999;
">
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" style="flex-shrink: 0; margin-top: 1px;">
    <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
  </svg>
  <div style="flex: 1;">
    <div style="font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.9); margin-bottom: 4px;">
      Upload failed
    </div>
    <div style="font-size: 13px; color: rgba(255,255,255,0.4); line-height: 1.4;">
      The file exceeds the maximum size limit. Please try a smaller file.
    </div>
  </div>
  <button style="background: none; border: none; color: rgba(255,255,255,0.3); cursor: pointer; padding: 2px; flex-shrink: 0;">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
  </button>
</div>

<!-- Android-style Snackbar (bottom) -->
<div style="
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: #333333;
  border-radius: 8px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 320px;
  max-width: 560px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
  z-index: 9999;
">
  <span style="font-size: 14px; color: rgba(255,255,255,0.85); flex: 1;">
    Item moved to trash
  </span>
  <button style="
    background: none; border: none; color: #e5a630;
    font-size: 14px; font-weight: 600; cursor: pointer; padding: 4px 8px;
    white-space: nowrap;
  ">Undo</button>
</div>
```

### 6.13 Dropdown / Select Menu

```html
<!-- Dropdown Menu -->
<div style="position: relative; display: inline-block; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;">
  <!-- Trigger -->
  <button style="
    background: #111111;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 6px;
    padding: 0 36px 0 16px;
    height: 44px;
    color: rgba(255,255,255,0.9);
    font-size: 14px;
    cursor: pointer;
    position: relative;
    min-width: 180px;
    text-align: left;
  ">
    Select option
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="2" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%);">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  </button>
  <!-- Menu (shown on open) -->
  <div style="
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    background: #1a1a1a;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px;
    padding: 4px;
    min-width: 200px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    z-index: 100;
  ">
    <div style="padding: 10px 12px; border-radius: 6px; color: rgba(255,255,255,0.9); font-size: 14px; cursor: pointer; background: rgba(229,166,48,0.08);">
      Option One
    </div>
    <div style="padding: 10px 12px; border-radius: 6px; color: rgba(255,255,255,0.6); font-size: 14px; cursor: pointer;">
      Option Two
    </div>
    <div style="padding: 10px 12px; border-radius: 6px; color: rgba(255,255,255,0.6); font-size: 14px; cursor: pointer;">
      Option Three
    </div>
    <div style="height: 1px; background: rgba(255,255,255,0.06); margin: 4px 0;"></div>
    <div style="padding: 10px 12px; border-radius: 6px; color: #f87171; font-size: 14px; cursor: pointer;">
      Delete
    </div>
  </div>
</div>
```

### 6.14 Data Table

```html
<!-- Data Table -->
<div style="
  background: #111111;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
">
  <!-- Table Header -->
  <div style="
    display: grid;
    grid-template-columns: 44px 2fr 1fr 1fr 80px;
    align-items: center;
    padding: 0 16px;
    height: 48px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.02);
  ">
    <input type="checkbox" style="width: 16px; height: 16px; accent-color: #e5a630;" />
    <span style="font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.05em;">Name</span>
    <span style="font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.05em;">Status</span>
    <span style="font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.05em;">Date</span>
    <span></span>
  </div>
  <!-- Table Row 1 -->
  <div style="
    display: grid;
    grid-template-columns: 44px 2fr 1fr 1fr 80px;
    align-items: center;
    padding: 0 16px;
    height: 52px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
  ">
    <input type="checkbox" style="width: 16px; height: 16px; accent-color: #e5a630;" />
    <span style="font-size: 14px; color: rgba(255,255,255,0.9); font-weight: 500;">Project Alpha</span>
    <span style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 100px; background: rgba(52,211,153,0.1); color: #34d399; font-size: 12px; font-weight: 500; width: fit-content;">
      <div style="width: 6px; height: 6px; border-radius: 100px; background: #34d399;"></div>Active
    </span>
    <span style="font-size: 13px; color: rgba(255,255,255,0.4);">Mar 28, 2026</span>
    <button style="background: none; border: none; color: rgba(255,255,255,0.3); cursor: pointer; padding: 8px; margin-left: auto;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
    </button>
  </div>
  <!-- Table Row 2 -->
  <div style="
    display: grid;
    grid-template-columns: 44px 2fr 1fr 1fr 80px;
    align-items: center;
    padding: 0 16px;
    height: 52px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
  ">
    <input type="checkbox" style="width: 16px; height: 16px; accent-color: #e5a630;" />
    <span style="font-size: 14px; color: rgba(255,255,255,0.9); font-weight: 500;">Project Beta</span>
    <span style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 100px; background: rgba(251,191,36,0.1); color: #fbbf24; font-size: 12px; font-weight: 500; width: fit-content;">
      <div style="width: 6px; height: 6px; border-radius: 100px; background: #fbbf24;"></div>Pending
    </span>
    <span style="font-size: 13px; color: rgba(255,255,255,0.4);">Mar 25, 2026</span>
    <button style="background: none; border: none; color: rgba(255,255,255,0.3); cursor: pointer; padding: 8px; margin-left: auto;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
    </button>
  </div>
</div>
```

### 6.15 Progress / Stepper

```html
<!-- Progress Bar -->
<div style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;">
  <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
    <span style="font-size: 13px; color: rgba(255,255,255,0.6);">Uploading...</span>
    <span style="font-size: 13px; color: rgba(255,255,255,0.4);">67%</span>
  </div>
  <div style="height: 4px; background: rgba(255,255,255,0.06); border-radius: 100px; overflow: hidden;">
    <div style="height: 100%; width: 67%; background: #e5a630; border-radius: 100px;"></div>
  </div>
</div>

<!-- Step Indicator / Stepper -->
<div style="
  display: flex;
  align-items: center;
  gap: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
">
  <!-- Completed Step -->
  <div style="display: flex; align-items: center;">
    <div style="width: 32px; height: 32px; border-radius: 100px; background: #e5a630; display: flex; align-items: center; justify-content: center;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
    </div>
    <span style="font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.9); margin-left: 8px;">Account</span>
  </div>
  <div style="flex: 1; height: 2px; background: #e5a630; margin: 0 12px;"></div>
  <!-- Active Step -->
  <div style="display: flex; align-items: center;">
    <div style="width: 32px; height: 32px; border-radius: 100px; background: #e5a630; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; color: #0a0a0a;">2</div>
    <span style="font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.9); margin-left: 8px;">Profile</span>
  </div>
  <div style="flex: 1; height: 2px; background: rgba(255,255,255,0.08); margin: 0 12px;"></div>
  <!-- Future Step -->
  <div style="display: flex; align-items: center;">
    <div style="width: 32px; height: 32px; border-radius: 100px; border: 2px solid rgba(255,255,255,0.15); display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 500; color: rgba(255,255,255,0.3);">3</div>
    <span style="font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.3); margin-left: 8px;">Review</span>
  </div>
</div>
```

### 6.16 Avatar Group

```html
<!-- Avatar Group (stacked) -->
<div style="display: flex; align-items: center; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;">
  <div style="width: 36px; height: 36px; border-radius: 100px; background: #e5a630; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; color: #0a0a0a; border: 2px solid #0a0a0a; position: relative; z-index: 4;">AB</div>
  <div style="width: 36px; height: 36px; border-radius: 100px; background: #60a5fa; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; color: #0a0a0a; border: 2px solid #0a0a0a; margin-left: -8px; position: relative; z-index: 3;">CD</div>
  <div style="width: 36px; height: 36px; border-radius: 100px; background: #34d399; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; color: #0a0a0a; border: 2px solid #0a0a0a; margin-left: -8px; position: relative; z-index: 2;">EF</div>
  <div style="width: 36px; height: 36px; border-radius: 100px; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.5); border: 2px solid #0a0a0a; margin-left: -8px; position: relative; z-index: 1;">+5</div>
</div>
```

---

## 7. Screen Flow Conventions

### 7.1 Authentication Flow

```
Splash / Loading
    |
    v
Login Screen -----> Forgot Password -----> Reset Email Sent
    |                                              |
    v                                              v
Sign Up Screen -----> Email Verification     Back to Login
    |
    v
Onboarding (3-5 steps)
    |
    v
Main Dashboard (authenticated root)
```

### 7.2 Main App Navigation (Tab-based)

```
Tab Bar
  |-- Home / Dashboard
  |     |-- Notification detail
  |     |-- Quick action sheets
  |
  |-- Browse / Search
  |     |-- Search results list
  |     |-- Filter sheet/modal
  |     |-- Item detail
  |           |-- Edit item
  |           |-- Share sheet
  |
  |-- Create (center tab / FAB)
  |     |-- Multi-step creation flow
  |     |-- Preview
  |     |-- Publish/Save confirmation
  |
  |-- Activity / Notifications
  |     |-- Notification detail
  |     |-- Linked content
  |
  |-- Profile / Settings
        |-- Edit profile
        |-- Settings groups
        |     |-- Account
        |     |-- Notifications
        |     |-- Privacy
        |     |-- Appearance
        |-- Help / Support
        |-- Log out
```

### 7.3 List-Detail Pattern

```
List View
  |-- Pull-to-refresh
  |-- Sort/Filter controls (top)
  |-- Scrollable list items
  |     |
  |     v
  Detail View
    |-- Hero image/header
    |-- Metadata (date, author, status)
    |-- Body content (scrollable)
    |-- Related items section
    |-- Action bar (bottom sticky)
    |     |-- Edit -----> Edit Form -----> Save -----> Back to Detail
    |     |-- Share -----> Share Sheet
    |     |-- Delete -----> Confirmation Dialog -----> Back to List
```

### 7.4 Onboarding Flow

```
Step 1: Welcome              Step 2: Value Prop 1          Step 3: Value Prop 2
+---------------------+      +---------------------+      +---------------------+
|     [Skip]          |      |     [Skip]          |      |     [Skip]          |
|                     |      |                     |      |                     |
|   [Illustration]    |      |   [Illustration]    |      |   [Illustration]    |
|                     |      |                     |      |                     |
|   Welcome to App    |      |  Feature Highlight  |      |  Feature Highlight  |
|   Brief tagline     |      |   Description       |      |   Description       |
|                     |      |                     |      |                     |
|   o O o             |      |   o O o             |      |   o O o             |
|       [Next -->]    |      |       [Next -->]    |      |   [Get Started]     |
+---------------------+      +---------------------+      +---------------------+
```

### 7.5 Settings Pattern

```
Settings (grouped list)
|
|-- ACCOUNT
|     |-- Profile -----> Edit Profile Form
|     |-- Email -----> Change Email Flow
|     |-- Password -----> Change Password Flow
|
|-- PREFERENCES
|     |-- Notifications [toggle] (inline)
|     |-- Dark Mode [toggle] (inline)
|     |-- Language -----> Language Picker
|
|-- SUPPORT
|     |-- Help Center -----> In-app browser / webview
|     |-- Contact Us -----> Email/form
|     |-- Terms of Service -----> Webview
|     |-- Privacy Policy -----> Webview
|
|-- DANGER ZONE
      |-- Log Out -----> Confirmation Alert
      |-- Delete Account -----> Multi-step Confirmation
```

### 7.6 Search Flow

```
Search Bar (collapsed/icon) -----> Tap to expand
    |
    v
Search Screen
  |-- Recent searches (list, clearable)
  |-- Trending / Suggested (chips/tags)
  |-- Type query...
  |     |
  |     v
  Search Results
    |-- Filter bar (horizontal scroll chips)
    |-- Sort dropdown
    |-- Results list (with load more / infinite scroll)
    |     |
    |     v
    Item Detail (same as list-detail pattern)
```

---

## 8. Common Screen Templates

### 8.1 Mobile Login Screen (HTML)

```html
<div style="
  width: 393px;
  height: 852px;
  background: #0a0a0a;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
">
  <!-- Status Bar -->
  <div style="height: 59px; padding: 16px 24px 0; display: flex; justify-content: space-between; align-items: flex-start;">
    <span style="font-size: 15px; font-weight: 600; color: white;">9:41</span>
    <div style="display: flex; gap: 6px; align-items: center;">
      <svg width="16" height="12" viewBox="0 0 16 12" fill="white"><rect x="0" y="3" width="3" height="9" rx="1"/><rect x="4.5" y="1.5" width="3" height="10.5" rx="1"/><rect x="9" y="0" width="3" height="12" rx="1"/></svg>
      <svg width="16" height="12" viewBox="0 0 16 12" fill="white"><path d="M8 2C5.24 2 2.79 3.11 1 5l7 7 7-7c-1.79-1.89-4.24-3-7-3z"/></svg>
      <svg width="24" height="12" viewBox="0 0 24 12"><rect x="0" y="1" width="21" height="10" rx="2" stroke="white" stroke-width="1" fill="none"/><rect x="22" y="4" width="2" height="4" rx="1" fill="white"/><rect x="2" y="3" width="14" height="6" rx="1" fill="#34d399"/></svg>
    </div>
  </div>

  <!-- Content -->
  <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 0 24px;">
    <!-- Logo -->
    <div style="text-align: center; margin-bottom: 48px;">
      <div style="width: 64px; height: 64px; border-radius: 16px; background: #e5a630; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 700; color: #0a0a0a;">A</div>
      <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: rgba(255,255,255,0.9);">Welcome back</h1>
      <p style="margin: 8px 0 0; font-size: 15px; color: rgba(255,255,255,0.4);">Sign in to your account</p>
    </div>

    <!-- Form -->
    <div style="display: flex; flex-direction: column; gap: 16px;">
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <label style="font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.6);">Email</label>
        <input type="email" placeholder="you@example.com" style="background: #111; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 0 16px; height: 50px; color: rgba(255,255,255,0.9); font-size: 16px; outline: none; width: 100%; box-sizing: border-box;"/>
      </div>
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <div style="display: flex; justify-content: space-between;">
          <label style="font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.6);">Password</label>
          <a style="font-size: 12px; color: #e5a630; text-decoration: none;">Forgot?</a>
        </div>
        <input type="password" placeholder="Enter password" style="background: #111; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 0 16px; height: 50px; color: rgba(255,255,255,0.9); font-size: 16px; outline: none; width: 100%; box-sizing: border-box;"/>
      </div>
      <button style="background: #e5a630; color: #0a0a0a; border: none; border-radius: 8px; height: 50px; font-size: 16px; font-weight: 600; cursor: pointer; margin-top: 8px;">Sign In</button>
    </div>

    <!-- Divider -->
    <div style="display: flex; align-items: center; gap: 16px; margin: 32px 0;">
      <div style="flex: 1; height: 1px; background: rgba(255,255,255,0.06);"></div>
      <span style="font-size: 12px; color: rgba(255,255,255,0.3);">or continue with</span>
      <div style="flex: 1; height: 1px; background: rgba(255,255,255,0.06);"></div>
    </div>

    <!-- Social Login -->
    <div style="display: flex; gap: 12px;">
      <button style="flex: 1; height: 50px; background: #111; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M17.05 20.28c-1.15.69-2.53 1.09-3.99 1.09C8.12 21.37 4.13 17.77 4.13 13.17c0-4.6 3.99-8.2 8.93-8.2 2.49 0 4.59.94 6.14 2.49l-2.49 2.4c-.97-.92-2.22-1.48-3.65-1.48-3.12 0-5.52 2.58-5.52 5.79s2.4 5.79 5.52 5.79c2.01 0 3.37-.81 4.15-1.87H13.06V14.7h8.58c.12.62.19 1.28.19 1.97 0 1.41-.39 2.66-1.06 3.61z"/></svg>
      </button>
      <button style="flex: 1; height: 50px; background: #111; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83z"/></svg>
      </button>
    </div>

    <!-- Sign Up Link -->
    <p style="text-align: center; margin: 32px 0 0; font-size: 14px; color: rgba(255,255,255,0.4);">
      Don't have an account? <a style="color: #e5a630; text-decoration: none; font-weight: 500;">Sign up</a>
    </p>
  </div>

  <!-- Home Indicator -->
  <div style="height: 34px; display: flex; align-items: center; justify-content: center;">
    <div style="width: 134px; height: 5px; border-radius: 100px; background: rgba(255,255,255,0.3);"></div>
  </div>
</div>
```

### 8.2 Mobile Dashboard Screen (HTML)

```html
<div style="
  width: 393px;
  height: 852px;
  background: #0a0a0a;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
">
  <!-- Status Bar -->
  <div style="height: 59px; padding: 16px 24px 0; display: flex; justify-content: space-between; align-items: flex-start;">
    <span style="font-size: 15px; font-weight: 600; color: white;">9:41</span>
    <div style="display: flex; gap: 6px; align-items: center;">
      <svg width="24" height="12" viewBox="0 0 24 12"><rect x="0" y="1" width="21" height="10" rx="2" stroke="white" stroke-width="1" fill="none"/><rect x="2" y="3" width="14" height="6" rx="1" fill="#34d399"/></svg>
    </div>
  </div>

  <!-- Header -->
  <div style="padding: 8px 24px 20px;">
    <div style="display: flex; align-items: center; justify-content: space-between;">
      <div>
        <div style="font-size: 14px; color: rgba(255,255,255,0.4);">Good morning</div>
        <div style="font-size: 28px; font-weight: 700; color: rgba(255,255,255,0.9);">Dashboard</div>
      </div>
      <div style="width: 40px; height: 40px; border-radius: 100px; background: #e5a630; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 600; color: #0a0a0a;">J</div>
    </div>
  </div>

  <!-- Scrollable Content -->
  <div style="flex: 1; overflow-y: auto; padding: 0 24px 100px;">
    <!-- KPI Cards Row -->
    <div style="display: flex; gap: 12px; margin-bottom: 24px;">
      <div style="flex: 1; background: #111; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 16px;">
        <div style="font-size: 11px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Revenue</div>
        <div style="font-size: 24px; font-weight: 700; color: rgba(255,255,255,0.9);">$12.4k</div>
        <div style="font-size: 12px; color: #34d399; margin-top: 4px;">+8.2%</div>
      </div>
      <div style="flex: 1; background: #111; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 16px;">
        <div style="font-size: 11px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Users</div>
        <div style="font-size: 24px; font-weight: 700; color: rgba(255,255,255,0.9);">1,847</div>
        <div style="font-size: 12px; color: #34d399; margin-top: 4px;">+3.1%</div>
      </div>
    </div>

    <!-- Chart Placeholder -->
    <div style="background: #111; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <div style="font-size: 15px; font-weight: 600; color: rgba(255,255,255,0.9); margin-bottom: 4px;">Weekly Overview</div>
      <div style="font-size: 12px; color: rgba(255,255,255,0.4); margin-bottom: 16px;">Mar 22 - Mar 28</div>
      <!-- Chart area -->
      <div style="height: 160px; display: flex; align-items: flex-end; gap: 8px; padding: 0 4px;">
        <div style="flex: 1; background: rgba(229,166,48,0.15); border-radius: 4px 4px 0 0; height: 60%;"></div>
        <div style="flex: 1; background: rgba(229,166,48,0.15); border-radius: 4px 4px 0 0; height: 45%;"></div>
        <div style="flex: 1; background: rgba(229,166,48,0.15); border-radius: 4px 4px 0 0; height: 80%;"></div>
        <div style="flex: 1; background: rgba(229,166,48,0.15); border-radius: 4px 4px 0 0; height: 55%;"></div>
        <div style="flex: 1; background: #e5a630; border-radius: 4px 4px 0 0; height: 90%;"></div>
        <div style="flex: 1; background: rgba(229,166,48,0.15); border-radius: 4px 4px 0 0; height: 70%;"></div>
        <div style="flex: 1; background: rgba(229,166,48,0.15); border-radius: 4px 4px 0 0; height: 40%;"></div>
      </div>
      <div style="display: flex; justify-content: space-between; margin-top: 8px;">
        <span style="font-size: 10px; color: rgba(255,255,255,0.3);">Mon</span>
        <span style="font-size: 10px; color: rgba(255,255,255,0.3);">Tue</span>
        <span style="font-size: 10px; color: rgba(255,255,255,0.3);">Wed</span>
        <span style="font-size: 10px; color: rgba(255,255,255,0.3);">Thu</span>
        <span style="font-size: 10px; color: #e5a630;">Fri</span>
        <span style="font-size: 10px; color: rgba(255,255,255,0.3);">Sat</span>
        <span style="font-size: 10px; color: rgba(255,255,255,0.3);">Sun</span>
      </div>
    </div>

    <!-- Recent Activity -->
    <div style="margin-bottom: 24px;">
      <div style="font-size: 15px; font-weight: 600; color: rgba(255,255,255,0.9); margin-bottom: 12px;">Recent Activity</div>
      <!-- Activity Items -->
      <div style="background: #111; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; overflow: hidden;">
        <div style="display: flex; align-items: center; padding: 14px 16px; gap: 12px; border-bottom: 1px solid rgba(255,255,255,0.04);">
          <div style="width: 36px; height: 36px; border-radius: 100px; background: rgba(96,165,250,0.1); display: flex; align-items: center; justify-content: center;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg>
          </div>
          <div style="flex: 1;">
            <div style="font-size: 14px; color: rgba(255,255,255,0.9);">New user signed up</div>
            <div style="font-size: 12px; color: rgba(255,255,255,0.3);">2 minutes ago</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; padding: 14px 16px; gap: 12px; border-bottom: 1px solid rgba(255,255,255,0.04);">
          <div style="width: 36px; height: 36px; border-radius: 100px; background: rgba(52,211,153,0.1); display: flex; align-items: center; justify-content: center;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </div>
          <div style="flex: 1;">
            <div style="font-size: 14px; color: rgba(255,255,255,0.9);">Payment received</div>
            <div style="font-size: 12px; color: rgba(255,255,255,0.3);">15 minutes ago</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; padding: 14px 16px; gap: 12px;">
          <div style="width: 36px; height: 36px; border-radius: 100px; background: rgba(251,191,36,0.1); display: flex; align-items: center; justify-content: center;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <div style="flex: 1;">
            <div style="font-size: 14px; color: rgba(255,255,255,0.9);">Server warning</div>
            <div style="font-size: 12px; color: rgba(255,255,255,0.3);">1 hour ago</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Bottom Tab Bar -->
  <nav style="
    background: rgba(17,17,17,0.95);
    backdrop-filter: blur(20px);
    border-top: 1px solid rgba(255,255,255,0.08);
    display: flex;
    justify-content: space-around;
    padding: 8px 0 34px;
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
  ">
    <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="#e5a630" stroke="#e5a630" stroke-width="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
      <span style="font-size: 10px; color: #e5a630; font-weight: 500;">Home</span>
    </div>
    <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <span style="font-size: 10px; color: rgba(255,255,255,0.35);">Search</span>
    </div>
    <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
      <span style="font-size: 10px; color: rgba(255,255,255,0.35);">Alerts</span>
    </div>
    <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      <span style="font-size: 10px; color: rgba(255,255,255,0.35);">Profile</span>
    </div>
  </nav>
</div>
```

### 8.3 Desktop Dashboard Layout (HTML)

```html
<div style="
  width: 1440px;
  height: 900px;
  background: #0a0a0a;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif;
  display: flex;
  overflow: hidden;
">
  <!-- Sidebar -->
  <aside style="
    width: 260px;
    background: #111;
    border-right: 1px solid rgba(255,255,255,0.08);
    display: flex;
    flex-direction: column;
    padding: 16px 12px;
    flex-shrink: 0;
  ">
    <div style="padding: 8px 12px 24px; font-size: 18px; font-weight: 700; color: #e5a630;">AppName</div>
    <div style="font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.25); text-transform: uppercase; letter-spacing: 0.08em; padding: 8px 12px 4px;">Overview</div>
    <a style="display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; background: rgba(229,166,48,0.1); color: #e5a630; text-decoration: none; font-size: 14px; font-weight: 500; margin-bottom: 2px;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
      Dashboard
    </a>
    <a style="display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; color: rgba(255,255,255,0.45); text-decoration: none; font-size: 14px; font-weight: 500; margin-bottom: 2px;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      Analytics
    </a>
    <a style="display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; color: rgba(255,255,255,0.45); text-decoration: none; font-size: 14px; font-weight: 500; margin-bottom: 2px;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      Users
    </a>
    <div style="font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.25); text-transform: uppercase; letter-spacing: 0.08em; padding: 20px 12px 4px;">Management</div>
    <a style="display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; color: rgba(255,255,255,0.45); text-decoration: none; font-size: 14px; font-weight: 500; margin-bottom: 2px;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
      Projects
    </a>
    <a style="display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; color: rgba(255,255,255,0.45); text-decoration: none; font-size: 14px; font-weight: 500; margin-bottom: 2px;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      Settings
    </a>
    <div style="flex: 1;"></div>
    <!-- User -->
    <div style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 12px; display: flex; align-items: center; gap: 12px; padding-left: 12px;">
      <div style="width: 32px; height: 32px; border-radius: 100px; background: #e5a630; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; color: #0a0a0a;">JD</div>
      <div>
        <div style="font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.9);">John Doe</div>
        <div style="font-size: 11px; color: rgba(255,255,255,0.3);">john@example.com</div>
      </div>
    </div>
  </aside>

  <!-- Main Content -->
  <main style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
    <!-- Top Bar -->
    <header style="
      height: 56px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      display: flex;
      align-items: center;
      padding: 0 32px;
      justify-content: space-between;
      flex-shrink: 0;
    ">
      <h1 style="margin: 0; font-size: 18px; font-weight: 600; color: rgba(255,255,255,0.9);">Dashboard</h1>
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="position: relative;">
          <svg style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: rgba(255,255,255,0.3);" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input placeholder="Search..." style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; height: 36px; padding: 0 12px 0 36px; color: rgba(255,255,255,0.9); font-size: 13px; outline: none; width: 240px;"/>
        </div>
        <button style="background: #e5a630; color: #0a0a0a; border: none; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; height: 36px; display: flex; align-items: center; gap: 6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
          New Project
        </button>
      </div>
    </header>

    <!-- Dashboard Content -->
    <div style="flex: 1; overflow-y: auto; padding: 32px;">
      <!-- KPI Row -->
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px;">
        <div style="background: #111; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 20px;">
          <div style="font-size: 12px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Total Revenue</div>
          <div style="font-size: 28px; font-weight: 700; color: rgba(255,255,255,0.9);">$45,231</div>
          <div style="font-size: 12px; color: #34d399; margin-top: 4px;">+20.1% from last month</div>
        </div>
        <div style="background: #111; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 20px;">
          <div style="font-size: 12px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Active Users</div>
          <div style="font-size: 28px; font-weight: 700; color: rgba(255,255,255,0.9);">2,350</div>
          <div style="font-size: 12px; color: #34d399; margin-top: 4px;">+180 this week</div>
        </div>
        <div style="background: #111; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 20px;">
          <div style="font-size: 12px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Conversion</div>
          <div style="font-size: 28px; font-weight: 700; color: rgba(255,255,255,0.9);">3.2%</div>
          <div style="font-size: 12px; color: #f87171; margin-top: 4px;">-0.4% from last month</div>
        </div>
        <div style="background: #111; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 20px;">
          <div style="font-size: 12px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Active Projects</div>
          <div style="font-size: 28px; font-weight: 700; color: rgba(255,255,255,0.9);">12</div>
          <div style="font-size: 12px; color: rgba(255,255,255,0.3); margin-top: 4px;">3 due this week</div>
        </div>
      </div>

      <!-- Two Column Layout -->
      <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 16px;">
        <!-- Chart Card -->
        <div style="background: #111; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 24px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <div>
              <div style="font-size: 16px; font-weight: 600; color: rgba(255,255,255,0.9);">Revenue Overview</div>
              <div style="font-size: 13px; color: rgba(255,255,255,0.4);">Monthly revenue for 2026</div>
            </div>
            <div style="display: inline-flex; background: rgba(255,255,255,0.04); border-radius: 6px; padding: 2px;">
              <button style="background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.9); border: none; padding: 6px 12px; border-radius: 4px; font-size: 12px; cursor: pointer;">Month</button>
              <button style="background: transparent; color: rgba(255,255,255,0.4); border: none; padding: 6px 12px; border-radius: 4px; font-size: 12px; cursor: pointer;">Quarter</button>
              <button style="background: transparent; color: rgba(255,255,255,0.4); border: none; padding: 6px 12px; border-radius: 4px; font-size: 12px; cursor: pointer;">Year</button>
            </div>
          </div>
          <div style="height: 240px; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; align-items: flex-end; gap: 12px; padding-bottom: 16px;">
            <!-- Chart bars placeholder -->
            <div style="flex: 1; background: rgba(229,166,48,0.12); border-radius: 4px 4px 0 0; height: 40%;"></div>
            <div style="flex: 1; background: rgba(229,166,48,0.12); border-radius: 4px 4px 0 0; height: 55%;"></div>
            <div style="flex: 1; background: rgba(229,166,48,0.12); border-radius: 4px 4px 0 0; height: 70%;"></div>
            <div style="flex: 1; background: rgba(229,166,48,0.12); border-radius: 4px 4px 0 0; height: 60%;"></div>
            <div style="flex: 1; background: rgba(229,166,48,0.12); border-radius: 4px 4px 0 0; height: 85%;"></div>
            <div style="flex: 1; background: #e5a630; border-radius: 4px 4px 0 0; height: 95%;"></div>
          </div>
        </div>

        <!-- Recent Activity -->
        <div style="background: #111; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 24px;">
          <div style="font-size: 16px; font-weight: 600; color: rgba(255,255,255,0.9); margin-bottom: 20px;">Recent Activity</div>
          <div style="display: flex; flex-direction: column; gap: 16px;">
            <div style="display: flex; gap: 12px; align-items: flex-start;">
              <div style="width: 8px; height: 8px; border-radius: 100px; background: #34d399; margin-top: 6px; flex-shrink: 0;"></div>
              <div>
                <div style="font-size: 13px; color: rgba(255,255,255,0.9);">New deployment completed</div>
                <div style="font-size: 12px; color: rgba(255,255,255,0.3); margin-top: 2px;">2 minutes ago</div>
              </div>
            </div>
            <div style="display: flex; gap: 12px; align-items: flex-start;">
              <div style="width: 8px; height: 8px; border-radius: 100px; background: #60a5fa; margin-top: 6px; flex-shrink: 0;"></div>
              <div>
                <div style="font-size: 13px; color: rgba(255,255,255,0.9);">User feedback received</div>
                <div style="font-size: 12px; color: rgba(255,255,255,0.3); margin-top: 2px;">15 minutes ago</div>
              </div>
            </div>
            <div style="display: flex; gap: 12px; align-items: flex-start;">
              <div style="width: 8px; height: 8px; border-radius: 100px; background: #fbbf24; margin-top: 6px; flex-shrink: 0;"></div>
              <div>
                <div style="font-size: 13px; color: rgba(255,255,255,0.9);">Database backup scheduled</div>
                <div style="font-size: 12px; color: rgba(255,255,255,0.3); margin-top: 2px;">1 hour ago</div>
              </div>
            </div>
            <div style="display: flex; gap: 12px; align-items: flex-start;">
              <div style="width: 8px; height: 8px; border-radius: 100px; background: #f87171; margin-top: 6px; flex-shrink: 0;"></div>
              <div>
                <div style="font-size: 13px; color: rgba(255,255,255,0.9);">API rate limit warning</div>
                <div style="font-size: 12px; color: rgba(255,255,255,0.3); margin-top: 2px;">3 hours ago</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>
</div>
```

---

## Appendix: Quick Reference Cheat Sheet

### Wireframe Canvas Sizes

| Platform | Recommended Canvas | Notes |
|----------|-------------------|-------|
| iPhone (standard) | 393 x 852 | iPhone 15/16 |
| iPhone (large) | 430 x 932 | iPhone Plus models |
| iPhone (Pro) | 402 x 874 | iPhone 16 Pro |
| iPad | 820 x 1180 | iPad Air / standard |
| iPad Pro | 1024 x 1366 | 13" iPad Pro |
| Android Phone | 360 x 800 | Most common size |
| Android Tablet | 800 x 1280 | Standard 10" |
| Desktop (laptop) | 1440 x 900 | Common MacBook |
| Desktop (full HD) | 1920 x 1080 | Standard monitor |

### Minimum Touch Targets

| Platform | Size | Notes |
|----------|------|-------|
| iOS | 44 x 44 pt | Apple HIG recommendation |
| Android | 48 x 48 dp | Material Design recommendation |
| Web (WCAG) | 44 x 44 px | AAA level, 24x24 minimum AA |

### Key Spacing Values

| Usage | iOS (pt) | Android (dp) | Web (px) |
|-------|---------|-------------|---------|
| Screen edge margin | 16-20 | 16 | 16-32 |
| Card padding | 16-20 | 16 | 16-24 |
| List item height | 44-72 | 48-72 | 44-56 |
| Section gap | 24-32 | 24 | 24-48 |
| Input height | 44-50 | 56 | 40-44 |
| Button height | 44-50 | 48-56 | 36-44 |
| Icon size (toolbar) | 22-24 | 24 | 20-24 |
| Icon size (tab bar) | 24-28 | 24 | 24 |

### CSS Reset for Wireframes

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  background: #0a0a0a;
  color: rgba(255, 255, 255, 0.9);
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', 'Segoe UI', system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

input, button, textarea, select {
  font-family: inherit;
  font-size: inherit;
}

a {
  color: inherit;
  text-decoration: none;
}
```
