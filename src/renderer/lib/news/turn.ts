// The clock the page turns on. The story shown is a function of time elapsed
// while the reader was away plus the turns they made by hand, so pausing
// resumes in place and browsing never fights the clock (the tip companion's
// arithmetic, lib/yeaboi/tips.ts).

/** How long a story stays up before the page turns, by default. */
export const PAGE_TURN_MS = 12_000;
/** How long a sheet takes to be lifted off the pile and carried away. */
export const TURN_MS = 600;

export type TurnSpeedId = 'quick' | 'slow' | 'slower' | 'hand';

export interface TurnSpeed {
  id: TurnSpeedId;
  /** 0 means the page turns only by hand. */
  ms: number;
  label: string;
}

/** The choices Settings offers, in order. */
export const TURN_SPEEDS: readonly TurnSpeed[] = [
  { id: 'quick', ms: PAGE_TURN_MS, label: 'Every 12 seconds' },
  { id: 'slow', ms: 20_000, label: 'Every 20 seconds' },
  { id: 'slower', ms: 30_000, label: 'Every 30 seconds' },
  { id: 'hand', ms: 0, label: 'Only by hand' },
];

export const DEFAULT_TURN_SPEED: TurnSpeedId = 'quick';

export function isTurnSpeed(value: unknown): value is TurnSpeedId {
  return TURN_SPEEDS.some((speed) => speed.id === value);
}

/** The period for a speed; 0 when the clock is off. An unknown speed is the default. */
export function periodFor(speed: unknown): number {
  const found = TURN_SPEEDS.find((candidate) => candidate.id === speed);
  return (found ?? TURN_SPEEDS[0]!).ms;
}

/** Which story is up after `elapsedMs` on the clock and `offset` turns by hand. */
export function resolveIndex(
  elapsedMs: number,
  offset: number,
  count: number,
  period = PAGE_TURN_MS,
): number {
  if (count <= 0) return 0;
  const ticks = period > 0 ? Math.floor(Math.max(0, elapsedMs) / period) : 0;
  return (((ticks + offset) % count) + count) % count;
}

/** `2 of 8`; nothing when there is nothing to turn to. */
export function counterLine(index: number, count: number): string {
  if (count <= 1) return '';
  return `${index + 1} of ${count}`;
}

export type TurnDirection = 'forward' | 'back';

/** Which way the sheet folds between two stories: the shorter way round, forward on a tie. */
export function turnDirection(from: number, to: number, count: number): TurnDirection {
  if (count <= 1) return 'forward';
  const ahead = (((to - from) % count) + count) % count;
  return ahead <= count - ahead ? 'forward' : 'back';
}
