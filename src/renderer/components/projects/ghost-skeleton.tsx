'use client';

// What the empty ledger shows while the sidecar reads the connections: three
// rows the shape of the suggested ones, hollow dots and all, and one line
// naming what is being read.

import { RunTrace } from '@/components/projects/run-trace';
import { LEDGER_ROW } from '@/lib/yeaboi/ledger';
import { traceFor } from '@/lib/yeaboi/projects';
import type { FlowStep } from '@/lib/yeaboi/reads';

const WIDTHS = [
  ['w-[72%]', 'w-[48%]'],
  ['w-[58%]', 'w-[40%]'],
  ['w-[66%]', 'w-[44%]'],
] as const;

export function GhostSkeleton({ steps, caption }: { steps: FlowStep[]; caption?: string }) {
  const trace = traceFor(steps, undefined);
  return (
    <div aria-busy="true" aria-label={caption ?? 'Loading'}>
      <ul className="animate-pulse divide-y divide-border/50">
        {WIDTHS.map(([name, facts]) => (
          <li key={name} className={LEDGER_ROW}>
            <span className="min-w-0">
              <span className={`block h-[18px] rounded bg-secondary/70 ${name}`} />
              <span className={`mt-1.5 block h-3 rounded bg-secondary/40 ${facts}`} />
            </span>
            <span className="hidden md:contents">
              <RunTrace trace={trace} variant="dots" />
            </span>
            <span className="hidden h-3 w-20 rounded bg-secondary/40 md:block md:justify-self-end" />
          </li>
        ))}
      </ul>
      {caption && <p className="pt-3 text-[13px] font-body text-muted-foreground">{caption}</p>}
    </div>
  );
}
