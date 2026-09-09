'use client';

// Picking a screensaver, by looking at it.
//
// Each tile is the real scene at a fixed seed, not a picture of it, so what a
// person picks is what they later get. They run still by default and animate on
// hover — six live canvases on a settings page is a lot of rAF for a screen
// nobody is idle on.
//
// The preference is shared with the terminal over /api/ambience, which is why
// the catalogue is read from the payload rather than hardcoded here: a style
// added on the backend appears without a release of this app.

import { useEffect, useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { ScreensaverCanvas } from '@/components/screensaver/screensaver-canvas';
import { PersonaPicker } from '@/components/settings/persona-picker';
import { useYeaboiBackend } from '@/hooks/yeaboi/use-yeaboi-backend';
import { logger } from '@/lib/logger';
import { getAmbience, setAmbience } from '@/lib/yeaboi/ambience';
import {
  hoverScreensaver,
  previewScreensaver,
  saverPreferenceChanged,
} from '@/lib/screensaver/preview';
import { DEFAULT_IDLE_SECONDS } from '@/lib/screensaver/idle';
import {
  DEFAULT_SAVER_STYLE,
  DOM_STYLES,
  STYLE_BLURBS,
  STYLE_NAMES,
  SCENE_STYLES,
  isDomStyle,
  isSaverStyle,
  type SaverStyle,
} from '@/lib/screensaver/styles';
import { cn } from '@/lib/utils';

/** Fixed per tile, so a tile looks the same every time the page is opened. */
const TILE_SEEDS: Record<string, number> = {
  'duck-yard': 7,
  constellation: 21,
  ricochet: 4,
  aurora: 13,
};

const ORDER: SaverStyle[] = [...SCENE_STYLES, ...DOM_STYLES, 'shuffle', 'off'];

export function ScreensaverSection() {
  const backend = useYeaboiBackend();
  const [style, setStyle] = useState<SaverStyle>(DEFAULT_SAVER_STYLE);
  const [names, setNames] = useState<Record<string, string>>(STYLE_NAMES);
  const [state, setState] = useState<'loading' | 'ready' | 'offline'>('loading');
  const [idleSeconds, setIdleSeconds] = useState(DEFAULT_IDLE_SECONDS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (backend.kind !== 'ready') return;
    let cancelled = false;
    getAmbience().then(
      (ambience) => {
        if (cancelled) return;
        const stored = ambience.saver?.style ?? DEFAULT_SAVER_STYLE;
        setStyle(isSaverStyle(stored) ? stored : DEFAULT_SAVER_STYLE);
        if (ambience.saver?.styles) setNames(ambience.saver.styles);
        if (ambience.saver?.idle_seconds) setIdleSeconds(ambience.saver.idle_seconds);
        setState('ready');
      },
      () => {
        if (!cancelled) setState('offline');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [backend.kind]);

  // Shuffle and Off always stand. Everything else is offered only when the
  // engine's own catalogue names it, so a style this app knows and the sidecar
  // does not is never something a click could fail to save.
  const offered = (option: SaverStyle) =>
    option === 'shuffle' || option === 'off' || state !== 'ready' || option in names;

  const choose = (next: SaverStyle): void => {
    const previous = style;
    setStyle(next); // optimistic: the tile must light up on the click
    setSaving(true);
    setAmbience({ saver_style: next }).then(
      () => {
        setSaving(false);
        saverPreferenceChanged();
      },
      (error: unknown) => {
        // The backend refuses a style it does not know; showing it as selected
        // when it was not stored is the one outcome worth undoing.
        logger.error('could not save the screensaver style', error);
        setStyle(previous);
        setSaving(false);
      },
    );
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-body font-medium tracking-[0.1em] uppercase text-muted-foreground">
          Screensaver
        </p>
        <div className="flex items-center gap-2">
          {saving && (
            <Loader2 className="size-3 animate-spin text-muted-foreground" aria-hidden="true" />
          )}
          <button
            type="button"
            onClick={() => previewScreensaver(style)}
            disabled={style === 'off'}
            className={cn(
              'inline-flex items-center gap-1 text-[11px] font-body transition-colors',
              'text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground',
            )}
          >
            <Play className="size-3" aria-hidden="true" />
            Preview
          </button>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground font-body leading-relaxed">
        After {Math.round(idleSeconds / 60)} minutes of quiet. The duck keeps his own colours;
        everything around him is drawn from the theme you are using. The choice is shared with the
        terminal.
      </p>

      <div className="grid grid-cols-3 gap-2 pt-1">
        {ORDER.filter(offered).map((option) => (
          <SaverTile
            key={option}
            style={option}
            name={names[option] ?? STYLE_NAMES[option]}
            blurb={STYLE_BLURBS[option]}
            seed={TILE_SEEDS[option]}
            active={style === option}
            disabled={state === 'offline'}
            onClick={() => choose(option)}
          />
        ))}
      </div>

      {state === 'offline' && (
        <p className="text-[11px] text-muted-foreground font-body pt-1">
          The backend is not up, so this cannot be saved yet.
        </p>
      )}

      <p className="pt-4 text-[10px] font-body font-medium tracking-[0.1em] uppercase text-muted-foreground">
        Persona
      </p>
      <p className="text-[11px] text-muted-foreground font-body leading-relaxed">
        Who the duck is here and on the desktop. The doors' ducks change on each visit to the home.
      </p>
      <PersonaPicker className="pt-1" />
    </div>
  );
}

function SaverTile({
  style,
  name,
  blurb,
  seed,
  active,
  disabled,
  onClick,
}: {
  style: SaverStyle;
  name: string;
  blurb: string;
  seed: number | undefined;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const drawable = style !== 'off' && style !== 'shuffle';

  // Pointing at a tile shows it full screen; moving off ends it. Also on
  // focus, so the keyboard reaches the same thing the pointer does.
  const show = () => {
    // A disabled tile still receives pointerenter in some browsers, and
    // previewing a style the backend cannot store is a promise it cannot keep.
    if (disabled) return;
    setHovered(true);
    if (style !== 'off') hoverScreensaver(style);
  };
  const hide = () => {
    setHovered(false);
    hoverScreensaver(null);
  };
  // Leaving the page — or unmounting mid-hover — must not strand the overlay.
  useEffect(() => () => hoverScreensaver(null), []);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      title={blurb}
      onPointerEnter={show}
      onPointerLeave={hide}
      onFocus={show}
      onBlur={hide}
      className={cn(
        'group flex flex-col overflow-hidden rounded-lg border text-left transition-colors outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50',
        active ? 'border-primary' : 'border-border/40 hover:border-border',
      )}
    >
      <div className="relative h-16 w-full bg-background">
        {isDomStyle(style) ? (
          <MastheadTile />
        ) : drawable ? (
          <ScreensaverCanvas
            style={style as (typeof SCENE_STYLES)[number]}
            // Still until the pointer is over it: six animating canvases on a
            // settings page is a lot of work for a screen nobody is idle on.
            still={!hovered}
            seed={seed}
            className="h-full w-full"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-[10px] font-body uppercase tracking-[0.1em] text-muted-foreground">
              {style === 'off' ? 'No takeover' : 'Any of them'}
            </span>
          </div>
        )}
      </div>
      <div className="border-t border-border/40 px-2 py-1.5">
        <p
          className={cn(
            'text-[11px] font-body font-medium',
            active ? 'text-primary' : 'text-foreground',
          )}
        >
          {name}
        </p>
      </div>
    </button>
  );
}

/** The front-page tile: a drawn masthead, not a live paper — a settings page
 *  should not fetch the news to render a 64-pixel preview. */
function MastheadTile() {
  return (
    <div
      aria-hidden
      className="pointer-events-none flex h-full w-full flex-col justify-center gap-1 px-3"
    >
      <div className="h-px w-full bg-foreground/30" />
      <div className="font-display text-[11px] leading-none text-foreground/80">yeaboi</div>
      <div className="h-px w-full bg-foreground/30" />
      <div className="mt-0.5 space-y-[3px]">
        <div className="h-[2px] w-3/4 bg-foreground/20" />
        <div className="h-[2px] w-full bg-foreground/15" />
        <div className="h-[2px] w-2/3 bg-foreground/15" />
      </div>
    </div>
  );
}
