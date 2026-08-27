// The duck's arbiter — pure clock logic, ported with the duck.

import { describe, expect, it } from 'vitest';
import { DuckVoice, HOLD_MS, PRIORITY_COACH, PRIORITY_EVENT } from '../src/renderer/lib/duck-voice';
import { NOTIFY, QUIPS } from '../src/renderer/lib/duck-vocabulary';
import { RUNS } from '../src/renderer/lib/yeaboi/run-notices';

describe('DuckVoice', () => {
  it('takes a line and shows it', () => {
    const voice = new DuckVoice();
    expect(voice.say("Standup's up!", PRIORITY_EVENT, HOLD_MS, 0)).toBe(true);
    expect(voice.tick(0)?.text).toBe("Standup's up!");
  });

  it('drops the line once it has had its time', () => {
    const voice = new DuckVoice();
    voice.say('Saved it!', PRIORITY_EVENT, HOLD_MS, 0);
    expect(voice.tick(HOLD_MS - 1)).not.toBeNull();
    expect(voice.tick(HOLD_MS + 1)).toBeNull();
  });

  it('never lets coaching interrupt a quip', () => {
    const voice = new DuckVoice();
    voice.say("Report's ready!", PRIORITY_EVENT, HOLD_MS, 0);
    expect(voice.say('Try the arrow keys', PRIORITY_COACH, HOLD_MS, 10)).toBe(false);
    expect(voice.tick(10)?.text).toBe("Report's ready!");
  });

  it('lets a quip take the bubble from coaching', () => {
    const voice = new DuckVoice();
    voice.say('Try the arrow keys', PRIORITY_COACH, HOLD_MS, 0);
    expect(voice.say('Saved it!', PRIORITY_EVENT, HOLD_MS, 10)).toBe(true);
    expect(voice.tick(10)?.text).toBe('Saved it!');
  });

  it('does not restart the fade for a line already showing', () => {
    const voice = new DuckVoice();
    voice.say('Synced!', PRIORITY_EVENT, HOLD_MS, 0);
    voice.say('Synced!', PRIORITY_EVENT, HOLD_MS, 500);
    expect(voice.tick(HOLD_MS + 1)).toBeNull();
  });

  it('holds a sticky line until it is answered', () => {
    // A question that fades out unanswered is worse than one never asked.
    const voice = new DuckVoice();
    voice.saySticky('A diff needs you.', 0);
    expect(voice.tick(HOLD_MS * 100)?.text).toBe('A diff needs you.');
    expect(voice.sticky).toBe(true);
    voice.clearSticky();
    expect(voice.tick(0)).toBeNull();
  });

  it('lets nothing chattier take the bubble from a sticky line', () => {
    const voice = new DuckVoice();
    voice.saySticky('A diff needs you.', 0);
    expect(voice.say('Saved it!', PRIORITY_EVENT, HOLD_MS, 10)).toBe(false);
    expect(voice.tick(10)?.text).toBe('A diff needs you.');
  });

  it('clearSticky leaves an ordinary line alone', () => {
    const voice = new DuckVoice();
    voice.say('Saved it!', PRIORITY_EVENT, HOLD_MS, 0);
    voice.clearSticky();
    expect(voice.tick(0)?.text).toBe('Saved it!');
  });

  it('says nothing at all when muted', () => {
    const voice = new DuckVoice();
    voice.say('Saved it!', PRIORITY_EVENT, HOLD_MS, 0);
    voice.mute(true);
    expect(voice.tick(0)).toBeNull();
    expect(voice.say('Synced!', PRIORITY_EVENT, HOLD_MS, 10)).toBe(false);
  });

  it('an empty line is not a line', () => {
    // A blank status must not hold the bubble open.
    const voice = new DuckVoice();
    expect(voice.say('', PRIORITY_EVENT, HOLD_MS, 0)).toBe(false);
    expect(voice.tick(0)).toBeNull();
  });
});

// The duck's vocabulary. Every announcement in the app names a key rather than
// writing words, so a key with no row here is a silence nobody notices.

describe('the duck vocabulary', () => {
  it('has a quip behind every notification', () => {
    // NOTIFY decides the banner and the toast; QUIPS is still what the duck
    // itself says, so a NOTIFY row with no quip would notify a silent duck.
    const orphans = Object.keys(NOTIFY).filter((key) => !QUIPS[key]);
    expect(orphans).toEqual([]);
  });

  it('has words for every run that can announce itself', () => {
    const keys = [...RUNS.map((run) => run.key), 'run.failed'];
    for (const key of keys) {
      expect(QUIPS[key], `no quip for ${key}`).toBeTruthy();
      expect(NOTIFY[key], `no notification for ${key}`).toBeTruthy();
    }
  });

  it('stays inside the clamps the main process applies', () => {
    // clampBanner truncates at 80/200; a line that gets cut mid-word reads as
    // a bug, so the table must not need cutting.
    for (const [key, banner] of Object.entries(NOTIFY)) {
      expect(banner.title.length, key).toBeLessThanOrEqual(80);
      expect(banner.body.length, key).toBeLessThanOrEqual(200);
    }
    // The pet bubble clamps a quip at 80 too.
    for (const [key, quip] of Object.entries(QUIPS)) {
      expect(quip.length, key).toBeLessThanOrEqual(80);
    }
  });
});
