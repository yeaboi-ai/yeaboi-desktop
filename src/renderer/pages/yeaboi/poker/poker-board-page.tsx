'use client';

// The live poker table's host view — where the room is up to, the invite, and
// the way out. The voting itself happens in the board window (and in every
// participant's browser); this page is the host's strip beside it.
//
// Vote secrecy is the board's own rule, not this page's: while the phase is
// `voting` the snapshot carries who has voted and nothing about what they
// voted, so there is nothing here to leak.

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'react-router';
import { BoardHost, useBoard } from '@/components/yeaboi/board-host';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { buttonVariants } from '@/components/ui/button';

interface PokerState {
  phase: string;
  ticket_index: number;
  ticket_count: number;
  ticket: { key?: string; summary?: string } | null;
  progress: { estimated: number; total: number };
  presence: { name: string; avatar: string }[];
  votes: { name: string; voted?: boolean; value?: string }[];
  median: number | null;
  suggestion: string | null;
  notice?: string;
}

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

function PokerBoardBody({ boardId }: { boardId: string }) {
  const [board, error] = useBoard(boardId);
  const [closed, setClosed] = useState(0);

  if (closed) {
    return (
      <Section title="Session recorded">
        <p className="text-[13px] text-muted-foreground">
          The table is closed and the estimates are saved.
        </p>
        <div className="mt-3">
          <Link href="/team/poker" className={buttonVariants({ size: 'sm' })}>
            Back to the sessions
          </Link>
        </div>
      </Section>
    );
  }
  if (error) return <Notice title="This table is not live" items={[error]} />;
  if (!boardId) return <Notice title="No table" items={['Start one from the Poker page.']} />;
  if (!board) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  const state = board.state as unknown as PokerState;
  const voting = state.phase === 'voting';

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl text-foreground">Poker — {board.title}</h1>
        <p className="text-[13px] text-muted-foreground mt-1">
          Everyone votes at once, so nobody anchors on whoever spoke first.
        </p>
      </header>

      <BoardHost board={board} onClosed={(runId) => setClosed(runId || -1)} />

      {state.notice && <Notice title="Table" items={[state.notice]} />}

      <Section
        title={
          state.ticket ? `${state.ticket.key ?? ''} ${state.ticket.summary ?? ''}` : 'No ticket'
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Ticket" value={`${state.ticket_index + 1} / ${state.ticket_count}`} />
          <Stat label="Estimated" value={`${state.progress.estimated} / ${state.progress.total}`} />
          <Stat label="At the table" value={String(state.presence.length)} />
          <Stat label="Phase" value={voting ? 'voting' : 'revealed'} />
        </div>
        {!voting && state.suggestion && (
          <p className="text-[12px] text-muted-foreground mt-3">
            Median {state.median ?? '—'} · suggestion{' '}
            <strong className="text-foreground">{state.suggestion}</strong>
          </p>
        )}
        <ul className="space-y-1.5 mt-3">
          {state.votes.map((vote) => (
            <li key={vote.name} className="text-[13px] text-foreground">
              {vote.name}
              {/* While voting, the board sends who has voted and nothing more. */}
              <span className="text-[12px] text-muted-foreground">
                {' '}
                — {voting ? (vote.voted ? 'voted' : 'thinking…') : (vote.value ?? '—')}
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

export default function PokerBoardPage() {
  const [searchParams] = useSearchParams();
  /** The `?id=` this board page was opened with. */
  const boardId = searchParams.get('id') ?? '';
  return (
    <BackendGate>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <PokerBoardBody boardId={boardId} />
      </div>
    </BackendGate>
  );
}
