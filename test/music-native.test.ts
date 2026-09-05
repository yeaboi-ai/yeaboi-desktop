// The AppleScript the main process runs, as data, and the parser for its answer.

import { describe, expect, it } from 'vitest';
import {
  NATIVE_LIBRARY_LIMIT,
  commandScript,
  isNativeApp,
  isNativeCommand,
  isPersistentId,
  isRunningScript,
  libraryPlaylistsScript,
  libraryTracksScript,
  openScript,
  parseNativePlaylists,
  parseNativeState,
  parseNativeTracks,
  playItemScript,
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
    // Spotify has a URL for its art; Music only a blob, so its field is empty.
    expect(spotify).toContain('artwork url of current track');
    expect(stateScript('apple_music').join('\n')).not.toContain('artwork');
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

describe('the library scripts', () => {
  it('read Music only, a property list at a time, never a row at a time', () => {
    expect(libraryPlaylistsScript('spotify')).toBeNull();
    const playlists = libraryPlaylistsScript('apple_music')!.join('\n');
    expect(playlists).toContain('persistent ID of user playlists');
    expect(playlists).toContain('name of user playlists');
    expect(playlists).toContain('special kind of user playlists');
    // AppleScript reads `names` as the plural of the property; the variables must not.
    expect(playlists).not.toMatch(/set (names|ids|artists|albums|durations) to/);
    const tracks = libraryTracksScript('apple_music', 'FCF8BDA2124B353F')!.join('\n');
    expect(tracks).toContain('whose persistent ID is "FCF8BDA2124B353F"');
    expect(tracks).toContain('if (count of tracks of p) is 0 then return ""');
    expect(tracks).toContain(`if i > ${NATIVE_LIBRARY_LIMIT} then exit repeat`);
    expect(tracks).not.toMatch(/repeat with t in/);
  });

  it('accept only a persistent ID, so nothing typed reaches a script', () => {
    expect(isPersistentId('FCF8BDA2124B353F')).toBe(true);
    expect(isPersistentId('fcf8bda2124b353f')).toBe(false);
    expect(isPersistentId('FCF8BDA2124B353F" & (do shell script "id")')).toBe(false);
    expect(libraryTracksScript('apple_music', 'nope')).toBeNull();
    expect(playItemScript('apple_music', 'track', '../x')).toBeNull();
    expect(playItemScript('spotify', 'track', 'FCF8BDA2124B353F')).toBeNull();
  });

  it('play a playlist or a track by persistent ID', () => {
    expect(playItemScript('apple_music', 'playlist', 'FCF8BDA2124B353F')).toEqual([
      'tell application "Music" to play (first user playlist whose persistent ID is "FCF8BDA2124B353F")',
    ]);
    expect(playItemScript('apple_music', 'track', 'FCF8BDA2124B353F')![0]).toContain(
      'first track of library playlist 1 whose persistent ID is "FCF8BDA2124B353F"',
    );
  });

  it('parse the rows and drop anything that is not one', () => {
    expect(parseNativePlaylists('FCF8BDA2124B353F\tFocus\tnone\nnot-an-id\tjunk\tnone\n')).toEqual([
      { id: 'FCF8BDA2124B353F', kind: 'playlist', title: 'Focus', subtitle: '', duration: 0 },
    ]);
    // Apple's own rows — the library, Purchased, a folder — are not playlists a person made.
    expect(
      parseNativePlaylists(
        'FCF8BDA2124B353F\tMusic\tMusic\nAB12CD34EF56AB78\tPurchased\tPurchased Music\n1234567890ABCDEF\tMine\tnone\n',
      ).map((p) => p.title),
    ).toEqual(['Mine']);
    // An older line without the kind column still reads as a person's playlist.
    expect(parseNativePlaylists('FCF8BDA2124B353F\tFocus\n')).toHaveLength(1);
    expect(parseNativeTracks('AB12CD34EF56AB78\tDeep Focus\tNils Frahm\tScrews\t311\n')).toEqual([
      {
        id: 'AB12CD34EF56AB78',
        kind: 'track',
        title: 'Deep Focus',
        subtitle: 'Nils Frahm · Screws',
        duration: 311,
      },
    ]);
    expect(parseNativeTracks('')).toEqual([]);
    expect(parseNativeTracks('execution error: Music got an error')).toEqual([]);
  });
});

describe('parseNativeState', () => {
  it('reads a playing line', () => {
    const state = parseNativeState(
      'spotify',
      'playing\tDeep Focus\tNils Frahm\tScrews\t42\t311\thttps://i.scdn.co/image/ab67616d\n',
      1_000,
    );
    expect(state).toEqual({
      app: 'spotify',
      status: 'playing',
      title: 'Deep Focus',
      artist: 'Nils Frahm',
      album: 'Screws',
      position: 42,
      duration: 311,
      asOf: 1_000,
      artworkUrl: 'https://i.scdn.co/image/ab67616d',
    });
  });

  it("keeps art only from Spotify's own host", () => {
    const line = (art: string) => `paused\tA\tB\tC\t1\t2\t${art}`;
    expect(parseNativeState('spotify', line('https://evil.example/x.jpg'))?.artworkUrl).toBeNull();
    expect(parseNativeState('spotify', line('javascript:alert(1)'))?.artworkUrl).toBeNull();
    expect(parseNativeState('apple_music', line(''))?.artworkUrl).toBeNull();
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
