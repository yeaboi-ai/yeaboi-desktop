// The music preferences: clamped on every read, the shelf re-parsed, and the
// radio hosts the CSP names matched against the stations the backend ships.

import { describe, expect, it } from 'vitest';
import {
  MUSIC_DEFAULTS,
  MUSIC_LIMITS,
  RADIO_MEDIA_ORIGINS,
  mediaOriginAllowed,
  mergeMusicPrefs,
  newSavedLinkId,
  normalizeMusicPrefs,
  radioRequestHeaders,
  radioUrlPatterns,
} from '../src/shared/music';

// yeaboi.ai's src/yeaboi/music.py CHANNELS, verbatim.
const SHIPPED_STATIONS = [
  'https://ice1.somafm.com/groovesalad-128-mp3',
  'https://ice1.somafm.com/sonicuniverse-128-mp3',
  'https://icecast.radiofrance.fr/francemusique-midfi.mp3',
  'https://ice1.somafm.com/dronezone-128-mp3',
];

const SPOTIFY = 'https://open.spotify.com/playlist/37i9dQZF1DX8Uebhn9wzrS';
const YOUTUBE = 'https://www.youtube.com/watch?v=jfKfPfyJRdk';

describe('normalizeMusicPrefs', () => {
  it('reads nothing as the defaults', () => {
    expect(normalizeMusicPrefs(undefined)).toEqual(MUSIC_DEFAULTS);
    expect(normalizeMusicPrefs('nonsense')).toEqual(MUSIC_DEFAULTS);
  });

  it('is a fixed point', () => {
    const once = normalizeMusicPrefs({
      volume: 0.7,
      source: 'spotify',
      pauseInCalls: false,
      library: [{ id: 'a', url: SPOTIFY, label: 'Deep Focus', addedAt: 5 }],
    });
    expect(normalizeMusicPrefs(once)).toEqual(once);
  });

  it('clamps the volume and refuses a NaN', () => {
    expect(normalizeMusicPrefs({ volume: 4 }).volume).toBe(1);
    expect(normalizeMusicPrefs({ volume: -1 }).volume).toBe(0);
    expect(normalizeMusicPrefs({ volume: 'loud' }).volume).toBe(MUSIC_DEFAULTS.volume);
  });

  it('accepts only radio or a catalogue service as the source', () => {
    expect(normalizeMusicPrefs({ source: 'apple_music' }).source).toBe('apple_music');
    expect(normalizeMusicPrefs({ source: 'winamp' }).source).toBe('radio');
  });

  it('drops a saved link whose url no longer parses, and keeps the parsed identity', () => {
    const prefs = normalizeMusicPrefs({
      library: [
        { id: 'ok', url: SPOTIFY, addedAt: 1 },
        { id: 'bad', url: 'https://evil.com/x', addedAt: 2 },
        { id: 'lying', url: YOUTUBE, service: 'spotify', addedAt: 3 },
        { url: SPOTIFY },
      ],
    });
    expect(prefs.library.map((l) => l.id)).toEqual(['ok']);
    expect(prefs.library[0]).toMatchObject({
      service: 'spotify',
      kind: 'playlist',
      label: 'Spotify playlist',
    });
  });

  it('keeps one row per share link and caps the shelf', () => {
    const many = Array.from({ length: MUSIC_LIMITS.library + 10 }, (_, i) => ({
      id: `id${i}`,
      url: `https://www.youtube.com/watch?v=${String(i).padStart(11, 'x').replace(/x/g, 'a')}`,
      addedAt: i,
    }));
    expect(normalizeMusicPrefs({ library: many }).library.length).toBeLessThanOrEqual(
      MUSIC_LIMITS.library,
    );
    const twice = normalizeMusicPrefs({
      library: [
        { id: 'a', url: SPOTIFY },
        { id: 'b', url: SPOTIFY },
      ],
    });
    expect(twice.library).toHaveLength(1);
  });

  it('trims a label to the limit', () => {
    const prefs = normalizeMusicPrefs({
      library: [{ id: 'a', url: SPOTIFY, label: 'x'.repeat(200) }],
    });
    expect(prefs.library[0]?.label).toHaveLength(MUSIC_LIMITS.label);
  });
});

describe('mergeMusicPrefs', () => {
  it('patches one field and re-clamps it', () => {
    const next = mergeMusicPrefs(MUSIC_DEFAULTS, { volume: 9 });
    expect(next.volume).toBe(1);
    expect(next.source).toBe('radio');
  });

  it('ignores a patch that is not an object', () => {
    expect(mergeMusicPrefs(MUSIC_DEFAULTS, 'x')).toEqual(MUSIC_DEFAULTS);
  });
});

describe('mediaOriginAllowed', () => {
  it('covers every station the backend ships', () => {
    for (const url of SHIPPED_STATIONS) {
      expect(mediaOriginAllowed(url, RADIO_MEDIA_ORIGINS), url).toBe(true);
    }
  });

  it('lets the SomaFM ice hosts bounce among themselves', () => {
    expect(
      mediaOriginAllowed('https://ice6.somafm.com/groovesalad-128-mp3', RADIO_MEDIA_ORIGINS),
    ).toBe(true);
  });

  it('refuses another host, a lookalike, and plain http', () => {
    expect(mediaOriginAllowed('https://somafm.com.evil.com/x', RADIO_MEDIA_ORIGINS)).toBe(false);
    expect(mediaOriginAllowed('https://example.com/stream', RADIO_MEDIA_ORIGINS)).toBe(false);
    expect(mediaOriginAllowed('http://ice1.somafm.com/x', RADIO_MEDIA_ORIGINS)).toBe(false);
    expect(mediaOriginAllowed('not a url', RADIO_MEDIA_ORIGINS)).toBe(false);
  });
});

describe('the radio request filter', () => {
  it('names the station hosts as URL patterns', () => {
    expect(radioUrlPatterns()).toEqual([
      'https://*.somafm.com/*',
      'https://icecast.radiofrance.fr/*',
    ]);
  });

  it('drops the referrer and nothing else', () => {
    // SomaFM answers 403 to a media request whose Referer it does not know.
    const headers = {
      Referer: 'app://yeaboi/',
      Range: 'bytes=0-',
      Origin: 'app://yeaboi',
      'User-Agent': 'x',
    };
    expect(radioRequestHeaders(headers)).toEqual({
      Range: 'bytes=0-',
      Origin: 'app://yeaboi',
      'User-Agent': 'x',
    });
    expect(radioRequestHeaders({ referer: 'x' })).toEqual({});
  });
});

describe('newSavedLinkId', () => {
  it('mints distinct ids', () => {
    expect(newSavedLinkId()).not.toBe(newSavedLinkId());
  });
});
