'use client';

// One style to pick: a moving thumbnail from the shared synthetic loop, the
// name beneath, the primary ring when it is the one in use.

import { useSyntheticVizSource } from '@/hooks/use-viz-frames';
import { Visualizer } from '@/components/music/visualizer';
import { useMusicPlayer } from '@/components/providers/music-provider';
import { VIZ_STYLE_CATALOGUE } from '@/lib/music/viz/styles';
import { cn } from '@/lib/utils';
import type { VizStyleId } from '@shared/music';

export function VizStyleTiles({ compact = false }: { compact?: boolean }) {
  const { prefs, updateVisualizer } = useMusicPlayer();
  const { gain, smoothing, peaks } = prefs.visualizer;
  const tiles = useSyntheticVizSource({ gain, smoothing, peaks });
  return (
    <div role="radiogroup" aria-label="Style" className="grid grid-cols-3 gap-2">
      {VIZ_STYLE_CATALOGUE.map((entry) => (
        <VizStyleTile
          key={entry.id}
          id={entry.id}
          name={entry.name}
          blurb={entry.blurb}
          active={prefs.visualizer.style === entry.id}
          compact={compact}
          onPick={() => updateVisualizer({ style: entry.id })}
          source={tiles}
        />
      ))}
    </div>
  );
}

function VizStyleTile({
  id,
  name,
  blurb,
  active,
  compact,
  onPick,
  source,
}: {
  id: VizStyleId;
  name: string;
  blurb: string;
  active: boolean;
  compact: boolean;
  onPick: () => void;
  source: ReturnType<typeof useSyntheticVizSource>;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      data-viz-tile={id}
      title={blurb}
      onClick={onPick}
      className={cn(
        'group flex flex-col overflow-hidden rounded-lg border text-left transition-colors outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring/50',
        active ? 'border-primary' : 'border-border/40 hover:border-border',
      )}
    >
      <div className={cn('relative w-full bg-background', compact ? 'h-9' : 'h-11')}>
        <Visualizer
          size="popover"
          style={id}
          source={source}
          className="absolute inset-0 h-full w-full"
        />
      </div>
      <span
        className={cn(
          'px-2 py-1 text-[11px] font-body',
          active ? 'text-primary' : 'text-foreground',
        )}
      >
        {name}
      </span>
    </button>
  );
}
