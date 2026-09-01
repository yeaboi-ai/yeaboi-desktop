'use client';

// The solo home's "where am I" strip — four tiles above the doors: yesterday's
// standup, the sprint and its confidence, the next story off the plan, and
// this week's agent spend. Each tile is a door of its own into the mode that
// would fill it. Empty tiles render muted with the sentence that says why.

import { useRouter } from 'next/navigation';
import { useSoloToday } from '@/hooks/yeaboi/use-solo-today';
import { todayTiles, type TodayTile } from '@/lib/yeaboi/solo';

function Tile({ tile, onOpen }: { tile: TodayTile; onOpen: (route: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(tile.route)}
      className="rounded-2xl bg-card ring-1 ring-border/60 px-5 py-4 text-left transition-colors hover:ring-primary/40 hover:bg-secondary/40 min-w-0"
    >
      <p
        data-audience-accented
        className="text-[11px] font-body uppercase tracking-wide"
        style={{ color: 'var(--audience-accent)' }}
      >
        {tile.label}
      </p>
      <p
        className={`mt-1 text-[13px] font-body leading-snug line-clamp-2 ${
          tile.empty ? 'text-muted-foreground' : 'text-foreground'
        }`}
        title={tile.value}
      >
        {tile.value}
      </p>
    </button>
  );
}

export function TodayStrip() {
  const router = useRouter();
  const { today, loading, unsupported } = useSoloToday();
  // An older sidecar has no snapshot to show, and a failed read has nothing
  // honest to say; either way the home reads as it did before this strip.
  if (unsupported || loading) return null;
  const tiles = todayTiles(today);
  return (
    <section aria-label="Today" className="mb-8">
      <p className="text-[11px] font-body text-muted-foreground uppercase tracking-wide mb-2">
        Today
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map((tile) => (
          <Tile key={tile.key} tile={tile} onOpen={(route) => router.push(route)} />
        ))}
      </div>
    </section>
  );
}
