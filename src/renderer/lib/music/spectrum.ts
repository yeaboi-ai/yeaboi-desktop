// The spectrum in the terminal's eight characters. The terminal fakes four of
// them with a clock; the window reads a real AnalyserNode and draws sixty-four.

/** `_EQ_CHARS` in ui/shared/_music_bar.py, verbatim. */
export const EQ_GLYPHS = '▁▂▃▄▅▆▇█';

/**
 * 0..1 per band from a byte spectrum. The top of the range is mostly empty on
 * a 128 kbps stream, so the bands read the lower half and spread it across.
 */
export function bandLevels(bins: ArrayLike<number>, bands: number): number[] {
  if (bands <= 0) return [];
  const usable = Math.max(1, Math.floor(bins.length / 2));
  const per = Math.max(1, Math.floor(usable / bands));
  return Array.from({ length: bands }, (_, i) => {
    let sum = 0;
    let n = 0;
    for (let k = 0; k < per; k += 1) {
      const value = bins[i * per + k];
      if (value === undefined) break;
      sum += value;
      n += 1;
    }
    // Lifted: a stream at a working volume sits low in the byte range, and a
    // spectrum that never leaves the floor says nothing.
    return n === 0 ? 0 : lift(sum / n / 255);
  });
}

function lift(raw: number): number {
  return Math.min(1, Math.max(0, Math.pow(raw, 0.8) * 1.2));
}

/** One glyph per level: 0 is the lowest bar, 1 the full block. */
export function blockGlyphs(levels: readonly number[]): string {
  const last = EQ_GLYPHS.length - 1;
  let out = '';
  for (const level of levels) {
    const clamped = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
    out += EQ_GLYPHS[Math.round(clamped * last)];
  }
  return out;
}

/** Two summed sines per band: the stand-in before the graph exists. */
export function syntheticLevels(phase: number, bands: number): number[] {
  return Array.from(
    { length: bands },
    (_, i) => (Math.sin(phase + i * 0.7) + Math.sin(phase * 1.7 + i) + 2) / 4,
  );
}

/** The resting line: every band at the floor. */
export function flatGlyphs(bands: number): string {
  return EQ_GLYPHS[0]!.repeat(Math.max(0, bands));
}
