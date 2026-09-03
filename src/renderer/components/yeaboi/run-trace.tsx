// A project's runs as a row of dots in the world's accent, the oldest faintest
// and the newest full: the picture of a project holding what ran inside it.
// A ghost trace (hollow dots) stands where nothing has run yet, so the shape
// is there before the data is. The sentence beside it carries the count.

import { TRACE_GHOST } from '@/lib/yeaboi/home';

const DOT = 8;
const GAP = 4;
const PITCH = DOT + GAP;
const STAGGER_MS = 30;

export function RunTrace({
  dots,
  ghost = false,
  title,
  className,
}: {
  /** One opacity per dot, oldest first. Ignored when `ghost`. */
  dots: number[];
  ghost?: boolean;
  /** What the dots say, for assistive technology. */
  title: string;
  className?: string;
}) {
  const opacities = ghost ? Array.from({ length: TRACE_GHOST }, () => 1) : dots;
  const width = opacities.length * PITCH - GAP;
  return (
    <svg
      role="img"
      aria-label={title}
      width={width}
      height={DOT}
      viewBox={`0 0 ${width} ${DOT}`}
      className={className}
      data-run-trace={ghost ? 'ghost' : 'runs'}
    >
      <title>{title}</title>
      {opacities.map((opacity, i) => (
        // The group carries the entrance so the dot keeps its own opacity.
        <g key={i} className="animate-fade-in" style={{ animationDelay: `${i * STAGGER_MS}ms` }}>
          {ghost ? (
            <circle
              cx={i * PITCH + DOT / 2}
              cy={DOT / 2}
              r={DOT / 2 - 0.75}
              fill="none"
              stroke="var(--audience-accent)"
              strokeWidth={1.5}
              opacity={0.45}
            />
          ) : (
            <circle
              cx={i * PITCH + DOT / 2}
              cy={DOT / 2}
              r={DOT / 2}
              fill="var(--audience-accent)"
              opacity={opacity}
            />
          )}
        </g>
      ))}
    </svg>
  );
}
