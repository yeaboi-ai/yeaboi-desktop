'use client';

import { useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import type { Suggestion } from '@/hooks/use-suggestions';

interface SuggestionReviewRowProps {
  suggestion: Suggestion;
  /** ``replace`` only meaningful when the suggestion has a ``supersedes_bullet``;
   *  defaults to false so additive suggestions land alongside existing content. */
  onAccept: (id: string, editedContent?: string, replace?: boolean) => void | Promise<void>;
  onReject: (id: string) => void | Promise<void>;
}

/**
 * Single suggestion row used by the post-session review screen.
 *
 * Shares the action surface with the in-session SuggestionsList component
 * but flatter and more explicit — the review screen is the user's deliberate
 * "approve everything that should land" moment, so we widen the buttons,
 * lift the conflict UI out of a tiny callout, and avoid the section grouping
 * (the parent already groups by section).
 */
export function SuggestionReviewRow({ suggestion, onAccept, onReject }: SuggestionReviewRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(suggestion.content);
  const [busy, setBusy] = useState(false);
  const hasConflict = !!suggestion.supersedes_bullet;

  async function run(fn: () => Promise<void> | void) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border/60 bg-card/50 p-3">
      {hasConflict && (
        <div className="mb-2 rounded-md bg-warning/[0.06] border border-warning/20 px-2.5 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-warning/80 mb-0.5">Replaces</div>
          <div className="text-[12px] text-muted-foreground line-through whitespace-pre-wrap leading-snug">
            {suggestion.supersedes_bullet}
          </div>
        </div>
      )}
      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={Math.min(8, Math.max(2, draft.split('\n').length))}
          className="w-full resize-y bg-foreground/[0.04] border border-border/70 rounded-md px-2 py-1.5 text-[13px] text-foreground leading-relaxed focus:outline-none focus:border-border"
          autoFocus
        />
      ) : (
        <pre className="text-[13px] text-foreground/95 leading-relaxed whitespace-pre-wrap font-sans m-0">
          {suggestion.content}
        </pre>
      )}
      <div className="mt-2.5 flex items-center justify-end gap-2">
        {editing ? (
          <>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(suggestion.content);
              }}
              className="px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground rounded-md hover:bg-foreground/[0.05]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                run(async () => {
                  await onAccept(suggestion.id, draft, hasConflict);
                })
              }
              disabled={busy}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-success hover:text-success rounded-md bg-success/10 hover:bg-success/15 disabled:opacity-50"
            >
              <Check className="h-3 w-3" />
              {hasConflict ? 'Save & replace' : 'Save & accept'}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={busy}
              aria-label="Edit suggestion"
              className="p-1.5 text-muted-foreground/70 hover:text-foreground/90 rounded-md hover:bg-foreground/[0.05] disabled:opacity-50"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() =>
                run(async () => {
                  await onReject(suggestion.id);
                })
              }
              disabled={busy}
              className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-muted-foreground hover:text-destructive rounded-md hover:bg-destructive/10 disabled:opacity-50"
            >
              <X className="h-3 w-3" />
              Reject
            </button>
            {hasConflict ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    run(async () => {
                      await onAccept(suggestion.id, undefined, false);
                    })
                  }
                  disabled={busy}
                  className="px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground rounded-md hover:bg-foreground/[0.05] disabled:opacity-50"
                  title="Add the new bullet alongside the existing one"
                >
                  Keep both
                </button>
                <button
                  type="button"
                  onClick={() =>
                    run(async () => {
                      await onAccept(suggestion.id, undefined, true);
                    })
                  }
                  disabled={busy}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-amber-200 hover:text-amber-100 rounded-md bg-warning/15 hover:bg-warning/25 disabled:opacity-50"
                >
                  <Check className="h-3 w-3" />
                  Replace
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() =>
                  run(async () => {
                    await onAccept(suggestion.id);
                  })
                }
                disabled={busy}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-success hover:text-success rounded-md bg-success/10 hover:bg-success/15 disabled:opacity-50"
              >
                <Check className="h-3 w-3" />
                Accept
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
