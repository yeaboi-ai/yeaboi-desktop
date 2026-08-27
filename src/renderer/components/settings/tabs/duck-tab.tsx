'use client';

// The desktop duck's own settings. Everything here is shell-local — the duck is
// a window this app draws on your desktop, so none of it goes near the backend.

import { RotateCcw } from 'lucide-react';
import { PET_COLOURS, PET_LIMITS } from '@shared/pet-prefs';
import {
  SettingsCard,
  SettingsListRow,
  SettingsSectionHeader,
} from '@/components/settings/primitives';
import { DuckSprite } from './duck-sprite';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { usePetPrefs } from '@/hooks/use-pet-prefs';
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
    <SettingsListRow trailing={children}>
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground">{hint}</div>
    </SettingsListRow>
  );
}

export function DuckTab() {
  const { prefs, loading, update, reset } = usePetPrefs();
  const tint = { filter: `hue-rotate(${prefs.hue}deg) saturate(${prefs.vividness})` };

  return (
    <div className="space-y-4" aria-busy={loading}>
      <SettingsCard index={0}>
        <SettingsSectionHeader
          title="Desktop duck"
          subtitle="A duck that lives on your desktop, above every window"
        />
        <div className="py-2">
          <Row title="Duck on the desktop" hint="Also in the menu-bar duck's menu">
            <Switch
              checked={prefs.enabled}
              onCheckedChange={(enabled) => update({ enabled })}
              aria-label="Duck on the desktop"
            />
          </Row>
        </div>
      </SettingsCard>

      <SettingsCard index={1}>
        <SettingsSectionHeader title="Look" subtitle="Size and colour, previewed live" />
        <div className="flex items-end gap-6 px-5 py-5">
          {/* The preview is the duck itself, at the chosen size and tint, so
              the choice is made here rather than by hunting it on the desktop. */}
          <div
            className="flex h-44 w-44 shrink-0 items-end justify-center overflow-hidden rounded-lg border border-border bg-muted/30"
            aria-hidden="true"
          >
            <div className="mb-3">
              <DuckSprite width={BASE_WIDTH * prefs.scale} filter={tint.filter} />
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-5">
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-sm font-medium">Size</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {Math.round(prefs.scale * 100)}%
                </span>
              </div>
              <Slider
                value={prefs.scale}
                min={PET_LIMITS.scale.min}
                max={PET_LIMITS.scale.max}
                step={PET_LIMITS.scale.step}
                onValueChange={(value) => update({ scale: first(value) })}
                aria-label="Duck size"
              />
            </div>

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
                        'size-9 overflow-hidden rounded-md border transition-colors',
                        active
                          ? 'border-foreground ring-2 ring-ring/40'
                          : 'border-border hover:border-foreground/50',
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

            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-sm font-medium">Hue</span>
                <span className="text-xs tabular-nums text-muted-foreground">{prefs.hue}°</span>
              </div>
              <Slider
                value={prefs.hue}
                min={PET_LIMITS.hue.min}
                max={PET_LIMITS.hue.max}
                step={PET_LIMITS.hue.step}
                onValueChange={(value) => update({ hue: first(value) })}
                aria-label="Duck hue"
              />
            </div>

            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-sm font-medium">Vividness</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {prefs.vividness.toFixed(2)}×
                </span>
              </div>
              <Slider
                value={prefs.vividness}
                min={PET_LIMITS.vividness.min}
                max={PET_LIMITS.vividness.max}
                step={PET_LIMITS.vividness.step}
                onValueChange={(value) => update({ vividness: first(value) })}
                aria-label="Duck vividness"
              />
            </div>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard index={2}>
        <SettingsSectionHeader title="Behaviour" subtitle="What the duck does while you work" />
        <div className="py-2">
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
        <div className="px-5 pt-1 pb-5">
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
      </SettingsCard>

      <SettingsCard index={3}>
        <SettingsSectionHeader
          title="Notifications"
          subtitle="How you hear that a run, a ceremony or a session has finished"
        />
        <div className="py-2">
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
          <Row title="Chime" hint="A short two-note ding">
            <Switch
              checked={prefs.notify.chime}
              onCheckedChange={(chime) => update({ notify: { ...prefs.notify, chime } })}
              aria-label="Chime"
            />
          </Row>
        </div>
      </SettingsCard>

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={reset}>
          <RotateCcw className="size-3.5" aria-hidden="true" />
          Reset to defaults
        </Button>
      </div>
    </div>
  );
}
