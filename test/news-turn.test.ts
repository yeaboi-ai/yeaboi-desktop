// The clock the page turns on.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TURN_SPEED,
  PAGE_TURN_MS,
  TURN_MS,
  TURN_SPEEDS,
  counterLine,
  isTurnSpeed,
  periodFor,
  resolveIndex,
  turnDirection,
} from '../src/renderer/lib/news/turn';
import { getPref } from '../src/renderer/lib/preferences';

describe('resolveIndex', () => {
  it('starts at the first story and turns once a period', () => {
    expect(resolveIndex(0, 0, 8)).toBe(0);
    expect(resolveIndex(PAGE_TURN_MS - 1, 0, 8)).toBe(0);
    expect(resolveIndex(PAGE_TURN_MS, 0, 8)).toBe(1);
    expect(resolveIndex(3 * PAGE_TURN_MS + 10, 0, 8)).toBe(3);
  });

  it('comes round again', () => {
    expect(resolveIndex(8 * PAGE_TURN_MS, 0, 8)).toBe(0);
    expect(resolveIndex(9 * PAGE_TURN_MS, 0, 8)).toBe(1);
  });

  it('adds the turns made by hand, backwards too', () => {
    expect(resolveIndex(0, 2, 8)).toBe(2);
    expect(resolveIndex(0, -1, 8)).toBe(7);
    expect(resolveIndex(PAGE_TURN_MS, -1, 8)).toBe(0);
    expect(resolveIndex(0, -17, 8)).toBe(7);
  });

  it('is always the one story when there is one, and zero with none', () => {
    expect(resolveIndex(5 * PAGE_TURN_MS, 3, 1)).toBe(0);
    expect(resolveIndex(5 * PAGE_TURN_MS, 3, 0)).toBe(0);
    expect(resolveIndex(-500, 0, 4)).toBe(0);
  });

  it('takes another period', () => {
    expect(resolveIndex(1000, 0, 4, 500)).toBe(2);
  });

  it('gives a story long enough to read', () => {
    expect(PAGE_TURN_MS).toBeGreaterThanOrEqual(10_000);
  });
});

describe('counterLine', () => {
  it('states the position and says nothing when there is no turning', () => {
    expect(counterLine(0, 0)).toBe('');
    expect(counterLine(0, 1)).toBe('');
    expect(counterLine(1, 8)).toBe('2 of 8');
    expect(counterLine(7, 8)).toBe('8 of 8');
    expect(counterLine(1, 8)).not.toMatch(/[·→—]/);
  });
});

describe('the speeds', () => {
  it('are distinct, labelled in words, and the default is the first', () => {
    const ids = TURN_SPEEDS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(TURN_SPEEDS[0]!.id).toBe(DEFAULT_TURN_SPEED);
    expect(TURN_SPEEDS[0]!.ms).toBe(PAGE_TURN_MS);
    for (const speed of TURN_SPEEDS) {
      expect(speed.label).toMatch(/^[A-Z][a-z]/);
      expect(speed.label).not.toMatch(/[·→—.]/);
    }
  });

  it('stop the clock by hand and fall back to the default for a stranger', () => {
    expect(periodFor('hand')).toBe(0);
    expect(periodFor('slow')).toBe(20_000);
    expect(periodFor('nope')).toBe(PAGE_TURN_MS);
    expect(isTurnSpeed('slower')).toBe(true);
    expect(isTurnSpeed('fast')).toBe(false);
    expect(resolveIndex(99_000, 1, 8, 0)).toBe(1);
  });

  it('is what the window remembers by default', () => {
    expect(getPref('news.turnSpeed')).toBe(DEFAULT_TURN_SPEED);
  });

  it('lifts a sheet in the time a hand takes', () => {
    expect(TURN_MS).toBeGreaterThanOrEqual(400);
    expect(TURN_MS).toBeLessThanOrEqual(900);
  });

  it('keeps the index folded until the reader opens it', () => {
    expect(getPref('news.insideOpen')).toBe(false);
  });
});

describe('turnDirection', () => {
  it('goes the shorter way round, forward on a tie, and wraps', () => {
    expect(turnDirection(0, 1, 12)).toBe('forward');
    expect(turnDirection(1, 0, 12)).toBe('back');
    expect(turnDirection(11, 0, 12)).toBe('forward');
    expect(turnDirection(0, 11, 12)).toBe('back');
    expect(turnDirection(0, 6, 12)).toBe('forward');
    expect(turnDirection(0, 7, 12)).toBe('back');
    expect(turnDirection(0, 0, 1)).toBe('forward');
  });
});
