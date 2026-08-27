# User-Facing Diagrams

## User Flow {#user-flow}

**When:** Any user-facing feature discussed. Tier 1.
**Layout:** L→R or T→B. Start (●) at entry, screens as rectangles, decisions as diamonds, end (◉) at goal.

**Nodes:**
| Element | Shape | Example |
|---|---|---|
| Screen/Page | Rectangle | "Login Page", "Dashboard" |
| Decision | Diamond | "Has account?" |
| Action | Rounded rect | "Submit form" |
| Error state | Red-bordered rect | "Invalid credentials" |
| Success state | Green-bordered rect | "Order confirmed" |

**Edges:** Labeled with user action ("clicks Sign Up", "enters email", "selects plan").
**Must include:** Happy path (green arrows), error path (red arrows), edge cases (gray arrows).
**Color:** Happy path edges = #4ade80, error = #f87171, alternative = #858585.

**Structure:**
```
● → [Landing Page] → ◇ Has account?
                      ├─ yes → [Login] → ◇ Valid? → yes → [Dashboard] → ◉
                      │                          → no → [Error] → [Login]
                      └─ no → [Sign Up] → [Verify Email] → [Onboarding] → [Dashboard] → ◉
```

## Wireframe {#wireframe}

**When:** User requests UI sketch or discusses page layout. Tier 3 (user-initiated).
**Layout:** Actual page proportions — desktop: ~1440×900, mobile: ~390×844.

**Elements:** All gray, no color, no real content:
| Element | Rendering |
|---|---|
| Header/Nav | Light gray bar, full width, 60px height |
| Sidebar | Gray rect, 240px wide, full height |
| Content block | Medium gray rect with label |
| Image placeholder | Rect with X diagonal lines |
| Text block | Horizontal lines (3-4 thin rects stacked) |
| Button | Small rounded rect with label |
| Input field | Outlined rect with placeholder text |
| Card | Rect with subtle border, sections inside |

**Fill colors:** Content=#e5e5e5 on bg=#f5f5f5 (light wireframe) or #333 on #1a1a1a (dark wireframe — use for our platform).

**Templates (pre-built zone layouts):**
1. **Dashboard:** Header + Sidebar + Grid of metric cards + Table
2. **Landing page:** Hero + Features grid + CTA + Footer
3. **Settings:** Header + Tabs + Form sections
4. **List + Detail:** Header + List sidebar + Detail panel
5. **Form:** Header + Centered form card + Submit
6. **Auth:** Split panel (branding left, form right)

## Screen Flow / Navigation Map {#screen-flow}

**When:** Multiple pages discussed — show how they connect. Tier 2.
**Layout:** Tree or directed graph. Main nav items as top row, sub-pages below.
**Nodes:** Small rectangles (120×80) with page name. Color by section.
**Edges:** Solid = primary nav link, dashed = modal/drawer, dotted = redirect.

**Structure:**
```
                    [Home]
        ┌─────────────┼─────────────┐
   [Projects]    [Settings]     [Profile]
    ├─[Detail]    ├─[General]    └─[Edit]
    │  └─[Session] ├─[Team]
    └─[Board]      └─[Billing]
```

## Sitemap {#sitemap}

**When:** Planning page structure. Auto-generate from route discussion.
**Layout:** Hierarchical tree T→B. Root at top, max 4 levels deep.
**Nodes:** Page name + URL path (e.g., "Settings /settings"). Grouped by nav section.
