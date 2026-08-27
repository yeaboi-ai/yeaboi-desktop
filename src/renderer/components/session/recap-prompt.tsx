"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ClipboardList, X } from "lucide-react";

interface RecapPromptProps {
  open: boolean;
  durationSeconds: number;
  onView: () => void;
  onSkip: () => void;
  onDontAskAgain: () => void;
  /** Auto-dismiss after this many ms of no interaction. Default 30s. */
  autoDismissMs?: number;
}

function formatDuration(s: number): string {
  if (s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function RecapPrompt({
  open,
  durationSeconds,
  onView,
  onSkip,
  onDontAskAgain,
  autoDismissMs = 30_000,
}: RecapPromptProps) {
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(onSkip, autoDismissMs);
    return () => clearTimeout(t);
  }, [open, onSkip, autoDismissMs]);

  if (!open || typeof window === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-label="View call recap"
      className="fixed bottom-6 right-6 z-[290] w-80 bg-secondary border border-border rounded-2xl shadow-2xl p-4 animate-in slide-in-from-bottom-4 fade-in duration-200"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5 p-1.5 rounded-lg bg-info/10 text-info ring-1 ring-info/20">
          <ClipboardList className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Your call recap is ready</p>
          <p className="text-xs text-muted-foreground/80 mt-0.5">Call ended · {formatDuration(durationSeconds)}</p>
        </div>
        <button
          type="button"
          onClick={onSkip}
          aria-label="Dismiss"
          className="p-1 -m-1 rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-foreground/[0.05] transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onView}
          className="flex-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-info/15 text-info ring-1 ring-info/30 hover:bg-info/25 transition-colors"
        >
          View recap
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-foreground/[0.05] text-muted-foreground hover:bg-foreground/[0.10] hover:text-foreground/90 transition-colors"
        >
          Skip
        </button>
      </div>
      <button
        type="button"
        onClick={onDontAskAgain}
        className="mt-2 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
      >
        Don&apos;t ask me again
      </button>
    </div>,
    document.body,
  );
}
