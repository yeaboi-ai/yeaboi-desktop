// The frame every page inside the app shell renders in. The outer column is
// the same on every page — one width, one top and bottom padding — so moving
// between pages never shifts the header, the centring or the scrollbar. A
// page that reads better narrow centres an inner column inside that frame
// rather than shrinking the frame itself.

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** The outer column's classes, verbatim — test/page-shell.test.ts holds them fixed. */
export const PAGE_FRAME = 'mx-auto w-full max-w-[var(--page-w)] px-6 pt-10 pb-[var(--page-pb)]';

export function PageShell({
  width = 'wide',
  className,
  children,
}: {
  /** `narrow` centres a max-w-3xl reading column inside the same frame. */
  width?: 'wide' | 'narrow';
  /** Extras on the inner column only (e.g. `space-y-4`, `relative`). */
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={PAGE_FRAME}>
      <div className={cn(width === 'narrow' && 'mx-auto max-w-3xl', className)}>{children}</div>
    </div>
  );
}
