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
import { SettingsSection } from '@/components/settings/primitives';
import { useYeaboiBackend } from '@/hooks/yeaboi/use-yeaboi-backend';
import { logger } from '@/lib/logger';
import { getAmbience, setAmbience } from '@/lib/yeaboi/ambience';
import { previewScreensaver, saverPreferenceChanged } from '@/lib/screensaver/preview';
import { DEFAULT_IDLE_SECONDS } from '@/lib/screensaver/idle';
import {
  DEFAULT_SAVER_STYLE,
  STYLE_BLURBS,
  STYLE_NAMES,
  SCENE_STYLES,
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

const ORDER: SaverStyle[] = [...SCENE_STYLES, 'shuffle', 'off'];

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
    <SettingsSection
      animate={false}
      title="Screensaver"
      action={
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
      }
    >
      <p className="pt-2 text-[11px] text-muted-foreground font-body leading-relaxed">
        After {Math.round(idleSeconds / 60)} minutes of quiet. The duck keeps his own colours;
        everything around him is drawn from the theme you are using. The choice is shared with the
        terminal.
      </p>

      <div className="grid grid-cols-3 items-start gap-2 pt-1">
        {ORDER.map((option) => (
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
    </SettingsSection>
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

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      title={blurb}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      className={cn(
        // No fill and no outline of its own: the picture is the tile, its name
        // sits on the page like every other label here, and the one that is
        // chosen says so in the accent rather than by being boxed.
        'group flex flex-col overflow-hidden rounded-lg text-left transition-colors outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50',
        active ? 'ring-1 ring-primary' : 'hover:ring-1 hover:ring-border/60',
      )}
    >
      <div className="relative h-20 w-full overflow-hidden bg-background">
        {drawable ? (
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
        {/* On the scene rather than under it: the tile is the picture, and a
            name below it was a second row of furniture per tile. */}
        <p
          className={cn(
            'absolute bottom-1.5 left-2 font-body text-[11px] font-medium',
            '[text-shadow:0_1px_3px_rgba(0,0,0,0.65)]',
            active ? 'text-primary' : 'text-white',
          )}
        >
          {name}
        </p>
      </div>
    </button>
  );
}
