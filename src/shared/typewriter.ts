// How fast an answer types itself out.
//
// The sidecar streams in whatever lumps the provider sends — a word, then
// eight, then nothing for half a second. Painting each lump the moment it
// lands makes the answer arrive in steps of wildly different size. These rules
// spend the text at a steady rate instead, catching up in proportion to how
// far behind the reveal is, so a long answer is never slow and a short one is
// still typed rather than stamped.

/** The least it advances per frame: a handful of letters, which is what makes
 *  it read as typing rather than as words arriving in groups. */
const FLOOR = 2;
/** What fraction of the backlog it clears per frame — the reveal is always
 *  gaining on the stream, and gains faster the further behind it is. */
const CATCH_UP = 30;
/** The most it advances in one frame, for the case the rest of this cannot
 *  help: a provider that hands over a thousand characters at once. */
const CEILING = 60;

/**
 * How many more characters to show this frame.
 *
 * `done` is the stream having finished: what is left is all there will be, so
 * it is spent faster rather than at the pace of something still arriving.
 */
export function revealStep(shown: number, total: number, done = false): number {
  const behind = total - shown;
  if (behind <= 0) return 0;
  const pace = Math.ceil(behind / CATCH_UP) * (done ? 2 : 1);
  return Math.min(behind, Math.max(FLOOR, Math.min(CEILING, pace)));
}

/** Markers whose halves have to arrive together, or the bubble shows the
 *  syntax for a frame and then swallows it. */
const PAIRS = ['**', '`', '_'] as const;

/**
 * What the bubble shows, given what has arrived and how much of it has been
 * spent so far.
 *
 * It cuts wherever it has reached — the answer reads as typing, letter after
 * letter, rather than as words landing in groups. The one thing it will not cut
 * inside is a marker whose other half has not arrived: `**` would show as two
 * asterisks for a moment and then be swallowed.
 *
 * Text that changes underneath a reveal — the `assistant` line replacing
 * everything the tokens built — must not leave the reveal past the end of it.
 */
export function revealed(text: string, shown: number, done = false): string {
  const at = Math.max(0, Math.min(shown, text.length));
  // Only a finished answer is shown exactly as it is. While the stream is
  // running, catching up with it is not the end of the sentence: the last
  // thing to arrive is often half a marker, and it would sit there as raw
  // asterisks until its other half came.
  if (done && at === text.length) return text;
  let cut = at;
  for (const mark of PAIRS) {
    const slice = text.slice(0, cut);
    const opens = slice.split(mark).length - 1;
    if (opens % 2 === 1) cut = slice.lastIndexOf(mark);
  }
  const slice = text.slice(0, cut);
  const link = slice.lastIndexOf('[');
  if (link > slice.lastIndexOf(']')) cut = link;
  return text.slice(0, Math.max(0, cut));
}
