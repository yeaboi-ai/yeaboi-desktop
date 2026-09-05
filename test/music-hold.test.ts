// The hold refcount: a call and a dictation can overlap, and the first to end
// must not restart the radio under the second.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  holdMusic,
  isMusicHeld,
  onMusicHoldChange,
  resetMusicHold,
} from '../src/renderer/lib/music/hold';

describe('holdMusic', () => {
  beforeEach(() => resetMusicHold());

  it('holds while any claim is open', () => {
    const seen: boolean[] = [];
    onMusicHoldChange((held) => seen.push(held));
    const releaseCall = holdMusic();
    const releaseVoice = holdMusic();
    expect(isMusicHeld()).toBe(true);
    releaseCall();
    expect(isMusicHeld()).toBe(true);
    releaseVoice();
    expect(isMusicHeld()).toBe(false);
    expect(seen).toEqual([true, true, true, false]);
  });

  it('releases a claim once however many times it is called', () => {
    const release = holdMusic();
    release();
    release();
    expect(isMusicHeld()).toBe(false);
    const again = holdMusic();
    expect(isMusicHeld()).toBe(true);
    again();
  });

  it('lets a listener leave', () => {
    let calls = 0;
    const off = onMusicHoldChange(() => (calls += 1));
    off();
    holdMusic()();
    expect(calls).toBe(0);
  });
});
