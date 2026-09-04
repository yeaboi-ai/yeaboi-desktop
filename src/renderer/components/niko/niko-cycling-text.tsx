'use client';

// The pill's rotating placeholder, written and unwritten a letter at a time.
//
// Two phrases are on screen at once — the one arriving and the one it replaces
// — stacked absolutely inside a fixed overflow-hidden box. The box is sized in
// px rather than by content: that is what keeps the pill's width stable while
// the text swaps. The width lives in niko.ts, which sizes the pill around it.
//
// Each letter carries its own delay, so a phrase rises into place as a wave
// left to right and leaves the same way, rather than the whole line sliding up
// as one block.

import { useEffect, useState } from 'react';

import { COLLAPSED_TEXT_WIDTH } from '@/lib/yeaboi/niko';

const PHRASES = [
  'Ask anything…',
  'What did my agents cost?',
  'Where do I run a retro?',
  'What should I do next?',
  'Is anything waiting on me?',
  'Show me my standups',
  'Take me to ceremonies',
];

/** How long each phrase holds, in ms. */
const DWELL_MS = 3500;

/** Between one letter and the next, and the most the whole wave may take. A
 *  long phrase would otherwise still be arriving when it is due to leave. */
const LETTER_MS = 16;
const WAVE_MS = 260;

function Letter({ char, delay, out }: { char: string; delay: number; out: boolean }) {
  return (
    <span
      className={`niko-letter ${out ? 'niko-letter-out' : 'niko-letter-in'}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {char}
    </span>
  );
}

function Phrase({ text, out }: { text: string; out: boolean }) {
  const letters = Array.from(text);
  const step = Math.min(LETTER_MS, WAVE_MS / Math.max(letters.length - 1, 1));
  return (
    <span className="absolute left-0 top-0 flex h-full items-center">
      {letters.map((char, i) => (
        <Letter key={`${i}-${char}`} char={char} delay={Math.round(i * step)} out={out} />
      ))}
    </span>
  );
}

export function NikoCyclingText() {
  // The phrase leaving and the phrase arriving. Nothing is leaving on the first
  // render — the pill opens with its first line already in place.
  const [[leaving, showing], setPair] = useState<[number, number]>([-1, 0]);

  useEffect(() => {
    const interval = setInterval(
      () => setPair(([, current]) => [current, (current + 1) % PHRASES.length]),
      DWELL_MS,
    );
    return () => clearInterval(interval);
  }, []);

  return (
    <span
      className="relative inline-flex shrink-0 items-center overflow-hidden whitespace-nowrap font-body text-[12px] text-muted-foreground/60 group-hover:text-foreground/80"
      style={{ height: 16, width: COLLAPSED_TEXT_WIDTH }}
    >
      {leaving >= 0 && <Phrase key={`out-${leaving}`} text={PHRASES[leaving]!} out />}
      <Phrase key={`in-${showing}`} text={PHRASES[showing]!} out={false} />
    </span>
  );
}
