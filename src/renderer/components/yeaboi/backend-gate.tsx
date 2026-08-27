'use client';

// Every yeaboi-backed page renders through this gate instead of inventing its
// own probe: children when the sidecar is ready, a quiet skeleton while it
// starts (cold start is a few seconds), and the reason plainly when it gave
// up — the sidecar's backoff already retried before saying "down".

import type { ReactNode } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useYeaboiBackend } from '@/hooks/yeaboi/use-yeaboi-backend';

export function BackendGate({ children }: { children: ReactNode }) {
  const backend = useYeaboiBackend();

  if (backend.kind === 'ready') return <>{children}</>;

  if (backend.kind === 'starting') {
    return (
      <div className="mx-auto max-w-5xl px-6 py-14">
        <div className="flex items-center gap-2.5 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-[13px] font-body">Starting the yeaboi backend…</span>
        </div>
        <div className="mt-8 space-y-3">
          {[0, 1, 2].map((row) => (
            <div key={row} className="h-16 rounded-2xl bg-secondary/50 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-14">
      <div className="rounded-2xl bg-card ring-1 ring-destructive/30 p-5 flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="text-[13px] font-medium text-foreground">The yeaboi backend is down</p>
          <p className="text-[12px] text-muted-foreground mt-1">{backend.reason}</p>
          <p className="text-[11px] text-muted-foreground/70 mt-2">
            It restarts itself after a crash; if this message stays, restart the app.
          </p>
        </div>
      </div>
    </div>
  );
}
