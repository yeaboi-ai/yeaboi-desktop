'use client';

import { useState, useSyncExternalStore } from 'react';
import { ArrowRight, X } from 'lucide-react';

export interface CoachMarkStep {
  title: string;
  body: string;
  /** Pixel position of the floating card. */
  position: {
    top?: string | number;
    bottom?: string | number;
    left?: string | number;
    right?: string | number;
  };
}

export type CoachMarkGate =
  | { kind: 'localStorage'; storageKey: string }
  | {
      kind: 'server';
      isSeen: boolean;
      onComplete: () => void | Promise<void>;
    };

interface Props {
  steps: CoachMarkStep[];
  gate: CoachMarkGate;
}

function subscribeLocal(storageKey: string, event: string) {
  return (callback: () => void) => {
    if (typeof window === 'undefined') return () => {};
    const handler = (e: StorageEvent | Event) => {
      if (e instanceof StorageEvent && e.key && e.key !== storageKey) return;
      callback();
    };
    window.addEventListener(event, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(event, handler);
      window.removeEventListener('storage', handler);
    };
  };
}

function getLocalSeen(storageKey: string): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(storageKey) === '1';
}

function getServerSnapshotStub(): boolean {
  return true;
}

/**
 * First-call coach marks. The gate decides when to render and where to
 * persist dismissal:
 *   - localStorage: per-browser, fire-and-forget. Used by the session tour.
 *   - server: gated on a server-backed boolean with a callback on dismiss.
 *     Used by the onboarding demo tour so completion follows the user across
 *     devices (User.tour_completed_at).
 */
export function CoachMarks({ steps, gate }: Props) {
  const [stepIdx, setStepIdx] = useState(0);

  const localSeen = useSyncExternalStore(
    gate.kind === 'localStorage'
      ? subscribeLocal(gate.storageKey, `coach-marks-change:${gate.storageKey}`)
      : () => () => {},
    gate.kind === 'localStorage' ? () => getLocalSeen(gate.storageKey) : getServerSnapshotStub,
    getServerSnapshotStub,
  );

  const seen = gate.kind === 'localStorage' ? localSeen : gate.isSeen;
  if (seen) return null;
  if (steps.length === 0) return null;

  const dismiss = () => {
    if (gate.kind === 'localStorage') {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(gate.storageKey, '1');
        window.dispatchEvent(new Event(`coach-marks-change:${gate.storageKey}`));
      }
    } else {
      void gate.onComplete();
    }
  };

  const advance = () => {
    if (stepIdx < steps.length - 1) {
      setStepIdx(stepIdx + 1);
    } else {
      dismiss();
    }
  };

  const step = steps[stepIdx];

  return (
    <>
      {/* Soft scrim — clickable to dismiss */}
      <div
        className="fixed inset-0 z-[260] bg-background/50 backdrop-blur-[1px] animate-in fade-in duration-200"
        onClick={dismiss}
        aria-hidden
      />
      {/* Coach card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="coach-mark-title"
        className="fixed z-[261] w-[min(360px,calc(100vw-3rem))] rounded-2xl bg-card ring-1 ring-border shadow-2xl animate-in fade-in zoom-in-95 duration-200"
        style={step.position}
      >
        <div className="px-5 py-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="text-[10px] uppercase tracking-[0.08em] text-warning/90 font-medium">
              {stepIdx + 1} of {steps.length} · Quick tour
            </p>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Skip tour"
              className="p-1 rounded-md text-muted-foreground/50 hover:text-foreground/80 hover:bg-foreground/[0.05] transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <h3 id="coach-mark-title" className="text-sm font-semibold text-foreground">
            {step.title}
          </h3>
          <p className="text-[12px] text-muted-foreground leading-relaxed mt-1.5">{step.body}</p>
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-1">
              {steps.map((_, i) => (
                <span
                  key={i}
                  aria-hidden
                  className={`h-1 w-4 rounded-full transition-colors ${
                    i === stepIdx ? 'bg-warning/90' : 'bg-foreground/[0.15]'
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={advance}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-foreground/[0.10] text-foreground hover:bg-foreground/[0.15] transition-colors"
            >
              {stepIdx < steps.length - 1 ? (
                <>
                  Next <ArrowRight className="h-3 w-3" />
                </>
              ) : (
                'Got it'
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
