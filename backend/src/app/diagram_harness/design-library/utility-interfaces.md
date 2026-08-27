# Utility Interfaces

> Admin panels, CRUD apps, inventory tools, back-office systems, forms-first workflows, tabular data UIs. The "work gets done here" category. Sits between dashboards (read-mostly, data-dense) and landing pages (marketing, conversion).

---

## Quick ref

- **When to load:** brief mentions admin, CRUD, inventory, management, back-office, operations tool, internal tool, workflow, wizard, data entry, bulk operations, permissions, audit, approvals.
- **Dashboards vs utility interfaces:** dashboards are read-mostly (monitor, analyse). Utility is read-write (create, edit, approve, bulk-act). Patterns diverge.
- **Density is a feature, not a smell.** Operators use these daily for hours; sparse spacing means more scrolling, more clicks, more time.
- **Keyboard > mouse.** Bulk select, navigate, submit — all from keyboard. Discoverability via `?` help overlay.
- **States multiply.** Beyond loading/empty/error you need: saving, saved, dirty, stale, conflict, permission-denied, pending-approval, locked-by-another-user.
- **Anti-patterns:** marketing-polished gradients, overly generous whitespace, animation-heavy transitions, hiding actions behind hover, confirming-every-action.

---

## How Utility Interfaces Differ

| Landing page | Dashboard | Utility interface |
|---|---|---|
| First impression | Daily glance | Daily work |
| Scrollytelling | Spatial status | Spatial + transactional |
| Conversion-focused | Efficiency-focused | Task completion |
| Hero + CTAs | Metric cards | List/detail + forms |
| Photography | Data viz | Data tables + forms |
| Centred layouts | Sidebar + grid | Sidebar + list/detail panes |
| Animation as identity | Animation as feedback | Animation minimal — state transitions only |
| Read-only | Read-mostly | Read + write + bulk-write |
| Anonymous users | Authenticated dashboards | Role-based, permissioned, audited |

---

## Information Architecture

### The Three-Pane Shell

Most utility UIs converge on a three-pane layout:

```
┌──────────┬──────────────────┬──────────────────┐
│          │                  │                  │
│ Sidebar  │ List / Index     │ Detail / Edit    │
│          │                  │                  │
│ Nav      │ Filter chips     │ Selected record  │
│ Sections │ Search           │ Field-by-field   │
│ Switcher │ Bulk selection   │ Inline editing   │
│          │ Row list         │ Related records  │
│ User     │ Pagination       │ Audit trail      │
│          │                  │                  │
└──────────┴──────────────────┴──────────────────┘
  ~14rem        flex 1              ~36-48rem
```

Variants:
- **Two-pane** (mobile / narrow): list collapses, detail is full-screen with back nav
- **List-only** (data-viewing, bulk ops): detail opens modal or drawer
- **Detail-only** (single-record editor): list becomes a breadcrumb + sibling nav (prev/next)

### Route Conventions

- `/{resource}` — list (e.g., `/orders`)
- `/{resource}/new` — create form
- `/{resource}/:id` — detail (read mode)
- `/{resource}/:id/edit` — detail (edit mode)
- `/{resource}/bulk` — bulk actions scratchpad (if complex)

Keep URLs RESTful; users bookmark and share them. Don't hide state in client-only query params when it should be in the path.

---

## Typography

Less dramatic than dashboards; more functional than landing pages.

- **Body UI:** clean workhorse sans — DM Sans, Plus Jakarta Sans, Outfit, Söhne. 13–14px body.
- **Data / numeric:** monospace is mandatory for IDs, timestamps, prices, counts, SKUs, reference codes. Tabular alignment makes scanning possible.
- **Labels:** 11–12px, uppercase, letter-spaced, dim colour. Consistent across forms and tables.
- **Page titles:** 18–24px, not 48px. Save the drama for content.
- **Section headers:** small, uppercase, letter-spaced; used as table/group captions.

---

## Colour Strategy

### Surface Hierarchy (dark, typical for operator tools)

