import { describe, expect, it } from 'vitest';

import { revealStep, revealed } from '../src/shared/typewriter';

describe('revealStep', () => {
  it('stops once the reveal has caught up', () => {
    expect(revealStep(40, 40)).toBe(0);
    expect(revealStep(41, 40)).toBe(0);
  });

  it('keeps moving on a trickle', () => {
    expect(revealStep(0, 1)).toBe(1);
    expect(revealStep(0, 4)).toBe(2);
  });

  it('gains faster the further behind it is', () => {
    expect(revealStep(0, 600)).toBeGreaterThan(revealStep(0, 60));
  });

  it('never overshoots what has arrived', () => {
    for (const total of [1, 5, 17, 200, 5000]) {
      expect(revealStep(0, total)).toBeLessThanOrEqual(total);
    }
  });

  it('caps the pace, so one burst does not stamp the whole answer down', () => {
    expect(revealStep(0, 100_000)).toBeLessThanOrEqual(120);
  });

  it('spends what is left faster once the stream has finished', () => {
    expect(revealStep(0, 600, true)).toBeGreaterThan(revealStep(0, 600, false));
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
    expect(frames).toBeLessThan(120);
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

describe('revealed, mid-answer', () => {
  it('cuts mid-word, so the answer reads as typing', () => {
    expect(revealed('the quick brown fox', 13)).toBe('the quick bro');
  });

  it('holds back a marker whose other half has not arrived', () => {
    expect(revealed('you are on the **Standup screen', 22)).toBe('you are on the ');
  });

  it('shows the marker once it is closed', () => {
    expect(revealed('you are on the **Standup** screen', 27)).toBe('you are on the **Standup** ');
  });

  it('holds back a half-written link', () => {
    expect(revealed('see [the board here', 12)).toBe('see ');
  });

  it('holds back a marker at the very end of what has streamed so far', () => {
    expect(revealed('half **bold', 11)).toBe('half ');
  });

  it('shows that same text once the stream has finished', () => {
    expect(revealed('half **bold', 11, true)).toBe('half **bold');
  });

  it('shows everything once it has all arrived', () => {
    expect(revealed('**done**', 99)).toBe('**done**');
  });

  it('takes the last of it whole when the stream has finished', () => {
    expect(revealed('the quick brown', 11, true)).toBe('the quick b');
  });
});
