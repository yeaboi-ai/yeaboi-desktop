'use client';

// The popover off the rail pocket: what is on, and the transport for it.
// Radio gets the sixteen-glyph spectrum and the volume; a native app gets its
// own line, since its volume is its own.

import Link from 'next/link';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useMusicPlayer } from '@/components/providers/music-provider';
import { NativeNowPlayingBlock } from '@/components/music/native-now-playing';
import { Spectrum } from '@/components/music/spectrum';
import { Slider } from '@/components/ui/slider';
import { STATUS_WORDS } from '@/lib/music/state';
import { cn } from '@/lib/utils';

export function MiniPlayer() {
  const { radio, channels, native, backend } = useMusicPlayer();
  const { state, analyser } = radio;
  const live = state.status === 'playing' || state.status === 'connecting';
  const station = channels[state.channel]?.name ?? 'Radio';
  const nativeOn = native.nowPlaying && native.nowPlaying.status !== 'stopped' && !live;

  return (
    <div className="w-72 p-3">
      {nativeOn && native.nowPlaying ? (
        <NativeNowPlayingBlock nowPlaying={native.nowPlaying} compact />
      ) : (
        <>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                aria-label="Previous station"
                disabled={channels.length === 0}
                onClick={radio.previous}
                className="rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <SkipBack className="size-3.5" aria-hidden />
              </button>
              <button
                type="button"
                aria-label={live ? 'Pause' : 'Play'}
                disabled={channels.length === 0}
                onClick={radio.toggle}
                className={cn(
                  'rounded-full p-1.5 transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                  live ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {live ? (
                  <Pause className="size-4" aria-hidden />
                ) : (
                  <Play className="size-4" aria-hidden />
                )}
              </button>
              <button
                type="button"
                aria-label="Next station"
                disabled={channels.length === 0}
                onClick={radio.next}
                className="rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <SkipForward className="size-3.5" aria-hidden />
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'truncate font-display text-[15px]',
                  live ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {backend === 'offline' && channels.length === 0 ? 'Radio' : station}
              </p>
              <p
                className={cn(
                  'font-mono text-[11px]',
                  state.status === 'failed' ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {state.status === 'failed' ? state.error : STATUS_WORDS[state.status]}
              </p>
            </div>
          </div>
          <Spectrum
            analyser={analyser}
            playing={state.status === 'playing'}
            frozen={state.status === 'paused'}
            bands={16}
            className={cn(
              'mt-3 block text-[18px] tracking-[0.02em]',
              state.status === 'playing' ? 'text-primary' : 'text-muted-foreground/60',
            )}
          />
          <div className="mt-3 flex items-center gap-3">
            <Slider
              aria-label="Volume"
              min={0}
              max={100}
              value={Math.round(state.volume * 100)}
              onValueChange={(value) =>
                radio.setVolume((Array.isArray(value) ? value[0]! : value) / 100)
              }
              className="flex-1"
            />
            <span className="w-8 text-right font-mono text-[11px] text-muted-foreground">
              {Math.round(state.volume * 100)}%
            </span>
          </div>
        </>
      )}
      <Link
        href="/music"
        className="mt-3 block text-[12px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Open Music
      </Link>
    </div>
  );
}
