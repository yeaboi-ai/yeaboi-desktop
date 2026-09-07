'use client';

// Music on the bottom row.
//
// At rest it is a note. While something is actually sounding the button widens
// into a pill whose whole face is the spectrum. Opened, it becomes a long pill
// of controls with the spectrum floating above it on nothing — the sound is
// already the background, so it does not get one of its own — and the volume
// standing off the left as an object of its own.

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowUpRight, Music, Pause, Play, SkipBack, SkipForward } from 'lucide-react';

import { ServiceMark } from '@/components/music/service-mark';
import { Visualizer } from '@/components/music/visualizer';
import { useMusicPlayer } from '@/components/providers/music-provider';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { STATUS_WORDS } from '@/lib/music/state';
import { stationNote } from '@/lib/music/stations';
import { NATIVE_APPS } from '@shared/music-native';

import { BUTTON, CONTROL, FLOAT } from './dock-float';

/** What the button widens to while something sounds: the spectrum fills it, so
 *  this is the whole of the picture. */
const PILL = 88;
/** The open control pill, and the gap the volume keeps off it. */
const OPEN = 264;
const VOL_GAP = 8;
/** Everything, open: volume at rest, the gap, and the controls. */
const TOTAL = BUTTON + VOL_GAP + OPEN;
/** The volume, opened out. It takes the room from the controls rather than
 *  from the row: they share one width, and the controls give up all of it
 *  bar the way through to the page. */
const VOL_OPEN = TOTAL - VOL_GAP - BUTTON;
/** The spectrum above the pill — narrower than it, and clear of its shoulder. */
const VIZ_W = 232;
const VIZ_H = 40;
const VIZ_GAP = 6;

const TAP =
  'rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50';

/** A line that walks its own length when it does not fit, and rests at both
 *  ends. An ellipsis says there is more; this says what it is. */
function Drift({ text, className }: { text: string; className?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const [over, setOver] = useState(0);

  useLayoutEffect(() => {
    const outer = box.current;
    const inner = outer?.firstElementChild;
    if (!outer || !inner) return;
    const take = () => setOver(Math.max(0, inner.scrollWidth - outer.clientWidth));
    take();
    const watch = new ResizeObserver(take);
    watch.observe(outer);
    watch.observe(inner);
    return () => watch.disconnect();
  }, [text]);

  return (
    <span ref={box} className={`block overflow-hidden whitespace-nowrap ${className ?? ''}`}>
      <span
        className={`inline-block ${over > 0 ? 'music-drift' : ''}`}
        style={over > 0 ? ({ '--drift': `-${over}px` } as CSSProperties) : undefined}
      >
        {text}
      </span>
    </span>
  );
}

/** The groove inside the opened volume: the scroll rail's thumb, lying down.
 *  The whole track takes the pointer, so there is no 3px target to hit. */
function VolumeRail({ percent, onChange }: { percent: number; onChange: (next: number) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const fromPointer = (clientX: number) => {
    const box = track.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    onChange(Math.round(Math.min(1, Math.max(0, (clientX - box.left) / box.width)) * 100));
  };

  return (
    <div
      ref={track}
      role="slider"
      aria-label="Volume"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
        fromPointer(event.clientX);
      }}
      onPointerMove={(event) => dragging && fromPointer(event.clientX)}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        setDragging(false);
      }}
      onKeyDown={(event) => {
        const by = event.key === 'ArrowRight' ? 5 : event.key === 'ArrowLeft' ? -5 : 0;
        if (!by) return;
        event.preventDefault();
        onChange(Math.min(100, Math.max(0, percent + by)));
      }}
      className={`group/rail relative h-[10px] w-full rounded-full bg-secondary/70 ring-1 ring-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
        dragging ? 'cursor-grabbing' : 'cursor-grab'
      }`}
    >
      <span
        aria-hidden
        className={`absolute top-1/2 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-rail-thumb transition-[height] duration-300 ease-out ${
          dragging ? 'h-4' : 'h-2.5 group-hover/rail:h-4'
        }`}
        style={{ left: `${percent}%` }}
      />
    </div>
  );
}

