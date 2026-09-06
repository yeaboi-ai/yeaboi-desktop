// An oscilloscope: the wave itself, as one stroke with a soft one beneath it.
// The only style that shows the sound rather than its spectrum.

import type { VizPainter } from './types';
import { fillFor, ink, inset, mirrored } from './shared';

export const wave: VizPainter = {
  id: 'wave',
  name: 'Wave',
  blurb: 'The sound itself, as an oscilloscope',
  // The wave reads samples, not bands; the counts only size the tile grid.
  bandsFor(size) {
    if (size === 'pocket') return 16;
    if (size === 'popover') return 32;
    return 64;
  },
  paint(ctx, frame, geo, palette, opts, mode, cache) {
    const pad = inset(geo);
    const { colour, alpha, live } = ink(palette, mode);
    const stroke = fillFor(ctx, palette, mode, geo, cache);
    mirrored(ctx, geo, opts, (g) => {
      const w = g.width - pad * 2;
      const h = g.height - pad * 2;
      const mid = pad + h / 2;
      const points = Math.max(2, Math.floor(w / 2));
      const samples = frame.wave.length;
      const amp = h * 0.45;
      const trace = (): void => {
        ctx.beginPath();
        for (let i = 0; i < points; i += 1) {
          const x = pad + (i / (points - 1)) * w;
          const v =
            live || mode === 'paused' ? (frame.wave[Math.floor((i / points) * samples)] ?? 0) : 0;
          const y = mid - v * amp;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      };
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (opts.glow && live && g.size !== 'pocket') {
        trace();
        ctx.strokeStyle = stroke;
        ctx.globalAlpha = alpha * palette.glowAlpha * 0.5;
        ctx.lineWidth = g.size === 'page' ? 8 : 5;
        ctx.stroke();
      }
      trace();
      ctx.strokeStyle = live ? stroke : colour;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = g.size === 'pocket' ? 2 : 1.5;
      ctx.stroke();
      ctx.restore();
    });
  },
};
