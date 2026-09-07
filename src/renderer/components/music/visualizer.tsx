'use client';

// A canvas that paints the shared frame in the chosen style. Everything
// expensive lives in refs and the paint callback: React is told about the
// style, the colour, the size and the source, and nothing per frame.

import { useEffect, useRef } from 'react';
import { useMusicPlayer } from '@/components/providers/music-provider';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { createVizState, type VizFrame } from '@/lib/music/viz/frame';
import type { VizMode } from '@/lib/music/viz/mode';
import { vizPalette, type VizPalette } from '@/lib/music/viz/palette';
import type { VizFrameSource } from '@/lib/music/viz/source';
import {
  createPainterCache,
  painterFor,
  type VizGeometry,
  type VizSize,
} from '@/lib/music/viz/styles';
import { syntheticStep } from '@/lib/music/viz/synthetic';
import { isLightGround } from '@/lib/screensaver/luminance';
import { onPaletteChange, readPalette } from '@/lib/screensaver/palette';
import type { VizColourId, VizStyleId } from '@shared/music';

const MAX_DPR = 2;

export function Visualizer({
  size,
  className,
  style,
  colour,
  source,
  bare,
}: {
  size: VizSize;
  className?: string;
  /** Overrides for a preview; the preferences otherwise. */
  style?: VizStyleId;
  colour?: VizColourId;
  source?: VizFrameSource;
  /** Paint only what is lit — for a spectrum that sits on nothing. */
  bare?: boolean;
}) {
  const player = useMusicPlayer();
  const src = source ?? player.viz;
  const prefs = player.prefs.visualizer;
  const styleId = style ?? prefs.style;
  const colourId = colour ?? prefs.colour;
  const { customHex, bands, peaks, mirror, glow } = prefs;
  const reduced = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const painter = painterFor(styleId);
    const cache = createPainterCache();
    const opts = { peaks, mirror, glow, bare };
    let width = 0;
    let height = 0;
    let palette: VizPalette = paletteNow();

    function paletteNow(): VizPalette {
      const tokens = readPalette();
      return vizPalette(tokens, { colour: colourId, customHex }, isLightGround(tokens.background));
    }

    const fit = (): void => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const paint = (frame: VizFrame, mode: VizMode): void => {
      ctx.clearRect(0, 0, width, height);
      const geo: VizGeometry = { width, height, size, bands: painter.bandsFor(size, bands) };
      painter.paint(ctx, frame, geo, palette, opts, mode, cache);
    };

    // One still, for reduced motion: the real frame when there is one, else
    // a synthetic pose so a tile is not a blank.
    const still = (): void => {
      const { frame, mode } = src.current();
      if ((mode === 'live' || mode === 'connecting') && frame.t === 0) {
        const posed = createVizState(48_000, 2048);
        for (let i = 0; i < 40; i += 1)
          syntheticStep(posed, 1 / 60, { gain: 1, smoothing: 0.5, peaks });
        paint(posed, mode);
        return;
      }
      paint(frame, mode);
    };

    fit();
    let unsubscribe: (() => void) | null = null;
    if (reduced) still();
    else unsubscribe = src.subscribe(paint);

    const observer = new ResizeObserver(() => {
      fit();
      const { frame, mode } = src.current();
      paint(frame, mode);
    });
    observer.observe(canvas);

    const stopWatchingTheme = onPaletteChange(() => {
      palette = paletteNow();
      cache.key = '';
      const { frame, mode } = src.current();
      paint(frame, mode);
    });

    return () => {
      unsubscribe?.();
      observer.disconnect();
      stopWatchingTheme();
    };
  }, [src, styleId, colourId, customHex, bands, peaks, mirror, glow, bare, size, reduced]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      data-viz={size}
      data-viz-style={styleId}
      aria-hidden="true"
    />
  );
}
