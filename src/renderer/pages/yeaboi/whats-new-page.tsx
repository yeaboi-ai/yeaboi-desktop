'use client';

// What's New — the bundled changelog (the same release ledger the TUI's `c`
// keycap shows), with per-area filter chips.

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/yeaboi/api';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { Button } from '@/components/ui/button';

interface Highlight {
  text: string;
  areas: string[];
}

interface Entry {
  version: string;
  date: string;
  summary: string;
  highlights: Highlight[];
}

const PAGE_SIZE = 20;

function WhatsNewBody() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [shown, setShown] = useState(PAGE_SIZE);
  const [area, setArea] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ entries: Entry[] }>('/api/meta/changelog').then(
      ({ entries: loaded }) => setEntries(loaded),
      (e: Error) => setError(e.message),
    );
  }, []);

  if (error)
    return (
      <p className="text-[13px] text-muted-foreground">Could not load the changelog: {error}</p>
    );
  if (!entries) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  const areas = [...new Set(entries.flatMap((e) => e.highlights.flatMap((h) => h.areas)))].sort();
  const visible = (
    area ? entries.filter((e) => e.highlights.some((h) => h.areas.includes(area))) : entries
  ).slice(0, shown);

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-[11px] font-body transition-colors ${
      active
        ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
        : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
    }`;

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 mb-6">
        <button type="button" className={chip(area === null)} onClick={() => setArea(null)}>
          all
        </button>
        {areas.map((name) => (
          <button
            key={name}
            type="button"
            className={chip(area === name)}
            onClick={() => setArea(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="space-y-6">
        {visible.map((entry) => (
          <section key={entry.version} className="rounded-2xl bg-card ring-1 ring-border/60 p-5">
            <h3 className="text-[13px] font-body font-medium text-foreground">
              v{entry.version}{' '}
              <span className="text-[11px] font-normal text-muted-foreground/70">{entry.date}</span>
            </h3>
            {entry.summary && (
              <p className="mt-1 text-[12px] text-muted-foreground">{entry.summary}</p>
            )}
            <ul className="mt-2 space-y-1">
              {(area
                ? entry.highlights.filter((h) => h.areas.includes(area))
                : entry.highlights
              ).map((h) => (
                <li key={h.text} className="text-[12px] text-muted-foreground leading-snug pl-3 relative before:content-['·'] before:absolute before:left-0">
                  {h.text}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {visible.length < entries.length && !area && (
        <div className="mt-6">
          <Button variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE_SIZE)}>
            Show older releases
          </Button>
        </div>
      )}
    </>
  );
}

export default function WhatsNewPage() {
  return (
    <BackendGate>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="font-display text-2xl text-foreground mb-6">What&apos;s New</h1>
        <WhatsNewBody />
      </div>
    </BackendGate>
  );
}
