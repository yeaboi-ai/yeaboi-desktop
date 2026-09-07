'use client';

// The suggested rows, unfolded only when the reader asks for them: the
// sidecar is read on mount, so an empty ledger that never asks never reads a
// connection. Three states below the head row: a skeleton while the
// connections are read, a ghost row per suggestion, or one small note when
// there is nothing to suggest from.

import { useRef } from 'react';
import Link from 'next/link';
import { RotateCw } from 'lucide-react';
import { GhostSkeleton } from '@/components/projects/ghost-skeleton';
import { LedgerHead } from '@/components/projects/ledger-head';
import { RunTrace } from '@/components/projects/run-trace';
import { useProjectSuggestions } from '@/hooks/use-project-suggestions';
import { LEDGER_ROW, START_FROM_LABEL } from '@/lib/yeaboi/ledger';
import { traceFor } from '@/lib/yeaboi/projects';
import type { FlowStep } from '@/lib/yeaboi/reads';
import {
  emptyNote,
  factsLine,
  ghostState,
  readingLine,
  type EmptyNote,
} from '@/lib/yeaboi/suggestions';

function GhostRow({
  text,
  facts,
  steps,
  onPick,
}: {
  text: string;
  facts?: string;
  steps: FlowStep[];
  onPick: (from: HTMLElement, text: string) => void;
}) {
  const words = useRef<HTMLSpanElement>(null);
  const trace = traceFor(steps, undefined);
  return (
    <li>
      <button
        type="button"
        onClick={() => words.current && onPick(words.current, text)}
        className={`group w-full text-left ${LEDGER_ROW}`}
      >
        <span className="min-w-0">
          <span
            ref={words}
            className="line-clamp-2 font-display text-[18px] leading-tight text-foreground/70 transition-colors group-hover:text-foreground"
          >
            {text}
          </span>
          {facts && (
            <span className="mt-0.5 block truncate text-[13px] font-body text-muted-foreground">
              {facts}
            </span>
          )}
        </span>
        <span className="hidden md:contents">
          <RunTrace trace={trace} variant="dots" />
        </span>
        <span className="text-[12px] font-body text-muted-foreground transition-colors group-hover:text-foreground md:text-right">
          {START_FROM_LABEL}
        </span>
      </button>
    </li>
  );
}

/** The one small line shown when there is nothing to suggest from. */
function NoteLine({
  note,
  refreshing,
  onRetry,
}: {
  note: EmptyNote;
  refreshing: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="pt-5 pb-3 text-[13px] font-body leading-snug text-muted-foreground">
      {note.detail && <p>{note.text}</p>}
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>{note.detail ?? note.text}</span>
        {note.retry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 text-foreground/80 transition-colors hover:text-foreground disabled:opacity-60"
          >
            <RotateCw aria-hidden className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
            {note.retry}
          </button>
        )}
        {note.link && (
          <Link
            href={note.link.href}
            className="text-foreground/80 transition-colors hover:text-foreground"
          >
            {note.link.label}
          </Link>
        )}
      </p>
    </div>
  );
}

export function SuggestedProjects({
  steps,
  colors,
  onPick,
}: {
  steps: FlowStep[];
  colors: Record<string, string>;
  onPick: (from: HTMLElement, text: string) => void;
}) {
  const { sheet, exhausted, failed, refreshing, retry } = useProjectSuggestions();
  const ghost = ghostState(sheet, exhausted, failed);
  // The column heads label rows; a note has none to head.
  const headed = ghost === 'loading' || ghost === 'rows';
  return (
    <div className="animate-fade-in" aria-label="Suggested projects">
      {headed && <LedgerHead steps={steps} colors={colors} />}
      {ghost === 'loading' ? (
        <GhostSkeleton steps={steps} caption={readingLine(sheet)} />
      ) : ghost === 'rows' ? (
        <ul className="divide-y divide-border/50" aria-label="Start from one of these">
          {(sheet?.suggestions ?? []).map((suggestion) => (
            <GhostRow
              key={suggestion.id}
              text={suggestion.text}
              facts={factsLine(suggestion)}
              steps={steps}
              onPick={onPick}
            />
          ))}
        </ul>
      ) : (
        <NoteLine
          note={emptyNote(sheet ?? null, exhausted, failed)}
          refreshing={refreshing}
          onRetry={retry}
        />
      )}
    </div>
  );
}
