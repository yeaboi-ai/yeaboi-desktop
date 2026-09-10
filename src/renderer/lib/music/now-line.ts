// What is sounding, in words: one line for the thing and one for what there is
// to say about it.
//
// Shared, because the dock and the dashboard's widget must not disagree about
// what is playing — and the answer depends on which of three sources has it.

import type { MusicPlayer } from '@/components/providers/music-provider';
import type { MusicService } from '@shared/music-links';
import { STATUS_WORDS } from '@/lib/music/state';
import { stationNote } from '@/lib/music/stations';
import { NATIVE_APPS } from '@shared/music-native';

export interface NowLine {
  station: string;
  /** One line, for somewhere with room for only one. */
  label: string;
  /** What is on. */
  now: string;
  /** What there is to say about it: the artist where the source knows one, and
   *  the station's genre and carrier where it does not. */
  under: string;
  /** The service or app carrying it, where something else is. */
  badge: MusicService | null;
  /** Sounding, rather than merely chosen. */
  playing: boolean;
}

export function nowLine(player: MusicPlayer): NowLine {
  const { radio, channels, mood, native, nativeApp, embed, nowPlaying } = player;
  const state = radio.state;
  const station = channels[state.channel]?.name ?? 'Radio';
  const note = stationNote(station);

  const label =
    mood === 'embed' && nowPlaying
      ? `${nowPlaying.title} · ${nowPlaying.status === 'paused' ? 'paused' : 'playing'} here`
      : mood === 'native' && native.nowPlaying
        ? `${native.nowPlaying.title || NATIVE_APPS[native.nowPlaying.app].name} · in ${NATIVE_APPS[native.nowPlaying.app].name}`
        : mood === 'off'
          ? 'Music'
          : `${station} · ${state.status === 'failed' ? 'stream unavailable' : STATUS_WORDS[state.status]}`;

  const now =
    mood === 'embed' && nowPlaying
      ? nowPlaying.title
      : mood === 'native' && native.nowPlaying
        ? native.nowPlaying.title || NATIVE_APPS[native.nowPlaying.app].name
        : (note?.title ?? station);

  const under =
    nowPlaying && (mood === 'embed' || mood === 'native')
      ? nowPlaying.artist || nowPlaying.where
      : state.status === 'failed'
        ? state.error
        : note
          ? `${station} · ${note.note} · ${note.source}`
          : STATUS_WORDS[state.status];

  return {
    station,
    label,
    now,
    under,
    badge: mood === 'embed' && embed ? embed.service : mood === 'native' ? nativeApp : null,
    playing:
      state.status === 'playing' ||
      state.status === 'connecting' ||
      native.nowPlaying?.status === 'playing' ||
      (mood === 'embed' && nowPlaying?.status === 'playing'),
  };
}
