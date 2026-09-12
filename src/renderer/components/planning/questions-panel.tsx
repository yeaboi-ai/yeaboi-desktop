'use client';

// The intake at a glance: every question this plan touches, its answer, and
// which ones are still owed. One panel behind three terminal affordances —
// /questions, /form and a bare /edit. Re-asking is an ordinary turn: the
// intake node consumes `edit N` itself.

import { useEffect, useState } from 'react';
import { type QuestionPlan, loadQuestions } from '@/lib/yeaboi/chat';

export interface QuestionsPanelProps {
  sessionId: string;
  /** Disabled while a turn is running — a re-ask is a turn of its own. */
  busy: boolean;
  onAsk: (number: number) => void;
  onClose: () => void;
}

export function QuestionsPanel({ sessionId, busy, onAsk, onClose }: QuestionsPanelProps) {
  const [plan, setPlan] = useState<QuestionPlan | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    loadQuestions(sessionId).then(setPlan, (e: Error) => setError(e.message));
  }, [sessionId]);

  const rows = plan?.questions ?? [];
  const owed = rows.filter((row) => row.remaining).length;

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-background/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="The questions"
        className="max-h-[80vh] w-[560px] max-w-[calc(100vw-3rem)] overflow-y-auto rounded-2xl bg-card p-5 shadow-2xl ring-1 ring-border/70"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-[18px] text-foreground">The questions</h2>
          <button
            type="button"
            className="text-[12px] text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            Close
          </button>
        </header>

        {error && <p className="text-[12px] text-destructive">{error}</p>}
        {!plan && !error && <p className="text-[12px] text-muted-foreground">Loading…</p>}

        {plan && rows.length === 0 && (
          <p className="text-[12px] text-muted-foreground">
            Nothing yet. Describe the project and the plan works out which questions it needs.
          </p>
        )}

        {plan && rows.length > 0 && (
          <>
            <p className="mb-3 text-[12px] text-muted-foreground">
              {plan.derived
                ? `${rows.length - owed} answered, ${owed} to go`
                : 'The remaining questions could not be worked out; these are the answers so far.'}
            </p>
            <ul className="space-y-1.5">
              {rows.map((row) => (
                <li key={row.number}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      onAsk(row.number);
                      onClose();
                    }}
                    title={row.remaining ? 'Answer this one next' : 'Change this answer'}
                    className={`w-full rounded-xl px-3 py-2 text-left transition-colors disabled:opacity-50 ${
                      row.remaining
                        ? 'bg-primary/5 ring-1 ring-primary/25 hover:bg-primary/10'
                        : 'bg-secondary/40 hover:bg-secondary/70'
                    }`}
                  >
                    <span className="block text-[12px] font-medium text-foreground">
                      {row.number}. {row.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {row.answer || (row.skipped ? 'skipped' : 'not answered yet')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-muted-foreground/70">
              Pick one to answer or change it, and it is asked next.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
