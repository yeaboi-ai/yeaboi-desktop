// What the visualiser is showing, from what the radio is doing.

import type { PlaybackStatus } from '@/lib/music/state';

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
