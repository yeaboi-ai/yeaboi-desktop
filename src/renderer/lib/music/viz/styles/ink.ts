// A filled silhouette through the bands, with a reflection fading to nothing
// below. Quiet and editorial; the one that belongs beside the serif.

import type { VizPainter } from './types';
import { columns, fillFor, glowOn, ink as inkOf, inset, mirrored } from './shared';

export const ink: VizPainter = {
  id: 'ink',
  name: 'Ink',
  blurb: 'A silhouette of the sound, with its reflection',
  bandsFor(size) {
    if (size === 'pocket') return 4;
    if (size === 'popover') return 16;
    return 64;
  },
  paint(ctx, frame, geo, palette, opts, mode, cache) {
    const pad = inset(geo);
    const { colour, alpha, live } = inkOf(palette, mode);
    const fill = fillFor(ctx, palette, mode, geo, cache);
    mirrored(ctx, geo, opts, (g) => {
      const n = Math.max(2, g.bands);
      const w = g.width - pad * 2;
      const h = g.height - pad * 2;
      const reflection = g.size === 'page' ? 28 : g.size === 'popover' ? 8 : 0;
      const body = h - reflection;
      const base = pad + body;
      const { levels } = columns(frame, n, cache);
      const yAt = (i: number): number =>
        base -
        (live || mode === 'paused' ? (levels[Math.min(n - 1, Math.max(0, i))] ?? 0) : 0) * body;
      const xAt = (i: number): number => pad + (i / (n - 1)) * w;
      const silhouette = (): void => {
        ctx.beginPath();
        ctx.moveTo(pad, base);
        ctx.lineTo(xAt(0), yAt(0));
        for (let i = 0; i < n - 1; i += 1) {
          const cx = (xAt(i) + xAt(i + 1)) / 2;
          const cy = (yAt(i) + yAt(i + 1)) / 2;
          ctx.quadraticCurveTo(xAt(i), yAt(i), cx, cy);
        }
        ctx.lineTo(xAt(n - 1), yAt(n - 1));
        ctx.lineTo(pad + w, base);
        ctx.closePath();
      };
      ctx.save();
      ctx.fillStyle = live ? fill : colour;
      ctx.globalAlpha = alpha;
      glowOn(ctx, palette, opts, g, mode, 12);
      silhouette();
      ctx.fill();
      if (!live && mode !== 'paused') {
        ctx.fillRect(pad, base - 1, w, 1);
      }
      if (reflection > 0 && (live || mode === 'paused')) {
        ctx.shadowBlur = 0;
        ctx.save();
        ctx.beginPath();
        ctx.rect(pad, base, w, reflection);
        ctx.clip();
        ctx.translate(0, base * 2);
        ctx.scale(1, -1);
        ctx.globalAlpha = alpha * 0.22;
        silhouette();
        ctx.fill();
        ctx.restore();
        const fade = ctx.createLinearGradient(0, base, 0, base + reflection);
        fade.addColorStop(0, 'transparent');
        fade.addColorStop(1, palette.background);
        ctx.globalAlpha = 1;
        ctx.fillStyle = fade;
        ctx.fillRect(pad, base, w, reflection);
      }
      ctx.restore();
    });
  },
};
