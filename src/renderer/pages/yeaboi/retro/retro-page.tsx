'use client';

// Retro — the saved-runs hub, and the way into a live board.
//
// A live board rejoins rather than restarts: the session lives in the backend
// so a reloaded window walks back into the ceremony it left.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DuckMark } from '@/components/brand/duck';
import {
  type BoardSnapshot,
  type RetroRun,
  loadBoards,
  retroHistory,
  startRetroBoard,
} from '@/lib/yeaboi/boards';
import { ResultActions } from '@/components/yeaboi/result-actions';
import { ContextPicker } from '@/components/context/context-picker';
import { useContextScope } from '@/hooks/yeaboi/use-context-scope';
import { PageShell } from '@/components/page-shell';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { Button, buttonVariants } from '@/components/ui/button';

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

function RetroBody() {
  const router = useRouter();
  const [runs, setRuns] = useState<RetroRun[] | null>(null);
  // The session the history belongs to is a sibling of the rows, not a column
  // on them — an artifact reference needs both halves.
  const [sessionId, setSessionId] = useState('');
  const [live, setLive] = useState<BoardSnapshot | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const reads = useContextScope('retro');

  useEffect(() => {
    retroHistory().then(
      (envelope) => {
        setRuns(envelope.data?.history ?? []);
        setSessionId(envelope.data?.session_id ?? '');
      },
      (e: Error) => setError(e.message),
    );
    loadBoards().then(
      (body) => setLive(body.boards.find((board) => board.kind === 'retro') ?? null),
      () => undefined,
    );
  }, []);

  async function start() {
    setBusy(true);
    setError('');
    try {
      const board = await startRetroBoard({ ...reads.body() });
      router.push(`/team/retro/board?id=${encodeURIComponent(board.board_id)}`);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  if (error && !runs) return <Notice title="Could not load past retros" items={[error]} />;

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-foreground">Retro</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            A live board your team fills in from their browsers, and every retro before it.
          </p>
        </div>
        {live ? (
          <Link
            href={`/team/retro/board?id=${encodeURIComponent(live.board_id)}`}
            className={buttonVariants({ size: 'sm' })}
          >
            Rejoin the live board
          </Link>
        ) : (
          <Button size="sm" disabled={busy} onClick={() => void start()}>
            {busy ? 'Opening…' : 'Start a retro'}
          </Button>
        )}
      </header>

      {!live && (
        <ContextPicker
          mode="retro"
          options={reads.options}
          scope={reads.scope}
          onChange={reads.setScope}
          disabled={busy}
        />
      )}

      {error && <Notice title="Could not start the board" items={[error]} />}
      {!runs && <p className="text-[13px] text-muted-foreground">Loading…</p>}

      {runs && runs.length > 0 && (
        <div className="space-y-3">
          {runs.map((run) => (
            <Section key={run.id} title={run.sprint_name || run.retro_date}>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Date" value={run.retro_date} />
                <Stat label="Cards" value={String(run.card_count ?? 0)} />
                <Stat label="Actions" value={String(run.action_count ?? 0)} />
              </div>
              <ResultActions
                refer={{ kind: 'retro', session_id: sessionId, run_id: run.id }}
                mode="retro"
              />
            </Section>
          ))}
        </div>
      )}

      {runs && runs.length === 0 && (
        <Section title="No retros yet">
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <DuckMark state="idle" size={28} /> Start a board and send the invite — everyone adds
            cards from their own browser, and yeaboi drafts the action items when you are done.
          </p>
        </Section>
      )}
    </div>
  );
}

export default function RetroPage() {
  return (
    <PageShell width="narrow">
      <BackendGate>
        <RetroBody />
      </BackendGate>
    </PageShell>
  );
}
