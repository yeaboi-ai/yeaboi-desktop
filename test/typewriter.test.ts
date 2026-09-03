import { describe, expect, it } from 'vitest';

import { revealStep, revealed } from '../src/shared/typewriter';

describe('revealStep', () => {
  it('stops once the reveal has caught up', () => {
    expect(revealStep(40, 40)).toBe(0);
    expect(revealStep(41, 40)).toBe(0);
  });

  it('keeps moving on a trickle', () => {
    expect(revealStep(0, 1)).toBe(1);
    expect(revealStep(0, 4)).toBe(3);
  });

  it('gains faster the further behind it is', () => {
    expect(revealStep(0, 60)).toBeGreaterThan(revealStep(0, 30));
  });

  it('never overshoots what has arrived', () => {
    for (const total of [1, 5, 17, 200, 5000]) {
      expect(revealStep(0, total)).toBeLessThanOrEqual(total);
    }
  });

  it('caps the pace, so one burst does not stamp the whole answer down', () => {
    expect(revealStep(0, 100_000)).toBeLessThanOrEqual(180);
  });

  it('spends what is left faster once the stream has finished', () => {
    expect(revealStep(0, 300, true)).toBeGreaterThan(revealStep(0, 300, false));
  });

  it('drains a long answer in a readable handful of frames', () => {
    let shown = 0;
    let frames = 0;
    const total = 900;
    while (shown < total && frames < 200) {
      shown += revealStep(shown, total, true);
      frames += 1;
    }
    expect(shown).toBe(total);
    expect(frames).toBeLessThan(40);
  });
});

describe('revealed', () => {
  it('shows the first `shown` characters', () => {
    expect(revealed('hello there', 5)).toBe('hello');
  });

  it('never runs past text that shrank underneath it', () => {
    expect(revealed('hi', 400)).toBe('hi');
  });

  it('treats a negative reveal as nothing shown', () => {
    expect(revealed('hello', -3)).toBe('');
  });
});
