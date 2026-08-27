# UX Ergonomics & Cognitive Design

> Design isn't just how it looks — it's how it works. These are the laws of interface physics.

---

## Quick ref

- **When to load:** SaaS, e-commerce, fitness, travel, local-business, education, non-profit, marketplace, fintech recipes.
- Fitts's Law — target size × distance. Primary CTAs should be big and close.
- Hick's Law — choice count slows decisions. Pricing: 2–3 tiers, max.
- Miller's Law — chunk info into ≤7 groups.
- Information scent — link text must describe destination ("Click here" fails).
- Progressive disclosure — don't show everything at once.
- Proximity principle — related elements grouped visually.
- Confirmation fatigue — don't confirm reversible actions. Only destructive / irreversible ones.
- Dark patterns (confirmshaming, hidden costs, forced continuity) — never.

---

## Fitts's Law

**The time to reach a target is a function of the distance to and size of the target.**

### Application

- **Make primary CTAs large.** Minimum 44x44px (Apple HIG), 48x48px (Material Design)
- **Place important actions near the cursor's resting position.** On desktop, that's usually center or slightly above. On mobile, that's the bottom third (thumb zone).
- **Edge and corner targets are infinitely tall** on desktop — menus pinned to screen edges are faster to hit. This is why macOS menu bar works.
- **Spacing between targets matters.** Minimum 8px gap between touch targets to prevent mis-taps.
- **Dropdown menus are slow** — the user must move diagonally through a narrow corridor. Use mega-menus or panels instead.

### Numbers

| Target Type | Minimum Size | Comfortable Size |
|-------------|-------------|-----------------|
| Touch target (mobile) | 44x44px | 48x48px |
| Click target (desktop) | 24x24px | 32x32px |
| Inline text link | Full text width | Add padding to hit area |
| Icon button | 32x32px | 40x40px |
| Gap between targets | 8px | 12px |

---

## Hick's Law

**Decision time increases logarithmically with the number of choices.**

### Application

- **Limit navigation items.** 5-7 top-level items maximum. Beyond 7, users slow down measurably.
- **Progressive disclosure.** Don't show all options at once. Reveal complexity in stages.
- **Recommended/default options.** On pricing pages, highlight one tier. In forms, pre-select the common choice.
- **Categorize large option sets.** A list of 50 unsorted items is slower than 5 groups of 10.
- **Reduce choices per viewport.** Linear shows a single-focus section with minimal CTAs per viewport — "Don't compete for attention you haven't earned."

### The Paradox of Choice

More options feel like more freedom but produce more anxiety and lower conversion. Pricing pages with 2-3 tiers convert better than 5+. Forms with fewer fields convert better than comprehensive ones.

---

## Cognitive Load Theory (Miller's Law)

**Working memory holds 7±2 items. Reduce cognitive load by chunking information.**

### Application

- **Chunk content into groups of 3-5.** Feature grids, pricing tiers, navigation items.
- **Phone numbers:** 020-7946-0958 not 02079460958
- **Break forms into steps.** A 15-field form as 3 steps of 5 fields each feels lighter.
- **Use visual hierarchy to pre-sort information.** Users shouldn't have to figure out what's important — the design should tell them.
- **Remove every element that doesn't serve the user's current goal.** Every element on screen costs cognitive overhead.

### Three Types of Cognitive Load

1. **Intrinsic:** The inherent complexity of the task. Can't be reduced, only managed.
2. **Extraneous:** Load created by poor design. Eliminate this.
3. **Germane:** Load that aids learning. Support this with clear patterns.

---

## Gestalt Principles

How the brain organizes visual information. Use these to create clear structure without explicit borders or labels.

### Proximity

Elements close together are perceived as related. This is the MOST powerful organizational tool in UI design. Space between groups > space within groups.

```
[Label]    [Label]    [Label]
[Input]    [Input]    [Input]
                                  ← larger gap
[Label]    [Label]
[Input]    [Input]
```

### Similarity

Elements that look alike are perceived as related. Use consistent styling for elements that do the same thing (all nav links look the same, all CTAs share a style).

### Closure

The brain completes incomplete shapes. You don't need a full border around a card — a top border and shadow might be enough.

### Continuity

Elements arranged on a line or curve are perceived as related. Align elements to invisible guide lines. This is why grid systems work.

### Figure-Ground

Users need to immediately distinguish foreground (interactive content) from background (decorative/structural). Modals use dark overlays for this reason. Cards use subtle elevation.

### Common Fate

Elements moving in the same direction are perceived as related. Staggered animations (cards fading in sequence) create visual grouping.

---

## Response Time Thresholds (Nielsen)

| Threshold | User Perception | Design Response |
|-----------|----------------|-----------------|
| **0.1s** | Instantaneous | No feedback needed |
| **1.0s** | Noticeable delay | Show subtle loading state |
| **10s** | Attention limit | Show progress bar with estimated time |

### Perceived Performance Techniques

