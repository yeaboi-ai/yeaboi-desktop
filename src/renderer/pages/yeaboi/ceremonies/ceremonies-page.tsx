'use client';

// Ceremonies — the clock every mode can run on.
//
// Two things this page is careful about, both inherited from the terminal one.
// Drift is shown first: the store says what is declared, the OS says what will
// fire, and nothing else in the app would ever mention the gap. And Run now is
// not a scheduled fire — the guards that answer "is this too late to be
// useful" belong to an unattended run, not to somebody pressing a button.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DuckMark } from '@/components/brand/duck';
import {
  // Aliased: the page component itself claims the `CeremoniesPage` name.
  type CeremoniesPage as CeremoniesSnapshot,
  type CeremonyRow,
  loadCeremonies,
  removeCeremony,
  runCeremony,
  setCeremonyEnabled,
} from '@/lib/yeaboi/ops';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { DeclareCeremony } from '@/components/yeaboi/declare-ceremony';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type Category = 'todo' | 'inprogress' | 'done' | 'blocked';

const CATEGORY_VARIANT: Record<Category, 'outline' | 'secondary' | 'default' | 'destructive'> = {
  todo: 'outline',
  inprogress: 'secondary',
  done: 'default',
  blocked: 'destructive',
};

function outcomeCategory(row: CeremonyRow): Category {
  if (!row.last_run) return 'todo';
  if (row.last_run.outcome === 'ok') return 'done';
  if (row.last_run.outcome === 'failed') return 'blocked';
  return 'inprogress';
}

function Section({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-card ring-1 ring-border/60 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[13px] font-body font-medium text-foreground">{title}</h2>
        {actions}
      </div>
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

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary/40 px-3 py-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-[13px] font-medium text-foreground">{value}</p>
    </div>
  );
}

function CeremoniesBody() {
  const [page, setPage] = useState<CeremoniesSnapshot | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [running, setRunning] = useState('');
  const [phases, setPhases] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

  function refresh() {
    return loadCeremonies().then(setPage, (e: Error) => setError(e.message));
  }

  useEffect(() => {
    void refresh();
  }, []);

  if (error && !page) return <Notice title="Could not read the schedule" items={[error]} />;
  if (!page) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  async function act(work: () => Promise<unknown>, done: string) {
    setError('');
    try {
      await work();
      setNotice(done);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function fire(name: string) {
    setRunning(name);
    setPhases([]);
    setNotice('');
    setError('');
    try {
      await runCeremony(name, (line) => {
        const row = (line ?? {}) as Record<string, unknown>;
        if (row.type === 'progress') setPhases((seen) => [...seen, String(row.phase ?? '')]);
        if (row.type === 'done') setNotice(String(row.summary ?? ''));
        if (row.type === 'error') setError(String(row.message ?? 'The run stopped.'));
      });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning('');
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-foreground">Ceremonies</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            The clock other modes run on — declared once, fired by your machine.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/ceremonies/slack"
            className="text-[12px] text-muted-foreground hover:text-foreground"
          >
            Slack
          </Link>
          <Button variant="outline" size="sm" onClick={() => setAdding((open) => !open)}>
            {adding ? 'Cancel' : 'Declare one'}
          </Button>
        </div>
      </header>

      {error && <Notice title="That did not work" items={[error]} />}
      {notice && <Notice title="Done" items={[notice]} />}
      {page.drift.length > 0 && (
        <Notice title="Your machine and this list disagree" items={page.drift} />
      )}

      {adding && (
        <Section title="Declare a ceremony">
          <DeclareCeremony
            page={page}
            onDone={(message) => {
              setAdding(false);
              setNotice(message);
              void refresh();
            }}
            onError={setError}
          />
        </Section>
      )}

      {page.ceremonies.length === 0 ? (
        <Section title="Nothing scheduled">
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <DuckMark state="idle" size={28} /> {page.empty_message}
          </p>
          <p className="text-[12px] text-muted-foreground mt-2">{page.add_hint}</p>
        </Section>
      ) : (
        page.ceremonies.map((row) => (
          <Section
            key={row.name}
            title={row.name}
            actions={
              <Badge variant={CATEGORY_VARIANT[outcomeCategory(row)]}>
                {row.last_run?.outcome ?? 'never run'}
              </Badge>
            }
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <Tile label="Runs" value={row.next_fire} />
              <Tile label="Mode" value={row.mode} />
              <Tile label="Delivers to" value={row.channels.join(', ') || 'nowhere'} />
              <Tile label="This month" value={`$${row.month_spend_usd.toFixed(2)}`} />
            </div>
            {row.last_run?.detail && (
              <p className="text-[12px] text-muted-foreground mb-2">{row.last_run.detail}</p>
            )}
            {row.last_run?.error && (
              <div className="mb-2">
                <Notice title="Last run failed" items={[row.last_run.error]} />
              </div>
            )}
            {running === row.name && (
              <ul className="space-y-1 mb-2">
                {phases.map((phase, index) => (
                  <li key={`${phase}-${index}`} className="text-[12px] text-muted-foreground">
                    {phase}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" disabled={Boolean(running)} onClick={() => void fire(row.name)}>
                {running === row.name ? 'Running…' : 'Run now'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={Boolean(running)}
                onClick={() =>
                  void act(
                    () => setCeremonyEnabled(row.name, !row.enabled),
                    `${row.name} ${row.enabled ? 'paused' : 'resumed'}.`,
                  )
                }
              >
                {row.enabled ? 'Pause' : 'Resume'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={Boolean(running)}
                onClick={() => void act(() => removeCeremony(row.name), `${row.name} removed.`)}
              >
                Remove
              </Button>
            </div>
          </Section>
        ))
      )}
    </div>
  );
}

export default function CeremoniesPage() {
  // A settings section, so it takes the width and the frame the others do and
  // scrolls inside itself rather than down a column in the middle of an empty
  // window.
  return (
    <div className="quiet-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="mx-auto w-full max-w-[1360px] px-6 pt-10 pb-28">
        <BackendGate>
          <CeremoniesBody />
        </BackendGate>
      </div>
    </div>
  );
}
