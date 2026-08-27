# Recipe AB: Wellness / Habit Tracker

## Quick ref

- **When:** Habit trackers, mood/journal apps, fitness logs, meditation/sleep/water/gratitude apps, streak-driven self-tracking apps. The visual language is soft, calm, gamified-but-not-childish. (For a marketing site that *sells* a wellness app, use recipe `w` (fitness) or `b` (SaaS).)
- **Token budget:** ~15k (HARNESS + components + color + typography + ergonomics + anti-similarity).
- **Files to read:** `04-components.md`, `02-color.md`, `01-typography.md`, `09-ergonomics.md`, `07-page-archetypes.md` > App Shells.
- **Personality fit:** Primary — Warm-Human, Organic-Natural. Strong — Playful, Professional. Bad fit — Brutalist, Technical, Bold-Adventurous.

## Page flow

```
[App shell — bottom-tab on mobile, sidebar on desktop. Mobile-first by default.]

Today screen (primary surface):
  Top: greeting + current streak number + tiny avatar
  Streak heatmap or weekly ring (THIS WEEK at a glance)
  Today's habits: list of checkable rings/cards, each with:
    - Habit name + icon + cadence ("3× this week")
    - Tap-to-complete with a satisfying ring-fill animation
    - Drag to reorder; long-press to skip
  Quick-log card at bottom: "How are you feeling?" 5-emoji scale or 1-tap mood

History screen:
  Calendar heatmap (12 weeks visible by default) — colour intensity = completions
  Below: list of past entries with mood emoji + first line of note + tags

Habit detail (drill-in):
  Big completion chart (line or area) — last 30 / 90 / 365 days
  Streak record + best week
  Edit cadence, reminder time, archive
  Notes timeline for this habit

Insights:
  Weekly summary card: best day, total completions, mood trend
  Correlations ("You sleep better on days you exercise")
  Simple bar / line charts — NO dashboards-style dense grids

Achievements:
  Badge grid: locked = silhouette, earned = filled with shimmer
  Streak milestones (7-day, 30-day, 100-day) with claimed-date

Settings:
  Reminder times (with quiet hours), units, export data, privacy
```

This is an APP shell, not a scroll page. Modal log-entry. Drawer for filters.

## Techniques

- Streak number is the hero metric — always visible on Today. Big numerals.
- Ring-fill completion animation on tap (300-400ms ease-out + subtle haptic).
- Calendar heatmap uses 5 intensity steps of a single hue (GitHub-style but warmer).
- Mood entry: 5 emoji on a horizontal track with the active one growing slightly. NOT a slider.
- Empty-state per screen has a warm, human-written line ("Your week starts here. Add a habit to begin." — not "No data").
- Charts are sketchy / soft: rounded corners on bars, area-fills with low opacity, NO axis ticks every 1 unit.
- Badge / achievement reveal: confetti is allowed here (UNIQUE to this recipe), but ONCE per unlock, never on routine completion.
- Reminder cadence picker uses time-of-day buckets (Morning / Afternoon / Evening / Custom) — not a 24-hour clock by default.
- Day-streak cards on Today have a tiny flame icon when streak ≥ 7, never on day 1.
- Notes / journal entries support photo attachments rendered as polaroid-style cards.
- Onboarding asks 2-3 questions max (which habits, when remind, optional name) — never a 6-step funnel.

## Font direction

Friendly geometric sans for UI (Inter, Manrope, DM Sans, Nunito). One soft serif accent for greetings or quotes (Tiempos, Lora, Fraunces). Generous size — body 16px+ on mobile. Avoid mono entirely.

## Color

Calm, low-saturation. Pick ONE warm hue family (peach, terracotta, sage, dusty rose, ocean) and use 5 tints of it. Background is off-white or warm-cream in light mode; deep aubergine, midnight, or warm-charcoal in dark mode (NOT pure #000). Status colours muted: success = sage green, alert = burnt orange (never bright red).

Streak / progress fills use the accent. Completed habits get a soft tint of the accent, not full saturation.

## Motion budget

MEDIUM. Animations should feel rewarding without being noisy. Ring-fill on completion. Numbers count up. Calendar squares fade in on month-switch. Confetti ONLY on milestone unlock. Page transitions: slide on mobile, fade on desktop. NO bouncy spring physics on tap; that reads as childish here.

## Reference sites

Streaks (iOS), Daylio, Way of Life, Productive, Apple Health, Headspace, Calm, Reflectly, Stoic.

## Anti-patterns

Dashboard-style dense grids of numbers. Pure-black dark mode. Bright saturated red for "missed" states (reads punitive). Children's-book sticker styles. Confetti / haptics on routine completions (devalues real milestones). 5-star ratings on mood (the granularity is wrong — use 5 emoji). Forced 7-day onboarding before first use. Streak-loss notifications that read as guilt-trips. Glass-morphism / neon (wrong emotional register).
