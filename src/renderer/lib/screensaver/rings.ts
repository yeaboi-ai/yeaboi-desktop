// Impact rings: a brief ring of theme colour where something happened, drawn
// by the duck yard on a collision.

export const RING_SECONDS = 0.35;
/** Final radius, as a multiple of the radius the ring was spawned with. */
export const RING_GROWTH = 1.3;
/** A busy scene must not become fireworks. */
export const MAX_RINGS = 12;

export interface Ring {
  x: number;
  y: number;
  radius: number;
  /** Seconds left. */
  left: number;
}

export function spawnRing(rings: Ring[], x: number, y: number, radius: number): void {
  if (rings.length > MAX_RINGS) return;
  rings.push({ x, y, radius, left: RING_SECONDS });
}

/** Age every ring by `dt` and drop the spent ones. */
export function stepRings(rings: Ring[], dt: number): Ring[] {
  for (const ring of rings) ring.left -= dt;
  return rings.filter((ring) => ring.left > 0);
}

export function drawRings(ctx: CanvasRenderingContext2D, rings: Ring[], colour: string): void {
  ctx.save();
  ctx.strokeStyle = colour;
  for (const ring of rings) {
    const through = 1 - ring.left / RING_SECONDS;
    ctx.globalAlpha = 0.3 * (1 - through);
    ctx.lineWidth = 2 * (1 - through) + 0.5;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.radius * (0.6 + RING_GROWTH * through), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
