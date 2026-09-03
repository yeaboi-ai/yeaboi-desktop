// Text that resolves into place rather than fading in.
//
// A surface's title and its line of description sit still while the rest of the
// page deals itself in — they are what tells you where you have landed, so they
// should be legible first and moving least. Decoding them keeps the arrival
// visible without moving the one thing you are reading to find out where you
// are.
//
// Pure, so the vitest lane can drive it: given the text and how much of it has
// resolved, it returns the line as it looks at that moment.

/** What an unresolved character is drawn as. Deliberately narrow and squarish —
 *  glyphs with wildly different widths make the line jitter as it resolves. */
const GLYPHS = '#$%&*+=-_?/\\<>[]{}01';

/** Deterministic per position and step, so a character does not flicker through
 *  a different glyph every frame — it holds one for a few frames, then moves on.
 */
function glyphFor(index: number, step: number): string {
  const mixed = (index * 2654435761 + step * 40503) >>> 0;
  return GLYPHS[mixed % GLYPHS.length]!;
}

/**
 * `text` with the first `revealed` characters resolved and the rest scrambled.
 *
 * Whitespace is never scrambled: the shape of the line — its word lengths and
 * gaps — is what makes it read as the same line resolving rather than a
 * different string appearing.
 */
export function scramble(text: string, revealed: number, step = 0): string {
  if (revealed >= text.length) return text;
  let out = '';
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (index < revealed || character === ' ' || character === '\n') {
      out += character;
      continue;
    }
    out += glyphFor(index, step);
  }
  return out;
}

/** How many characters have resolved at `progress` (0..1), left to right. */
export function revealedAt(length: number, progress: number): number {
  if (progress <= 0) return 0;
  if (progress >= 1) return length;
  return Math.floor(length * progress);
}

/** How long a line takes to resolve. Longer lines take a little longer, but not
 *  proportionally — a description would otherwise still be decoding after its
 *  title had been readable for a second. */
export function durationFor(length: number): number {
  return Math.min(560, 220 + length * 6);
}
