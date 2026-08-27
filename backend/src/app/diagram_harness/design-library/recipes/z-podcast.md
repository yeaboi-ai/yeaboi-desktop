# Recipe Z: Podcast / Media

## Quick ref

- **When:** Podcast shows, episodes, audio-first content, talk shows, radio-style media.
- **Token budget:** ~15k (HARNESS + typography + color + motion + imagery + anti-similarity).
- **Files to read:** `01-typography.md`, `02-color.md`, `05-motion.md`, `06-imagery-texture.md`
- **Personality fit:** Primary — Playful, Editorial, Warm/Human. Strong — Brutalist.

## Page flow intent

LISTEN-FIRST. The page should get audio playing within seconds.

Core rhythm: `latest episode hero (play button, NOT auto-play) + episode title + guest photo → episode back-catalog (list with play buttons, durations, dates in mono) → persistent bottom player bar that follows across pages → subscribe links (all platforms) → about/hosts`.

The persistent player is the KEY structural difference from every other recipe — it's a UI element that survives navigation. Study Spotify's web player for how audio persists.

## Techniques

- Audio waveform or equalizer as hero visual element
- Episode list with play button, duration, date (monospace metadata)
- Embedded player that persists across page navigation (sticky bottom bar)
- Guest/host photos with editorial treatment
- Transcript expandable sections
- Subscribe links to all platforms (Apple, Spotify, RSS)
- Episode cards with clip-path reveal on scroll
- Editorial layout for show notes (single column, generous line-height)

## Font direction

Editorial serif for show name/episode titles + clean sans for UI. Monospace for timestamps/durations. The serif gives authority.

## Color

Show-brand-driven. Derive from cover art. Dark backgrounds work well for audio-focused content (mirrors the "eyes closed, listening" experience).

## Motion budget

MEDIUM. Waveform animations, play button transitions, episode card reveals. Audio feedback animations (equalizer bars, progress indicators).

## Anti-patterns

Just embedding a Spotify playlist. No episode descriptions. Missing RSS feed. Auto-playing audio.
