'use client';

// The app's own player, in the shape a board expects.
//
// A board served to a browser mints its own from the channels in its boot
// payload. Staged in this window there is already one — the dock's radio, its
// visualizer, the Music page — and two would be two sets of speakers fighting
// over the same room. So the board's music popover drives this one instead,
// and everything else in the window follows it.

import { useMemo } from 'react';

import { useMusicPlayer } from '@/components/providers/music-provider';
import type { BoardMusic } from '@board/retro/App';

export function useBoardMusic(): BoardMusic {
  const { radio } = useMusicPlayer();
  const { state, analyser } = radio;

  return useMemo(
    () => ({
      playing: state.status === 'playing',
      // A stream takes seconds to arrive, and the board's play button leans on
      // this to say it heard the click.
      connecting: state.status === 'connecting',
      channel: state.channel,
      volume: state.volume,
      toggle: () => radio.toggle(),
      play: () => radio.play(),
      stop: () => radio.stop(),
      setChannel: (index: number) => radio.setChannel(index),
      setVolume: (value: number) => radio.setVolume(value),
      // The host casting a station to the room. Nothing here can refuse the
      // way a browser's autoplay policy can, but the signature is the board's.
      cast: async (index: number, on: boolean) => {
        radio.setChannel(index);
        if (on) await radio.play();
        else radio.stop();
      },
      analyser,
    }),
    [radio, state.status, state.channel, state.volume, analyser],
  );
}

/** The stations the window is carrying, for the board's own station list. */
export function useBoardChannels(): { name: string; url: string }[] {
  const { channels } = useMusicPlayer();
  return useMemo(() => channels.map(({ name, url }) => ({ name, url })), [channels]);
}
