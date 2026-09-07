// The terminal's eight levels — its `_EQ_CHARS` are ▁▂▃▄▅▆▇█ — as an LED
// matrix: a column of cells per band with gaps, the unlit cells faint so the
// grid is there at rest, the top lit cell brighter, the peak a held cell.

import type { VizPainter } from './types';
import { columns, fillFor, glowOff, glowOn, ink, inset, mirrored } from './shared';

export const BLOCK_ROWS = 8;

export const blocks: VizPainter = {
  id: 'blocks',
  name: 'Blocks',
  blurb: "The terminal's eight levels, lit cell by cell",
  bandsFor(size, preferred) {
    if (size === 'pocket') return 4;
    if (size === 'popover') return 16;
    return preferred;
  },
  paint(ctx, frame, geo, palette, opts, mode, cache) {
    const pad = inset(geo);
    const { colour, alpha, live } = ink(palette, mode, frame.fall);
    const fill = fillFor(ctx, palette, mode, geo, cache, false, frame.fall);
    mirrored(ctx, geo, opts, (g) => {
      const rows = g.size === 'pocket' ? 6 : BLOCK_ROWS;
      const cols = Math.max(1, g.bands);
      const gap = g.size === 'page' ? 2 : 1;
      const w = g.width - pad * 2;
      const h = g.height - pad * 2;
      const cellW = (w - gap * (cols - 1)) / cols;
      const cellH = (h - gap * (rows - 1)) / rows;
      if (cellW <= 0 || cellH <= 0) return;
      const { levels, peaks } = columns(frame, cols, cache);
      ctx.save();
      ctx.globalAlpha = alpha;
      glowOn(ctx, palette, opts, g, mode, 8);
      for (let c = 0; c < cols; c += 1) {
        const lit = live || mode === 'paused' ? Math.round((levels[c] ?? 0) * rows) : 0;
        const peakRow = opts.peaks && live ? Math.round((peaks[c] ?? 0) * rows) : 0;
        const x = pad + c * (cellW + gap);
        for (let r = 0; r < rows; r += 1) {
          const y = pad + h - (r + 1) * cellH - r * gap;
          const isLit = r < lit;
          const isPeak = !isLit && peakRow > lit && r === peakRow - 1;
          if (opts.bare && !isLit && !isPeak) continue;
          ctx.fillStyle = isLit || isPeak ? fill : colour;
          ctx.globalAlpha = alpha * (isLit ? (r === lit - 1 ? 1 : 0.82) : isPeak ? 0.6 : 0.12);
          if (!isLit && !isPeak) glowOff(ctx);
          else glowOn(ctx, palette, opts, g, mode, 8);
          ctx.fillRect(x, y, cellW, cellH);
        }
      }
      ctx.restore();
    });
  },
};
