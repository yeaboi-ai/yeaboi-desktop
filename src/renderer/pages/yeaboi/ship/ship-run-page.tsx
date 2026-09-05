'use client';

// One ship run: the phase checklist, the approval gate, the result.
//
// The run lives in the backend, so this page polls rather than streams — a
// reload walks back into the run it left instead of abandoning a coding agent
// mid-diff. The gate is answered through the store, which arbitrates whoever
// answers first: `taken: false` means somebody else got there.
//
// A run launched from a bridged board card carries ?card=<id>; when the run
// finishes, its outcome is posted onto that card as a comment so the board
// tells the story too.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'react-router';
import { type ShipSnapshot, answerGate, cancelShip, loadShipRun } from '@/lib/yeaboi/modes';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { PageShell } from '@/components/page-shell';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { Button } from '@/components/ui/button';

const POLL_MS = 1500;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card ring-1 ring-border/60 p-5">
      <h2 className="text-[13px] font-body font-medium text-foreground mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary/40 px-3 py-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-[12px] font-mono text-foreground break-all">{value}</p>
    </div>
  );
}

function RunBody({ runKey, cardId }: { runKey: string; cardId: string }) {
  const { authFetch, ready } = useAuthFetch();
  const [run, setRun] = useState<ShipSnapshot | null>(null);
  const [comment, setComment] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const reported = useRef(false);

  useEffect(() => {
    if (!runKey) return;
    let stop = false;
    const tick = () => {
      loadShipRun(runKey).then(
        (snapshot) => {
          if (stop) return;
          setRun(snapshot);
          // Polling stops when the run does — nothing about a finished run
          // changes, and a timer that never clears is a leak per visit.
          if (!snapshot.finished) window.setTimeout(tick, POLL_MS);
        },
        (e: Error) => {
          if (!stop) setError(e.message);
        },
      );
    };
    tick();
    return () => {
      stop = true;
    };
  }, [runKey]);

  // The board half of a bridged run: one comment with the outcome, once.
  useEffect(() => {
    if (!cardId || !ready || reported.current || !run?.finished) return;
    reported.current = true;
    const result = (run.result ?? {}) as Record<string, unknown>;
    const outcome = run.failure
      ? `Ship run stopped: ${run.failure}`
      : `Ship run ${String(result['status'] ?? 'finished')}${
          result['pr_url'] ? ` — ${String(result['pr_url'])}` : ''
        }${result['branch'] ? ` (branch ${String(result['branch'])})` : ''}`;
    void authFetch(`/api/cards/${cardId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: outcome }),
    }).catch(() => undefined);
  }, [cardId, ready, run, authFetch]);

  if (!runKey)
    return (
      <p className="text-[13px] text-muted-foreground">No run — launch one from Ship first.</p>
    );
  if (error && !run)
    return <p className="text-[13px] text-destructive">Could not read the run: {error}</p>;
  if (!run) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  async function resolve(resolution: 'approved' | 'rejected') {
    try {
      const answer = await answerGate(runKey, resolution, resolution === 'rejected' ? comment : '');
      setMessage(answer.taken ? `Gate ${resolution}.` : 'The gate was already answered.');
      setRejecting(false);
      setComment('');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const result = run.result as Record<string, string> | null;

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-foreground">
            {run.story_title || run.story_id}
          </h1>
          <p className="text-[12px] font-mono text-muted-foreground mt-1">{run.repo}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!run.finished && (
            <Button
              variant="outline"
              size="sm"
              disabled={run.cancelling}
              onClick={() => void cancelShip(runKey)}
            >
              {run.cancelling ? 'Stopping…' : 'Stop'}
            </Button>
          )}
          <Link
            href="/team/ship"
            className="text-[12px] text-muted-foreground hover:text-foreground"
          >
            Back
          </Link>
        </div>
      </header>

      {message && <p className="text-[12px] text-muted-foreground">{message}</p>}
      {error && <p className="text-[12px] text-destructive">{error}</p>}
      {run.failure && (
        <div className="rounded-2xl bg-card ring-1 ring-destructive/30 p-4">
          <p className="text-[13px] font-medium text-foreground">The run stopped</p>
          <p className="text-[12px] text-muted-foreground mt-1">{run.failure}</p>
        </div>
      )}

      {run.board.url && (
        <Section title="Watching along">
          <p className="text-[12px] text-muted-foreground">
            <a href={run.board.url} className="text-primary hover:underline">
              {run.board.url}
            </a>{' '}
            · code <strong className="text-foreground">{run.board.code}</strong>
          </p>
        </Section>
      )}

      <Section title={run.finished ? 'Phases' : 'Working…'}>
        <ul className="space-y-1.5">
          {run.phases.map((phase) => (
            <li key={phase.component_id} className="flex items-baseline gap-2 text-[13px]">
              <strong className="font-body font-medium text-foreground">{phase.label}</strong>
              <span className="text-[11px] text-muted-foreground">{phase.status}</span>
              {phase.detail && (
                <span className="text-[11px] text-muted-foreground/70">{phase.detail}</span>
              )}
            </li>
          ))}
          {run.phases.length === 0 && (
            <li className="text-[12px] text-muted-foreground">Setting up…</li>
          )}
        </ul>
      </Section>

      {run.gate && (
        <Section title="Your approval">
          <div className="grid grid-cols-3 gap-3 mb-3">
            <Stat label="Branch" value={run.gate.branch || '—'} />
            <Stat label="Diff" value={run.gate.diff_stat || '—'} />
            <Stat label="Cost" value={`$${(run.gate.cost_usd ?? 0).toFixed(2)}`} />
          </div>
          <pre className="max-h-[420px] overflow-auto rounded-xl bg-secondary/40 p-3 font-mono text-[11px] leading-snug text-foreground whitespace-pre">
            {run.gate.diff_text}
          </pre>
          {rejecting ? (
            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                value={comment}
                placeholder="What should change?"
                onChange={(e) => setComment(e.target.value)}
                className="flex-1 rounded-lg bg-secondary/40 border border-border/40 px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
              <Button variant="outline" size="sm" onClick={() => void resolve('rejected')}>
                Send rejection
              </Button>
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2">
              <Button size="sm" onClick={() => void resolve('approved')}>
                Approve
              </Button>
              <Button variant="outline" size="sm" onClick={() => setRejecting(true)}>
                Reject
              </Button>
            </div>
          )}
        </Section>
      )}

      {result && (
        <Section title="Result">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Status" value={String(result.status ?? '')} />
            <Stat label="Branch" value={String(result.branch ?? '—')} />
            <Stat label="Cost" value={`$${Number(result.cost_usd ?? 0).toFixed(2)}`} />
          </div>
          {result.pr_url && (
            <p className="mt-3">
              <a href={String(result.pr_url)} className="text-[13px] text-primary hover:underline">
                {String(result.pr_url)}
              </a>
            </p>
          )}
        </Section>
      )}
    </div>
  );
}

export default function ShipRunPage() {
  const [searchParams] = useSearchParams();
  const runKey = searchParams.get('key') ?? '';
  const cardId = searchParams.get('card') ?? '';
  return (
    <PageShell width="narrow">
      <BackendGate>
        <RunBody key={runKey} runKey={runKey} cardId={cardId} />
      </BackendGate>
    </PageShell>
  );
}
