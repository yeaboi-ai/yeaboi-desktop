'use client';

// Ship — pick a story, name the repo, launch.
//
// Two places a story can come from: the latest yeaboi plan (the TUI's own
// list), and yeaboi-sourced cards on the kanban board (the bridge stamps
// yeaboi_story_id on those; the platform orchestrator skips them, because
// this engine — worktree, diff gate, your approval — is the one that runs
// them).
//
// The repo is resolved by the backend before anything starts: what a run
// writes to is the git toplevel, not the typed path, and that is also what
// the sandbox must have granted. A refusal here is a sentence, not a failed
// run.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DuckMark } from '@/components/brand/duck';
import {
  type ShipSnapshot,
  type ShipStories,
  type ShipTarget,
  launchShip,
  loadShipRuns,
  loadStories,
  resolveRepo,
} from '@/lib/yeaboi/modes';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { Button } from '@/components/ui/button';

interface BoardStory {
  cardId: string;
  title: string;
  column: string;
  storyId: string;
  sessionId: string;
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
    <div className="rounded-2xl bg-card ring-1 ring-border/60 p-4">
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      {items.map((item) => (
        <p key={item} className="text-[12px] text-muted-foreground mt-1">
          {item}
        </p>
      ))}
    </div>
  );
}

/** Every board card the bridge made, wherever it sits. */
function useBoardStories(): BoardStory[] {
  const { authFetch, ready } = useAuthFetch();
  const [rows, setRows] = useState<BoardStory[]>([]);
  useEffect(() => {
    if (!ready) return;
    authFetch('/api/board')
      .then((r) => (r.ok ? r.json() : { columns: [] }))
      .then((board: { columns?: { name?: string; cards?: Record<string, unknown>[] }[] }) => {
        const found: BoardStory[] = [];
        for (const column of board.columns ?? []) {
          for (const card of column.cards ?? []) {
            const fields = (card['custom_fields'] ?? {}) as Record<string, unknown>;
            const storyId = String(fields['yeaboi_story_id'] ?? '');
            if (!storyId) continue;
            found.push({
              cardId: String(card['id'] ?? ''),
              title: String(card['title'] ?? storyId),
              column: column.name ?? '',
              storyId,
              sessionId: String(fields['yeaboi_session_id'] ?? ''),
            });
          }
        }
        setRows(found);
      })
      .catch(() => setRows([]));
  }, [ready, authFetch]);
  return rows;
}

