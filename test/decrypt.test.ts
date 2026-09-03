import { describe, expect, it } from 'vitest';

import { durationFor, revealedAt, scramble } from '../src/shared/decrypt';

describe('scramble', () => {
  const line = "Your team's desk";

  it('keeps the line the same length', () => {
    expect(scramble(line, 4).length).toBe(line.length);
  });

  it('resolves left to right', () => {
    expect(scramble(line, 4).slice(0, 4)).toBe('Your');
  });

  it('never scrambles the gaps between words', () => {
    const out = scramble(line, 0);
    for (let i = 0; i < line.length; i += 1) {
      if (line[i] === ' ') expect(out[i]).toBe(' ');
    }
  });

  it('is the text itself once everything has resolved', () => {
    expect(scramble(line, line.length)).toBe(line);
    expect(scramble(line, line.length + 10)).toBe(line);
  });

  it('holds a glyph steady within a step and changes between steps', () => {
    expect(scramble(line, 0, 3)).toBe(scramble(line, 0, 3));
    expect(scramble(line, 0, 3)).not.toBe(scramble(line, 0, 4));
  });

  it('leaves nothing of the unresolved text readable', () => {
    const secret = 'Reporting';
    expect(scramble(secret, 0)).not.toContain('Reporting');
  });
});

describe('revealedAt', () => {
  it('starts at nothing and ends at everything', () => {
    expect(revealedAt(20, 0)).toBe(0);
    expect(revealedAt(20, 1)).toBe(20);
    expect(revealedAt(20, 2)).toBe(20);
  });

  it('advances with progress', () => {
    expect(revealedAt(20, 0.5)).toBe(10);
  });
});

describe('durationFor', () => {
  it('gives a longer line longer, up to a ceiling', () => {
    expect(durationFor(0)).toBe(220);
    expect(durationFor(20)).toBeGreaterThan(durationFor(10));
    expect(durationFor(1000)).toBe(560);
  });
});