```css
:root {
  --bg-base:     #0a0a0c;  /* canvas behind everything */
  --bg-surface:  #111116;  /* panels, cards, table rows */
  --bg-raised:   #18181f;  /* modals, popovers, hover */
  --bg-selected: #1e1e28;  /* selected row / active field */

  --border:         #1e1e28;
  --border-focus:   #3a3a48;
  --border-strong:  #4a4a58;  /* form fields */

  --text-bright:  #f4f5f8;
  --text-default: #b0b0b8;
  --text-dim:     #6b6b76;
  --text-placeholder: #4a4a55;
}
```

### Semantic Palette (expanded vs dashboards)

Dashboards need 4 semantic colours. Utility tools often need 6+:

```css
:root {
  --positive:   #22c55e;   /* success, approved, active */
  --negative:   #ef4444;   /* error, failed, rejected */
  --warning:    #f59e0b;   /* needs attention, pending */
  --info:       #3b82f6;   /* informational, in-progress */
  --neutral:    #6b7280;   /* paused, archived, inactive */
  --accent:     var(--brand);  /* primary actions, active nav */

  /* Each needs a dim variant (10-15% alpha) for badges + backgrounds */
}
```

### Light-mode Operator Interfaces

Some users prefer light. Mirror the palette:

```css
:root[data-theme="light"] {
  --bg-base:    #ffffff;
  --bg-surface: #fafafa;
  --bg-raised:  #f4f4f5;
  --bg-selected:#ebebed;
  --border:     #e4e4e7;
  --text-bright:  #09090b;
  --text-default: #3f3f46;
  --text-dim:     #71717a;
}
```

Provide both. Let the user pick. System-preference detection is default.

---

## Data Tables (The Backbone)

This is where utility UIs live or die. Get this right and half the product is good.

### Structure

```css
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}

.table th {
  text-align: left;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-dim);
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--border);
  background: var(--bg-surface);
  position: sticky;
  top: 0;
  z-index: 1;
  user-select: none;
  cursor: pointer; /* sortable */
}

.table td {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}

.table tr:hover td {
  background: var(--bg-raised);
}

.table tr[aria-selected="true"] td {
  background: var(--bg-selected);
  box-shadow: inset 2px 0 0 var(--accent);
}

/* Numeric columns always monospace, right-aligned */
.table td.numeric,
.table td.money,
.table td.quantity {
  font-family: var(--font-mono);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
```

### Column types and rules

| Type | Alignment | Font | Truncation |
|---|---|---|---|
| Text (name, title) | left | UI sans | ellipsis at column width |
| Numeric (count, qty) | right | mono | never truncate |
| Money | right | mono | never truncate |
| Date / timestamp | left or right | mono | relative + tooltip with absolute |
| ID / reference code | left | mono | monospace, truncate with tooltip |
| Status | left | UI sans | badge (dim bg + semantic colour) |
| Actions (menu) | right | — | icon-only, reveal on row hover |
| Selection (checkbox) | leftmost | — | fixed 40px column |

### Density modes

Let users toggle density. Store preference per user.

```css
.table[data-density="compact"]  { --row-pad: 0.25rem 0.5rem; }
.table[data-density="default"]  { --row-pad: 0.5rem 0.75rem; }
.table[data-density="comfortable"] { --row-pad: 0.75rem 1rem; }
```

### Sticky everything

- Header sticky to top of scroll container
- Leftmost column (name/ID) sticky to left when scrolling horizontally
- Selection column sticky with the name column
- Action menu column sticky to right edge
- Row of bulk-action controls sticky to top when any rows selected

### Empty state

Not "No data." Provide:
- Icon relevant to the resource
- "No {resources} yet" or "No {resources} match your filters"
- One-line explanation of what would appear
- Action button (create first one, clear filters)

### Error state

If the request failed, don't silently render nothing:
- Error summary at top of table region
- Retry button
- Technical detail collapsed but accessible

---

## Forms

### Layout

- **Single column.** Multi-column forms drop completion rates ~15%.
- **Labels above fields**, not beside or placeholder-as-label.
- **Group related fields** with subtle section dividers + small uppercase captions.
- **Long forms:** split into sections with anchor nav down the right side.
- **Wizards:** discrete steps with progress indicator. One concept per step.

### Field patterns

