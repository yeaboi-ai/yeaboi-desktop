// What every painter needs: the frame regrouped to its columns, the colour
// for the mode, the glow, and the mirror.

import { regroupBands } from '../bands';
import type { VizFrame } from '../frame';
import type { VizMode } from '../mode';
import type { VizPalette } from '../palette';
import type { PainterCache, VizGeometry, VizStyleOptions } from './types';

/** The pocket draws inside a rounded 48 px face; keep off its corners. */
export function inset(geo: VizGeometry): number {
  return geo.size === 'pocket' ? Math.round(Math.min(geo.width, geo.height) * 0.2) : 0;
}

/** Levels and peaks at the painter's column count, from the 64-band frame. */
export function columns(
  frame: VizFrame,
  count: number,
  cache: PainterCache,
): { levels: Float32Array; peaks: Float32Array } {
  const n = Math.max(1, Math.min(64, count));
  if (n === 64) return { levels: frame.bands, peaks: frame.peaks };
  if (cache.scratch.length !== n) {
    cache.scratch = new Float32Array(n);
    cache.scratchPeaks = new Float32Array(n);
  }
  regroupBands(frame.bands, cache.scratch);
  regroupBands(frame.peaks, cache.scratchPeaks);
  return { levels: cache.scratch, peaks: cache.scratchPeaks };
}

/** The one colour a mode paints in, and how strongly. */
export function ink(
  palette: VizPalette,
  mode: VizMode,
): { colour: string; alpha: number; live: boolean } {
  switch (mode) {
    case 'live':
      return { colour: palette.main, alpha: 1, live: true };
    case 'connecting':
      return { colour: palette.main, alpha: 0.6, live: true };
    case 'paused':
      return { colour: palette.dim, alpha: 0.9, live: false };
    case 'failed':
      return { colour: palette.failed, alpha: 0.9, live: false };
    default:
      return { colour: palette.floor, alpha: 1, live: false };
  }
}

/** A left→right ramp for the spectrum colour, cached per width. */
export function fillFor(
  ctx: CanvasRenderingContext2D,
  palette: VizPalette,
  mode: VizMode,
  geo: VizGeometry,
  cache: PainterCache,
  vertical = false,
): string | CanvasGradient {
  const { colour, live } = ink(palette, mode);
  if (!live || !palette.ramp) return colour;
  const key = `${palette.ramp[0]}|${palette.ramp[1]}|${geo.width}|${geo.height}|${vertical ? 'v' : 'h'}`;
  if (cache.key !== key || !cache.gradient) {
    const gradient = vertical
      ? ctx.createLinearGradient(0, geo.height, 0, 0)
      : ctx.createLinearGradient(0, 0, geo.width, 0);
    gradient.addColorStop(0, palette.ramp[0]);
    gradient.addColorStop(1, palette.ramp[1]);
    cache.gradient = gradient;
    cache.key = key;
  }
  return cache.gradient;
}

/** Glow only where it is worth paying for: the page, while live. */
export function glowOn(
  ctx: CanvasRenderingContext2D,
  palette: VizPalette,
  opts: VizStyleOptions,
  geo: VizGeometry,
  mode: VizMode,
  blur: number,
): void {
  const wanted = opts.glow && geo.size === 'page' && (mode === 'live' || mode === 'connecting');
  ctx.shadowBlur = wanted ? blur : 0;
  ctx.shadowColor = wanted ? palette.main : 'transparent';
}

export function glowOff(ctx: CanvasRenderingContext2D): void {
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
}

/**
 * Paint the top half, then the same paint reflected into the bottom half at
 * lower alpha. `draw` receives the half-height geometry.
 */
export function mirrored(
  ctx: CanvasRenderingContext2D,
  geo: VizGeometry,
  opts: VizStyleOptions,
  draw: (half: VizGeometry) => void,
): void {
  if (!opts.mirror || geo.size === 'pocket') {
    draw(geo);
    return;
  }
  const half: VizGeometry = { ...geo, height: geo.height / 2 };
  draw(half);
  ctx.save();
  ctx.translate(0, geo.height);
  ctx.scale(1, -1);
  ctx.globalAlpha *= 0.45;
  draw(half);
  ctx.restore();
}
