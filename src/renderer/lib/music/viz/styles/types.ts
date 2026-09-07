// What a style is: a painter over a 2D context, pure in its arguments, that
// draws all three sizes itself so the pocket never contradicts the page.

import type { VizFrame } from '../frame';
import type { VizMode } from '../mode';
import type { VizPalette } from '../palette';
import type { VizBandCount, VizStyleId } from '@shared/music';

export type VizSize = 'pocket' | 'popover' | 'page';

export interface VizGeometry {
  width: number;
  height: number;
  size: VizSize;
  /** Columns to draw, already decided by `bandsFor`. */
  bands: number;
}

export interface VizStyleOptions {
  peaks: boolean;
  mirror: boolean;
  glow: boolean;
  /** Draw only what is lit. On a surface of its own the resting grid is the
   *  picture's background, and this one has none. */
  bare?: boolean;
}

export interface PainterCache {
  key: string;
  gradient: CanvasGradient | null;
  scratch: Float32Array;
  scratchPeaks: Float32Array;
}

export interface VizPainter {
  id: VizStyleId;
  name: string;
  blurb: string;
  /** Columns the style draws at a size; the page honours the preference. */
  bandsFor(size: VizSize, preferred: VizBandCount): number;
  paint(
    ctx: CanvasRenderingContext2D,
    frame: VizFrame,
    geo: VizGeometry,
    palette: VizPalette,
    opts: VizStyleOptions,
    mode: VizMode,
    cache: PainterCache,
  ): void;
}

export function createPainterCache(): PainterCache {
  return {
    key: '',
    gradient: null,
    scratch: new Float32Array(64),
    scratchPeaks: new Float32Array(64),
  };
}
