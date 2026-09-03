'use client';

// A short inventory: plain rows, the name on the left, a quiet stamp on the
// right, one hairline between rows. An empty list is one inviting sentence
// and the action that fills it. Used by the home's two halves, the Sessions
// page and the project's run panel.

import Link from 'next/link';
import type { GlimpseRow } from '@/lib/yeaboi/glimpse';

export function GlimpseList({
  rows,
  empty,
  action,
}: {
  rows: GlimpseRow[];
  empty: string;
  /** Where the empty sentence sends the reader. */
  action?: { label: string; href: string };
}) {
  if (rows.length === 0) {
    return (
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        {empty}
        {action && (
          <>
            {' '}
            <Link href={action.href} className="text-primary hover:underline">
              {action.label}
            </Link>
          </>
        )}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border/50">
      {rows.map((row) => (
        <li key={row.key}>
          <Link
            href={row.href}
            className="group flex items-baseline justify-between gap-6 py-2 text-[13px] font-body transition-colors"
          >
            <span className="min-w-0 truncate">
              <span className="text-foreground group-hover:text-primary">{row.primary}</span>
              {row.detail && <span className="ml-2 text-muted-foreground">{row.detail}</span>}
            </span>
            <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
              {row.secondary}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
