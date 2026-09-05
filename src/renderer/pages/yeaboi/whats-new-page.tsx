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

import type { ReactNode } from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { cn } from '@/lib/utils';

const SEEN_KEY = 'whats-new.last-seen';
// Months past the newest are collapsed, so a page of the ledger costs a row
// each rather than a screen each.
const PAGE_SIZE = 48;
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

/** A release's identity across both ledgers. */
const keyOf = (entry: MergedEntry) => `${entry.channel}-${entry.version}`;

/** A pane that scrolls inside itself, and says so: a scrollbar while there is
 *  somewhere to go, and the content fading at whichever edge it runs past.
 *  Cut off square, a column that carries on reads as one that has ended. */
function ScrollPane({
  className,
  boxRef,
  children,
}: {
  className?: string;
  /** For a caller that needs the pane's own height — how much it can hold is
   *  a question only the box can answer. */
  boxRef?: React.RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const own = useRef<HTMLDivElement>(null);
  const box = boxRef ?? own;
  const inner = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ top: false, bottom: false });

  useLayoutEffect(() => {
    const el = box.current;
    const content = inner.current;
    if (!el || !content) return;
    const read = () =>
      setEdge({
        top: el.scrollTop > 4,
        bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 4,
      });
    read();
    el.addEventListener('scroll', read, { passive: true });
    // The pane's own height rarely changes; what it holds does — a month
    // opening is what puts it past its edge.
    const watch = new ResizeObserver(read);
    watch.observe(content);
    watch.observe(el);
    return () => {
      el.removeEventListener('scroll', read);
      watch.disconnect();
    };
  }, []);

  const fade = `linear-gradient(to bottom, transparent 0, #000 ${edge.top ? 28 : 0}px, #000 calc(100% - ${
    edge.bottom ? 28 : 0
  }px), transparent 100%)`;

  return (
    <div
      ref={box}
      className={cn('slim-scroll min-h-0 overflow-y-auto overscroll-contain', className)}
      style={{ maskImage: fade, WebkitMaskImage: fade }}
    >
      <div ref={inner}>{children}</div>
    </div>
  );
}

/** The release the reader is on, given room to be read. */
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
    <section className="animate-slide-up mb-6 rounded-2xl bg-card p-5 ring-1 ring-border/60 motion-reduce:animate-none">
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

/** One row of the timeline: headline and colour signature. It picks the
 *  release rather than unfolding it — the panel beside the list is where a
 *  release is read, and expanding in place moved the rest of the list under
 *  the cursor every time you looked at one. */
function ReleaseRow({
  entry,
  accents,
  picked,
  onPick,
}: {
  entry: MergedEntry;
  accents: Map<string, string>;
  picked: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      data-release-row
      onClick={onPick}
      aria-pressed={picked}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left ring-1 transition-colors',
        picked
          ? 'bg-card ring-border/60'
          : 'ring-transparent hover:bg-card/60 hover:ring-border/40',
      )}
    >
      <span
        aria-hidden
        className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full transition-colors"
        style={{ background: picked ? 'var(--primary)' : 'transparent' }}
      />
      <span className="w-16 shrink-0 font-body text-[11px] text-muted-foreground/70 tabular-nums">
        v{entry.version}
      </span>
      <span className="flex-1 text-[12px] leading-snug text-foreground">
        {entryHeadline(entry)}
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <ChannelBadge channel={entry.channel} />
        <span className="flex gap-0.5">
          {(areasOf(entry).length ? areasOf(entry) : ['general']).map((area) => (
            <AreaDot key={area} area={area} accents={accents} />
          ))}
        </span>
      </span>
    </button>
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
    <section className="mb-6 shrink-0 rounded-2xl bg-card p-5 ring-1 ring-border/60">
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

/** One month of the ledger. The newest is open; the rest are a line each until
 *  you ask for them — a year of releases is a year of scrolling otherwise. */
