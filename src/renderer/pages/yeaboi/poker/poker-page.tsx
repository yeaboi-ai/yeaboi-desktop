'use client';

// Planning poker — the saved-sessions hub, and the way into a live table.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DuckMark } from '@/components/brand/duck';
import { type BoardSnapshot, type PokerRun, loadBoards, pokerHistory } from '@/lib/yeaboi/boards';
import { ResultActions } from '@/components/yeaboi/result-actions';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { RunCard, Surface } from '@/components/yeaboi/surface';
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
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {runs.map((run) => (
            <RunCard
              key={run.id}
              title={run.scope_label || run.poker_date}
              meta={run.poker_date}
              figures={[
                { label: 'Tickets', value: String(run.ticket_count ?? 0) },
                { label: 'Estimated', value: String(run.estimated_count ?? 0) },
              ]}
            >
              {/* Export only. A poker session has no share document in any
                  surface — the estimates go back to the tracker instead. */}
              <ResultActions
                refer={{ kind: 'poker', session_id: run.session_id, run_id: run.id }}
                mode="poker"
              />
            </RunCard>
          ))}
        </div>
      )}

      {runs && runs.length === 0 && (
        <Section title="No sessions yet">
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <DuckMark state="idle" size={28} /> Pick a sprint or the backlog, send the invite, and
            everyone votes at once — no anchoring on whoever spoke first.
          </p>
        </Section>
      )}
    </div>
  );
}

export default function PokerPage() {
  return (
    <BackendGate>
      <Surface>
        <PokerBody />
      </Surface>
    </BackendGate>
  );
}