```css
.field {
  display: grid;
  gap: 0.375rem;
  margin-bottom: 1rem;
}

.field-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-default);
  display: flex;
  justify-content: space-between;
}

.field-hint {
  font-size: 0.75rem;
  color: var(--text-dim);
}

.field-error {
  font-size: 0.75rem;
  color: var(--negative);
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.input {
  background: var(--bg-surface);
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  color: var(--text-bright);
  transition: border-color 120ms ease;
}

.input:focus {
  border-color: var(--accent);
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--accent) 20%, transparent);
}

.input[aria-invalid="true"] {
  border-color: var(--negative);
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--negative) 20%, transparent);
}

.input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: var(--bg-base);
}

.input[data-dirty="true"] {
  border-left: 2px solid var(--warning);  /* unsaved indicator */
}
```

### Validation timing

- **On blur** for field-level (not every keystroke)
- **On submit** for cross-field / server-side
- **Inline** errors only — never a toast for a field error
- Preserve the user's input on error; never clear

### Required vs optional

Show optional, not required. If most fields are required, mark the minority as (optional). If most are optional, mark the minority with an asterisk or "*required".

### Multi-step wizards

- Progress bar or step indicator fixed at the top
- One concept per step — don't cram multiple decisions
- Allow back navigation without losing data
- Save partial state on each step (if long)
- Show a summary review step before submission
- Success state with what happened + where to go next

---

## Bulk Operations

### Selection patterns

- Checkbox column is leftmost and sticky
- Click a row = select; Shift-click = range-select; Cmd/Ctrl-click = toggle
- Selection count + actions appear in a sticky bar above the table
- "Select all matching filter" (not just visible page) when relevant
- Shift-select across pages gracefully (either expand or warn)

### Action bar (appears on selection)

```
┌────────────────────────────────────────────────┐
│ 12 orders selected · Select all 1,247 matching │
│                                                │
│ [Approve] [Archive] [Export ▾] [More ▾]  [×]   │
└────────────────────────────────────────────────┘
```

- Primary actions inline, overflow in "More" menu
- Destructive actions require explicit confirmation dialog
- Long-running actions: show progress, allow cancel, report outcomes per-row

### Outcome reporting

Bulk actions partially fail often. Report clearly:

- Total attempted, succeeded, failed
- Expandable list of failures with per-row reason
- Offer to retry failures only
- Undo option for reversible bulk actions (5–10s window, then permanent)

---

## Permissions + Audit

### Visibility vs capability

Three states per action:
1. **Not allowed** — hide the control entirely
2. **Allowed but unavailable** (wrong state) — show disabled with reason tooltip
3. **Requires approval** — show with pending-review badge after submit

Never show a control that always errors on click. That's a design failure.

### Audit trail

Most utility tools need "who did what, when" visible:

- Per-record activity feed (right pane or tab)
- Entries: timestamp, actor, action, before/after diff (for edits)
- Filter by actor, action type, date range
- Exportable (CSV, JSON)

### Impersonation + elevated access

If admins can act-as another user:
- Persistent banner ("Impersonating {user}") across all views
- Visually distinct (amber border, different chrome)
- Clear "return to self" control
- All actions logged with both actors

---

## State Complexity

Utility UIs have many more states than dashboards. Design each:

| State | When | Treatment |
|---|---|---|
| **Loading (first)** | Initial data fetch | Skeleton matching final layout |
| **Loading (refresh)** | Background sync | Subtle spinner in corner; don't blank the UI |
| **Empty (no data)** | Resource never had data | Icon + "No X yet" + create CTA |
| **Empty (filtered)** | Filters exclude all | Icon + "No X match filters" + clear-filters CTA |
| **Error** | Request failed | Retry button + technical detail collapsed |
| **Saving** | Mutation in flight | Button shows spinner; inputs disabled |
| **Saved** | Mutation succeeded | Inline confirmation (1.5s), then return to idle |
| **Dirty (unsaved)** | User edited, not submitted | Warning icon on tab/header; confirm before navigation |
| **Stale** | Another user modified | Banner "This record was updated. Refresh to see latest." |
| **Conflict** | Save would overwrite | Modal showing server/yours/merge options |
| **Permission denied** | User lacks capability | Inline explanation, not just 403 |
| **Pending approval** | Submitted, awaiting reviewer | Badge + expected timeline |
| **Locked** | Being edited by another user | Show who's editing + when they'll be done (or take-over option) |

