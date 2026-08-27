# Dashboard Palettes (Locked)

> Recipe G uses ONE of these palettes verbatim. Pick by name, copy hex values exactly. Do NOT blend, mix, or improvise. Do NOT tint backgrounds with the accent color.

---

## Hard rules (apply to every palette)

1. **Background and surface layers are neutral grays.** Never tinted with the accent. A violet accent does NOT make the background `#0a0a14` — it stays `#0a0a0c`.
2. **Accent appears ONLY on**: active nav state, primary buttons, key metric highlights, in-progress badges, focused borders. Nothing else.
3. **Semantic colors are fixed across all palettes**: `#22c55e` positive / `#ef4444` negative / `#f59e0b` warning / `#3b82f6` info. Never substituted with the accent.
4. **Text colors are fixed per theme** (dark vs light). Don't tint text with accent.
5. **Pick exactly one palette by name.** Use the literal hex values in the schema below — no LCH conversion, no "close enough" approximations.

---

## Palette 1: `indigo-pro` (default)

Modern SaaS feel. Linear / Stripe Dashboard. Best for: project management, team tools, B2B admin.

```json
{
  "theme": "dark",
  "accent_name": "Indigo",
  "colors": {
    "background":  {"hex": "#0a0a0c", "name": "Background", "usage": "Page background, deepest layer"},
    "surface":     {"hex": "#111116", "name": "Surface",    "usage": "Cards, panels, sidebar"},
    "raised":      {"hex": "#18181f", "name": "Raised",     "usage": "Hover, active rows, dropdowns"},
    "border":      {"hex": "#1e1e28", "name": "Border",     "usage": "Hairlines between cards/rows"},
    "text":        {"hex": "#f4f5f8", "name": "Text",       "usage": "Headings, primary body copy"},
    "muted":       {"hex": "#b0b0b8", "name": "Muted",      "usage": "Secondary copy, table values"},
    "subtle":      {"hex": "#6b6b76", "name": "Subtle",     "usage": "Labels, timestamps, eyebrows"},
    "accent":      {"hex": "#5E6AD2", "name": "Accent",     "usage": "Active nav, primary CTA, focus ring"},
    "primary":     {"hex": "#5E6AD2", "name": "Primary",    "usage": "Same as accent"},
    "positive":    {"hex": "#22c55e", "name": "Positive",   "usage": "Success badges, up-trend deltas"},
    "negative":    {"hex": "#ef4444", "name": "Negative",   "usage": "Error badges, down-trend deltas"},
    "warning":     {"hex": "#f59e0b", "name": "Warning",    "usage": "Pending, blocked, in-review"},
    "foreground":  {"hex": "#0a0a0c", "name": "Foreground", "usage": "Text on accent backgrounds"}
  }
}
```

## Palette 2: `electric-blue` (data-heavy)

Datadog / observability tooling vibe. Best for: monitoring, analytics, infra.

```json
{
  "theme": "dark",
  "accent_name": "Electric Blue",
  "colors": {
    "background":  {"hex": "#0a0a0c"},
    "surface":     {"hex": "#111116"},
    "raised":      {"hex": "#18181f"},
    "border":      {"hex": "#1e1e28"},
    "text":        {"hex": "#f4f5f8"},
    "muted":       {"hex": "#b0b0b8"},
    "subtle":      {"hex": "#6b6b76"},
    "accent":      {"hex": "#0EA5E9"},
    "primary":     {"hex": "#0EA5E9"},
    "positive":    {"hex": "#22c55e"},
    "negative":    {"hex": "#ef4444"},
    "warning":     {"hex": "#f59e0b"},
    "foreground":  {"hex": "#0a0a0c"}
  }
}
```

## Palette 3: `slate-sage` (premium operational)

Bloomberg-Terminal / Notion. Subdued, calm. Best for: financial, executive, content-heavy admin.

