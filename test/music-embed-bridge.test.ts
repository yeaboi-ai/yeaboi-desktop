// The embed players' postMessage dialects, turned into one playback record.

import { describe, expect, it } from 'vitest';
import { parseMusicLink } from '../src/shared/music-links';
import {
  EMBED_INITIAL,
  bridgeOrigin,
  bridgedEmbedUrl,
  embedCommand,
  embedPositionAt,
  embedReducer,
  hasChannel,
  listeningMessage,
  parseEmbedMessage,
  type EmbedPlayback,
} from '../src/renderer/lib/music/embed/bridge';

const YT = 'https://www.youtube-nocookie.com';
const SP = 'https://open.spotify.com';
const youtube = parseMusicLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ')!;
const playlist = parseMusicLink(
  'https://www.youtube.com/playlist?list=PL590L5WQmH8dpP0RyH5pCfIWUOSmqVKN6',
)!;
const spotify = parseMusicLink('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC')!;
const apple = parseMusicLink('https://music.apple.com/us/album/random-access-memories/1440935467')!;

describe('the channel', () => {
  it('exists for YouTube and Spotify, not Apple', () => {
    expect(bridgeOrigin('youtube_music')).toBe(YT);
    expect(bridgeOrigin('spotify')).toBe(SP);
    expect(bridgeOrigin('apple_music')).toBeNull();
    expect(hasChannel('apple_music')).toBe(false);
  });

  it('names our origin on the YouTube URL and leaves the others alone', () => {
    const url = new URL(bridgedEmbedUrl(youtube, 'app://yeaboi'));
    expect(url.origin).toBe(YT);
    expect(url.pathname).toBe('/embed/dQw4w9WgXcQ');
    expect(url.searchParams.get('enablejsapi')).toBe('1');
    expect(url.searchParams.get('origin')).toBe('app://yeaboi');
    expect(bridgedEmbedUrl(playlist, 'http://localhost:5173')).toContain('enablejsapi=1');
    expect(bridgedEmbedUrl(spotify, 'app://yeaboi')).toBe(spotify.embedUrl);
    expect(bridgedEmbedUrl(apple, 'app://yeaboi')).toBe(apple.embedUrl);
  });

  it('only asks YouTube to talk', () => {
    expect(listeningMessage('youtube_music')).toEqual({
      targetOrigin: YT,
      data: JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }),
    });
    expect(listeningMessage('spotify')).toBeNull();
    expect(listeningMessage('apple_music')).toBeNull();
  });
});

describe('parseEmbedMessage', () => {
  it('refuses the wrong origin outright', () => {
    const yt = JSON.stringify({ event: 'onReady' });
    expect(parseEmbedMessage('youtube_music', 'https://www.youtube.com', yt)).toBeNull();
    expect(parseEmbedMessage('spotify', YT, { type: 'ready' })).toBeNull();
    expect(parseEmbedMessage('apple_music', 'https://embed.music.apple.com', {})).toBeNull();
  });

  it('reads YouTube as JSON strings', () => {
    expect(parseEmbedMessage('youtube_music', YT, JSON.stringify({ event: 'onReady' }))).toEqual({
      kind: 'ready',
    });
    const info = JSON.stringify({
      event: 'infoDelivery',
      info: {
        currentTime: 12.5,
        duration: 212,
        playerState: 1,
        videoData: { title: 'Never Gonna Give You Up', author: 'Rick Astley' },
      },
    });
    expect(parseEmbedMessage('youtube_music', YT, info)).toEqual({
      kind: 'playback',
      patch: {
        position: 12.5,
        duration: 212,
        status: 'playing',
        title: 'Never Gonna Give You Up',
        artist: 'Rick Astley',
      },
    });
    expect(
      parseEmbedMessage('youtube_music', YT, JSON.stringify({ event: 'onStateChange', info: 2 })),
    ).toEqual({ kind: 'playback', patch: { status: 'paused' } });
    // A cued or unstarted player is waiting on a press: nothing sounds yet.
    expect(
      parseEmbedMessage('youtube_music', YT, JSON.stringify({ event: 'onStateChange', info: -1 })),
    ).toEqual({ kind: 'playback', patch: { status: 'paused' } });
    expect(
      parseEmbedMessage(
        'youtube_music',
        YT,
        JSON.stringify({ event: 'initialDelivery', info: { playerState: 5, currentTime: 0 } }),
      ),
    ).toEqual({ kind: 'playback', patch: { position: 0, status: 'paused' } });
    expect(
      parseEmbedMessage('youtube_music', YT, JSON.stringify({ event: 'onStateChange', info: 9 })),
    ).toBeNull();
    expect(parseEmbedMessage('youtube_music', YT, 'not json')).toBeNull();
    expect(parseEmbedMessage('youtube_music', YT, { event: 'onReady' })).toBeNull();
  });

  it('reads Spotify as objects, in milliseconds', () => {
    expect(parseEmbedMessage('spotify', SP, { type: 'ready' })).toEqual({ kind: 'ready' });
    expect(
      parseEmbedMessage('spotify', SP, {
        type: 'playback_update',
        payload: { isPaused: false, isBuffering: false, duration: 30000, position: 1500 },
      }),
    ).toEqual({ kind: 'playback', patch: { position: 1.5, duration: 30, status: 'playing' } });
    expect(
      parseEmbedMessage('spotify', SP, {
        type: 'playback_update',
        payload: { isPaused: true, isBuffering: true, duration: 30000, position: 0 },
      }),
    ).toMatchObject({ kind: 'playback', patch: { status: 'buffering' } });
    expect(parseEmbedMessage('spotify', SP, { type: 'playback_started' })).toEqual({
      kind: 'playback',
      patch: { status: 'playing' },
    });
    expect(parseEmbedMessage('spotify', SP, 'ready')).toBeNull();
    expect(parseEmbedMessage('spotify', SP, { type: 'something_else' })).toBeNull();
  });
});