function ShipBody() {
  const router = useRouter();
  const [plan, setPlan] = useState<ShipStories | null>(null);
  const [selected, setSelected] = useState<{ id: string; title: string; sessionId: string } | null>(
    null,
  );
  const [cardId, setCardId] = useState('');
  const [repo, setRepo] = useState('');
  const [check, setCheck] = useState('');
  const [target, setTarget] = useState<ShipTarget | null>(null);
  const [live, setLive] = useState<ShipSnapshot[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const boardStories = useBoardStories();

  useEffect(() => {
    loadStories().then(
      (body) => {
        setPlan(body);
        setRepo(body.default_repo);
        const first = body.stories[0];
        if (first) setSelected({ id: first.id, title: first.title, sessionId: body.session_id });
      },
      (e: Error) => setError(e.message),
    );
    loadShipRuns().then(
      (body) => setLive(body.runs.filter((row) => !row.finished)),
      () => undefined,
    );
  }, []);

  // Resolving costs a git call, so it follows the field rather than every
  // keystroke's render.
  useEffect(() => {
    if (!repo) return;
    let stale = false;
    const timer = window.setTimeout(() => {
      resolveRepo(repo).then(
        (found) => {
          if (!stale) setTarget(found);
        },
        () => undefined,
      );
    }, 400);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [repo]);

  if (error && !plan) return <Notice title="Could not open Ship" items={[error]} />;
  if (!plan) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  async function launch() {
    if (busy || !selected) return;
    setBusy(true);
    setError('');
    try {
      const snapshot = await launchShip({
        story_id: selected.id,
        story_title: selected.title,
        repo,
        session_id: selected.sessionId,
        check_command: check,
      });
      const suffix = cardId ? `&card=${encodeURIComponent(cardId)}` : '';
      router.push(`/team/ship/run?key=${encodeURIComponent(snapshot.key)}${suffix}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const pick = (id: string, title: string, sessionId: string, fromCard = '') => {
    setSelected({ id, title, sessionId });
    setCardId(fromCard);
  };

  const radio = (checked: boolean) =>
    `flex items-start gap-2.5 rounded-xl px-3 py-2 text-left w-full transition-colors ${
      checked ? 'bg-primary/10 ring-1 ring-primary/40' : 'bg-secondary/40 hover:bg-secondary/70'
    }`;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-foreground">Ship</h1>
        <p className="text-[13px] text-muted-foreground mt-1">
          A story from your plan, implemented behind your approval.
        </p>
      </div>

      {error && <Notice title="Could not launch" items={[error]} />}
      {plan.problem && <Notice title="Saved plans" items={[plan.problem]} />}

      {live.length > 0 && (
        <Section title="Still running">
          <ul className="space-y-1.5">
            {live.map((row) => (
              <li key={row.key}>
                <button
                  type="button"
                  onClick={() => router.push(`/team/ship/run?key=${encodeURIComponent(row.key)}`)}
                  className="text-[13px] text-primary hover:underline"
                >
                  {row.story_title || row.story_id}
                </button>{' '}
                <span className="text-[11px] text-muted-foreground">{row.repo}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {boardStories.length > 0 && (
        <Section title="From the board">
          <p className="text-[12px] text-muted-foreground mb-2">
            Cards this plan put on the kanban board. The platform&apos;s own agent leaves these
            alone — launching here runs them through yeaboi&apos;s worktree + approval gate.
          </p>
          <div className="space-y-1.5">
            {boardStories.map((row) => (
              <button
                key={row.cardId}
                type="button"
                className={radio(selected?.id === row.storyId && cardId === row.cardId)}
                onClick={() => pick(row.storyId, row.title, row.sessionId, row.cardId)}
              >
                <span>
                  <strong className="block text-[13px] font-body font-medium text-foreground">
                    {row.title}
                  </strong>
                  <span className="block text-[11px] text-muted-foreground">
                    {row.column} · {row.storyId}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </Section>
      )}

      {plan.stories.length === 0 && boardStories.length === 0 ? (
        <Section title="No stories yet">
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <DuckMark state="idle" size={28} /> {plan.empty_message}
          </p>
        </Section>
      ) : (
        <>
          {plan.stories.length > 0 && (
            <Section title={plan.project_name || 'Latest plan'}>
              <div className="space-y-1.5">
                {plan.stories.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className={radio(selected?.id === row.id && !cardId)}
                    onClick={() => pick(row.id, row.title, plan.session_id)}
                  >
                    <span>
                      <strong className="block text-[13px] font-body font-medium text-foreground">
                        {row.id} — {row.title}
                      </strong>
                      <span className="block text-[11px] text-muted-foreground">
                        {row.points} pts · {row.criteria} acceptance criteria
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </Section>
          )}

          <Section title="Where">
            <label className="block mb-3">
              <span className="text-[11px] font-body text-muted-foreground uppercase tracking-wide">
                Repository
              </span>
              <input
                type="text"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                className="mt-1 w-full rounded-lg bg-secondary/40 border border-border/40 px-3 py-2 text-[13px] font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </label>
            <label className="block mb-3">
              <span className="text-[11px] font-body text-muted-foreground uppercase tracking-wide">
                Check command
              </span>
              <input
                type="text"
                value={check}
                placeholder="make test (optional)"
                onChange={(e) => setCheck(e.target.value)}
                className="mt-1 w-full rounded-lg bg-secondary/40 border border-border/40 px-3 py-2 text-[13px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </label>
            {target && (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-secondary/40 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    Resolves to
                  </p>
                  <p className="text-[12px] font-mono text-foreground break-all">
                    {target.repo || '—'}
                  </p>
                </div>
                <div className="rounded-xl bg-secondary/40 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    Granted
                  </p>
                  <p className="text-[12px] text-foreground">{target.allowed ? 'yes' : 'no'}</p>
                </div>
              </div>
            )}
            {target?.problem && (
              <p className="mt-2 text-[12px] text-destructive">{target.problem}</p>
            )}
            {target?.consent_hint && (
              <p className="mt-2 text-[12px] text-muted-foreground">{target.consent_hint}</p>
            )}
          </Section>

          <Button
            disabled={busy || !selected || !target?.allowed || Boolean(target?.problem)}
            onClick={() => void launch()}
          >
            {busy ? 'Launching…' : 'Launch'}
          </Button>
        </>
      )}
    </div>
  );
}

export default function ShipPage() {
  return (
    <BackendGate>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <ShipBody />
      </div>
    </BackendGate>
  );
}
