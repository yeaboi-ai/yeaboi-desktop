// One "what is on" for the page, the popover and the pocket, whichever source
// is sounding: the embed here in the window, or Spotify or Music out there.

import type { MusicLink, MusicService } from '@shared/music-links';
import { NATIVE_APPS, type NativeApp, type NativeNowPlaying } from '@shared/music-native';
import { embedPositionAt, type EmbedPlayback } from '@/lib/music/embed/bridge';

export type NowPlayingStatus = 'playing' | 'paused' | 'buffering' | 'stopped' | 'unknown';

export interface NowPlaying {
  source: 'embed' | 'native';
  service: MusicService;
  status: NowPlayingStatus;
  title: string;
  artist: string;
  album: string;
  /** Seconds, as of `asOf`; see positionAt. */
  position: number;
  duration: number;
  asOf: number;
  artworkUrl: string | null;
  /** "here" or "in Spotify" — where the sound is. */
  where: string;
  /** What the transport may offer for this source. */
  transport: { toggle: boolean; skip: boolean; seek: boolean };
}

export interface NowPlayingInputs {
  embed: MusicLink | null;
  embedPlayback: EmbedPlayback | null;
  /** The shelf row's name, the only title Spotify's and Apple's frames give. */
  embedTitle: string;
  native: NativeNowPlaying | null;
  nativeApp: NativeApp | null;
}

const NATIVE_SERVICE: Record<NativeApp, MusicService> = {
  spotify: 'spotify',
  apple_music: 'apple_music',
};

/** YouTube's still for a video, from an id the link grammar already checked. */
export function youtubeThumbnail(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export function nowPlayingFrom({
  embed,
  embedPlayback,
  embedTitle,
  native,
  nativeApp,
}: NowPlayingInputs): NowPlaying | null {
  if (embed) {
    const playback = embedPlayback;
    const channel = embed.service !== 'apple_music';
    return {
      source: 'embed',
      service: embed.service,
      status: playback?.status === 'ended' ? 'stopped' : (playback?.status ?? 'unknown'),
      title: playback?.title || embedTitle || embed.label,
      artist: playback?.artist ?? '',
      album: '',
      position: playback?.position ?? 0,
      duration: playback?.duration ?? 0,
      asOf: playback?.asOf ?? 0,
      artworkUrl:
        embed.service === 'youtube_music' && embed.kind === 'video'
          ? youtubeThumbnail(embed.id)
          : null,
      where: 'here',
      transport: { toggle: channel, skip: false, seek: channel && (playback?.duration ?? 0) > 0 },
    };
  }
  if (native && nativeApp && native.app === nativeApp && native.status !== 'stopped') {
    return {
      source: 'native',
      service: NATIVE_SERVICE[native.app],
      status: native.status,
      title: native.title,
      artist: native.artist,
      album: native.album,
      position: native.position,
      duration: native.duration,
      asOf: native.asOf,
      artworkUrl: native.artworkUrl,
      where: `in ${NATIVE_APPS[native.app].name}`,
      transport: { toggle: true, skip: true, seek: false },
    };
  }
  return null;
}

/** Where the track is now: the last report, run forward while it plays. */
export function positionAt(now: NowPlaying, clock: number): number {
  if (now.status !== 'playing' || !now.asOf) return now.position;
  return embedPositionAt(
    {
      status: 'playing',
      position: now.position,
      duration: now.duration,
      asOf: now.asOf,
    } as EmbedPlayback,
    clock,
  );
}

export function progressFraction(now: NowPlaying, clock: number): number {
  if (now.duration <= 0) return 0;
  return Math.min(1, Math.max(0, positionAt(now, clock) / now.duration));
}
