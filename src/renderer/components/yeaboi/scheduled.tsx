'use client';

// The enabled ceremonies as rows: the name, and when each next fires in the
// backend's own words. Nothing when none is scheduled.

import Link from 'next/link';
import type { CeremonyRow } from '@/lib/yeaboi/ops';

export function Scheduled({ rows, className }: { rows: CeremonyRow[]; className?: string }) {
  if (rows.length === 0) return null;
  return (
    <div className={className}>
      <h3 className="text-[13px] font-body font-medium text-foreground">Scheduled</h3>
      <ul className="mt-1 divide-y divide-border/50">
        {rows.map((row) => (
          <li key={row.name}>
            <Link
              href="/ceremonies"
              className="group flex items-baseline justify-between gap-6 py-2 text-[13px] font-body"
            >
              <span className="min-w-0 truncate text-foreground group-hover:text-primary">
                {row.name}
              </span>
              <span className="shrink-0 text-[12px] text-muted-foreground">{row.next_fire}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
