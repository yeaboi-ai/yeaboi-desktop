'use client';

// What Spotify or Music is playing, with the transport that drives it. Shown
// only while the app reports a track; the sound is the app's, and this says so.

import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { NATIVE_APPS, type NativeNowPlaying } from '@shared/music-native';
import { useMusicPlayer } from '@/components/providers/music-provider';
import { formatElapsed } from '@/lib/music/state';
import { cn } from '@/lib/utils';

export function NativeNowPlayingBlock({
  nowPlaying,
  compact = false,
}: {
  nowPlaying: NativeNowPlaying;
  compact?: boolean;
}) {
  const { sendNative } = useMusicPlayer();
  const playing = nowPlaying.status === 'playing';
  const app = NATIVE_APPS[nowPlaying.app].name;
  return (
    <div className={cn('flex items-center gap-4', compact ? 'gap-3' : 'gap-4')}>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Previous track"
          onClick={() => void sendNative('previous')}
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <SkipBack className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={playing ? `Pause ${app}` : `Play ${app}`}
          onClick={() => void sendNative('playpause')}
          className={cn(
            'rounded-full p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            playing
              ? 'text-primary hover:text-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {playing ? (
            <Pause className="size-5" aria-hidden />
          ) : (
            <Play className="size-5" aria-hidden />
          )}
        </button>
        <button
          type="button"
          aria-label="Next track"
          onClick={() => void sendNative('next')}
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <SkipForward className="size-4" aria-hidden />
        </button>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-3">
          <span
            className={cn(
              'truncate font-display',
              compact ? 'text-[15px]' : 'text-[28px] leading-tight',
              playing ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {nowPlaying.title || 'Nothing on'}
          </span>
          <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground">in {app}</span>
        </div>
        {!compact && (nowPlaying.artist || nowPlaying.album) && (
          <p className="mt-1 truncate font-mono text-[12px] text-muted-foreground">
            {[nowPlaying.artist, nowPlaying.album].filter(Boolean).join(' · ')}
            {nowPlaying.duration > 0 &&
              ` · ${formatElapsed(nowPlaying.position)} / ${formatElapsed(nowPlaying.duration)}`}
          </p>
        )}
      </div>
    </div>
  );
}
