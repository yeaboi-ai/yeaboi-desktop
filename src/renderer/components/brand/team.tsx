// The Team world's mark: three ducks, one cluster. Pure composition of the
// existing DuckMark — no new sprites — mirroring the TUI category screen's
// staging: the front duck centred, the two behind it smaller, higher and
// faded, the way distance stages a crowd.

import { DuckMark } from '@/components/brand/duck';

// The duck sprite is 128×136, so a DuckMark of width `size` renders this
// tall. The cluster claims the SAME box as a lone DuckMark at the same
// `size` — the marks sit side by side (chooser cards, the sidebar pill), and
// a shorter box floats the Team card's text off its neighbours' line.
const DUCK_ASPECT = 136 / 128;

export interface TeamMarkProps {
  /** Rendered width of the whole cluster in px, like DuckMark's `size`. */
  size?: number;
  className?: string;
}

export function TeamMark({ size = 24, className }: TeamMarkProps) {
  const front = Math.round(size * 0.7);
  const back = Math.round(size * 0.5);
  return (
    <span
      className={className}
      style={{
        width: size,
        height: Math.round(size * DUCK_ASPECT),
        display: 'inline-block',
        position: 'relative',
        lineHeight: 0,
      }}
      aria-hidden
    >
      <span style={{ position: 'absolute', left: 0, top: 0, opacity: 0.7 }}>
        <DuckMark size={back} state="idle" />
      </span>
      <span style={{ position: 'absolute', right: 0, top: 0, opacity: 0.7 }}>
        <DuckMark size={back} state="idle" />
      </span>
      <span
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 0,
          transform: 'translateX(-50%)',
        }}
      >
        <DuckMark size={front} state="idle" />
      </span>
    </span>
  );
}