describe('embedReducer', () => {
  it('marks the player ready and stamps the clock', () => {
    const ready = embedReducer(EMBED_INITIAL, { kind: 'ready' }, 100);
    expect(ready).toMatchObject({ ready: true, asOf: 100, status: 'unknown' });
    const playing = embedReducer(
      ready,
      { kind: 'playback', patch: { status: 'playing', position: 3 } },
      200,
    );
    expect(playing).toMatchObject({ status: 'playing', position: 3, asOf: 200 });
  });

  it('forgets a hold once a person presses play in the player', () => {
    const held: EmbedPlayback = { ...EMBED_INITIAL, status: 'paused', heldBy: 'hold' };
    expect(embedReducer(held, { kind: 'playback', patch: { status: 'playing' } }, 1).heldBy).toBe(
      'none',
    );
    expect(embedReducer(held, { kind: 'playback', patch: { position: 4 } }, 1).heldBy).toBe('hold');
  });
});

describe('embedCommand', () => {
  const playing: EmbedPlayback = { ...EMBED_INITIAL, status: 'playing' };
  it('speaks YouTube', () => {
    expect(embedCommand('youtube_music', 'play', EMBED_INITIAL)).toEqual({
      targetOrigin: YT,
      data: JSON.stringify({
        event: 'command',
        func: 'playVideo',
        args: [],
        id: 1,
        channel: 'widget',
      }),
    });
    expect(JSON.parse(embedCommand('youtube_music', 'toggle', playing)!.data as string).func).toBe(
      'pauseVideo',
    );
    expect(
      JSON.parse(embedCommand('youtube_music', 'toggle', EMBED_INITIAL)!.data as string).func,
    ).toBe('playVideo');
    expect(
      JSON.parse(embedCommand('youtube_music', { seek: -3 }, playing)!.data as string),
    ).toMatchObject({ func: 'seekTo', args: [0, true] });
  });

  it('speaks Spotify', () => {
    expect(embedCommand('spotify', 'pause', playing)).toEqual({
      targetOrigin: SP,
      data: { command: 'pause' },
    });
    expect(embedCommand('spotify', 'toggle', playing)!.data).toEqual({ command: 'pause' });
    expect(embedCommand('spotify', 'toggle', EMBED_INITIAL)!.data).toEqual({ command: 'play' });
    expect(embedCommand('spotify', { seek: 12 }, playing)!.data).toEqual({
      command: 'seek',
      timestamp: 12,
    });
  });

  it('has nothing to say to Apple', () => {
    expect(embedCommand('apple_music', 'play', EMBED_INITIAL)).toBeNull();
    expect(embedCommand('apple_music', { seek: 1 }, EMBED_INITIAL)).toBeNull();
  });
});

describe('embedPositionAt', () => {
  it('runs forward only while playing, and never past the end', () => {
    const playing: EmbedPlayback = {
      ...EMBED_INITIAL,
      status: 'playing',
      position: 10,
      duration: 12,
      asOf: 1_000,
    };
    expect(embedPositionAt(playing, 1_500)).toBe(10.5);
    expect(embedPositionAt(playing, 9_000)).toBe(12);
    expect(embedPositionAt({ ...playing, status: 'paused' }, 9_000)).toBe(10);
    expect(embedPositionAt({ ...playing, asOf: 0 }, 9_000)).toBe(10);
  });
});
