'use client';

// Reporting — the saved-reports hub, and the way into a new one.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DuckMark } from '@/components/brand/duck';
import { maskText } from '@/lib/yeaboi/boards';
import { type ReportRun, reportingHistory } from '@/lib/yeaboi/modes';
import { ResultActions } from '@/components/yeaboi/result-actions';
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

function ReportingBody() {
  const [runs, setRuns] = useState<ReportRun[] | null>(null);
  const [error, setError] = useState('');
  const [mask, setMask] = useState<[string, string][]>([]);
  const [anonNote, setAnonNote] = useState('');

  useEffect(() => {
    reportingHistory().then(
      (envelope) => setRuns(envelope.data?.history ?? []),
      (e: Error) => setError(e.message),
    );
  }, []);

  if (error && !runs) return <Notice title="Could not load past reports" items={[error]} />;

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-foreground">Reporting</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            What the team delivered, written for the business.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/humans/reporting/new" className={buttonVariants({ size: 'sm' })}>
            New report
          </Link>
          <Link
            href="/humans/reporting/style"
            className={buttonVariants({ size: 'sm', variant: 'secondary' })}
          >
            Deck style
          </Link>
        </div>
      </header>

      {anonNote && <Notice title={anonNote} items={['Review before sharing.']} />}
      {!runs && <p className="text-[13px] text-muted-foreground">Loading…</p>}

      {runs && runs.length > 0 && (
        <div className="space-y-3">
          {runs.map((run) => (
            <Section key={run.id} title={maskText(run.period || run.period_end, mask)}>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Period end" value={run.period_end} />
                <Stat label="Items" value={String(run.item_count ?? 0)} />
                <Stat label="Project" value={maskText(run.project_name || '—', mask)} />
              </div>
              <ResultActions
                refer={{ kind: 'reporting', session_id: '', run_id: run.id }}
                mode="reporting"
                anonNote={anonNote}
                onAnonymize={(replacements, note) => {
                  setMask(replacements);
                  setAnonNote(note);
                }}
              />
            </Section>
          ))}
        </div>
      )}

      {runs && runs.length === 0 && (
        <Section title="No reports yet">
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <DuckMark state="idle" size={28} /> Pick a period and yeaboi gathers what actually
            shipped, writes the narrative, and lays it out as a deck you can present.
          </p>
        </Section>
      )}
    </div>
  );
}

export default function ReportingPage() {
  return (
    <BackendGate>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <ReportingBody />
      </div>
    </BackendGate>
  );
}
