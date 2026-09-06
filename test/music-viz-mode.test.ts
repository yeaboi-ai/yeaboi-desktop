// Who moves the visualiser: the radio first, then the embed, then the app.

import { describe, expect, it } from 'vitest';
import { vizMode, vizModeFor } from '../src/renderer/lib/music/viz/mode';

describe('vizModeFor', () => {
  it('follows the radio while it is doing anything', () => {
    for (const radio of ['playing', 'connecting', 'paused', 'failed'] as const) {
      expect(vizModeFor({ radio, embed: 'playing', native: 'playing' })).toBe(vizMode(radio));
    }
  });

  it('moves for an embed, synthetically, and pauses with it', () => {
    expect(vizModeFor({ radio: 'stopped', embed: 'playing', native: null })).toBe('live');
    expect(vizModeFor({ radio: 'stopped', embed: 'buffering', native: null })).toBe('live');
    // A frame that has not spoken yet is being started, not ignored.
    expect(vizModeFor({ radio: 'stopped', embed: 'unknown', native: null })).toBe('live');
    expect(vizModeFor({ radio: 'stopped', embed: 'paused', native: 'playing' })).toBe('paused');
    expect(vizModeFor({ radio: 'stopped', embed: 'ended', native: 'playing' })).toBe('paused');
  });

  it('moves for the app when nothing else is on', () => {
    expect(vizModeFor({ radio: 'stopped', embed: null, native: 'playing' })).toBe('live');
    expect(vizModeFor({ radio: 'stopped', embed: null, native: 'paused' })).toBe('paused');
    expect(vizModeFor({ radio: 'stopped', embed: null, native: 'stopped' })).toBe('off');
    expect(vizModeFor({ radio: 'stopped', embed: null, native: null })).toBe('off');
  });
});
