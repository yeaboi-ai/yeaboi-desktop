'use client';

// The one frame loop behind every visualiser canvas in the window, and the
// synthetic one the style tiles share so previews move with nothing playing.

import { useEffect, useRef } from 'react';
import { createVizSource, type VizFrameSource } from '@/lib/music/viz/source';
import type { VizOptions } from '@/lib/music/viz/frame';

function realSource(): VizFrameSource {
  return createVizSource({
    now: () => performance.now(),
    raf: (cb) => requestAnimationFrame(cb),
    caf: (id) => cancelAnimationFrame(id),
    hidden: () => document.hidden,
  });
}

export function useVizFrames(): VizFrameSource {
  const ref = useRef<VizFrameSource | null>(null);
  if (!ref.current) ref.current = realSource();
  useEffect(() => {
    const source = ref.current!;
    const onVisibility = () => source.visibility();
    document.addEventListener('visibilitychange', onVisibility);
    if (import.meta.env.DEV) {
      (window as unknown as { __yeaboiViz?: unknown }).__yeaboiViz = {
        stats: () => source.stats(),
      };
    }
    return () => {
      // Pause, never dispose: React's development double-mount runs this once
      // before the real mount, and a disposed loop would stay dead.
      document.removeEventListener('visibilitychange', onVisibility);
      source.pause();
    };
  }, []);
  return ref.current;
}

/** A loop that never hears the radio: the style tiles' preview. */
export function useSyntheticVizSource(opts: VizOptions): VizFrameSource {
  const ref = useRef<VizFrameSource | null>(null);
  if (!ref.current) ref.current = realSource();
  const { gain, smoothing, peaks } = opts;
  useEffect(() => {
    const source = ref.current!;
    source.set({ analyser: null, mode: 'live', opts: { gain, smoothing, peaks } });
    const onVisibility = () => source.visibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      source.pause();
    };
  }, [gain, smoothing, peaks]);
  return ref.current;
}
