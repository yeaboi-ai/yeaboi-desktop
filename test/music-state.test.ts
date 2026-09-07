// The radio's reducer: the terminal's rules, pinned.

import { describe, expect, it } from 'vitest';
import {
  MUSIC_INITIAL,
  NEEDS_A_CLICK,
  STREAM_UNAVAILABLE,
  formatElapsed,
  musicReducer,
  pocketMood,
  type MusicState,
} from '../src/renderer/lib/music/state';

const COUNT = 4;
const playing: MusicState = { ...MUSIC_INITIAL, status: 'playing' };

describe('musicReducer', () => {
  it('starts quiet and a hydrate never plays', () => {
    expect(MUSIC_INITIAL.status).toBe('stopped');
    const next = musicReducer(MUSIC_INITIAL, {
      type: 'hydrate',
      channel: 2,
      volume: 0.5,
      count: COUNT,
    });
    expect(next).toMatchObject({ status: 'stopped', channel: 2, volume: 0.5 });
    const off = musicReducer(
      { ...MUSIC_INITIAL, channel: 1 },
      { type: 'hydrate', channel: 99, count: COUNT },
    );
    expect(off.channel).toBe(1);
  });

  it('connects on play, then plays when the element says so', () => {
    const connecting = musicReducer(MUSIC_INITIAL, { type: 'play' });
    expect(connecting.status).toBe('connecting');
    expect(musicReducer(connecting, { type: 'media', event: 'playing' }).status).toBe('playing');
  });

  it('names a dead stream and keeps the way back', () => {
    const failed = musicReducer(playing, { type: 'media', event: 'error' });
    expect(failed).toMatchObject({ status: 'failed', error: STREAM_UNAVAILABLE });
    // The element's own pause after its error must not clear the failure.
    expect(musicReducer(failed, { type: 'media', event: 'pause' }).status).toBe('failed');
    expect(musicReducer(failed, { type: 'play' }).status).toBe('connecting');
    expect(
      musicReducer(playing, { type: 'media', event: 'error', message: NEEDS_A_CLICK }).error,
    ).toBe(NEEDS_A_CLICK);
  });

  it('treats an unasked-for pause as paused, and a pause while connecting as stopped', () => {
    expect(musicReducer(playing, { type: 'media', event: 'pause' }).status).toBe('paused');
    const connecting = musicReducer(MUSIC_INITIAL, { type: 'play' });
    expect(musicReducer(connecting, { type: 'media', event: 'pause' }).status).toBe('stopped');
  });

  it('wraps the station and keeps playing across a change', () => {
    expect(musicReducer(playing, { type: 'channel', index: 5, count: COUNT })).toMatchObject({
      status: 'playing',
      channel: 1,
    });
    expect(
      musicReducer({ ...playing, channel: 0 }, { type: 'previous', count: COUNT }).channel,
    ).toBe(3);
    expect(musicReducer({ ...playing, channel: 3 }, { type: 'next', count: COUNT }).channel).toBe(
      0,
    );
    expect(musicReducer(playing, { type: 'channel', index: 2, count: 0 }).channel).toBe(0);
    // A failure belonged to the old station; the new one starts clean.
    const failed = musicReducer(playing, { type: 'media', event: 'error' });
    expect(musicReducer(failed, { type: 'next', count: COUNT })).toMatchObject({
      status: 'stopped',
      error: '',
    });
  });

  it('clamps the volume', () => {
    expect(musicReducer(MUSIC_INITIAL, { type: 'volume', value: 3 }).volume).toBe(1);
    expect(musicReducer(MUSIC_INITIAL, { type: 'volume', value: -3 }).volume).toBe(0);
  });

  describe('a hold', () => {
    it('pauses only a live radio and remembers it did', () => {
      const held = musicReducer(playing, { type: 'hold', held: true });
      expect(held).toMatchObject({ status: 'paused', held: true });
      expect(musicReducer(MUSIC_INITIAL, { type: 'hold', held: true })).toBe(MUSIC_INITIAL);
    });

    it('resumes only what it paused', () => {
      const held = musicReducer(playing, { type: 'hold', held: true });
      expect(musicReducer(held, { type: 'hold', held: false })).toMatchObject({
        status: 'connecting',
        held: false,
      });
      const byHand = musicReducer(playing, { type: 'pause' });
      expect(musicReducer(byHand, { type: 'hold', held: false })).toBe(byHand);
    });

    it('is forgotten by a person pressing play or stop', () => {
      const held = musicReducer(playing, { type: 'hold', held: true });
      expect(musicReducer(held, { type: 'stop' }).held).toBe(false);
      expect(musicReducer(held, { type: 'play' }).held).toBe(false);
    });
  });
});

describe('pocketMood', () => {
  const quiet = { native: false, embed: false };
  it('shows the radio first, then the embed, then the app, then the radio again', () => {
    expect(pocketMood(playing, { native: true, embed: true })).toBe('live');
    expect(pocketMood(MUSIC_INITIAL, { native: true, embed: true })).toBe('embed');
    expect(pocketMood(MUSIC_INITIAL, { native: true, embed: false })).toBe('native');
    expect(pocketMood(MUSIC_INITIAL, quiet)).toBe('off');
    expect(pocketMood({ ...MUSIC_INITIAL, status: 'failed' }, quiet)).toBe('failed');
    expect(pocketMood({ ...MUSIC_INITIAL, status: 'paused', held: true }, quiet)).toBe('held');
    expect(pocketMood({ ...MUSIC_INITIAL, status: 'paused' }, quiet)).toBe('paused');
  });

  it('lets an embed outrank a paused or failed radio', () => {
    expect(pocketMood({ ...MUSIC_INITIAL, status: 'failed' }, { native: false, embed: true })).toBe(
      'embed',
    );
    expect(pocketMood({ ...MUSIC_INITIAL, status: 'paused' }, { native: false, embed: true })).toBe(
      'embed',
    );
  });
});

describe('formatElapsed', () => {
  it('reads like a clock', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(247)).toBe('4:07');
    expect(formatElapsed(6127)).toBe('1:42:07');
    expect(formatElapsed(-5)).toBe('0:00');
  });
});
