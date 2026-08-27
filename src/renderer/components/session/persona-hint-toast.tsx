'use client';

import { useEffect, useRef } from 'react';
import { Lightbulb, X } from 'lucide-react';

interface PersonaHintToastProps {
  open: boolean;
  onDismiss: () => void;
  autoDismissMs?: number;
}

export function PersonaHintToast({ open, onDismiss, autoDismissMs = 5000 }: PersonaHintToastProps) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(onDismiss, autoDismissMs);
    const bar = barRef.current;
    let anim: Animation | undefined;
    if (bar && typeof bar.animate === 'function') {
      const reduced =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (!reduced) {
        anim = bar.animate([{ width: '100%' }, { width: '0%' }], {
          duration: autoDismissMs,
          easing: 'linear',
          fill: 'forwards',
        });
      }
    }
    return () => {
      clearTimeout(timer);
      anim?.cancel();
    };
  }, [open, autoDismissMs, onDismiss]);

  if (!open) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-[260] w-80 max-w-[calc(100vw-3rem)] animate-in slide-in-from-right-4 fade-in duration-300"
    >
      <div className="relative overflow-hidden bg-card/95 backdrop-blur-xl border border-border/70 rounded-2xl shadow-2xl">
        <div className="flex items-start gap-3 px-4 py-3.5">
          <div className="w-8 h-8 rounded-full bg-warning/[0.08] border border-warning/15 flex items-center justify-center shrink-0">
            <Lightbulb className="h-4 w-4 text-warning/90" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70 font-medium">
              Suggestion
            </p>
            <p className="text-[13px] text-foreground/95 leading-snug mt-1">Ask your agent:</p>
            <p className="text-[13px] text-foreground font-medium leading-snug mt-0.5">
              &ldquo;Should I switch personas?&rdquo;
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="p-1 -m-1 rounded-md text-muted-foreground/50 hover:text-foreground/80 hover:bg-foreground/[0.05] transition-colors shrink-0"
            aria-label="Dismiss hint"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div
          ref={barRef}
          className="absolute bottom-0 left-0 h-[2px] bg-warning/60 rounded-r-full"
          style={{ width: '100%' }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