```json
{
  "theme": "dark",
  "accent_name": "Slate Sage",
  "colors": {
    "background":  {"hex": "#0a0a0c"},
    "surface":     {"hex": "#111116"},
    "raised":      {"hex": "#18181f"},
    "border":      {"hex": "#1e1e28"},
    "text":        {"hex": "#f4f5f8"},
    "muted":       {"hex": "#b0b0b8"},
    "subtle":      {"hex": "#6b6b76"},
    "accent":      {"hex": "#7C8C7E"},
    "primary":     {"hex": "#7C8C7E"},
    "positive":    {"hex": "#22c55e"},
    "negative":    {"hex": "#ef4444"},
    "warning":     {"hex": "#f59e0b"},
    "foreground":  {"hex": "#0a0a0c"}
  }
}
```

## Palette 4: `magenta-tech` (devtools)

Sentry / GitLab. Best for: developer tools, security, error tracking.

```json
{
  "theme": "dark",
  "accent_name": "Magenta",
  "colors": {
    "background":  {"hex": "#0a0a0c"},
    "surface":     {"hex": "#111116"},
    "raised":      {"hex": "#18181f"},
    "border":      {"hex": "#1e1e28"},
    "text":        {"hex": "#f4f5f8"},
    "muted":       {"hex": "#b0b0b8"},
    "subtle":      {"hex": "#6b6b76"},
    "accent":      {"hex": "#A855F7"},
    "primary":     {"hex": "#A855F7"},
    "positive":    {"hex": "#22c55e"},
    "negative":    {"hex": "#ef4444"},
    "warning":     {"hex": "#f59e0b"},
    "foreground":  {"hex": "#0a0a0c"}
  }
}
```

## Palette 5: `clean-light` (light theme)

Stripe Dashboard / Linear light mode. Best for: content-first dashboards, public-facing reporting.

```json
{
  "theme": "light",
  "accent_name": "Indigo Light",
  "colors": {
    "background":  {"hex": "#FAFAFA", "name": "Background", "usage": "Page background"},
    "surface":     {"hex": "#FFFFFF", "name": "Surface",    "usage": "Cards, panels"},
    "raised":      {"hex": "#F4F4F5", "name": "Raised",     "usage": "Hover, active rows"},
    "border":      {"hex": "#E5E5E8", "name": "Border",     "usage": "Hairlines"},
    "text":        {"hex": "#0F0F12", "name": "Text",       "usage": "Headings, primary copy"},
    "muted":       {"hex": "#52525B", "name": "Muted",      "usage": "Secondary copy"},
    "subtle":      {"hex": "#A1A1AA", "name": "Subtle",     "usage": "Labels, timestamps"},
    "accent":      {"hex": "#5E6AD2", "name": "Accent",     "usage": "Active nav, primary CTA"},
    "primary":     {"hex": "#5E6AD2"},
    "positive":    {"hex": "#16A34A"},
    "negative":    {"hex": "#DC2626"},
    "warning":     {"hex": "#D97706"},
    "foreground":  {"hex": "#FFFFFF", "name": "Foreground", "usage": "Text on accent backgrounds"}
  }
}
```

---

## How to apply

In the design system output, when recipe = `g`:

1. Pick a palette name based on the brief's vibe (modern SaaS → indigo-pro, monitoring → electric-blue, financial → slate-sage, devtools → magenta-tech, light public → clean-light).
2. Copy the `colors` block VERBATIM into the `design_system.colors` field. No substitutions.
3. The `style` field should reference the palette name: `"Dashboard recipe G with indigo-pro palette — Linear/Stripe-style operational dark theme."`
4. The `design_memo.variation_picks.color` should record the palette: `"palette: indigo-pro"`.

---

## Anti-patterns (DO NOT)

- **DO NOT** tint the background or surface layers with the accent. Backgrounds are neutral gray. A purple accent on a `#14101a` (purple-tinted) background looks amateur.
- **DO NOT** generate intermediate gray values that drift toward the accent hue. `#111116` is `#111116` regardless of accent.
- **DO NOT** substitute the accent for semantic colors. Active badge stays accent-colored, but DONE badges always use `#22c55e` and BLOCKED badges always use `#f59e0b`.
- **DO NOT** invent new palettes. Pick from the five above. If none fit, default to `indigo-pro`.
- **DO NOT** generate component-level hex values that diverge from these tokens (e.g. don't make `card-priority.background` `#1E2128` when surface is `#111116`).
