// The AppleScript the main process runs, as data, and the parser for its answer.

import { describe, expect, it } from 'vitest';
import {
  commandScript,
  isNativeApp,
  isNativeCommand,
  isRunningScript,
  openScript,
  parseNativeState,
  stateScript,
} from '../src/shared/music-native';

describe('the scripts', () => {
  it('ask System Events whether the app runs, never the app itself', () => {
    for (const app of ['spotify', 'apple_music'] as const) {
      const [line] = isRunningScript(app);
      expect(line).toContain('tell application "System Events"');
      expect(line).not.toMatch(/tell application "(Spotify|Music)"/);
    }
  });

  it('read one tab-separated line of state', () => {
    const spotify = stateScript('spotify').join('\n');
    expect(spotify).toContain('tell application "Spotify"');
    expect(spotify).toContain('player state');
    // Spotify's duration is milliseconds; Music's is seconds.
    expect(spotify).toContain('/ 1000');
    expect(stateScript('apple_music').join('\n')).not.toContain('/ 1000');
  });

  it('name the transport verbs the apps share', () => {
    expect(commandScript('spotify', 'next')).toEqual(['tell application "Spotify" to next track']);
    expect(commandScript('apple_music', 'playpause')).toEqual([
      'tell application "Music" to playpause',
    ]);
  });

  it('start a Spotify URI and nothing else', () => {
    expect(openScript('spotify', 'spotify:playlist:37i9dQZF1DX8Uebhn9wzrS')).toEqual([
      'tell application "Spotify" to play track "spotify:playlist:37i9dQZF1DX8Uebhn9wzrS"',
    ]);
    expect(openScript('spotify', 'spotify:playlist:x" & (do shell script "id")')).toBeNull();
    expect(openScript('apple_music', 'music://music.apple.com/us/album/x/1440935467')).toBeNull();
  });
});

describe('parseNativeState', () => {
  it('reads a playing line', () => {
    const state = parseNativeState('spotify', 'playing\tDeep Focus\tNils Frahm\tScrews\t42\t311\n');
    expect(state).toEqual({
      app: 'spotify',
      status: 'playing',
      title: 'Deep Focus',
      artist: 'Nils Frahm',
      album: 'Screws',
      position: 42,
      duration: 311,
    });
  });

  it('reads a stopped app as stopped with nothing on', () => {
    expect(parseNativeState('apple_music', 'stopped\n')).toMatchObject({
      status: 'stopped',
      title: '',
    });
  });

  it('returns null for garbage', () => {
    expect(parseNativeState('spotify', '')).toBeNull();
    expect(parseNativeState('spotify', 'execution error: Spotify got an error')).toBeNull();
  });
});

describe('the guards', () => {
  it('know the two apps and the five verbs', () => {
    expect(isNativeApp('spotify')).toBe(true);
    expect(isNativeApp('youtube_music')).toBe(false);
    expect(isNativeCommand('previous')).toBe(true);
    expect(isNativeCommand('quit')).toBe(false);
  });
});
