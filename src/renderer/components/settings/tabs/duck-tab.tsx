'use client';

// The desktop duck's own settings. Everything here is shell-local — the duck is
// a window this app draws on your desktop, so none of it goes near the backend.

import { RotateCcw } from 'lucide-react';
import { CHIMES, PET_COLOURS, PET_LIMITS, type ChimeId } from '@shared/pet-prefs';
import { SettingsListRow, SettingsSection } from '@/components/settings/primitives';
import { DuckQuipsRow } from '@/components/settings/duck-quips-row';
import { DuckSprite } from './duck-sprite';
import { DuckPreview } from './duck-preview';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { usePetPrefs } from '@/hooks/use-pet-prefs';
import { playChime } from '@/lib/chime';
import { cn } from '@/lib/utils';

/** The rig width the pet window draws at scale 1. */
const BASE_WIDTH = 72;

/** base-ui hands back a number for a single-thumb slider and an array for a
 *  range; this tab only ever has one thumb. */
function first(value: number | readonly number[]): number {
  return Array.isArray(value) ? (value[0] ?? 0) : (value as number);
}

function Row({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <SettingsListRow hoverable={false} trailing={children}>
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground">{hint}</div>
    </SettingsListRow>
  );
}

export function DuckTab() {
  const { prefs, loading, update, reset } = usePetPrefs();
  const tint = { filter: `hue-rotate(${prefs.hue}deg) saturate(${prefs.vividness})` };

  return (
    // One grid in rows, like the other tabs: what he does and what he says sit
    // side by side, and the picture of him takes the width under them.
    <div className="grid items-start gap-x-10 gap-y-8 xl:grid-cols-2" aria-busy={loading}>
      {/* Him, in the window, while he is being changed. */}
      <DuckPreview prefs={prefs} />
      <SettingsSection
        index={0}
        title="On your desktop"
        subtitle="a duck above every window, and what he does while you work"
      >
        <div className="py-1">
          <Row title="Duck on the desktop" hint="Also in the menu-bar duck's menu">
            <Switch
              checked={prefs.enabled}
              onCheckedChange={(enabled) => update({ enabled })}
              aria-label="Duck on the desktop"
            />
          </Row>
          <Row title="Walk around" hint="Wanders the bottom of the screen and climbs the dock">
            <Switch
              checked={prefs.walk}
              onCheckedChange={(walk) => update({ walk })}
              aria-label="Walk around"
            />
          </Row>
          <Row
            title="Avoid the cursor"
            hint="Runs from an approaching pointer — fun, but hard to click"
          >
            <Switch
              checked={prefs.evade}
              onCheckedChange={(evade) => update({ evade })}
              aria-label="Avoid the cursor"
            />
          </Row>
        </div>
        <div className="pt-2 pb-4">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm font-medium">Sit height</span>
            <span className="text-xs tabular-nums text-muted-foreground">{prefs.raise}px</span>
          </div>
          <Slider
            value={prefs.raise}
            min={PET_LIMITS.raise.min}
            max={PET_LIMITS.raise.max}
            step={PET_LIMITS.raise.step}
            onValueChange={(value) => update({ raise: first(value) })}
            aria-label="Sit height"
          />
        </div>
      </SettingsSection>

      <SettingsSection
        index={1}
        title="How you hear him"
        subtitle="when a run, a ceremony or a session has finished"
      >
        <div className="py-1">
          <Row title="System notification" hint="The only one that reaches you with yeaboi closed">
            <Switch
              checked={prefs.notify.os}
              onCheckedChange={(os) => update({ notify: { ...prefs.notify, os } })}
              aria-label="System notification"
            />
          </Row>
          <Row title="The duck says it" hint="A bubble on the desktop; click it to open the result">
            <Switch
              checked={prefs.notify.bubble}
              onCheckedChange={(bubble) => update({ notify: { ...prefs.notify, bubble } })}
              aria-label="The duck says it"
            />
          </Row>
          <Row title="In-app toast" hint="For when you are already looking at yeaboi">
            <Switch
              checked={prefs.notify.toast}
              onCheckedChange={(toast) => update({ notify: { ...prefs.notify, toast } })}
              aria-label="In-app toast"
            />
          </Row>
          <Row title="Chime" hint="A short sound when something lands">
            <Switch
              checked={prefs.notify.chime}
              onCheckedChange={(chime) => update({ notify: { ...prefs.notify, chime } })}
              aria-label="Chime"
            />
          </Row>
          {/* Picking one plays it: a list of names is no way to choose a sound. */}
          {prefs.notify.chime && (
            <div className="flex flex-wrap gap-1.5 pt-1 pb-2">
              {CHIMES.map((sound) => {
                const on = prefs.notify.chimeSound === sound.id;
                return (
                  <button
                    key={sound.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      playChime(sound.id as ChimeId);
                      update({ notify: { ...prefs.notify, chimeSound: sound.id } });
                    }}
                    className={cn(
                      'rounded-full px-3 py-1 font-body text-[11.5px] transition-colors',
                      on
                        ? 'bg-primary/10 text-foreground ring-1 ring-primary/40'
                        : 'text-muted-foreground hover:bg-secondary/60',
                    )}
                  >
                    {sound.label}
                  </button>
                );
              })}
            </div>
          )}
          <DuckQuipsRow />
        </div>
      </SettingsSection>

      <SettingsSection
        index={2}
        title="How he looks"
        subtitle="size and colour, previewed live"
        className="xl:col-span-2"
      >
        <div className="flex flex-wrap items-start gap-6 py-5">
          {/* The preview is the duck itself, at the chosen size and tint, so
              the choice is made here rather than by hunting it on the desktop. */}
          <div
            className="flex h-44 w-44 shrink-0 items-end justify-center overflow-hidden rounded-lg bg-secondary/30 ring-1 ring-border/40"
            aria-hidden="true"
          >
            <div className="mb-3">
              <DuckSprite width={BASE_WIDTH * prefs.scale} filter={tint.filter} />
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-5">
            <div>
              <span className="mb-2 block text-sm font-medium">Colour</span>
              <div className="flex flex-wrap gap-2">
                {PET_COLOURS.map((colour) => {
                  const active = prefs.hue === colour.hue && prefs.vividness === colour.vividness;
                  return (
                    <button
                      key={colour.id}
                      type="button"
                      onClick={() => update({ hue: colour.hue, vividness: colour.vividness })}
                      aria-pressed={active}
                      aria-label={colour.label}
                      title={colour.label}
                      className={cn(
                        'size-9 overflow-hidden rounded-md ring-1 transition-colors',
                        active ? 'ring-primary' : 'ring-border/60 hover:ring-border',
                      )}
                    >
                      <span className="flex size-full items-center justify-center">
                        <DuckSprite
                          width={28}
                          filter={`hue-rotate(${colour.hue}deg) saturate(${colour.vividness})`}
                        />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Three of the same thing, laid out as three of the same thing. */}
            <div className="grid gap-5 sm:grid-cols-3">
              {(
                [
                  ['Size', `${Math.round(prefs.scale * 100)}%`, 'scale', prefs.scale],
                  ['Hue', `${prefs.hue}°`, 'hue', prefs.hue],
                  ['Vividness', `${prefs.vividness.toFixed(2)}×`, 'vividness', prefs.vividness],
                ] as const
              ).map(([label, readout, key, value]) => (
                <div key={key}>
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="text-sm font-medium">{label}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{readout}</span>
                  </div>
                  <Slider
                    value={value}
                    min={PET_LIMITS[key].min}
                    max={PET_LIMITS[key].max}
                    step={PET_LIMITS[key].step}
                    onValueChange={(next) => update({ [key]: first(next) })}
                    aria-label={`Duck ${label.toLowerCase()}`}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </SettingsSection>

      <div
        className="flex animate-slide-up justify-end motion-reduce:animate-none xl:col-span-2"
        style={{ animationDelay: '240ms' }}
      >
        <Button variant="ghost" size="sm" onClick={reset}>
          <RotateCcw className="size-3.5" aria-hidden="true" />
          Reset to defaults
        </Button>
      </div>
    </div>
  );
}
