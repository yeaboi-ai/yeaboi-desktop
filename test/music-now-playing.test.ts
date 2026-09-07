// One Now Playing for every source, and the clock that runs it forward.

import { describe, expect, it } from 'vitest';
import { parseMusicLink } from '../src/shared/music-links';
import type { NativeNowPlaying } from '../src/shared/music-native';
import { EMBED_INITIAL, type EmbedPlayback } from '../src/renderer/lib/music/embed/bridge';
import {
  nowPlayingFrom,
  positionAt,
  progressFraction,
  youtubeThumbnail,
} from '../src/renderer/lib/music/now-playing';

const youtube = parseMusicLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ')!;
const spotify = parseMusicLink('https://open.spotify.com/playlist/37i9dQZF1DX8Uebhn9wzrS')!;
const apple = parseMusicLink('https://music.apple.com/us/album/random-access-memories/1440935467')!;
const nativeSpotify: NativeNowPlaying = {
  app: 'spotify',
  status: 'playing',
  title: 'Deep Focus',
  artist: 'Nils Frahm',
  album: 'Screws',
  position: 42,
  duration: 311,
  asOf: 5_000,
  artworkUrl: 'https://i.scdn.co/image/abc',
};
const quiet = { embed: null, embedPlayback: null, embedTitle: '', native: null, nativeApp: null };

describe('nowPlayingFrom', () => {
  it('is nothing when nothing is on', () => {
    expect(nowPlayingFrom(quiet)).toBeNull();
    expect(
      nowPlayingFrom({
        ...quiet,
        native: { ...nativeSpotify, status: 'stopped' },
        nativeApp: 'spotify',
      }),
    ).toBeNull();
    // An app that is not the one being watched does not count.
    expect(
      nowPlayingFrom({ ...quiet, native: nativeSpotify, nativeApp: 'apple_music' }),
    ).toBeNull();
  });

  it('describes a YouTube embed from what the player said, with its still', () => {
    const playback: EmbedPlayback = {
      ...EMBED_INITIAL,
      status: 'playing',
      position: 12,
      duration: 212,
      title: 'Never Gonna Give You Up',
      artist: 'Rick Astley',
      asOf: 1_000,
    };
    const now = nowPlayingFrom({
      ...quiet,
      embed: youtube,
      embedPlayback: playback,
      embedTitle: 'A shelf row',
    })!;
    expect(now).toMatchObject({
      source: 'embed',
      service: 'youtube_music',
      status: 'playing',
      title: 'Never Gonna Give You Up',
      artist: 'Rick Astley',
      position: 12,
      duration: 212,
      artworkUrl: youtubeThumbnail('dQw4w9WgXcQ'),
      where: 'here',
      transport: { toggle: true, skip: false, seek: true },
    });
  });

  it("falls back to the shelf row's name and offers no seek before the length is known", () => {
    const now = nowPlayingFrom({
      ...quiet,
      embed: spotify,
      embedPlayback: EMBED_INITIAL,
      embedTitle: 'Focus mix',
    })!;
    expect(now).toMatchObject({ title: 'Focus mix', status: 'unknown', artworkUrl: null });
    expect(now.transport).toEqual({ toggle: true, skip: false, seek: false });
    const bare = nowPlayingFrom({ ...quiet, embed: spotify, embedPlayback: null, embedTitle: '' })!;
    expect(bare.title).toBe(spotify.label);
  });

  it("offers Apple's frame nothing but its name", () => {
    const now = nowPlayingFrom({
      ...quiet,
      embed: apple,
      embedPlayback: EMBED_INITIAL,
      embedTitle: 'RAM',
    })!;
    expect(now.transport).toEqual({ toggle: false, skip: false, seek: false });
    expect(now.artworkUrl).toBeNull();
  });

  it('describes the app, with its art and a full transport', () => {
    const now = nowPlayingFrom({ ...quiet, native: nativeSpotify, nativeApp: 'spotify' })!;
    expect(now).toMatchObject({
      source: 'native',
      service: 'spotify',
      status: 'playing',
      title: 'Deep Focus',
      album: 'Screws',
      artworkUrl: 'https://i.scdn.co/image/abc',
      where: 'in Spotify',
      transport: { toggle: true, skip: true, seek: false },
    });
  });

  it('prefers the embed here to the app out there', () => {
    const now = nowPlayingFrom({
      ...quiet,
      embed: youtube,
      embedPlayback: EMBED_INITIAL,
      native: nativeSpotify,
      nativeApp: 'spotify',
    })!;
    expect(now.source).toBe('embed');
  });
});

describe('the clock', () => {
  it('runs forward while playing and reads as a fraction', () => {
    const now = nowPlayingFrom({ ...quiet, native: nativeSpotify, nativeApp: 'spotify' })!;
    expect(positionAt(now, 7_000)).toBe(44);
    expect(progressFraction(now, 7_000)).toBeCloseTo(44 / 311);
    const paused = nowPlayingFrom({
      ...quiet,
      native: { ...nativeSpotify, status: 'paused' },
      nativeApp: 'spotify',
    })!;
    expect(positionAt(paused, 70_000)).toBe(42);
    const endless = nowPlayingFrom({
      ...quiet,
      native: { ...nativeSpotify, duration: 0 },
      nativeApp: 'spotify',
    })!;
    expect(progressFraction(endless, 7_000)).toBe(0);
  });
});
