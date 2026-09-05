'use client';

// Music. The radio the terminal has, made real; and the three services the
// catalogue switched on. One column, left aligned; the block-glyph spectrum
// is the one place the page spends.

import { useEffect, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { useMusicPlayer } from '@/components/providers/music-provider';
import { EmbedSlot } from '@/components/music/embed-slot';
import { Library } from '@/components/music/library';
import { NowPlayingBlock } from '@/components/music/now-playing';
import { ServiceOff } from '@/components/music/service-off';
import { SourceTabs } from '@/components/music/source-tabs';
import { Visualizer } from '@/components/music/visualizer';
import { VisualizerStyleButton } from '@/components/music/visualizer-style-button';
import { Slider } from '@/components/ui/slider';
import { SERVICE_APPS, SERVICE_LABELS, type MusicService } from '@shared/music-links';
import { STATUS_WORDS, formatElapsed } from '@/lib/music/state';
import { cn } from '@/lib/utils';

/** The terminal's four stations, as the page describes them. */
const STATION_NOTES: Record<string, { title: string; note: string; source: string }> = {
  Lofi: { title: 'Groove Salad', note: 'a warm bath of downtempo', source: 'SomaFM · 128 kbps' },
  Jazz: {
    title: 'Sonic Universe',
    note: 'jazz that wanders off the map',
    source: 'SomaFM · 128 kbps',
  },
  Classical: {
    title: 'France Musique',
    note: 'the concert hall, from Paris',
    source: 'Radio France · 128 kbps',
  },
  Ambient: { title: 'Drone Zone', note: 'served best chilled', source: 'SomaFM · 128 kbps' },
};

function useClock(startedAt: number | null): string {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (startedAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [startedAt]);
  return startedAt === null ? '' : formatElapsed((now - startedAt) / 1000);
}

function RadioPanel() {
  const { radio, channels, backend } = useMusicPlayer();
  const { state } = radio;
  const live = state.status === 'playing' || state.status === 'connecting';
  const channel = channels[state.channel];
  const meta = channel ? STATION_NOTES[channel.name] : undefined;
  const clock = useClock(radio.startedAt);
  const empty = channels.length === 0;

  return (
    <div>
      <div className="mt-6 flex items-center justify-end">
        <VisualizerStyleButton />
      </div>
      <Visualizer size="page" className="mt-2 block h-[120px] w-full" />

      <div className="mt-8 flex items-start gap-5">
        <button
          type="button"
          aria-label={live ? 'Pause' : 'Play'}
          disabled={empty}
          onClick={radio.toggle}
          className={cn(
            'mt-2 shrink-0 rounded-full p-3 ring-1 transition-colors disabled:opacity-40',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            live
              ? 'text-primary ring-primary/50'
              : 'text-foreground ring-border hover:bg-secondary',
          )}
        >
          {live ? (
            <Pause className="size-6" aria-hidden />
          ) : (
            <Play className="size-6" aria-hidden />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-6">
            <h2
              className={cn(
                'truncate font-display text-[44px] leading-none',
                live ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {empty ? 'Radio' : (meta?.title ?? channel?.name)}
            </h2>
            {clock && (
              <span className="shrink-0 font-mono text-[15px] text-muted-foreground">{clock}</span>
            )}
          </div>
          <p className="mt-2 font-mono text-[12.5px] text-muted-foreground">
            {empty ? (
              backend === 'offline' ? (
                'the backend is not up, so the stations cannot be read yet'
              ) : (
                'reading the stations…'
              )
            ) : (
              <>
                {channel?.name}
                {meta && (
                  <>
                    {' · '}
                    <span className="font-display italic text-[14px]">{meta.note}</span>
                    {' · '}
                    {meta.source}
                  </>
                )}
                {' · '}
                <span className={cn(state.status === 'failed' && 'text-destructive')}>
                  {state.status === 'failed' ? state.error : STATUS_WORDS[state.status]}
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="mt-10 flex items-center gap-8 pl-[68px]">
        <div role="radiogroup" aria-label="Station" className="flex items-center gap-6">
          {channels.map((item, index) => {
            const active = index === state.channel;
            return (
              <button
                key={item.name}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => radio.setChannel(index)}
                className={cn(
                  'text-[14px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-sm',
                  active
                    ? 'text-foreground underline underline-offset-[6px]'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {item.name}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex w-56 items-center gap-3">
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
          <span className="w-9 text-right font-mono text-[12px] text-muted-foreground">
            {Math.round(state.volume * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
}

function ServicePanel({ service }: { service: MusicService }) {
  const { serviceFor, backend, embed, nowPlaying } = useMusicPlayer();
  const state = serviceFor(service);
  if (!state?.connected) return <ServiceOff service={service} offline={backend === 'offline'} />;
  const app = SERVICE_APPS[service];
  const showEmbed = embed && embed.service === service;
  const on = nowPlaying !== null && nowPlaying.service === service ? nowPlaying : null;
  return (
    <div>
      {on && (
        <>
          <div className="mt-6 flex items-center justify-end">
            <VisualizerStyleButton />
          </div>
          <Visualizer size="page" className="mt-2 block h-[120px] w-full" />
        </>
      )}
      <div className="mt-8">
        {showEmbed ? (
          <EmbedSlot />
        ) : (
          <div className="flex h-36 items-center justify-center rounded-xl border border-dashed border-border/70">
            <p className="text-[13px] text-muted-foreground">
              {app
                ? `Preview a link from the shelf here, or play it in ${app}.`
                : 'Pick something from the shelf and it plays here.'}
            </p>
          </div>
        )}
        <p className="mt-3 text-[12.5px] text-muted-foreground">
          {app ? `Previews here. Full tracks play in the ${app} app.` : 'Plays here in full.'}
        </p>
      </div>
      {on && (
        <div className="mt-8">
          <NowPlayingBlock nowPlaying={on} />
        </div>
      )}
      <Library service={service} />
    </div>
  );
}

export default function MusicPage() {
  const { source } = useMusicPlayer();
  return (
    <div className="mx-auto max-w-[880px] px-8 pb-32 pt-10">
      <h1 className="font-display text-[34px] leading-none text-foreground">Music</h1>
      <p className="mt-2 text-[14px] text-muted-foreground">
        Something to work to. Nothing plays until you press play.
      </p>
      <div className="mt-8">
        <SourceTabs />
      </div>
      {source === 'radio' ? <RadioPanel /> : <ServicePanel service={source} />}
      <p className="sr-only">{source === 'radio' ? 'Radio' : SERVICE_LABELS[source]}</p>
    </div>
  );
}
