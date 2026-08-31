'use client';

// What's New — the app's own release ledger merged with the desktop-relevant
// half of the bundled yeaboi changelog (the same ledger the TUI's `c` keycap
// shows, minus its terminal-only notes), under the shell's update panel.
//
// The page leads with what shipped since this reader last looked, then the
// newest release in full, then a compact month-by-month timeline that expands in
// place. Area tags are coloured from the accents the backend serves, so a change
// reads as the mode the reader already knows by colour.
//
// The update panel sits OUTSIDE the backend gate on purpose: it talks only to
// the preload bridge, and a shell update may be exactly what fixes a sidecar
// that will not start.

import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Sparkles } from 'lucide-react';
import { apiGet, checkForUpdate, getShellMeta, type ShellMeta } from '@/lib/yeaboi/api';
import {
  SHELL_AREA_ACCENTS,
  SHELL_ENTRIES,
  areasOf,
  desktopBackendEntries,
  entriesSince,
  entryHeadline,
  formatDate,
  headVersions,
  mergeChangelogs,
  mergeSeen,
  monthOf,
  type AreaAccent,
  type Entry,
  type MergedEntry,
  type SeenVersions,
} from '@/lib/yeaboi/shell-changelog';
import { useUpdateFlow } from '@/hooks/use-update-state';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const SEEN_KEY = 'whats-new.last-seen';
const PAGE_SIZE = 24;
const NEUTRAL_ACCENT = 'var(--muted-foreground)';

/** The reader's own markers, per ledger. Absent or unreadable means a first visit. */
function readSeen(): SeenVersions {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<SeenVersions>) : null;
    return { app: parsed?.app ?? '', backend: parsed?.backend ?? '' };
  } catch {
    return { app: '', backend: '' };
  }
}

function writeSeen(head: SeenVersions) {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(mergeSeen(readSeen(), head)));
  } catch {
    /* a private window costs a repeated digest, nothing more */
  }
}

function AreaDot({ area, accents }: { area: string; accents: Map<string, string> }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
      style={{ background: accents.get(area) ?? NEUTRAL_ACCENT }}
      title={area}
    />
  );
}

function AreaTag({ area, accents }: { area: string; accents: Map<string, string> }) {
  const color = accents.get(area);
  return (
    <Badge
      variant="secondary"
      className="gap-1.5 bg-secondary/70 text-[10px] font-body text-muted-foreground"
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: color ?? NEUTRAL_ACCENT }}
      />
      {area}
    </Badge>
  );
}

function Highlights({ entry, accents }: { entry: Entry; accents: Map<string, string> }) {
  return (
    <ul className="mt-3 space-y-1.5">
      {entry.highlights.map((h) => (
        <li key={h.text} className="flex items-start gap-2.5">
          <span className="mt-[7px] flex gap-0.5 shrink-0">
            {(h.areas.length ? h.areas : ['general']).map((area) => (
              <AreaDot key={area} area={area} accents={accents} />
            ))}
          </span>
          <span className="text-[12px] text-muted-foreground leading-snug">{h.text}</span>
        </li>
      ))}
    </ul>
  );
}

function ChannelBadge({ channel }: { channel: MergedEntry['channel'] }) {
  return channel === 'app' ? (
    <Badge variant="secondary" className="text-[10px] font-body">
      app
    </Badge>
  ) : null;
}

/** The catch-up digest. Absent on a first visit and when nothing is new. */
function SinceYouLastLooked({
  since,
  accents,
  onDismiss,
}: {
  since: MergedEntry[];
  accents: Map<string, string>;
  onDismiss: () => void;
}) {
  if (since.length === 0) return null;
  return (
    <section className="rounded-2xl bg-primary/[0.06] ring-1 ring-primary/30 p-5 mb-6 animate-slide-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[13px] font-body font-medium text-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          {since.length} {since.length === 1 ? 'release' : 'releases'} since you last looked
        </h2>
        <Button variant="ghost" size="xs" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
      <ul className="mt-3 space-y-1.5">
        {since.slice(0, 6).map((entry) => (
          <li key={`${entry.channel}-${entry.version}`} className="flex items-start gap-2.5">
            <span className="mt-[7px] flex gap-0.5 shrink-0">
              {(areasOf(entry).length ? areasOf(entry) : ['general']).map((area) => (
                <AreaDot key={area} area={area} accents={accents} />
              ))}
            </span>
            <span className="text-[12px] text-foreground leading-snug">{entryHeadline(entry)}</span>
          </li>
        ))}
      </ul>
      {since.length > 6 && (
        <p className="mt-2 text-[11px] text-muted-foreground/70">and {since.length - 6} more</p>
      )}
    </section>
  );
}

/** The newest release, given room to be read. */
function LatestRelease({
  entry,
  accents,
  isLatest,
}: {
  entry: MergedEntry;
  accents: Map<string, string>;
  /** False under a filter, where the top card is merely the newest match. */
  isLatest: boolean;
}) {
  return (
    <section className="rounded-2xl bg-card ring-1 ring-border/60 p-5 mb-6">
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-body text-muted-foreground/70">
        <ChannelBadge channel={entry.channel} />
        <span>v{entry.version}</span>
        <span aria-hidden>·</span>
        <span>{formatDate(entry.date)}</span>
        {isLatest && (
          <>
            <span aria-hidden>·</span>
            <span className="text-primary">latest</span>
          </>
        )}
      </div>
      <h2 className="mt-2 font-display text-xl text-foreground">{entryHeadline(entry)}</h2>
      {entry.summary && (
        <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed">{entry.summary}</p>
      )}
      <Highlights entry={entry} accents={accents} />
      <div className="mt-4 flex flex-wrap gap-1.5">
        {areasOf(entry).map((area) => (
          <AreaTag key={area} area={area} accents={accents} />
        ))}
      </div>
    </section>
  );
}

