'use client';

// Planning poker — the saved-sessions hub, and the way into a live table.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DuckMark } from '@/components/brand/duck';
import { type BoardSnapshot, type PokerRun, loadBoards, pokerHistory } from '@/lib/yeaboi/boards';
import { ResultActions } from '@/components/yeaboi/result-actions';
import { PageShell } from '@/components/page-shell';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { buttonVariants } from '@/components/ui/button';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card ring-1 ring-border/60 p-5">
      <h2 className="text-[13px] font-body font-medium text-foreground mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Notice({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl bg-card ring-1 ring-destructive/30 p-4">
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      {items.map((item) => (
        <p key={item} className="text-[12px] text-muted-foreground mt-1">
          {item}
        </p>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary/40 px-3 py-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-[12px] text-foreground break-all">{value}</p>
    </div>
  );
}

function PokerBody() {
  const [runs, setRuns] = useState<PokerRun[] | null>(null);
  const [live, setLive] = useState<BoardSnapshot | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    pokerHistory().then(
      (envelope) => setRuns(envelope.data?.history ?? []),
      (e: Error) => setError(e.message),
    );
    loadBoards().then(
      (body) => setLive(body.boards.find((board) => board.kind === 'poker') ?? null),
      () => undefined,
    );
  }, []);

  if (error && !runs) return <Notice title="Could not load past sessions" items={[error]} />;

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-foreground">Planning poker</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            The team estimates from their own browsers; the points go back to the board.
          </p>
        </div>
        {live ? (
          <Link
            href={`/team/poker/board?id=${encodeURIComponent(live.board_id)}`}
            className={buttonVariants({ size: 'sm' })}
          >
            Rejoin the live table
          </Link>
        ) : (
          <Link href="/team/poker/new" className={buttonVariants({ size: 'sm' })}>
            New session
          </Link>
        )}
      </header>

      {!runs && <p className="text-[13px] text-muted-foreground">Loading…</p>}

      {runs && runs.length > 0 && (
        <div className="space-y-3">
          {runs.map((run) => (
            <Section key={run.id} title={run.scope_label || run.poker_date}>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Date" value={run.poker_date} />
                <Stat label="Tickets" value={String(run.ticket_count ?? 0)} />
                <Stat label="Estimated" value={String(run.estimated_count ?? 0)} />
              </div>
              {/* Export only. A poker session has no share document in any
                  surface — the estimates go back to the tracker instead. */}
              <ResultActions
                refer={{ kind: 'poker', session_id: run.session_id, run_id: run.id }}
                mode="poker"
              />
            </Section>
          ))}
        </div>
      )}

      {runs && runs.length === 0 && (
        <Section title="No sessions yet">
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <DuckMark state="idle" size={28} /> Pick a sprint or the backlog, send the invite, and
            everyone votes at once — no anchoring on whoever spoke first.
          </div>
        </Section>
      )}
    </div>
  );
}

export default function PokerPage() {
  return (
    <PageShell width="narrow">
      <BackendGate>
        <PokerBody />
      </BackendGate>
    </PageShell>
  );
}
