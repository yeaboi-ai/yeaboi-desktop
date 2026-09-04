// A scene onto a canvas: paper first, then each cell in the theme's ink or
// accent. The palette is read off the document, so a theme or world change
// repaints the same grid in the new colours.

import { ACCENT, CELL, CODE, FRAME, HALF, INK, PAPER, halftoneInks, type Grid } from './alphabet';
import type { Palette } from '@/lib/screensaver/palette';

export function paintScene(
  canvas: HTMLCanvasElement,
  grid: Grid,
  palette: Palette,
  dpr: number,
): void {
  const scale = Math.max(1, dpr);
  canvas.width = Math.round(FRAME.w * CELL * scale);
  canvas.height = Math.round(FRAME.h * CELL * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, FRAME.w * CELL, FRAME.h * CELL);
  const colour: Record<number, string> = {
    [CODE[INK]]: palette.foreground,
    [CODE[HALF]]: palette.foreground,
    [CODE[ACCENT]]: palette.audienceAccent,
    [CODE[PAPER]]: palette.background,
  };
  for (let y = 0; y < FRAME.h; y += 1) {
    for (let x = 0; x < FRAME.w; x += 1) {
      const code = grid[y * FRAME.w + x]!;
      if (code === 0) continue;
      if (code === CODE[HALF] && !halftoneInks(x, y)) continue;
      ctx.fillStyle = colour[code]!;
      ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
  }
}
