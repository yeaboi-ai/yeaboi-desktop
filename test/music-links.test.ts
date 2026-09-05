// The link grammar: every share link the Music page accepts, and the shapes it
// must refuse. Every produced URL is rebuilt from validated parts.

import { describe, expect, it } from 'vitest';
import { EMBED_FRAME_ORIGINS } from '../src/shared/music';
import { MUSIC_SERVICES, isMusicService, parseMusicLink } from '../src/shared/music-links';

const SAFE = /^[A-Za-z0-9./?=&_%:-]+$/;

describe('parseMusicLink', () => {
  describe('spotify', () => {
    it.each(['track', 'album', 'playlist', 'artist', 'episode', 'show'])(
      'reads a %s link',
      (kind) => {
        const link = parseMusicLink(`https://open.spotify.com/${kind}/37i9dQZF1DX8Uebhn9wzrS`);
        expect(link).toMatchObject({ service: 'spotify', kind, id: '37i9dQZF1DX8Uebhn9wzrS' });
        expect(link?.embedUrl).toBe(
          `https://open.spotify.com/embed/${kind}/37i9dQZF1DX8Uebhn9wzrS?theme=0`,
        );
        expect(link?.nativeUrl).toBe(`spotify:${kind}:37i9dQZF1DX8Uebhn9wzrS`);
      },
    );

    it('reads the spotify: URI form', () => {
      expect(parseMusicLink('spotify:playlist:37i9dQZF1DX8Uebhn9wzrS')?.kind).toBe('playlist');
    });

    it('drops the locale prefix and the share tracking', () => {
      const link = parseMusicLink(
        'https://open.spotify.com/intl-de/album/4aawyAB9vmqN3uQ7FjRGTy?si=abc123',
      );
      expect(link?.embedUrl).toBe(
        'https://open.spotify.com/embed/album/4aawyAB9vmqN3uQ7FjRGTy?theme=0',
      );
    });

    it('refuses an id that is not 22 base62 characters', () => {
      expect(parseMusicLink('https://open.spotify.com/track/short')).toBeNull();
      expect(parseMusicLink('https://open.spotify.com/user/somebody')).toBeNull();
    });
  });

  describe('apple music', () => {
    it('reads an album, keeping the country and the slug', () => {
      const link = parseMusicLink('https://music.apple.com/gb/album/rain-and-static/1440935467');
      expect(link).toMatchObject({ service: 'apple_music', kind: 'album', id: '1440935467' });
      expect(link?.embedUrl).toBe(
        'https://embed.music.apple.com/gb/album/rain-and-static/1440935467',
      );
      expect(link?.nativeUrl).toBe('music://music.apple.com/gb/album/rain-and-static/1440935467');
    });

    it('turns an album link with ?i= into that song', () => {
      const link = parseMusicLink(
        'https://music.apple.com/us/album/says/1440935467?i=1440935474&uo=4',
      );
      expect(link).toMatchObject({ kind: 'song', id: '1440935474' });
      expect(link?.embedUrl).toBe(
        'https://embed.music.apple.com/us/album/says/1440935467?i=1440935474',
      );
    });

    it('reads a playlist by its pl. id', () => {
      const link = parseMusicLink(
        'https://music.apple.com/us/playlist/pure-focus/pl.u-9N9LYbgs1A7yE',
      );
      expect(link).toMatchObject({ kind: 'playlist', id: 'pl.u-9N9LYbgs1A7yE' });
    });

    it('re-encodes a slug rather than passing it through', () => {
      const link = parseMusicLink(
        'https://music.apple.com/us/album/caf%C3%A9%20del%20mar/1440935467',
      );
      expect(link?.embedUrl).toBe(
        'https://embed.music.apple.com/us/album/caf%C3%A9%20del%20mar/1440935467',
      );
    });

    it('refuses a path that is not country/kind/slug/id', () => {
      expect(parseMusicLink('https://music.apple.com/us/album/1440935467')).toBeNull();
      expect(parseMusicLink('https://music.apple.com/usa/album/x/1440935467')).toBeNull();
      expect(parseMusicLink('https://music.apple.com/us/album/x/1440935467?i=abc')).toBeNull();
    });
  });

  describe('youtube', () => {
    it.each([
      'https://www.youtube.com/watch?v=jfKfPfyJRdk',
      'https://youtu.be/jfKfPfyJRdk?t=42',
      'https://music.youtube.com/watch?v=jfKfPfyJRdk&feature=share',
      'https://m.youtube.com/watch?v=jfKfPfyJRdk',
      'https://www.youtube.com/shorts/jfKfPfyJRdk',
    ])('reads a video from %s', (input) => {
      const link = parseMusicLink(input);
      expect(link).toMatchObject({ service: 'youtube_music', kind: 'video', id: 'jfKfPfyJRdk' });
      expect(link?.embedUrl).toBe('https://www.youtube-nocookie.com/embed/jfKfPfyJRdk');
      expect(link?.nativeUrl).toBeNull();
    });

    it('reads a playlist', () => {
      const link = parseMusicLink(
        'https://www.youtube.com/playlist?list=PLOHoVaTp8R7dfrJW5pumS0iD_dhlXKv17',
      );
      expect(link).toMatchObject({ kind: 'playlist', id: 'PLOHoVaTp8R7dfrJW5pumS0iD_dhlXKv17' });
      expect(link?.embedUrl).toBe(
        'https://www.youtube-nocookie.com/embed/videoseries?list=PLOHoVaTp8R7dfrJW5pumS0iD_dhlXKv17',
      );
    });

    it('keeps the playlist when a video is opened inside one', () => {
      const link = parseMusicLink(
        'https://www.youtube.com/watch?v=jfKfPfyJRdk&list=PLOHoVaTp8R7dfrJW5pumS0iD_dhlXKv17',
      );
      expect(link?.embedUrl).toBe(
        'https://www.youtube-nocookie.com/embed/jfKfPfyJRdk?list=PLOHoVaTp8R7dfrJW5pumS0iD_dhlXKv17',
      );
    });

    it('refuses an id of the wrong shape', () => {
      expect(parseMusicLink('https://www.youtube.com/watch?v=tooshort')).toBeNull();
      expect(parseMusicLink('https://www.youtube.com/playlist?list=short')).toBeNull();
    });
  });

  describe('refusals', () => {
    it.each([
      '',
      '   ',
      'not a url',
      'http://open.spotify.com/track/37i9dQZF1DX8Uebhn9wzrS',
      'https://evil.com/open.spotify.com/track/37i9dQZF1DX8Uebhn9wzrS',
      'https://open.spotify.com.evil.com/track/37i9dQZF1DX8Uebhn9wzrS',
      'https://user:pass@open.spotify.com/track/37i9dQZF1DX8Uebhn9wzrS',
      'javascript:alert(1)',
      'https://open.spotify.com/track/<script>alert(1)</script>',
      'https://soundcloud.com/somebody/track',
      'spotify:user:somebody',
    ])('returns null for %s', (input) => {
      expect(parseMusicLink(input)).toBeNull();
    });
  });

  it('only ever frames one of the three embed origins, in safe characters', () => {
    const inputs = [
      'https://open.spotify.com/playlist/37i9dQZF1DX8Uebhn9wzrS',
      'https://music.apple.com/us/album/caf%C3%A9/1440935467?i=1440935474',
      'https://www.youtube.com/watch?v=jfKfPfyJRdk&list=PLOHoVaTp8R7dfrJW5pumS0iD_dhlXKv17',
    ];
    for (const input of inputs) {
      const link = parseMusicLink(input)!;
      expect(EMBED_FRAME_ORIGINS.some((origin) => link.embedUrl.startsWith(`${origin}/`))).toBe(
        true,
      );
      expect(link.embedUrl).toMatch(SAFE);
      if (link.nativeUrl) expect(link.nativeUrl).toMatch(SAFE);
    }
  });
});

