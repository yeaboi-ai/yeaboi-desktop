// What the visualiser is showing, from what is sounding.

import type { PlaybackStatus } from '@/lib/music/state';
import type { EmbedStatus } from '@/lib/music/embed/bridge';

export type VizMode = 'live' | 'connecting' | 'paused' | 'off' | 'failed';

export function vizMode(status: PlaybackStatus): VizMode {
  switch (status) {
    case 'playing':
      return 'live';
    case 'connecting':
      return 'connecting';
    case 'paused':
      return 'paused';
    case 'failed':
      return 'failed';
    default:
      return 'off';
  }
}

export interface VizSources {
  radio: PlaybackStatus;
  /** The embed's last word, or null when none is up. */
  embed: EmbedStatus | null;
  /** Spotify's or Music's, or null when neither is watched. */
  native: 'playing' | 'paused' | 'stopped' | null;
}

/** The radio owns the visualiser while it is doing anything at all; otherwise
 *  the embed, then the app, move it — synthetically, since their sound never
 *  passes through an analyser here. An embed that has not spoken yet counts
 *  as playing: a frame that just came up is being pressed, not ignored. */
export function vizModeFor({ radio, embed, native }: VizSources): VizMode {
  if (radio !== 'stopped') return vizMode(radio);
  if (embed !== null) {
    if (embed === 'playing' || embed === 'buffering' || embed === 'unknown') return 'live';
    return 'paused';
  }
  if (native === 'playing') return 'live';
  if (native === 'paused') return 'paused';
  return 'off';
}
