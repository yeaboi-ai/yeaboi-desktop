'use client';

// Music, small: the spectrum over the transport, and what is on beside it.
//
// The same bottom line the dock's open pill carries, less the way through to
// the Music page — the widget is already that door, so a second one inside it
// would be a button that does what the tile around it does.

import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';

import { Drift } from '@/components/music/drift';
import { Visualizer } from '@/components/music/visualizer';
import { useMusicPlayer } from '@/components/providers/music-provider';
import { nowLine } from '@/lib/music/now-line';

const TAP =
  'rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none';

export function MusicWidget() {
  const player = useMusicPlayer();
  const { now, under, playing } = nowLine(player);
  const { radio, channels, toggle } = player;
  const bare = channels.length === 0;

  /** The tile is the door to the Music page; a control inside it is not. */
  const only = (run: () => void) => (event: React.MouseEvent) => {
    event.stopPropagation();
    run();
  };
  const hold = (event: React.PointerEvent) => event.stopPropagation();

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* The spectrum takes whatever room the widget has been given, so making
          it taller makes the picture bigger rather than the gap. */}
      <div className="min-h-0 flex-1">
        <Visualizer size="page" bare className="block h-full w-full" />
      </div>

      <div className="-ml-1 flex flex-none items-center">
        <button
          type="button"
          aria-label="Previous station"
          disabled={bare}
          onPointerDown={hold}
          onClick={only(radio.previous)}
          className={TAP}
        >
          <SkipBack className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={playing ? 'Pause' : 'Play'}
          onPointerDown={hold}
          onClick={only(toggle)}
          className={TAP}
        >
          {playing ? (
            <Pause className="size-4" aria-hidden />
          ) : (
            <Play className="size-4" aria-hidden />
          )}
        </button>
        <button
          type="button"
          aria-label="Next station"
          disabled={bare}
          onPointerDown={hold}
          onClick={only(radio.next)}
          className={TAP}
        >
          <SkipForward className="size-3.5" aria-hidden />
        </button>
        {/* Faded at both ends rather than cut: what walks past the edge goes
            out of the picture instead of hitting a wall. */}
        <span
          className="min-w-0 flex-1 pl-2 text-left leading-[1.15] [mask-image:linear-gradient(to_right,transparent_0,#000_6px,#000_calc(100%-12px),transparent_100%)]"
          title={`${now} — ${under}`}
        >
          <Drift text={now} className="font-body text-[11px] text-foreground" />
          <Drift text={under} className="font-code text-[9px] text-muted-foreground" />
        </span>
      </div>
    </div>
  );
}
