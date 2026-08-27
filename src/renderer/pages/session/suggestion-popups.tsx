'use client';

// The facilitator's two proactive popups: "switch persona?" and "this
// output artifact is ready to generate". Ported from the web session page.

import { useEffect } from 'react';

export function PersonaSuggestionPopup({
  persona,
  label,
  reason,
  onAccept,
  onDismiss,
}: {
  persona: string;
  label: string;
  reason: string;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  // Auto-dismiss after 20 seconds
  useEffect(() => {
    const timer = setTimeout(onDismiss, 20000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[250] animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="flex items-center gap-3 bg-secondary/95 backdrop-blur-xl border border-border rounded-2xl shadow-2xl px-5 py-3.5 max-w-md">
        <img
          src={`/personas/${persona}.svg`}
          alt={label}
          className="w-10 h-10 rounded-full object-cover ring-2 ring-primary/30 shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-foreground font-medium">Switch to {label}?</p>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5 truncate">
            Recommended {reason}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onAccept}
            className="px-3.5 py-1.5 rounded-lg text-[12px] font-medium bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 transition-colors"
          >
            Accept
          </button>
          <button
            onClick={onDismiss}
            className="px-2.5 py-1.5 rounded-lg text-[12px] text-muted-foreground/50 hover:text-muted-foreground hover:bg-foreground/[0.06] transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

export function OutputSuggestionPopup({
  outputType,
  label,
  reason,
  onAccept,
  onDismiss,
}: {
  outputType: string;
  label: string;
  reason: string;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  // Slightly longer than persona — "generate now vs later" needs a beat.
  useEffect(() => {
    const timer = setTimeout(onDismiss, 25000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  // Stacked just above the persona popup so the two never overlap.
  return (
    <div className="fixed bottom-36 left-1/2 -translate-x-1/2 z-[251] animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="flex items-center gap-3 bg-secondary/95 backdrop-blur-xl border border-border rounded-2xl shadow-2xl px-5 py-3.5 max-w-md">
        <div className="w-10 h-10 rounded-full bg-info/15 ring-2 ring-info/30 flex items-center justify-center shrink-0">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-info"
            aria-hidden="true"
            data-output={outputType}
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-foreground font-medium">{label} is ready</p>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5 truncate">{reason}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onAccept}
            className="px-3.5 py-1.5 rounded-lg text-[12px] font-medium bg-info/20 text-info border border-info/30 hover:bg-info/30 transition-colors"
          >
            Generate
          </button>
          <button
            onClick={onDismiss}
            className="px-2.5 py-1.5 rounded-lg text-[12px] text-muted-foreground/50 hover:text-muted-foreground hover:bg-foreground/[0.06] transition-colors"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