/** One row of the timeline: headline and colour signature, expanding in place. */
function ReleaseRow({ entry, accents }: { entry: MergedEntry; accents: Map<string, string> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl ring-1 ring-transparent transition-colors hover:ring-border/60 hover:bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-3 px-3 py-2.5 text-left"
        aria-expanded={open}
      >
        <ChevronRight
          className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform ${
            open ? 'rotate-90' : ''
          }`}
        />
        <span className="w-16 shrink-0 text-[11px] font-body text-muted-foreground/70 tabular-nums">
          v{entry.version}
        </span>
        <span className="flex-1 text-[12px] text-foreground leading-snug">
          {entryHeadline(entry)}
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          <ChannelBadge channel={entry.channel} />
          <span className="flex gap-0.5">
            {(areasOf(entry).length ? areasOf(entry) : ['general']).map((area) => (
              <AreaDot key={area} area={area} accents={accents} />
            ))}
          </span>
        </span>
      </button>
      {open && (
        <div className="px-3 pb-4 pl-[3.4rem]">
          {entry.summary && (
            <p className="text-[12px] text-muted-foreground leading-relaxed">{entry.summary}</p>
          )}
          <Highlights entry={entry} accents={accents} />
        </div>
      )}
    </div>
  );
}

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
  const [accents, setAccents] = useState<Map<string, string>>(new Map());
  const [shown, setShown] = useState(PAGE_SIZE);
  const [area, setArea] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Read once, on mount: the digest must survive "Mark as read" writing the marker.
  const [seen] = useState<SeenVersions>(readSeen);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    apiGet<{ entries: Entry[]; areas?: AreaAccent[] }>('/api/meta/changelog').then(
      ({ entries: loaded, areas }) => {
        setAccents(
          new Map([
            ...Object.entries(SHELL_AREA_ACCENTS),
            ...(areas ?? []).map((a) => [a.name, a.color] as const),
          ]),
        );
        setEntries(mergeChangelogs(desktopBackendEntries(loaded), SHELL_ENTRIES));
      },
      (e: Error) => setError(e.message),
    );
  }, []);

  // Looking at the page is reading it: record the head of each ledger on arrival.
  useEffect(() => {
    if (entries && entries.length > 0) writeSeen(headVersions(entries));
  }, [entries]);

  const since = useMemo(
    () => (entries && !dismissed ? entriesSince(entries, seen) : []),
    [entries, seen, dismissed],
  );

  const areaNames = useMemo(
    () => [...new Set((entries ?? []).flatMap((e) => e.highlights.flatMap((h) => h.areas)))].sort(),
    [entries],
  );

  if (error)
    return (
      <p className="text-[13px] text-muted-foreground">Could not load the changelog: {error}</p>
    );
  if (!entries) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  const matching = area
    ? entries
        .map((e) => ({ ...e, highlights: e.highlights.filter((h) => h.areas.includes(area)) }))
        .filter((e) => e.highlights.length > 0)
    : entries;
  const [latest, ...rest] = matching;
  const visible = rest.slice(0, shown);

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-[11px] font-body transition-colors ${
      active
        ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
        : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
    }`;

  // Group the tail by release month so a long ledger stays navigable.
  const groups: { month: string; rows: MergedEntry[] }[] = [];
  for (const entry of visible) {
    const month = monthOf(entry.date);
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.rows.push(entry);
    else groups.push({ month, rows: [entry] });
  }

  return (
    <>
      <SinceYouLastLooked since={since} accents={accents} onDismiss={() => setDismissed(true)} />

      <div className="flex flex-wrap items-center gap-1.5 mb-6">
        <button
          type="button"
          className={chip(area === null)}
          onClick={() => {
            setArea(null);
            setShown(PAGE_SIZE);
          }}
        >
          all
        </button>
        {areaNames.map((name) => (
          <button
            key={name}
            type="button"
            className={chip(area === name)}
            onClick={() => {
              setArea(name);
              setShown(PAGE_SIZE);
            }}
          >
            {name}
          </button>
        ))}
      </div>

      {latest ? (
        <LatestRelease entry={latest} accents={accents} isLatest={!area} />
      ) : (
        <p className="text-[13px] text-muted-foreground">Nothing tagged that yet.</p>
      )}

      {groups.map((group) => (
        <section key={group.month} className="mb-5">
          <h3 className="text-[11px] font-body uppercase tracking-wide text-muted-foreground/60 mb-1.5 px-3">
            {group.month}
          </h3>
          <div className="space-y-0.5">
            {group.rows.map((entry) => (
              <ReleaseRow
                key={`${entry.channel}-${entry.version}`}
                entry={entry}
                accents={accents}
              />
            ))}
          </div>
        </section>
      ))}

      {visible.length < rest.length && (
        <Button variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE_SIZE)}>
          Show older releases
        </Button>
      )}
    </>
  );
}

export default function WhatsNewPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="font-display text-2xl text-foreground mb-6">What&apos;s New</h1>
      <ShellUpdateSection />
      <BackendGate>
        <WhatsNewBody />
      </BackendGate>
    </div>
  );
}