function MonthGroup({
  month,
  rows,
  accents,
  open,
  onToggle,
  picked,
  onPick,
}: {
  month: string;
  rows: MergedEntry[];
  accents: Map<string, string>;
  open: boolean;
  onToggle: () => void;
  picked: string;
  onPick: (key: string) => void;
}) {
  return (
    <section className="mb-3">
      <button
        type="button"
        data-month-head
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left font-body text-[11px] tracking-wide text-muted-foreground/60 uppercase transition-colors hover:text-foreground"
      >
        <ChevronRight
          className={`h-3 w-3 shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
        />
        {month}
        <span className="ml-auto tabular-nums normal-case">{rows.length}</span>
      </button>
      {/* 0fr to 1fr: the rows are of no known height, and a max-height guess
          either clips a long month or coasts through an empty gap. */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="space-y-0.5 pt-1" inert={open ? undefined : true}>
            {rows.map((entry) => (
              <ReleaseRow
                key={keyOf(entry)}
                entry={entry}
                accents={accents}
                picked={keyOf(entry) === picked}
                onPick={() => onPick(keyOf(entry))}
              />
            ))}
          </div>
        </div>
      </div>
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
  // Empty until you pick one, which means the head of whatever the filter
  // leaves — a filter just applied should not leave the panel reading a
  // release that no longer matches it.
  const [picked, setPicked] = useState('');
  // Months you have opened or closed yourself, over the top of the run the
  // column opens on its own.
  const [byHand, setByHand] = useState<Record<string, boolean>>({});
  const [autoOpen, setAutoOpen] = useState(1);
  const listPane = useRef<HTMLDivElement>(null);

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

  // How many months the column opens on its own: enough to reach the foot of
  // the pane and no further. One month is rarely a column's worth — the
  // newest is four releases and the rest of the space was floor — and every
  // month is a wall. Measured rather than guessed, from the rows already on
  // screen: a closed month still lays its rows out behind the clip.
  useLayoutEffect(() => {
    const el = listPane.current;
    if (!el) return;
    const decide = () => {
      const months = [...el.querySelectorAll('section')];
      const pane = el.clientHeight;
      if (months.length === 0 || pane === 0) return;
      const head = months[0]!.querySelector('[data-month-head]')?.getBoundingClientRect().height;
      const row = el.querySelector('[data-release-row]')?.getBoundingClientRect().height;
      let used = months.length * ((head ?? 30) + 12);
      let open = 0;
      for (const month of months) {
        open += 1;
        used += month.querySelectorAll('[data-release-row]').length * ((row ?? 39) + 2);
        if (used >= pane) break;
      }
      setAutoOpen(open);
    };
    decide();
    // The pane's height is the window's; what it holds does not change it, so
    // this cannot chase its own tail.
    const watch = new ResizeObserver(decide);
    watch.observe(el);
    return () => watch.disconnect();
  }, [entries, area, shown]);

  // A filter is a different ledger; the months you opened in the last one
  // mean nothing in it.
  useEffect(() => setByHand({}), [area]);

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
  // The whole of the filtered ledger is in the list, the newest included:
  // once the panel beside it is where a release is read, leaving the newest
  // out of the list leaves no way back to it.
  const visible = matching.slice(0, shown);
  const reading = matching.find((entry) => keyOf(entry) === picked) ?? matching[0];

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-[11px] font-body transition-colors ${
      active
        ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
        : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
    }`;

  // Group by release month so a long ledger stays navigable.
  const groups: { month: string; rows: MergedEntry[] }[] = [];
  for (const entry of visible) {
    const month = monthOf(entry.date);
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.rows.push(entry);
    else groups.push({ month, rows: [entry] });
  }

  return (
    <>
      <div className="mb-6 flex shrink-0 flex-wrap items-center gap-1.5">
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

      {/* Two readings of the same ledger side by side: the history to the
          left, and whichever release you are reading to the right. Each
          column scrolls inside itself — the page does not move, so the filter
          chips and the release you are on stay put while you go back through
          the months. */}
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] items-stretch gap-x-8 xl:grid-cols-2">
        <ScrollPane className="pr-2" boxRef={listPane}>
          {groups.map((group, at) => (
            <MonthGroup
              key={group.month}
              month={group.month}
              rows={group.rows}
              accents={accents}
              open={byHand[group.month] ?? at < autoOpen}
              onToggle={() =>
                setByHand((was) => ({
                  ...was,
                  [group.month]: !(was[group.month] ?? at < autoOpen),
                }))
              }
              picked={reading ? keyOf(reading) : ''}
              onPick={setPicked}
            />
          ))}

          {/* The foot of a list, not a control sitting on it: nothing until
              you reach for it, and the button under your cursor when you do. */}
          {visible.length < matching.length && (
            <div className="flex justify-center pt-1 pb-3">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground/70"
                onClick={() => setShown((n) => n + PAGE_SIZE)}
              >
                Show older releases
              </Button>
            </div>
          )}
        </ScrollPane>

        <ScrollPane className="pr-2">
          <SinceYouLastLooked
            since={since}
            accents={accents}
            onDismiss={() => setDismissed(true)}
          />
          {reading ? (
            <LatestRelease
              key={keyOf(reading)}
              entry={reading}
              accents={accents}
              isLatest={keyOf(reading) === keyOf(entries[0]!)}
            />
          ) : (
            <p className="text-[13px] text-muted-foreground">Nothing tagged that yet.</p>
          )}
        </ScrollPane>
      </div>
    </>
  );
}

export default function WhatsNewPage() {
  // One surface that fills the window, like the dashboard and the system
  // check. The page itself never scrolls — the two columns of the ledger do,
  // each in its own box, so the heading and the filter stay where you left
  // them.
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="mx-auto flex min-h-0 w-full max-w-[1360px] flex-1 flex-col px-6 pt-10 pb-2">
        <header className="mb-7 shrink-0">
          <p className="font-body text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Releases and updates
          </p>
          <h1 className="font-display mt-0.5 text-3xl text-foreground">What&apos;s New</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Everything that shipped in this window and in the backend behind it.
          </p>
        </header>
        <ShellUpdateSection />
        <BackendGate>
          <WhatsNewBody />
        </BackendGate>
      </div>
    </div>
  );
}
