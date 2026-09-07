'use client';

// What is on, wherever it sounds: the art, the names, a clock that runs, and
// the transport the source allows. The page shows it large under the frame;
// the popover shows it compact.

import { useEffect, useState } from 'react';
import { Pause, Play, SkipBack, SkipForward, Square } from 'lucide-react';
import { useMusicPlayer } from '@/components/providers/music-provider';
import { ServiceMark } from '@/components/music/service-mark';
import { positionAt, progressFraction, type NowPlaying } from '@/lib/music/now-playing';
import { formatElapsed } from '@/lib/music/state';
import { cn } from '@/lib/utils';

/** A clock that ticks only while something plays. */
function useTicking(playing: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!playing) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [playing]);
  return now;
}

const TRANSPORT_BUTTON =
  'rounded-full text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50';

export function NowPlayingBlock({
  nowPlaying,
  compact = false,
}: {
  nowPlaying: NowPlaying;
  compact?: boolean;
}) {
  const { toggle, next, sendNative, sendEmbed, clearEmbed } = useMusicPlayer();
  const playing = nowPlaying.status === 'playing';
  const now = useTicking(playing);
  const position = positionAt(nowPlaying, now);
  const fraction = progressFraction(nowPlaying, now);
  const { transport } = nowPlaying;
  const art = compact ? 40 : 64;

  const seek = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!transport.seek || nowPlaying.duration <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const at = ((event.clientX - rect.left) / rect.width) * nowPlaying.duration;
    sendEmbed({ seek: at });
  };

  return (
    <div className={cn('flex items-center', compact ? 'gap-3' : 'gap-4')}>
      <div
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary/60 text-muted-foreground"
        style={{ width: art, height: art }}
      >
        {nowPlaying.artworkUrl ? (
          <img
            src={nowPlaying.artworkUrl}
            alt=""
            width={art}
            height={art}
            className="size-full object-cover"
          />
        ) : (
          <ServiceMark service={nowPlaying.service} size={compact ? 16 : 22} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-3">
          <span
            className={cn(
              'truncate font-display',
              compact ? 'text-[15px]' : 'text-[24px] leading-tight',
              playing ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {nowPlaying.title || 'Nothing on'}
          </span>
          <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground">
            {nowPlaying.where}
          </span>
        </div>
        {!compact && (nowPlaying.artist || nowPlaying.album) && (
          <p className="mt-0.5 truncate font-mono text-[12px] text-muted-foreground">
            {[nowPlaying.artist, nowPlaying.album].filter(Boolean).join(' · ')}
          </p>
        )}
        {nowPlaying.duration > 0 && (
          <div className={cn('flex items-center gap-2', compact ? 'mt-1' : 'mt-2')}>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={Math.round(nowPlaying.duration)}
              aria-valuenow={Math.round(position)}
              onClick={seek}
              className={cn(
                'h-1 flex-1 overflow-hidden rounded-full bg-border',
                transport.seek && 'cursor-pointer',
              )}
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear"
                style={{ width: `${fraction * 100}%` }}
              />
            </div>
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
              {formatElapsed(position)} / {formatElapsed(nowPlaying.duration)}
            </span>
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {transport.skip && (
          <button
            type="button"
            aria-label="Previous track"
            onClick={() => void sendNative('previous')}
            className={cn(TRANSPORT_BUTTON, 'p-1')}
          >
            <SkipBack className="size-3.5" aria-hidden />
          </button>
        )}
        {transport.toggle && (
          <button
            type="button"
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={toggle}
            className={cn(TRANSPORT_BUTTON, 'p-1.5', playing && 'text-primary')}
          >
            {playing ? (
              <Pause className="size-4" aria-hidden />
            ) : (
              <Play className="size-4" aria-hidden />
            )}
          </button>
        )}
        {transport.skip && (
          <button
            type="button"
            aria-label="Next track"
            onClick={next}
            className={cn(TRANSPORT_BUTTON, 'p-1')}
          >
            <SkipForward className="size-3.5" aria-hidden />
          </button>
        )}
        {nowPlaying.source === 'embed' && (
          <button
            type="button"
            aria-label="Stop"
            onClick={clearEmbed}
            className={cn(TRANSPORT_BUTTON, 'p-1.5')}
          >
            <Square className="size-3.5" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
