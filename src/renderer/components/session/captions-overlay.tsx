"use client";

import { useEffect, useState } from "react";
import { Captions, X } from "lucide-react";

import { useReducedMotion } from "@/hooks/use-reduced-motion";

interface CaptionEntry {
  id: string;
  speaker_name: string | null;
  text: string;
  is_final: boolean;
  created_at: string;
}

interface CaptionsOverlayProps {
  entries: CaptionEntry[];
  /** When false, the overlay is hidden. */
  enabled: boolean;
  onClose: () => void;
  /** How long a caption stays visible after going final (ms). Default 7000. */
  showFinalForMs?: number;
}

/**
 * Bottom-of-canvas live captions, rendered independently of the transcript
 * drawer. Honors `prefers-reduced-motion`. Hides itself when there's nothing
 * to show. Shows the most recent 1–2 lines (current interim + previous final).
 */
export function CaptionsOverlay({
  entries,
  enabled,
  onClose,
  showFinalForMs = 7000,
}: CaptionsOverlayProps) {
  const reducedMotion = useReducedMotion();
  const [now, setNow] = useState(() => Date.now());

  // Tick every 1s to age out final captions.
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [enabled]);

  if (!enabled) return null;

  // Pick the most recent interim entry (still in progress) and the most recent
  // final entry that's within the show-final window.
  const recent = entries.slice(-8);
  const interim = [...recent].reverse().find((e) => !e.is_final);
  const lastFinal = [...recent]
    .reverse()
    .find((e) => e.is_final && (!interim || e.id !== interim.id));

  const ageMs = lastFinal ? now - new Date(lastFinal.created_at).getTime() : Infinity;
  const showFinal = lastFinal && ageMs < showFinalForMs;

  if (!interim && !showFinal) {
    return (
      <div className="pointer-events-none fixed bottom-24 left-1/2 -translate-x-1/2 z-[210]">
        <div className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/80 backdrop-blur-md ring-1 ring-border/70 text-[11px] text-muted-foreground">
          <Captions className="h-3 w-3" />
          Captions on — waiting for speech...
          <button
            type="button"
            onClick={onClose}
            aria-label="Hide captions"
            className="ml-1 p-0.5 rounded hover:bg-foreground/[0.10] hover:text-foreground/90 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed bottom-24 left-1/2 -translate-x-1/2 z-[210] w-[min(720px,calc(100vw-3rem))]">
      <div
        className={`pointer-events-auto rounded-2xl bg-background/85 backdrop-blur-md ring-1 ring-border/70 px-5 py-3 ${
          reducedMotion ? "" : "transition-all duration-200"
        }`}
        role="region"
        aria-label="Live captions"
        aria-live="polite"
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground/50 font-medium flex items-center gap-1">
            <Captions className="h-3 w-3" />
            Captions
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Hide captions"
            className="text-muted-foreground/50 hover:text-foreground/80 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="space-y-1 text-[15px] leading-snug">
          {showFinal && lastFinal && (
            <p className="text-muted-foreground">
              {lastFinal.speaker_name && (
                <span className="text-muted-foreground/60 mr-2 text-[12px]">{lastFinal.speaker_name}:</span>
              )}
              {lastFinal.text}
            </p>
          )}
          {interim && (
            <p className="text-foreground italic">
              {interim.speaker_name && (
                <span className="text-muted-foreground mr-2 text-[12px] not-italic">{interim.speaker_name}:</span>
              )}
              {interim.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
