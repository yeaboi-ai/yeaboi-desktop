'use client';

// What the empty ledger shows while it loads: three rows the shape of the
// real ones, and one line naming what is being read.

import { LEDGER_ROW } from '@/lib/yeaboi/ledger';

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
          <li key={name} className={LEDGER_ROW}>
            <span className="min-w-0">
              <span className={`block h-[18px] rounded bg-secondary/70 ${name}`} />
              <span className={`mt-1.5 block h-3 rounded bg-secondary/40 ${facts}`} />
            </span>
            <span className="hidden h-3 w-20 rounded bg-secondary/40 md:block md:justify-self-end" />
          </li>
        ))}
      </ul>
      {caption && <p className="pt-3 text-[13px] font-body text-muted-foreground">{caption}</p>}
    </div>
  );
}