- **Skeleton screens** (layout-shaped placeholders) feel 20-30% faster than spinners
- **Optimistic UI:** Show success immediately, handle failure in background. "Message sent" before server confirms.
- **Progressive loading:** Show content as it arrives, don't wait for everything
- **Instant feedback:** Button press → immediate visual change (color, text, icon)
- **Lazy loading:** Below-fold content loads when needed, not at page load

---

## Jakob's Law

**Users spend most of their time on OTHER sites. They expect your site to work like the ones they already know.**

### Application

- **Don't reinvent standard patterns.** Logo top-left links to home. Shopping cart top-right. Search has a magnifying glass icon. These conventions exist because they work.
- **Innovate on value, not navigation.** Unseen Studio's spatial navigation works because their audience (creative directors) expects experimental interfaces. A SaaS product should have standard navigation.
- **When you break convention, make it obvious.** If your hamburger menu is somewhere unusual, give extra visual weight to signal it.
- **Study your competitors' UX.** Users come to you pre-trained on competitor patterns.

---

## Form Design

### Evidence-Based Rules

- **Single column:** Multi-column forms reduce completion by 15%
- **Labels above fields:** Not beside (adds scanning distance) or inside (placeholder-as-label disappears on focus — accessibility failure)
- **Group related fields** with subtle section dividers
- **Put labels close to their fields** (proximity principle) — label-to-field gap should be smaller than field-to-field gap
- **Inline validation on blur**, not keystroke-by-keystroke
- **Error messages below the field** they relate to, in red, with icon
- **Never clear the form on error** — preserve input
- **Optional fields:** Mark optional, not required (most fields should be required — question whether you need optional ones at all)
- **Autofill support:** Use correct `autocomplete` attributes

### Field Ordering

1. Group by topic (personal info, then address, then payment)
2. Within groups: most common/easiest first (name before phone number)
3. End with the most commitment-heavy field (credit card last)

---

## Scroll Design

### Infinite Scroll vs Pagination

- **Infinite scroll:** Good for discovery/browsing (social feeds, image galleries). Bad for goal-oriented tasks.
- **Pagination:** Good for search results, product listings, data tables. Users need to feel progress and be able to find items again.
- **Load more button:** Compromise — user controls when to load, maintains position.

### Sticky Elements

- **Headers:** Persist navigation + CTA. Slim down on scroll (reduce height, hide subtitle).
- **Sidebars:** Table of contents that highlights current section
- **CTAs:** Persistent but not obstructive. Bottom bar on mobile, sticky header CTA on desktop.
- **Never stack sticky elements.** If header is sticky, sidebar TOC should scroll with content on mobile.

### Scroll Depth Data

Average users scroll 50-60% of page content. Critical information above 50%. CTAs should appear before the 50% mark AND at the end.

---

## Error Prevention vs Error Handling

### Prevention (Prefer This)

- **Constraints:** Disabled buttons until form is valid. Date pickers instead of free text. Dropdowns for known option sets.
- **Confirmation dialogs:** For destructive actions only (delete, send, purchase). Not for navigation.
- **Undo:** More forgiving than "Are you sure?" dialogs. Let users act, then undo. Gmail's "Undo send" is the gold standard.
- **Smart defaults:** Pre-fill likely answers. Auto-detect country from IP. Suggest based on previous input.
- **Inline hints:** Show format requirements BEFORE the user makes an error ("Password must be 8+ characters" shown on focus, not after failed submission).

### Handling (When Prevention Fails)

- Describe the problem in plain language (not error codes)
- Tell the user exactly what to do to fix it
- Keep the form state intact
- Focus the first error field
- Use `aria-invalid` and `aria-describedby` for screen readers

---

## Dark Patterns to Avoid

These are manipulative UX patterns. They damage trust and increasingly face legal consequences.

| Pattern | Description | Example |
|---------|-------------|---------|
| **Confirmshaming** | Guilt-tripping the opt-out | "No thanks, I don't want to save money" |
| **Roach Motel** | Easy to enter, hard to leave | Sign up in 1 click, cancel requires calling |
| **Misdirection** | Visual attention drawn away from true cost | Giant "FREE" with tiny "then $99/mo" |
| **Hidden Costs** | Fees revealed late in checkout | Service fee appears at payment step |
| **Forced Continuity** | Auto-renew without clear notice | Free trial → paid with no warning |
| **Trick Questions** | Confusing double-negative opt-ins | "Uncheck to not receive no emails" |
| **Bait and Switch** | Promise one thing, deliver another | "Free" tool that requires paid signup |
| **Sneak into Basket** | Adding items the user didn't choose | Pre-checked add-ons in checkout |

---

## Information Scent

Users "forage" for information like animals foraging for food (Information Foraging Theory, Pirolli & Card). Strong information scent means each link/button clearly signals what the user will find.

### Application

- **Link text should describe the destination.** "View pricing" not "Click here"
- **Navigation labels should be specific.** "Documentation" not "Resources"
- **Breadcrumbs** provide location context and backtracking ability
- **Search suggestions** help users refine intent
- **The "3-click rule" is a myth.** What matters is confidence at each step, not click count. Users happily click 5 times if each click felt right.