describe('isMusicService', () => {
  it('knows the three catalogue keys and nothing else', () => {
    for (const service of MUSIC_SERVICES) expect(isMusicService(service)).toBe(true);
    expect(isMusicService('radio')).toBe(false);
    expect(isMusicService('apple')).toBe(false);
  });
});

describe('the rows the backend hands back', () => {
  // contracts/v1/app_http.md, "Music": every row's url is one of these forms.
  it('parse through the same grammar a pasted link does', () => {
    const rows = [
      ['spotify', 'track', 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC'],
      ['spotify', 'playlist', 'https://open.spotify.com/playlist/37i9dQZF1DX8Uebhn9wzrS'],
      ['spotify', 'album', 'https://open.spotify.com/album/4uLU6hMCjMI75M1A2tKUQC'],
      ['youtube_music', 'video', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
      [
        'youtube_music',
        'playlist',
        'https://www.youtube.com/playlist?list=PL590L5WQmH8dpP0RyH5pCfIWUOSmqVKN6',
      ],
      [
        'apple_music',
        'song',
        'https://music.apple.com/us/album/random-access-memories-deluxe/1440935400?i=1440935467',
      ],
      [
        'apple_music',
        'album',
        'https://music.apple.com/gb/album/random-access-memories/1440935400',
      ],
    ] as const;
    for (const [service, kind, url] of rows) {
      const parsed = parseMusicLink(url);
      expect(parsed?.service, url).toBe(service);
      expect(parsed?.kind, url).toBe(kind);
    }
  });
});
