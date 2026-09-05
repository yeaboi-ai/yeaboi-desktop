'use client';

// Performance — the roster, and where each engineer stands.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DuckMark } from '@/components/brand/duck';
import { type PerformanceRoster, loadPerformanceRoster } from '@/lib/yeaboi/modes';
import { PageShell } from '@/components/page-shell';
import { BackendGate } from '@/components/yeaboi/backend-gate';

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

function PerformanceBody() {
  const [roster, setRoster] = useState<PerformanceRoster | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    loadPerformanceRoster().then(setRoster, (e: Error) => setError(e.message));
  }, []);

  if (error) return <Notice title="Could not load the roster" items={[error]} />;
  if (!roster) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl text-foreground">Performance</h1>
        <p className="text-[13px] text-muted-foreground mt-1">
          1:1 prep, completion and the 6-month review — for the people who did the work on the
          board.
        </p>
      </header>

      {roster.engineers.length > 0 ? (
        <div className="space-y-3">
          {roster.engineers.map((engineer) => (
            <Link
              key={engineer.name}
              href={`/team/performance/engineer?name=${encodeURIComponent(engineer.name)}`}
              className="block rounded-2xl bg-card ring-1 ring-border/60 p-5 transition-colors hover:ring-primary/40"
            >
              <p className="text-[13px] font-body font-medium text-foreground">{engineer.name}</p>
              <p className="text-[12px] text-muted-foreground mt-1">{engineer.hint}</p>
            </Link>
          ))}
        </div>
      ) : (
        <Section title="No engineers yet">
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <DuckMark state="idle" size={28} /> {roster.empty_message}
          </p>
        </Section>
      )}
    </div>
  );
}

export default function PerformancePage() {
  return (
    <PageShell width="narrow">
      <BackendGate>
        <PerformanceBody />
      </BackendGate>
    </PageShell>
  );
}
