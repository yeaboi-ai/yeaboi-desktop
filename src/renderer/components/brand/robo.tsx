// The Agents world's mascot. Never drawn from scratch: scripts/gen_robo_
// sprites.py recolours the brand duck to steel with a cyan LED visor and an
// antenna — the same derivation law as the TUI's robo (_mascot.py in
// yeaboi.ai). One silhouette, two materials.

import roboSprite from '@/assets/brand/robo.png';

export interface RoboMarkProps {
  /** Rendered width in px. */
  size?: number;
  className?: string;
}

/**
 * The robo at UI-mark sizes. Same `data-duck-mark` treatment as `DuckMark`:
 * every mark is a minification, where the browser's own filter beats
 * nearest-neighbour.
 */
export function RoboMark({ size = 24, className }: RoboMarkProps) {
  return (
    <span
      data-duck-mark
      className={className}
      style={{ width: size, display: 'inline-block', lineHeight: 0 }}
    >
      <img src={roboSprite} alt="" style={{ width: '100%', height: 'auto', display: 'block' }} />
    </span>
  );
}
