// A radial spectrum: ticks around a circle growing outward, the peaks as dots.
// Made for the square pocket.

import type { VizPainter } from './types';
import { columns, fillFor, glowOn, ink, inset } from './shared';

export const rings: VizPainter = {
  id: 'rings',
  name: 'Rings',
  blurb: 'The spectrum around a circle',
  bandsFor(size) {
    if (size === 'pocket') return 16;
    if (size === 'popover') return 32;
    return 64;
  },
  paint(ctx, frame, geo, palette, opts, mode, cache) {
    const pad = inset(geo);
    const { colour, alpha, live } = ink(palette, mode, frame.fall);
    const stroke = fillFor(ctx, palette, mode, geo, cache, false, frame.fall);
    const n = Math.max(4, geo.bands);
    const side = Math.min(geo.width, geo.height) - pad * 2;
    const cx = geo.width / 2;
    const cy = geo.height / 2;
    const r0 = side * (geo.size === 'pocket' ? 0.3 : 0.28);
    const maxLen = Math.max(1, side / 2 - r0 - 2);
    const { levels, peaks } = columns(frame, n, cache);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1, ((2 * Math.PI * r0) / n) * 0.55);
    // The base ring: the floor every mode rests on.
    ctx.beginPath();
    ctx.arc(cx, cy, r0, 0, Math.PI * 2);
    ctx.strokeStyle = colour;
    ctx.globalAlpha = alpha * (live ? 0.25 : 0.6);
    ctx.lineWidth = 1;
    ctx.stroke();
    if (!live && mode !== 'paused') {
      ctx.restore();
      return;
    }
    ctx.lineWidth = Math.max(1, ((2 * Math.PI * r0) / n) * 0.55);
    ctx.strokeStyle = live ? stroke : colour;
    glowOn(ctx, palette, opts, geo, mode, 8);
    for (let i = 0; i < n; i += 1) {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const len = (levels[i] ?? 0) * maxLen;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(cx + ux * r0, cy + uy * r0);
      ctx.lineTo(cx + ux * (r0 + len), cy + uy * (r0 + len));
      ctx.stroke();
      if (opts.mirror && geo.size !== 'pocket') {
        ctx.beginPath();
        ctx.moveTo(cx + ux * r0, cy + uy * r0);
        ctx.lineTo(cx + ux * (r0 - len * 0.5), cy + uy * (r0 - len * 0.5));
        ctx.stroke();
      }
      if (opts.peaks && live) {
        const pr = r0 + (peaks[i] ?? 0) * maxLen;
        ctx.globalAlpha = alpha * 0.8;
        ctx.fillStyle = live ? stroke : colour;
        ctx.beginPath();
        ctx.arc(cx + ux * pr, cy + uy * pr, geo.size === 'page' ? 1.5 : 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  },
};
