// The frame every page inside the app shell renders in. The outer column is
// the same on every page — one width, one top and bottom padding — so moving
// between pages never shifts the header, the centring or the scrollbar. A
// page that reads better narrow centres an inner column inside that frame
// rather than shrinking the frame itself.
//
// The page scrolls in here, not the window: the deck clips at its port, so a
// page taller than it would simply lose its foot. The scroller is the whole
// page area rather than the column on it, so the wheel works in the margins
// either side too.

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** The outer column's classes, verbatim. */
export const PAGE_FRAME = 'mx-auto w-full max-w-[var(--page-w)] px-6 pt-10 pb-[var(--page-pb)]';

export function PageShell({
  width = 'wide',
  className,
  children,
}: {
  /** `narrow` centres a max-w-3xl reading column inside the same frame;
   *  `full` gives the frame the window, for a page that is a sheet. */
  width?: 'wide' | 'narrow' | 'full';
  /** Extras on the inner column only (e.g. `space-y-4`, `relative`). */
  className?: string;
  children: ReactNode;
}) {
  return (
    // `data-scrollport`: the chrome's scroll rail follows whichever port the
    // page in front of it has marked.
    <div
      data-scrollport
      className="quiet-scroll h-full min-h-0 flex-1 overflow-y-auto overscroll-contain"
    >
      <div className={cn(PAGE_FRAME, width === 'full' && 'max-w-none')}>
        <div className={cn(width === 'narrow' && 'mx-auto max-w-3xl', className)}>{children}</div>
      </div>
    </div>
  );
}
