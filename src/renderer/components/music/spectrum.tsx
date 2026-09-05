'use client';

// The spectrum, in the terminal's eight block characters, from a real
// AnalyserNode. Sixty-four columns on the page, four in the rail pocket.
//
// Text rather than canvas on purpose: the glyphs ARE the design, and a string
// of them redraws for nothing. The loop runs only while playing and stops on
// unmount; under reduced motion one frame is drawn and left.

import { useEffect, useRef, useState } from 'react';
import { bandLevels, blockGlyphs, flatGlyphs, syntheticLevels } from '@/lib/music/spectrum';
import { cn } from '@/lib/utils';

const FRAME_MS = 80;
const SPEED = 0.18;

export function Spectrum({
  analyser,
  playing,
  bands,
  className,
  frozen,
}: {
  analyser: AnalyserNode | null;
  playing: boolean;
  bands: number;
  className?: string;
  /** Paused: keep the last frame in muted rather than drop to the floor. */
  frozen?: boolean;
}) {
  const [text, setText] = useState(() => flatGlyphs(bands));
  const last = useRef(text);

  useEffect(() => {
    if (!playing) {
      if (!frozen) {
        last.current = flatGlyphs(bands);
        setText(last.current);
      }
      return;
    }
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const bins = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    let phase = 0;
    let raf = 0;
    let stamp = 0;

    const levels = (): number[] => {
      if (analyser && bins) {
        analyser.getByteFrequencyData(bins);
        return bandLevels(bins, bands);
      }
      phase += SPEED;
      return syntheticLevels(phase, bands);
    };

    const frame = (now: number): void => {
      if (now - stamp >= FRAME_MS) {
        stamp = now;
        last.current = blockGlyphs(levels());
        setText(last.current);
      }
      raf = requestAnimationFrame(frame);
    };

    if (reduced) {
      last.current = blockGlyphs(levels());
      setText(last.current);
      return;
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playing, analyser, bands, frozen]);

  return (
    <span
      aria-hidden
      className={cn('font-mono whitespace-pre select-none leading-none', className)}
    >
      {text}
    </span>
  );
}
