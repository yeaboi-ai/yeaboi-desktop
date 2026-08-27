"use client";

import { useEffect, useMemo, useState } from "react";

const BASE_PHASES = [
  "Reading your blueprint…",
  "Drafting candidate tasks…",
  "Mapping dependencies…",
  "Sequencing into waves…",
  "Polishing titles and details…",
] as const;

const REPO_READING_PHASE = "Reading your repo's conventions…";

const PHASE_MS = 7000;
const REASSURE_AT_MS = 20_000;
const PATIENCE_AT_MS = 45_000;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function GeneratingTasksLoader({
  estimatedWaves = 3,
  style,
}: {
  estimatedWaves?: number;
  /** When "follow_practices" the loader prepends an extra phase to set
   * expectation that the first run does a one-shot GitHub fetch + analysis. */
  style?: string;
}) {
  const [reduced] = useState(() => prefersReducedMotion());
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  const phases = useMemo(
    () => (style === "follow_practices" ? [REPO_READING_PHASE, ...BASE_PHASES] : BASE_PHASES),
    [style],
  );

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => {
      setPhaseIdx((i) => Math.min(i + 1, phases.length - 1));
    }, PHASE_MS);
    return () => window.clearInterval(id);
  }, [reduced, phases.length]);

  useEffect(() => {
    if (reduced) return;
    const startedAt = Date.now();
    const id = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 1000);
    return () => window.clearInterval(id);
  }, [reduced]);

  const waves = Math.max(2, Math.min(5, Math.round(estimatedWaves || 3)));
  const reassurance =
    elapsedMs >= PATIENCE_AT_MS
      ? "Still working — quality over speed."
      : elapsedMs >= REASSURE_AT_MS
        ? "Good plans take a moment — almost there."
        : null;

  return (
    <div className="flex-1 flex flex-col" role="status" aria-live="polite" aria-label="Generating tasks">
      <div className="relative h-0.5 bg-primary/15 overflow-hidden">
        <div
          className="absolute inset-y-0 w-1/3 bg-primary/60"
          style={
            reduced
              ? { opacity: 0.4 }
              : { animation: "loader-shimmer-travel 1.8s linear infinite" }
          }
        />
      </div>

      <div className="px-8 pt-6 pb-2 text-center">
        <div
          key={phaseIdx}
          className="text-sm text-foreground/80 animate-fade-in"
        >
          {phases[phaseIdx]}
        </div>
        {reassurance && (
          <div className="mt-1.5 text-[11px] text-muted-foreground animate-fade-in">
            {reassurance}
          </div>
        )}
      </div>

      <div className="px-8 py-5 space-y-5">
        {Array.from({ length: waves }).map((_, waveIdx) => {
          const cardCount = waveIdx === 0 ? 3 : 2;
          return (
            <div key={waveIdx} className="relative">
              <div className="flex items-baseline gap-3 mb-2.5 pb-1.5 border-b border-border/40">
                <span className="flex items-center justify-center h-5 min-w-[1.75rem] px-1.5 rounded bg-primary/15 text-primary text-[11px] font-medium tabular-nums">
                  W{waveIdx + 1}
                </span>
                <span
                  className={`h-3 w-40 rounded bg-foreground/10 ${reduced ? "" : "animate-pulse"}`}
                />
              </div>
              <div className="space-y-1.5">
                {Array.from({ length: cardCount }).map((_, cardIdx) => (
                  <SkeletonCard
                    key={cardIdx}
                    delayClass={`stagger-${Math.min(6, waveIdx * 2 + cardIdx + 1)}`}
                    reduced={reduced}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SkeletonCard({ delayClass, reduced }: { delayClass: string; reduced: boolean }) {
  return (
    <div
      className={`rounded-md border border-border/60 bg-card/40 px-3 py-2.5 ${
        reduced ? "" : `animate-scale-in ${delayClass}`
      }`}
    >
      <div className="space-y-1.5">
        <div className={`h-3 w-2/3 rounded bg-foreground/10 ${reduced ? "" : "animate-pulse"}`} />
        <div className={`h-2.5 w-1/2 rounded bg-foreground/5 ${reduced ? "" : "animate-pulse"}`} />
        <div className={`h-2 w-1/3 rounded bg-foreground/5 ${reduced ? "" : "animate-pulse"}`} />
      </div>
    </div>
  );
}
