'use client';

import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';

import { useReducedMotion } from '@/hooks/use-reduced-motion';

interface AgentIntentStripProps {
  intent: string;
  /** Optional ETA — drives the cancel countdown ring. Falls back to a static label. */
  etaMs: number | null;
  /** Cancel handler — caller is expected to send a /skip steering message. */
  onCancel: () => void;
}

/**
 * W3.2.5 — Floating preview strip showing what the agent is *about to do*.
 *
 * Renders bottom-center, above the captions overlay. Cancellable; if the
 * user dismisses, the parent posts a /skip system message and the agent
 * picks a different move on its next turn.
 */
export function AgentIntentStrip({ intent, etaMs, onCancel }: AgentIntentStripProps) {
  const reducedMotion = useReducedMotion();
  // Track remaining time as state so render is pure. The effect computes
  // elapsed via performance.now() (impure), but only fires once a second.
  const [remainingMs, setRemainingMs] = useState<number | null>(etaMs);

  useEffect(() => {
    // Re-anchor whenever etaMs changes. The interval is the only setState
    // path; the initial value is carried by useState above.
    if (etaMs === null) return;
    const start = typeof window === 'undefined' ? 0 : performance.now();
    if (reducedMotion) return;
    const id = setInterval(() => {
      const elapsed = performance.now() - start;
      setRemainingMs(Math.max(0, etaMs - elapsed));
    }, 1000);
    return () => clearInterval(id);
  }, [etaMs, reducedMotion]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto fixed bottom-44 left-1/2 -translate-x-1/2 z-[212]"
    >
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-full bg-info/10 ring-1 ring-info/30 backdrop-blur-md">
        <Sparkles className={`h-3.5 w-3.5 text-info ${reducedMotion ? '' : 'animate-pulse'}`} />
        <span className="text-[12px] text-info/95">
          Agent will <span className="font-medium text-foreground">{intent}</span>
          {remainingMs !== null && remainingMs > 0 && (
            <span className="ml-2 text-info/70 tabular-nums">
              in {Math.ceil(remainingMs / 1000)}s
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel — pick something else"
          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] text-info/80 hover:text-foreground hover:bg-info/20 transition-colors"
        >
          <X className="h-3 w-3" />
          Skip
        </button>
      </div>
    </div>
  );
}
