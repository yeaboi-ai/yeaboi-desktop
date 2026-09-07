// One breathing disc from loudness, with a thin ring at the held peak. The
// quietest of the six; the one for a day full of calls.

import type { VizPainter } from './types';
import { fillFor, glowOn, ink, inset } from './shared';

export const pulse: VizPainter = {
  id: 'pulse',
  name: 'Pulse',
  blurb: 'A disc that breathes with the loudness',
  bandsFor() {
    return 1;
  },
  paint(ctx, frame, geo, palette, opts, mode, cache) {
    const pad = inset(geo);
    const { colour, alpha, live } = ink(palette, mode, frame.fall);
    const fill = fillFor(ctx, palette, mode, geo, cache, true, frame.fall);
    const side = Math.min(geo.width, geo.height) - pad * 2;
    const cx = geo.width / 2;
    const cy = geo.height / 2;
    const rms = live || mode === 'paused' ? frame.rms : 0;
    let peak = 0;
    for (let i = 0; i < frame.peaks.length; i += 1) peak = Math.max(peak, frame.peaks[i]!);
    const radius = (0.35 + 0.5 * rms) * (side / 2);
    ctx.save();
    ctx.fillStyle = live ? fill : colour;
    ctx.globalAlpha = live || mode === 'paused' ? alpha * 0.9 : alpha * 0.3;
    glowOn(ctx, palette, opts, geo, mode, 16);
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1, radius), 0, Math.PI * 2);
    ctx.fill();
    if (opts.peaks && live) {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = fill;
      ctx.lineWidth = 1;
      ctx.globalAlpha = alpha * 0.6;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(radius + 2, (0.35 + 0.5 * peak) * (side / 2)), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  },
};