export function MusicPocket() {
  const {
    radio,
    channels,
    mood,
    native,
    nativeApp,
    embed,
    nowPlaying,
    prefs,
    clearEmbed,
    toggle,
    next,
  } = useMusicPlayer();
  const pathname = usePathname();
  const router = useRouter();
  // Opened by hand, or standing open because that is where it is kept.
  const [reached, setReached] = useState(false);
  const open = prefs.dockOpen || reached;
  const [wide, setWide] = useState(false);
  const volume_ = useRef<HTMLDivElement>(null);
  const level = useRef(0);
  const { state } = radio;
  const station = channels[state.channel]?.name ?? 'Radio';
  const here = Boolean(pathname?.startsWith('/music'));

  const label =
    mood === 'embed' && nowPlaying
      ? `${nowPlaying.title} · ${nowPlaying.status === 'paused' ? 'paused' : 'playing'} here`
      : mood === 'native' && native.nowPlaying
        ? `${native.nowPlaying.title || NATIVE_APPS[native.nowPlaying.app].name} · in ${NATIVE_APPS[native.nowPlaying.app].name}`
        : mood === 'off'
          ? 'Music'
          : `${station} · ${state.status === 'failed' ? 'stream unavailable' : STATUS_WORDS[state.status]}`;

  const badge = mood === 'embed' && embed ? embed.service : mood === 'native' ? nativeApp : null;
  // Sounding, rather than merely chosen: stopping folds him back to the note.
  const playing =
    state.status === 'playing' ||
    state.status === 'connecting' ||
    native.nowPlaying?.status === 'playing' ||
    (mood === 'embed' && nowPlaying?.status === 'playing');
  const shut = playing ? PILL : BUTTON;
  // What is on, over what there is to say about it: the artist where the
  // source knows one, and what the Music page says about the station where it
  // does not — its genre and who carries it, rather than a count.
  const note = stationNote(station);
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
  const volume = open && wide ? VOL_OPEN : BUTTON;
  const percent = Math.round(state.volume * 100);

  level.current = percent;

  // The wheel turns the volume, and the page behind stays where it is. The
  // listener is hand-attached because React's `onWheel` is passive, and a
  // passive listener cannot hold the page still.
  useEffect(() => {
    const box = volume_.current;
    if (!box) return;
    const spin = (event: WheelEvent) => {
      event.preventDefault();
      const next = Math.min(100, Math.max(0, level.current - Math.sign(event.deltaY) * 4));
      if (next !== level.current) radio.setVolume(next / 100);
    };
    box.addEventListener('wheel', spin, { passive: false });
    return () => box.removeEventListener('wheel', spin);
  }, [radio]);

  // A click anywhere else, or Escape, folds him back — the way the chat bar
  // closes.
  useEffect(() => {
    if (!reached || prefs.dockOpen) return;
    const away = (event: PointerEvent) => {
      if ((event.target as HTMLElement | null)?.closest('[data-music]')) return;
      setReached(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setReached(false);
    };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', key);
    };
  }, [reached, prefs.dockOpen]);

  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div />}>
        <div
          data-music
          className="relative shrink-0"
          style={{ width: open ? TOTAL : shut, height: BUTTON }}
        >
          {/* The spectrum, on nothing. Above the pill rather than behind the
              controls: a face you read and a face you press are two things. */}
          <div
            aria-hidden
            className={`pointer-events-none absolute transition-opacity duration-300 ease-out ${
              open ? 'opacity-100 delay-100' : 'opacity-0'
            }`}
            style={{
              width: VIZ_W,
              height: VIZ_H,
              right: (OPEN - VIZ_W) / 2,
              bottom: BUTTON + VIZ_GAP,
            }}
          >
            {open && <Visualizer size="popover" bare className="block h-full w-full" />}
          </div>

          {/* The volume, its own object. Reaching for it opens it rightwards
              into the room the controls give up. */}
          <div
            ref={volume_}
            data-wheel
            onPointerEnter={() => setWide(true)}
            onPointerLeave={() => setWide(false)}
            // No delay on the way back: it is shared with `width`, and the
            // volume closed a beat after the controls reopened.
            className={`${FLOAT} ${CONTROL} absolute bottom-0 left-0 overflow-hidden rounded-full transition-[width,opacity] duration-500 ease-out ${
              open ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
            style={{ width: volume }}
          >
            <div
              className={`absolute inset-y-0 right-8 left-3.5 flex items-center transition-opacity duration-300 ease-out ${
                open && wide ? 'opacity-100 delay-100' : 'pointer-events-none opacity-0'
              }`}
            >
              <VolumeRail percent={percent} onChange={(next) => radio.setVolume(next / 100)} />
            </div>
            {/* Pinned to the right edge, so the number rides out with it. */}
            <span
              aria-hidden
              className="absolute inset-y-0 right-0 flex w-8 items-center justify-center font-code text-[10px] tabular-nums text-muted-foreground"
            >
              {percent}
            </span>
          </div>

          <div
            className={`${FLOAT} ${CONTROL} absolute right-0 bottom-0 overflow-hidden transition-[width] duration-500 ease-out ${
              open ? 'z-50' : ''
            }`}
            style={{ width: open ? TOTAL - VOL_GAP - volume : shut }}
          >
            <button
              type="button"
              title={label}
              aria-label={mood === 'off' ? 'Music' : `Music — ${label}`}
              aria-expanded={open}
              onClick={() => setReached(true)}
              className={`absolute right-0 bottom-0 flex items-center justify-center transition-[opacity,color,background-color] duration-300 ease-out ${
                open ? 'pointer-events-none opacity-0' : 'opacity-100'
              } ${
                here || playing
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
              }`}
              style={{ width: shut, height: BUTTON }}
            >
              {/* The two closed faces are laid over each other so the one thing
                  that moves is the box: a note at rest, and while something
                  sounds the spectrum itself, wall to wall. */}
              <Music
                aria-hidden
                className={`absolute h-[14px] w-[14px] transition-opacity duration-300 ease-out ${
                  playing ? 'opacity-0' : 'opacity-100'
                }`}
              />
              <span
                aria-hidden
                className={`absolute inset-[5px] overflow-hidden rounded-lg transition-opacity duration-300 ease-out ${
                  playing && !open ? 'opacity-100' : 'opacity-0'
                }`}
              >
                <Visualizer size="popover" className="block h-full w-full" />
                {badge && (
                  <ServiceMark
                    service={badge}
                    size={11}
                    className="absolute right-0 bottom-0 text-muted-foreground"
                  />
                )}
              </span>
            </button>

            <div
              className={`absolute inset-y-0 left-0 flex items-center gap-1 pl-2.5 transition-opacity duration-300 ease-out ${
                open && !wide ? 'opacity-100 delay-100' : 'pointer-events-none opacity-0'
              }`}
              style={{ width: OPEN - BUTTON }}
            >
              <button
                type="button"
                aria-label="Previous station"
                disabled={channels.length === 0}
                onClick={radio.previous}
                className={TAP}
              >
                <SkipBack className="size-3.5" aria-hidden />
              </button>
              <button
                type="button"
                aria-label={playing ? 'Pause' : 'Play'}
                disabled={channels.length === 0}
                onClick={radio.toggle}
                className={`${TAP} text-foreground`}
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
                disabled={channels.length === 0}
                onClick={radio.next}
                className={TAP}
              >
                <SkipForward className="size-3.5" aria-hidden />
              </button>
              {/* Faded at both ends rather than cut: what walks past the edge
                  goes out of the picture instead of hitting a wall. */}
              <span
                className="min-w-0 flex-1 pl-2 text-left leading-[1.15] [mask-image:linear-gradient(to_right,transparent_0,#000_6px,#000_calc(100%-12px),transparent_100%)]"
                title={`${now} — ${under}`}
              >
                <Drift text={now} className="font-body text-[11px] text-foreground" />
                <Drift text={under} className="font-code text-[9px] text-muted-foreground" />
              </span>
            </div>

            {/* The last thing to go: whatever else the pill gives up, the way
                through to the page stays, centred on what is left of it. */}
            <div
              className={`absolute inset-y-0 right-0 flex w-8 items-center justify-center transition-opacity duration-300 ease-out ${
                open ? 'opacity-100 delay-100' : 'pointer-events-none opacity-0'
              }`}
            >
              <Link href="/music" title="Open Music" aria-label="Open Music" className={TAP}>
                <ArrowUpRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {mood === 'embed' ? (
          <ContextMenuItem onClick={clearEmbed}>Stop</ContextMenuItem>
        ) : (
          <>
            <ContextMenuItem onClick={toggle}>{playing ? 'Pause' : 'Play'}</ContextMenuItem>
            <ContextMenuItem onClick={next}>Next station or track</ContextMenuItem>
          </>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => router.push('/music')}>Open Music</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
