// How light the ground is — the one thing a scene sometimes has to know about
// a theme beyond the colours themselves.
//
// Aurora is the reason this exists: layers of colour blended with plain alpha
// average toward grey, so it wants an additive blend on a dark ground and a
// multiply on a light one. Which of those is right is not a theme setting
// anybody would want to write down; it is a property of the background colour,
// so it is measured rather than declared.
//
// Measured, too, rather than parsed: a token is any CSS colour, and a custom
// theme may hold an hsl() or an oklch() that a hex regex would silently read as
// black. Painting one pixel and reading it back is exact for every notation the
// browser accepts.

let probe: CanvasRenderingContext2D | null = null;

function context(): CanvasRenderingContext2D | null {
  if (probe) return probe;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  probe = canvas.getContext('2d', { willReadFrequently: true });
  return probe;
}

/** Relative luminance of a CSS colour, 0 (black) to 1 (white). */
export function luminanceOf(colour: string, fallback = 0): number {
  const ctx = context();
  if (!ctx) return fallback;
  try {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    // Rec. 709 luma, on the sRGB values as painted. Precise enough to answer
    // "is this ground light or dark", which is all it is ever asked.
    return (0.2126 * r! + 0.7152 * g! + 0.0722 * b!) / 255;
  } catch {
    return fallback;
  }
}

export function isLightGround(colour: string): boolean {
  return luminanceOf(colour) > 0.5;
}
