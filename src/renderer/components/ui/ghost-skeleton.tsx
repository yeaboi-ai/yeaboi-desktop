'use client';

// What an empty list shows while it loads: three rows the shape of the real
// ones, and one line naming what is being read.

const ROW = 'grid grid-cols-[minmax(0,1fr)_5.5rem] items-baseline gap-x-4 py-3';

const WIDTHS = [
  ['w-[72%]', 'w-[48%]'],
  ['w-[58%]', 'w-[40%]'],
  ['w-[66%]', 'w-[44%]'],
] as const;

export function GhostSkeleton({ caption }: { caption?: string }) {
  return (
    <div aria-busy="true" aria-label={caption ?? 'Loading'}>
      <ul className="animate-pulse divide-y divide-border/50">
        {WIDTHS.map(([name, facts]) => (
          <li key={name} className={ROW}>
            <span className="min-w-0">
              <span className={`block h-[18px] rounded bg-secondary/70 ${name}`} />
              <span className={`mt-1.5 block h-3 rounded bg-secondary/40 ${facts}`} />
            </span>
            <span className="h-3 w-20 justify-self-end rounded bg-secondary/40" />
          </li>
        ))}
      </ul>
      {caption && <p className="pt-3 text-[13px] font-body text-muted-foreground">{caption}</p>}
    </div>
  );
}
