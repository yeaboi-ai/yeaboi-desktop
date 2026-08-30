'use client';

// The pill's rotating placeholder.
//
// Every phrase is rendered at once, stacked absolutely inside a fixed
// overflow-hidden box: that is what keeps the pill's width stable while the
// text swaps, and why the box is sized in px rather than by content. Outgoing
// phrases leave upward, pending ones wait below. The width lives in niko.ts,
// which sizes the pill around it.

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

export function NikoCyclingText() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setIndex((i) => (i + 1) % PHRASES.length), DWELL_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <span
      className="relative inline-flex shrink-0 items-center overflow-hidden text-[12px] font-body text-muted-foreground/60 group-hover:text-foreground/80 whitespace-nowrap"
      style={{ height: 16, width: COLLAPSED_TEXT_WIDTH }}
    >
      {PHRASES.map((phrase, i) => {
        const isLeaving = i < index || (index === 0 && i === PHRASES.length - 1);
        return (
          <span
            key={phrase}
            className="absolute left-0 top-0 flex items-center h-full transition-all duration-500 ease-in-out"
            style={{
              opacity: i === index ? 1 : 0,
              transform:
                i === index
                  ? 'translateY(0)'
                  : isLeaving
                    ? 'translateY(-14px)'
                    : 'translateY(14px)',
            }}
          >
            {phrase}
          </span>
        );
      })}
    </span>
  );
}
