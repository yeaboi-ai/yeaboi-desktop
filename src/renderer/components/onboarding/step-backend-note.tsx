'use client';

// The wizard's own backend-readiness row. Steps past Welcome need the yeaboi
// sidecar; a cold start takes a few seconds, so the step frame stays visible
// with its actions disabled instead of blanking (which BackendGate would do).

import { AlertTriangle, Loader2 } from 'lucide-react';
import type { YeaboiBackendState } from '@/hooks/yeaboi/use-yeaboi-backend';
import { Button } from '@/components/ui/button';

export function StepBackendNote({
  backend,
  onEmergencySkip,
}: {
  backend: YeaboiBackendState;
  onEmergencySkip: () => void;
}) {
  if (backend.kind === 'ready') return null;

  if (backend.kind === 'starting') {
    return (
      <div className="flex items-center gap-2.5 rounded-xl bg-secondary/40 px-4 py-3 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-[12px] font-body">Warming up the yeaboi engine…</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-card ring-1 ring-destructive/30 p-4">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="text-[13px] font-medium text-foreground">The yeaboi engine is down</p>
          <p className="text-[12px] text-muted-foreground mt-1">{backend.reason}</p>
          <p className="text-[11px] text-muted-foreground/70 mt-2">
            Setup needs it. You can skip for now and finish later at Settings → Setup.
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={onEmergencySkip}>
            Skip setup
          </Button>
        </div>
      </div>
    </div>
  );
}
