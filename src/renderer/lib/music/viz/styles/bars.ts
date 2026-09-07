// Rounded bars with detached caps that ride the peak and fall.

import type { VizPainter } from './types';
import { columns, fillFor, glowOn, ink, inset, mirrored } from './shared';

export const bars: VizPainter = {
  id: 'bars',
  name: 'Bars',
  blurb: 'A spectrum with peak caps that fall',
  bandsFor(size, preferred) {
    if (size === 'pocket') return 5;
    if (size === 'popover') return 24;
    return preferred;
  },
  paint(ctx, frame, geo, palette, opts, mode, cache) {
    const pad = inset(geo);
    const { colour, alpha, live } = ink(palette, mode, frame.fall);
    const fill = fillFor(ctx, palette, mode, geo, cache, false, frame.fall);
    mirrored(ctx, geo, opts, (g) => {
      const n = Math.max(1, g.bands);
      const w = g.width - pad * 2;
      const h = g.height - pad * 2;
      const gap = g.size === 'pocket' ? 2 : Math.max(2, Math.floor(w / n / 4));
      const barW = Math.max(1, (w - gap * (n - 1)) / n);
      const radius = Math.min(barW / 2, 3);
      const { levels, peaks } = columns(frame, n, cache);
      ctx.save();
      glowOn(ctx, palette, opts, g, mode, 10);
      for (let i = 0; i < n; i += 1) {
        const x = pad + i * (barW + gap);
        const level = live || mode === 'paused' ? (levels[i] ?? 0) : 0;
        const barH = Math.max(1, level * h);
        ctx.fillStyle = level > 0 ? fill : colour;
        ctx.globalAlpha = level > 0 ? alpha : alpha * 0.35;
        ctx.beginPath();
        ctx.roundRect(x, pad + h - barH, barW, barH, radius);
        ctx.fill();
        if (opts.peaks && live) {
          const cap = pad + h - (peaks[i] ?? 0) * h - 3;
          if (cap > pad) {
            ctx.globalAlpha = alpha * 0.9;
            ctx.fillStyle = fill;
            ctx.fillRect(x, Math.max(pad, cap), barW, g.size === 'pocket' ? 1 : 2);
          }
        }
      }
      ctx.restore();
    });
  },
};
