// The ink a scene is drawn in. A newspaper prints one colour on paper, so a
// scene has ink, a halftone (ink on every other cell), one accent, and paper
// laid back over ink for chalk and screen text. The frame is 200 by 120 cells
// on the duck's own 2px pitch, so the sprite and the drawing share a grid.
//
// Pure: a Grid is a byte per cell and every helper writes cells, so a scene
// can be built and asserted in Node with no canvas.

export const CLEAR = '.';
export const INK = 'i';
export const HALF = 'h';
export const ACCENT = 'a';
export const PAPER = 'p';
export type Letter = typeof CLEAR | typeof INK | typeof HALF | typeof ACCENT | typeof PAPER;
export const ALPHABET: readonly Letter[] = [CLEAR, INK, HALF, ACCENT, PAPER];

/** The frame in cells, and a cell in CSS pixels. */
export const FRAME = { w: 200, h: 120 } as const;
export const CELL = 2;

/** The duck sprite in cells (128 by 136 px), and the hat's headroom above it. */
export const DUCK_CELLS = { w: 64, h: 68, headroom: 20 } as const;

export type Grid = Uint8Array;

export const CODE: Record<Letter, number> = {
  [CLEAR]: 0,
  [INK]: 1,
  [HALF]: 2,
  [ACCENT]: 3,
  [PAPER]: 4,
};
const LETTER_OF: Letter[] = [CLEAR, INK, HALF, ACCENT, PAPER];

export function emptyGrid(): Grid {
  return new Uint8Array(FRAME.w * FRAME.h);
}

export function cellAt(grid: Grid, x: number, y: number): Letter {
  if (x < 0 || y < 0 || x >= FRAME.w || y >= FRAME.h) return CLEAR;
  return LETTER_OF[grid[y * FRAME.w + x]!]!;
}

export function set(grid: Grid, x: number, y: number, letter: Letter): void {
  if (x < 0 || y < 0 || x >= FRAME.w || y >= FRAME.h) return;
  grid[y * FRAME.w + x] = CODE[letter];
}

/** Whether a halftone cell prints: a checker over the frame, not the shape. */
export function halftoneInks(x: number, y: number): boolean {
  return (x + y) % 2 === 0;
}

export function rect(
  grid: Grid,
  x: number,
  y: number,
  w: number,
  h: number,
  letter: Letter = INK,
): void {
  for (let yy = y; yy < y + h; yy += 1)
    for (let xx = x; xx < x + w; xx += 1) set(grid, xx, yy, letter);
}

/** A rectangle's outline, `t` cells thick, inside the box. */
export function box(
  grid: Grid,
  x: number,
  y: number,
  w: number,
  h: number,
  t = 1,
  letter: Letter = INK,
): void {
  rect(grid, x, y, w, t, letter);
  rect(grid, x, y + h - t, w, t, letter);
  rect(grid, x, y, t, h, letter);
  rect(grid, x + w - t, y, t, h, letter);
}

export function hline(
  grid: Grid,
  x: number,
  y: number,
  w: number,
  t = 1,
  letter: Letter = INK,
): void {
  rect(grid, x, y, w, t, letter);
}

export function vline(
  grid: Grid,
  x: number,
  y: number,
  h: number,
  t = 1,
  letter: Letter = INK,
): void {
  rect(grid, x, y, t, h, letter);
}

/** A straight stroke between two cells, `t` cells wide (Bresenham). */
export function line(
  grid: Grid,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  t = 1,
  letter: Letter = INK,
): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  const half = Math.floor(t / 2);
  for (;;) {
    rect(grid, x - half, y - half, t, t, letter);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

/** A ring: the cells between radius `r - t` and `r` around a centre. */
export function ring(
  grid: Grid,
  cx: number,
  cy: number,
  r: number,
  t = 1,
  letter: Letter = INK,
  keep: (x: number, y: number) => boolean = () => true,
): void {
  for (let y = cy - r - 1; y <= cy + r + 1; y += 1) {
    for (let x = cx - r - 1; x <= cx + r + 1; x += 1) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d <= r && d > r - t && keep(x, y)) set(grid, x, y, letter);
    }
  }
}

export function disc(grid: Grid, cx: number, cy: number, r: number, letter: Letter = INK): void {
  ring(grid, cx, cy, r, r + 1, letter);
}

/** A filled triangle with a flat base: apex at (ax, ay), base from bx0 to bx1 at by. */
export function triangle(
  grid: Grid,
  ax: number,
  ay: number,
  bx0: number,
  bx1: number,
  by: number,
  letter: Letter = INK,
): void {
  const rows = by - ay;
  if (rows === 0) return;
  const step = ay < by ? 1 : -1;
  for (let y = ay; step > 0 ? y <= by : y >= by; y += step) {
    const f = (y - ay) / rows;
    const left = Math.round(ax + (bx0 - ax) * f);
    const right = Math.round(ax + (bx1 - ax) * f);
    hline(grid, Math.min(left, right), y, Math.abs(right - left) + 1, 1, letter);
  }
}

/** An ASCII prop stamped at a cell offset; `.` leaves the cell as it was. */
export function place(grid: Grid, rows: readonly string[], x: number, y: number): void {
  rows.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx += 1) {
      const ch = row[dx] as Letter;
      if (ch !== CLEAR) set(grid, x + dx, y + dy, ch);
    }
  });
}

/** A small deterministic PRNG (mulberry32), the screensaver's. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `n` single-cell stars in the sky above `below`, never over an inked cell. */
export function stars(grid: Grid, seed: number, n: number, below = 60): void {
  const random = seeded(seed);
  let placed = 0;
  let tries = 0;
  while (placed < n && tries < n * 20) {
    tries += 1;
    const x = Math.floor(random() * FRAME.w);
    const y = Math.floor(random() * below);
    if (cellAt(grid, x, y) !== CLEAR) continue;
    set(grid, x, y, INK);
    placed += 1;
  }
}

/** A four-point star, the one the accent gets. */
export function sparkle(grid: Grid, x: number, y: number, letter: Letter = ACCENT): void {
  set(grid, x, y, letter);
  set(grid, x - 1, y, letter);
  set(grid, x + 1, y, letter);
  set(grid, x, y - 1, letter);
  set(grid, x, y + 1, letter);
}

export function count(grid: Grid, letter: Letter): number {
  let n = 0;
  const code = CODE[letter];
  for (const cell of grid) if (cell === code) n += 1;
  return n;
}
