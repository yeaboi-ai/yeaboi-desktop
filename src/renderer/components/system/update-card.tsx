'use client';

// The sidebar's amber update card — the desktop's answer to the TUI welcome
// screen's amber "update" box. Appears on its own when a check finds a new
// version; one click downloads and, once the download lands, restarts the app
// after a short countdown. Dismissal is per-version: the card stays hidden for
// the release it was shown for and returns for the next one.

import Link from 'next/link';
import { X } from 'lucide-react';
import { updateIndicatorVisible } from '@shared/update';
import { useUpdateFlow } from '@/hooks/use-update-state';

export function UpdateCard() {
  const { state, update, dismiss, dismissedVersion, countdown } = useUpdateFlow();

  if (!updateIndicatorVisible(state, dismissedVersion)) return null;

  return (
    <div className="hidden md:block rounded-lg bg-amber-500/10 ring-1 ring-amber-500/30 px-3 py-2 mb-1">
      {state.kind === 'available' && (
        <>
          <div className="flex items-start justify-between gap-1">
            <Link
              href="/whats-new"
              className="text-[11px] font-body font-medium text-amber-600 dark:text-amber-400 hover:underline"
            >
              v{state.version} is out
            </Link>
            <button
              type="button"
              onClick={dismiss}
              className="text-muted-foreground/50 hover:text-foreground transition-colors shrink-0"
              title="Dismiss for this version"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <button
            type="button"
            onClick={update}
            className="mt-1.5 w-full rounded-md bg-amber-500/20 hover:bg-amber-500/30 px-2 py-1 text-[11px] font-body font-medium text-amber-700 dark:text-amber-300 transition-colors"
          >
            Update
          </button>
        </>
      )}
      {state.kind === 'downloading' && (
        <>
          <p className="text-[11px] font-body text-amber-600 dark:text-amber-400">
            Downloading — {state.percent}%
          </p>
          <div className="mt-1.5 h-1 rounded-full bg-amber-500/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-amber-500 transition-[width] duration-300"
              style={{ width: `${state.percent}%` }}
            />
          </div>
        </>
      )}
      {state.kind === 'ready' && (
        <button
          type="button"
          onClick={update}
          className="w-full rounded-md bg-amber-500/20 hover:bg-amber-500/30 px-2 py-1 text-[11px] font-body font-medium text-amber-700 dark:text-amber-300 transition-colors"
        >
          {countdown !== null ? `Restarting in ${countdown}…` : 'Restart to update'}
        </button>
      )}
    </div>
  );
}
