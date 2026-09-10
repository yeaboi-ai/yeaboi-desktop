'use client';

// Music. The radio the terminal has, made real; and the three services the
// catalogue switched on. One column, left aligned; the block-glyph spectrum
// is the one place the page spends.

import { useEffect, useState } from 'react';
import { Pause, Play, Settings2 } from 'lucide-react';
import { PageShell } from '@/components/ui/page-shell';
import { useMusicPlayer } from '@/components/providers/music-provider';
import { Browser } from '@/components/music/browser';
import { EmbedSlot } from '@/components/music/embed-slot';
import { ServiceAccount } from '@/components/music/service-account';
import { Library } from '@/components/music/library';
import { NowPlayingBlock } from '@/components/music/now-playing';
import { ServiceOff } from '@/components/music/service-off';
import { SourceTabs } from '@/components/music/source-tabs';
import { Visualizer } from '@/components/music/visualizer';
import { VisualizerControls } from '@/components/music/visualizer-controls';
import { VisualizerStyleButton } from '@/components/music/visualizer-style-button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { VolumeColumn } from '@/components/music/volume-rail';
import { Switch } from '@/components/ui/switch';
import { SERVICE_APPS, SERVICE_LABELS, type MusicService } from '@shared/music-links';
import { STATUS_WORDS, formatElapsed } from '@/lib/music/state';
import { STATION_NOTES } from '@/lib/music/stations';
import { cn } from '@/lib/utils';

function useClock(startedAt: number | null): string {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (startedAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [startedAt]);
  return startedAt === null ? '' : formatElapsed((now - startedAt) / 1000);
}

function RadioScreen({ onSettings }: { onSettings: () => void }) {
  const { radio, channels, backend } = useMusicPlayer();
  const { state } = radio;
  const live = state.status === 'playing' || state.status === 'connecting';
  const channel = channels[state.channel];
  const meta = channel ? STATION_NOTES[channel.name] : undefined;
  const clock = useClock(radio.startedAt);
  const empty = channels.length === 0;

  return (
    <>
      <div className="flex-none">
        <h1 className="font-display text-[34px] leading-none text-foreground">Music</h1>
        <div className="mt-5">
          <SourceTabs />
        </div>
      </div>

      {/* Everything the window has left over. The spectrum is what the page is
          for, so it takes the room rather than a fixed slice of it. */}
      <Visualizer size="page" bare className="my-6 block min-h-0 w-full flex-1" />

      <div className="flex flex-none items-start gap-5">
        <button
          type="button"
          aria-label={live ? 'Pause' : 'Play'}
          disabled={empty}
          onClick={radio.toggle}
          className={cn(
            'mt-1 shrink-0 rounded-full p-3 ring-1 transition-colors disabled:opacity-40',
            'focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
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
                    <span className="font-display text-[14px] italic">{meta.note}</span>
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

      <div className="mt-6 flex flex-none items-center gap-8 pl-[68px]">
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
                  'rounded-sm text-[14px] transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
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
        {/* The volume is not on this row: it stands down the right edge,
            where the scroll rail would be on a screen that scrolled. */}
        <VolumeColumn
          percent={Math.round(state.volume * 100)}
          onChange={(next) => radio.setVolume(next / 100)}
        >
          <button
            type="button"
            aria-label="Music settings"
            title="Music settings"
            onClick={onSettings}
            className="rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Settings2 className="size-4" aria-hidden />
          </button>
        </VolumeColumn>
      </div>
    </>
  );
}

/** How the radio behaves. In the drawer rather than on the page: it is a thing
 *  you set once, and the page is for listening. */
function RadioHabits() {
  const { prefs, updatePrefs } = useMusicPlayer();
  return (
    <div>
      <h3 className="text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
        Habits
      </h3>
      <div className="mt-4 grid gap-y-5">
        <label className="flex items-start justify-between gap-6">
          <span className="min-w-0">
            <span className="block text-[13px] text-foreground">Pause during calls</span>
            <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted-foreground">
              The radio waits while a call or a voice session is live and comes back after, the way
              it does in the terminal while you dictate.
            </span>
          </span>
          <Switch
            checked={prefs.pauseInCalls}
            onCheckedChange={(pauseInCalls) => updatePrefs({ pauseInCalls })}
            aria-label="Pause during calls"
          />
        </label>
        <label className="flex items-start justify-between gap-6">
          <span className="min-w-0">
            <span className="block text-[13px] text-foreground">Keep the player open</span>
            <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted-foreground">
              The control on the bottom row stands as the transport and the spectrum rather than
              folding back to its pill.
            </span>
          </span>
          <Switch
            checked={prefs.dockOpen}
            onCheckedChange={(dockOpen) => updatePrefs({ dockOpen })}
            aria-label="Keep the player open"
          />
        </label>
      </div>
      <p className="mt-4 text-[11.5px] text-muted-foreground">
        Nothing plays when the app starts, and the station is shared with the terminal.
      </p>
    </div>
  );
}

/** Everything you set rather than press. Slides in from the right, so the
 *  spectrum it is describing stays on screen behind it. */
function MusicDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (n: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-0">
        <SheetHeader>
          <SheetTitle>Music settings</SheetTitle>
          <SheetDescription>How the spectrum draws, and how the radio behaves.</SheetDescription>
        </SheetHeader>
        <div className="quiet-scroll flex-1 space-y-8 overflow-y-auto px-4 pb-6">
          <div>
            <h3 className="text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
              Spectrum
            </h3>
            <div className="mt-4">
              <VisualizerControls compact />
            </div>
          </div>
          <RadioHabits />
        </div>
      </SheetContent>
    </Sheet>
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
          <Visualizer size="page" bare className="mt-2 block h-[120px] w-full" />
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
      <div className="mt-6">
        <ServiceAccount service={service} />
      </div>
      <Browser service={service} />
      <Library service={service} />
    </div>
  );
}

export default function MusicPage() {
  const { source } = useMusicPlayer();
  const [settings, setSettings] = useState(false);

  // The radio is a screen, not a document: it fills the window and nothing on
  // it scrolls. The services carry a shelf and a library, which do.
  if (source === 'radio') {
    return (
      <div className="relative -mb-[var(--dock-clear)] flex min-h-0 flex-1 flex-col">
        <div className="mx-auto flex min-h-0 w-full max-w-[1360px] flex-1 flex-col px-6 pt-10 pb-[calc(var(--dock-clear)+0.5rem)]">
          <RadioScreen onSettings={() => setSettings(true)} />
        </div>
        <MusicDrawer open={settings} onOpenChange={setSettings} />
        <p className="sr-only">Radio</p>
      </div>
    );
  }

  return (
    <PageShell
      header={
        <>
          <h1 className="font-display text-[34px] leading-none text-foreground">Music</h1>
          <div className="mt-6">
            <SourceTabs />
          </div>
        </>
      }
    >
      <ServicePanel key={source} service={source} />
      <p className="sr-only">{SERVICE_LABELS[source]}</p>
    </PageShell>
  );
}
