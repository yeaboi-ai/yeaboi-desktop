'use client';

// What's New — the app's own release ledger merged with the desktop-relevant
// half of the bundled yeaboi changelog (the same ledger the TUI's `c` keycap
// shows, minus its terminal-only notes), under the shell's update panel.
//
// The update panel sits OUTSIDE the backend gate on purpose: it talks only to
// the preload bridge, and a shell update may be exactly what fixes a sidecar
// that will not start.

import { useEffect, useState } from 'react';
import { apiGet, checkForUpdate, getShellMeta, type ShellMeta } from '@/lib/yeaboi/api';
import {
  SHELL_ENTRIES,
  desktopBackendEntries,
  mergeChangelogs,
  type Entry,
  type MergedEntry,
} from '@/lib/yeaboi/shell-changelog';
import { useUpdateFlow } from '@/hooks/use-update-state';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { Button } from '@/components/ui/button';

const PAGE_SIZE = 20;

function ShellUpdateSection() {
  const { state, update, countdown } = useUpdateFlow();
  const [shell, setShell] = useState<ShellMeta | null>(null);

  useEffect(() => {
    void getShellMeta().then(setShell, () => {});
  }, []);

  const version = shell?.version ?? '…';

  return (
    <section className="rounded-2xl bg-card ring-1 ring-border/60 p-5 mb-6">
      {state.kind === 'unsupported' ? (
        <p className="text-[12px] text-muted-foreground">
          You&apos;re on yeaboi.ai {version}. {state.reason}
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-body font-medium text-foreground">
              You&apos;re on yeaboi.ai {version}
              {state.kind === 'available' && (
                <span className="text-amber-600 dark:text-amber-400">
                  {' '}
                  — {state.version} is available
                </span>
              )}
              {state.kind === 'ready' && (
                <span className="text-amber-600 dark:text-amber-400">
                  {' '}
                  — {state.version} is ready to install
                </span>
              )}
            </p>
            {state.kind === 'idle' && (
              <p className="text-[11px] text-muted-foreground/70 mt-0.5">You&apos;re up to date.</p>
            )}
            {state.kind === 'checking' && (
              <p className="text-[11px] text-muted-foreground/70 mt-0.5">Checking…</p>
            )}
            {state.kind === 'downloading' && (
              <div className="mt-2 w-56">
                <p className="text-[11px] text-muted-foreground mb-1">
                  Downloading — {state.percent}%
                </p>
                <div className="h-1 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-[width] duration-300"
                    style={{ width: `${state.percent}%` }}
                  />
                </div>
              </div>
            )}
            {state.kind === 'error' && (
              <p className="text-[11px] text-destructive/80 mt-0.5">
                Last check failed: {state.message}
              </p>
            )}
          </div>
          <div className="shrink-0">
            {state.kind === 'available' && (
              <Button size="sm" onClick={update}>
                Update
              </Button>
            )}
            {state.kind === 'ready' && (
              <Button size="sm" onClick={update}>
                {countdown !== null ? `Restarting in ${countdown}…` : 'Restart to update'}
              </Button>
            )}
            {(state.kind === 'idle' || state.kind === 'error') && (
              <Button variant="outline" size="sm" onClick={() => void checkForUpdate()}>
                {state.kind === 'error' ? 'Try again' : 'Check for updates'}
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function WhatsNewBody() {
  const [entries, setEntries] = useState<MergedEntry[] | null>(null);
  const [shown, setShown] = useState(PAGE_SIZE);
  const [area, setArea] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ entries: Entry[] }>('/api/meta/changelog').then(
      ({ entries: loaded }) =>
        setEntries(mergeChangelogs(desktopBackendEntries(loaded), SHELL_ENTRIES)),
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
          <section
            key={`${entry.channel}-${entry.version}`}
            className="rounded-2xl bg-card ring-1 ring-border/60 p-5"
          >
            <h3 className="text-[13px] font-body font-medium text-foreground">
              {entry.channel === 'app' ? `App v${entry.version}` : `v${entry.version}`}{' '}
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
                <li
                  key={h.text}
                  className="text-[12px] text-muted-foreground leading-snug pl-3 relative before:content-['·'] before:absolute before:left-0"
                >
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
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="font-display text-2xl text-foreground mb-6">What&apos;s New</h1>
      <ShellUpdateSection />
      <BackendGate>
        <WhatsNewBody />
      </BackendGate>
    </div>
  );
}
