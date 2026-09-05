'use client';

// Everything about how the visualiser looks, in one block: the style tiles,
// the colour, the columns, the feel, and the three switches. The Music page
// shows it in a popover beside the bars; Settings · Player shows it whole.

import { useState } from 'react';
import { HexColorPicker } from 'react-colorful';
import { VizStyleTiles } from '@/components/music/visualizer-tile';
import { useMusicPlayer } from '@/components/providers/music-provider';
import { ChoicePills } from '@/components/settings/primitives';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { VIZ_BAND_COUNTS, VIZ_COLOURS, normalizeHexColour, type VizColourId } from '@shared/music';

const COLOUR_LABELS: Record<VizColourId, string> = {
  amber: 'Amber',
  accent: 'World',
  spectrum: 'Spectrum',
  custom: 'Custom',
};

export function VisualizerControls({ compact = false }: { compact?: boolean }) {
  const { prefs, updateVisualizer } = useMusicPlayer();
  const viz = prefs.visualizer;
  const [draft, setDraft] = useState(viz.customHex);

  const commitHex = (value: string) => {
    setDraft(value);
    const hex = normalizeHexColour(value);
    if (hex) updateVisualizer({ customHex: hex });
  };

  const row = (label: string, control: React.ReactNode) => (
    <div className={cn('flex items-center gap-3', compact ? 'py-1' : 'py-1.5')}>
      <span
        className={cn('shrink-0 text-[11.5px] text-muted-foreground', compact ? 'w-16' : 'w-24')}
      >
        {label}
      </span>
      <div className="min-w-0 flex-1">{control}</div>
    </div>
  );

  return (
    <div className={cn('space-y-3', compact && 'space-y-2')}>
      <VizStyleTiles compact={compact} />

      {row(
        'Colour',
        <div className="flex flex-wrap items-center gap-2">
          <ChoicePills
            options={VIZ_COLOURS}
            labels={COLOUR_LABELS}
            active={viz.colour}
            onPick={(value) => updateVisualizer({ colour: value as VizColourId })}
          />
          {viz.colour === 'custom' && (
            <Popover>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    aria-label="Pick a colour"
                    className="size-6 rounded-full ring-1 ring-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    style={{ background: viz.customHex }}
                  />
                }
              />
              <PopoverContent side="bottom" align="start" className="w-auto p-3">
                <HexColorPicker color={viz.customHex} onChange={commitHex} />
                <input
                  type="text"
                  value={draft}
                  maxLength={7}
                  spellCheck={false}
                  aria-label="Hex colour"
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={() => commitHex(draft)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') commitHex(draft);
                  }}
                  className="mt-2 w-full rounded-md border border-border bg-transparent px-2 py-1 font-mono text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                />
              </PopoverContent>
            </Popover>
          )}
        </div>,
      )}

      {row(
        'Columns',
        <ChoicePills
          options={VIZ_BAND_COUNTS.map(String)}
          active={String(viz.bands)}
          onPick={(value) => updateVisualizer({ bands: Number(value) as 16 | 32 | 64 })}
        />,
      )}

      {row(
        'Gain',
        <div className="flex items-center gap-3">
          <Slider
            aria-label="Gain"
            min={50}
            max={200}
            step={5}
            value={Math.round(viz.gain * 100)}
            onValueChange={(value) =>
              updateVisualizer({ gain: (Array.isArray(value) ? value[0]! : value) / 100 })
            }
            className="flex-1"
          />
          <span className="w-10 text-right font-mono text-[11px] text-muted-foreground">
            {Math.round(viz.gain * 100)}%
          </span>
        </div>,
      )}

      {row(
        'Smoothing',
        <div className="flex items-center gap-3">
          <Slider
            aria-label="Smoothing"
            min={0}
            max={100}
            step={5}
            value={Math.round(viz.smoothing * 100)}
            onValueChange={(value) =>
              updateVisualizer({ smoothing: (Array.isArray(value) ? value[0]! : value) / 100 })
            }
            className="flex-1"
          />
          <span className="w-10 text-right font-mono text-[11px] text-muted-foreground">
            {Math.round(viz.smoothing * 100)}%
          </span>
        </div>,
      )}

      <div className={cn('flex flex-wrap gap-x-5 gap-y-2 pt-1', compact && 'gap-x-4')}>
        {(
          [
            ['peaks', 'Peak caps'],
            ['mirror', 'Mirror'],
            ['glow', 'Glow'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-[11.5px] text-foreground">
            <Switch
              checked={viz[key]}
              onCheckedChange={(checked) => updateVisualizer({ [key]: checked })}
              aria-label={label}
            />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}
