// The one import path for duck branding. App code pulls Duck/Wordmark from
// here rather than deep-importing @design paths everywhere.

import { Duck, type DuckState } from '@design/primitives/Duck';
import { OUTFIT_HEADROOM, PERSONA_SRC } from '@/lib/screensaver/duck-art';
import type { PersonaId } from '@/lib/yeaboi/personas';

export { Duck, useDuckPulse } from '@design/primitives/Duck';
export type { DuckPulse, DuckRest, DuckState } from '@design/primitives/Duck';
export { Wordmark } from '@design/primitives/Wordmark';

/**
 * The product name, set in the app's own display voice.
 *
 * The pixel duck is the mascot and the one pixel-art artifact in the chrome;
 * the name beside him is typography, not sprite lettering — the same
 * `font-display italic` every heading in the app already speaks.
 */
export function BrandName({ className = '' }: { className?: string }) {
  return <span className={`font-display italic text-foreground ${className}`}>yeaboi</span>;
}

export interface DuckMarkProps {
  /** Rendered width in px. Anything under 64 needs this wrapper. */
  size?: number;
  state?: DuckState;
  jamming?: boolean;
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
export function DuckMark({ size = 24, state = 'idle', jamming, className }: DuckMarkProps) {
  return (
    <span
      data-duck-mark
      className={className}
      style={{ width: size, display: 'inline-block', lineHeight: 0 }}
    >
      <Duck state={state} size={size} jamming={jamming} />
    </span>
  );
}

/** The sprite's width in source pixels; the personas are drawn on the same canvas. */
const SPRITE_WIDTH = 128;

/**
 * The duck as a persona (see lib/yeaboi/personas.ts). Each layer is laid
 * over the ordinary mark, mirrored the way the primitive mirrors its body, on
 * a canvas taller than the sprite so a hat rises above the crown; at mark
 * sizes the body's bob is under a pixel, so the layers sit still.
 */
export function PersonaDuckMark({
  persona,
  size = 24,
  className,
}: {
  persona: PersonaId;
  size?: number;
  className?: string;
}) {
  const rise = (OUTFIT_HEADROOM / SPRITE_WIDTH) * size;
  return (
    <span
      data-duck-mark
      className={className}
      style={{ width: size, display: 'inline-block', lineHeight: 0, position: 'relative' }}
    >
      <Duck state="idle" size={size} />
      {PERSONA_SRC[persona].map((layer) => (
        <img
          key={layer.src}
          src={layer.src}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            left: 0,
            top: -rise,
            width: size,
            height: 'auto',
            scale: '-1 1',
            pointerEvents: 'none',
          }}
        />
      ))}
    </span>
  );
}
