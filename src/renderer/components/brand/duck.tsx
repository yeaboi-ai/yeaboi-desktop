// The one import path for duck branding. App code pulls Duck/Wordmark from
// here rather than deep-importing @design paths everywhere.

import { Duck, type DuckRest } from '@design/primitives/Duck';

export { Duck, useDuckPulse } from '@design/primitives/Duck';
export type { DuckPulse, DuckRest, DuckState } from '@design/primitives/Duck';
export { Wordmark } from '@design/primitives/Wordmark';

export interface DuckMarkProps {
  /** Rendered width in px. Anything under 64 needs this wrapper. */
  size?: number;
  state?: DuckRest;
  className?: string;
}

/**
 * The duck at small sizes, without the smudge.
 *
 * The sprite is 128×136 and the primitive's own prop doc calls 64 "the 2x-crisp
 * size". `duck.module.css` sets `image-rendering: pixelated` for the opposite
 * case — its comment says "let it stay blocky when it scales **up**" — but every
 * duck drawn as a UI mark is a *minification*, where pixelated means
 * nearest-neighbour: it discards fifteen of every sixteen source pixels instead
 * of averaging them, and `glasses.png` is 858 bytes of hairlines that alias
 * straight out.
 *
 * The `data-duck-mark` attribute is the hook for one rule in globals.css that
 * hands those images back to the browser's own filter. Done here rather than in
 * the design package because that package is vendored — its source of truth is
 * yeaboi-frontend, a third repo — and this is a consumer-side sizing choice.
 */
export function DuckMark({ size = 24, state = 'idle', className }: DuckMarkProps) {
  return (
    <span
      data-duck-mark
      className={className}
      style={{ width: size, display: 'inline-block', lineHeight: 0 }}
    >
      <Duck state={state} size={size} />
    </span>
  );
}
