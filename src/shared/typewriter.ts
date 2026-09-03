// How fast an answer types itself out.
//
// The sidecar streams in whatever lumps the provider sends — a word, then
// eight, then nothing for half a second. Painting each lump the moment it
// lands makes the answer arrive in steps of wildly different size. These rules
// spend the text at a steady rate instead, catching up in proportion to how
// far behind the reveal is, so a long answer is never slow and a short one is
// still typed rather than stamped.

/** The least it advances per frame, so a trickle still moves. */
const FLOOR = 3;
/** What fraction of the backlog it clears per frame — the reveal is always
 *  gaining on the stream, and gains faster the further behind it is. */
const CATCH_UP = 6;
/** Past this the answer has stopped being typed and started being waited for.
 *  A very long reply lands in a few frames rather than a few seconds. */
const CEILING = 90;

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

/**
 * What the bubble shows, given what has arrived and how much of it has been
 * spent so far.
 *
 * Text that changes underneath a reveal — the `assistant` line replacing
 * everything the tokens built — must not leave the reveal past the end of it,
 * and a reveal that has fallen behind a shortened answer starts again from
 * where the two still agree.
 */
export function revealed(text: string, shown: number): string {
  return text.slice(0, Math.max(0, Math.min(shown, text.length)));
}
