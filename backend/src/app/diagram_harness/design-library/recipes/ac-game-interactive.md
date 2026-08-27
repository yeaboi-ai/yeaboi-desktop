# Recipe AC: Browser Game / Interactive Toy

## Quick ref

- **When:** Casual browser games (Wordle, 2048, Connections, Tetris clones), trivia/quiz games, puzzle games, idle games, interactive toys, "fun" generative experiments. Playable in a tab with no install. (For a marketing site that *promotes* a game studio, use recipe `i` (film) or `a` (creative-studio).)
- **Token budget:** ~14k (HARNESS + components + color + motion + ergonomics + anti-similarity).
- **Files to read:** `04-components.md`, `02-color.md`, `05-motion.md`, `09-ergonomics.md`, `10-accessibility-performance.md`.
- **Personality fit:** Primary — Playful, Bold-Adventurous. Strong — Brutalist (NYT Games style), Technical (puzzle clean), Professional. Bad fit — Luxury, Editorial.

## Page flow

```
[Single-page app feel — menus and play screens are overlays, NOT route changes.]

Main menu (entry):
  Game logo (large, animated subtly)
  [Play] button — biggest CTA on screen
  Smaller secondary: [How to play] [Leaderboard] [Settings]
  Footer: streak / best-score / today's puzzle date if relevant

Play screen (the actual game):
  Top HUD: score | timer or moves | lives or hearts | pause button
  Game canvas: centred, dominates the viewport
    - Use a clear bounded play area (border or contrast bg) so the game doesn't bleed into chrome
    - Touch / click targets generous (≥44px on mobile)
  Bottom controls (if needed): big tap buttons, never tiny links

Result modal (win/lose):
  Big result emoji or icon (NOT a wall of text)
  Score + key stats (moves used, time, accuracy)
  Share-result button (copy-as-emoji-grid for Wordle-style)
  Retry / Next level / Home — three clear buttons

Level select:
  Grid of level tiles (5×N), each showing:
    - Number, star rating (or completion checkmark), locked padlock if not yet unlocked
    - Tap-to-play; long-press for stats
  Progress bar at top showing % completed

Leaderboard:
  Top 10 with rank, avatar, name, score (mono)
  Your rank pinned at bottom if not in top 10
  Toggle: All-time / This week / Friends

Pause overlay:
  Translucent backdrop, NEVER dismisses on tap (must hit Resume)
  Resume / Restart / Quit-to-menu

Tutorial:
  Inline interactive — let them DO the action, with arrows / pulses pointing at controls
  Skip button always visible (NOT hidden in a corner)
```

## Techniques

- HUD numbers are MONO + tabular-nums so scores don't jiggle as digits change.
- Score-up effect: number counts to new value over 200-400ms with a +X floater rising from the score location.
- Win celebration: confetti, screen shake, satisfying sfx — go big for THIS recipe (it's the one place these are right).
- Lose state: red flash + gentle shake, NEVER skull-and-crossbones, NEVER aggressive horror sfx.
- Streak / daily-puzzle pattern: lock the puzzle of the day, show next-puzzle countdown post-win.
- Share-result as emoji grid (🟩🟨⬜) — the Wordle pattern. Copy-to-clipboard with a "Copied!" toast.
- High-contrast play area so the game state is the figure, chrome is the ground.
- Sound toggle persistently visible — first-touch should NOT play sfx; wait for user interaction (Chrome autoplay).
- Keyboard support for desktop play (arrow keys, space, enter). Show shortcuts in How-to-play.
- Haptics on mobile for key events (correct, wrong, win) — never for routine moves.
- Pause-on-blur: window losing focus auto-pauses the game.
- Save-state to localStorage so refresh doesn't lose progress.
- Animation primitives: cubic-bezier(0.34, 1.56, 0.64, 1) for "snappy" feedback, ease-out for transitions.

## Font direction

Bold display sans for HUD, score, win-screen ("Inter Black", "Space Grotesk Bold", "Bricolage Grotesque"). Monospace for score numerals and timer (JetBrains Mono, IBM Plex Mono, Geist Mono). Optional: one playful display font for the game title only ("Climate Crisis", "Sentient", a custom logo). NEVER serif body in a game — it reads as documentation.

## Color

High-contrast and PLAYFUL. 3-4 saturated colours allowed (this recipe is the exception to the "one accent" rule). Use them functionally: one for "correct/good", one for "wrong/bad", one for "neutral/score", one for accent. Background often dark to make the play area pop. NYT-Games-style pastel-on-cream is also valid for word/puzzle games.

Avoid muddy mid-tones; this recipe needs clarity at a glance.

## Motion budget

HIGH (for THIS recipe specifically). Every game action gets feedback: tap = scale-down 95%, success = pulse + colour, fail = shake. Win screen earns confetti + sfx + screen shake. Level transitions: slide or zoom, not crossfade. Idle elements (logo, menu CTA) get subtle living motion (3-5s breathing). NEVER use motion that delays input — feedback should be ≤100ms perceived.

## Reference sites

NYT Games (Wordle, Connections, Spelling Bee), Cookie Clicker, 2048, Polytrack, GeoGuessr, Pokémon Showdown, Drawful, Jackbox.tv lobby UI.

## Anti-patterns

Aggressive ad walls before play. Auto-playing music on load. Tiny tap targets on mobile. Forced sign-up before first play. Loading screens longer than the gameplay loop. Splash screens with company logos eating 5 seconds. Pause-overlay that dismisses on accidental tap. Motion blur that hurts to look at. Saturated red as a primary colour (reads as error everywhere). Cluttered HUDs with 8+ stats — pick 2-3 that matter. Cartoon "ka-pow!" comic-book styling unless that IS the game's brand.