---

## Motion

Utility UIs want the LEAST animation of any category. Every transition costs attention.

### DO

- Row enter/exit when list updates (fade + micro-translate, 120ms)
- Inline save confirmation (fade-in checkmark, 800ms then fade-out)
- Skeleton shimmer during initial load
- Drawer / modal: 180ms slide-in, respect prefers-reduced-motion

### DO NOT

- Parallax anything
- Bounce / spring easings (toy-like in work contexts)
- Animated charts beyond data updates
- Scroll-triggered reveals
- Page transitions longer than 200ms

---

## Keyboard

Operators use keyboard. Design for it.

- `?` — help overlay with all shortcuts
- `/` or `⌘K` — search / command palette
- `n` — new record
- `j` / `k` — next / prev row
- `x` — toggle selection
- `⇧x` — range select
- `⌘s` — save
- `⌘enter` — submit / confirm
- `esc` — cancel / close modal / clear selection
- `⌘z` / `⌘⇧z` — undo / redo (when supported)

Show shortcuts in button tooltips and menu items. Don't hide them.

---

## Progressive Disclosure

Utility UIs show a lot. Layer it:

1. **List view** shows columns that answer "what is this?" — 5–8 columns
2. **Column picker** lets power users add technical columns (IDs, timestamps, refs)
3. **Quick preview** (drawer/popover) shows ~15 fields
4. **Detail view** shows everything
5. **Expert toggle** reveals hidden-by-default sections (advanced filters, raw data, debugging)

Don't cram detail view fields into the list. Don't force every user through detail view to see common fields.

---

## Command Palette

Most power-user tools have one. Cmd+K opens a searchable command surface:

- Navigate to any resource by name
- Invoke actions (create, bulk ops, exports)
- Recent items
- Fuzzy match
- Shortcut hints next to each entry
- Scoped: if on a record, first results are record-specific actions

Libraries: `cmdk` (React), similar patterns in other frameworks.

---

## Anti-patterns

- Marketing-polished gradients and animations in operator contexts
- Hiding destructive actions behind hover-only menus (discoverability fail)
- Confirming every action (trust the user; confirm only irreversible ones)
- Icon-only buttons without tooltips
- Pagination where infinite scroll would be faster (or vice versa)
- Forcing one-record-at-a-time when bulk is the expected flow
- Losing user input on validation error
- Sparse layouts that force scrolling for operators who do 100+ records/day
- Modal-stack soup (modal opens modal opens modal)
- Decorative photography / stock images

---

## The Utility Interface Checklist

- [ ] Three-pane shell (sidebar / list / detail) or a justified variant
- [ ] Density toggle (compact / default / comfortable), preference persisted
- [ ] Monospace for ALL IDs, timestamps, numerics
- [ ] Data tables with sticky headers, sticky first column, row hover, row selection
- [ ] Empty state (no data) distinct from filtered empty state
- [ ] Loading state (skeleton) + refresh state (subtle, non-blanking)
- [ ] Error state with retry
- [ ] Dirty-state indicator + navigation warning
- [ ] Stale / conflict detection when concurrent edits possible
- [ ] Bulk selection with sticky action bar + outcome reporting
- [ ] Undo window for reversible actions (5–10s)
- [ ] Permission-aware UI (hide / disable with reason / require-approval)
- [ ] Audit trail visible per record
- [ ] Keyboard shortcuts for navigation, selection, save, search (`?` help overlay)
- [ ] Command palette (⌘K) for power users
- [ ] Forms: single-column, labels above, inline validation on blur
- [ ] Semantic colour palette with 6+ meanings, dim background variants
- [ ] Surface hierarchy of 3+ levels (base / surface / raised / selected)
- [ ] Dark + light both available, system preference detected
- [ ] Minimal motion (≤200ms transitions, no parallax, no bouncy easings)
- [ ] No marketing polish (gradients, stock photos, decorative animation)
- [ ] Route conventions: `/x`, `/x/new`, `/x/:id`, `/x/:id/edit` — shareable URLs
