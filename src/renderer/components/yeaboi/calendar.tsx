'use client';

// The schedule, as dates rather than as a list of cadences.
//
// Everything here is a view over `/api/ceremonies` — what is declared, when it
// fires, and where its output lands. Nothing is stored on this side: declaring,
// pausing and removing a ceremony installs or removes an OS job, so those stay
// where they were, and this reads the result.

import { useCallback, useEffect, useMemo, useState } from 'react';

import { loadCeremonies, type CeremonyRow } from '@/lib/yeaboi/ops';
import {
  addDays,
  isoDate,
  monthGrid,
  occurrences,
  upcoming,
  type Occurrence,
  type Scheduled,
} from '@shared/ceremony-calendar';

/** The API's rows in the shape the date maths wants. `skip_next` is only on the
 *  row when the backend put it there. */
function scheduled(rows: CeremonyRow[]): Scheduled[] {
  return rows.map((row) => ({
    name: row.name,
    mode: row.mode,
    at: row.at,
    weekdays: row.weekdays,
    enabled: row.enabled,
    skipNext: (row as CeremonyRow & { skip_next?: string }).skip_next,
    channels: row.channels ?? [],
  }));
}

export function useSchedule() {
  const [rows, setRows] = useState<CeremonyRow[] | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    loadCeremonies().then(
      (page) => setRows(page.ceremonies ?? []),
      (e: Error) => {
        setError(e.message);
        setRows([]);
      },
    );
  }, []);
  useEffect(refresh, [refresh]);

  return { rows, error, refresh, ceremonies: useMemo(() => scheduled(rows ?? []), [rows]) };
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** A ceremony's colour comes from its mode, so the same ceremony reads the same
 *  everywhere it appears — the grid, the upcoming list, a page's own snip. */
const MODE_TINT: Record<string, string> = {
  standup: 'var(--primary)',
  report: 'rgb(120,210,170)',
  'weekly-review': 'rgb(70,190,230)',
  'agents-usage': 'rgb(70,190,230)',
  'agents-advisor': 'rgb(240,180,70)',
  'agents-standup': 'rgb(120,210,170)',
  'agents-security': 'rgb(230,90,120)',
};

/** The header's small controls, which are all the same button. */
const STEP =
  'rounded-lg px-2 py-1 font-body text-[11px] text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground';

function tint(mode: string): string {
  return MODE_TINT[mode] ?? 'var(--muted-foreground)';
}

/** One day. The same cell in the week strip and the month grid, so a day does
 *  not change shape when the calendar is expanded. */
function DayCell({
  day,
  slots,
  today,
  dim,
  showWeekday,
  height,
  limit,
}: {
  day: Date;
  slots: Occurrence[];
  today: string;
  dim?: boolean;
  showWeekday?: boolean;
  height: number;
  limit: number;
}) {
  const date = isoDate(day);
  return (
    <div
      className={`rounded-xl p-1.5 ring-1 transition-colors ${
        date === today ? 'bg-secondary/50 ring-border' : 'ring-border/30'
      } ${dim ? 'opacity-40' : ''}`}
      style={{ minHeight: height }}
    >
      <p className="flex items-baseline gap-1.5">
        {showWeekday && (
          <span className="font-body text-[10px] uppercase tracking-wide text-muted-foreground/60">
            {DAY_LABELS[day.getDay() === 0 ? 6 : day.getDay() - 1]}
          </span>
        )}
        <span
          className={`font-code text-[10px] ${
            date === today ? 'text-foreground' : 'text-muted-foreground/70'
          }`}
        >
          {day.getDate()}
        </span>
      </p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {slots.slice(0, limit).map((slot) => (
          <li
            key={`${slot.ceremony.name}-${slot.at}`}
            className="flex items-center gap-1 truncate"
            title={`${slot.at} · ${slot.ceremony.name} → ${slot.ceremony.channels.join(', ') || 'nowhere'}`}
          >
            <span
              aria-hidden
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: tint(slot.ceremony.mode) }}
            />
            <span className="truncate font-body text-[10px] text-muted-foreground">
              {slot.at} {slot.ceremony.name}
            </span>
          </li>
        ))}
        {slots.length > limit && (
          <li className="font-body text-[10px] text-muted-foreground/60">
            +{slots.length - limit} more
          </li>
        )}
      </ul>
    </div>
  );
}

/** Occurrences keyed by date, for a range of days. */
function byDate(ceremonies: Scheduled[], days: Date[]): Map<string, Occurrence[]> {
  const map = new Map<string, Occurrence[]>();
  if (days.length === 0) return map;
  for (const slot of occurrences(ceremonies, days[0]!, days[days.length - 1]!)) {
    const list = map.get(slot.date) ?? [];
    list.push(slot);
    map.set(slot.date, list);
  }
  return map;
}

/** The schedule as far ahead as it is worth looking: the next seven days, and
 *  the month behind a button. A month of mostly empty cells is a lot of window
 *  to spend on a week's worth of answer. */
export function Schedule({ ceremonies }: { ceremonies: Scheduled[] }) {
  const [expanded, setExpanded] = useState(false);
  const [month, setMonth] = useState(() => new Date());
  const today = isoDate(new Date());

  const week = useMemo(() => {
    const start = new Date();
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, []);
  const days = useMemo(() => (expanded ? monthGrid(month) : week), [expanded, month, week]);
  const slots = useMemo(() => byDate(ceremonies, days), [ceremonies, days]);

  const step = (by: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + by, 1));

  return (
    <section className="rounded-2xl bg-card p-4 ring-1 ring-border/60">
      <header className="flex items-center justify-between">
        <h2 className="font-body text-[13px] font-medium text-foreground">
          {expanded
            ? month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
            : 'Week ahead'}
        </h2>
        <div className="flex items-center gap-1">
          {expanded && (
            <>
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => step(-1)}
                className={STEP}
              >
                ‹
              </button>
              <button type="button" onClick={() => setMonth(new Date())} className={STEP}>
                Today
              </button>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => step(1)}
                className={STEP}
              >
                ›
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              setMonth(new Date());
              setExpanded(!expanded);
            }}
            className={STEP}
          >
            {expanded ? 'Week' : 'Month'}
          </button>
        </div>
      </header>

      <div className="mt-3 grid grid-cols-7 gap-1">
        {expanded &&
          DAY_LABELS.map((label) => (
            <div
              key={label}
              className="pb-1 font-body text-[10px] uppercase tracking-wide text-muted-foreground/60"
            >
              {label}
            </div>
          ))}
        {days.map((day) => (
          <DayCell
            key={isoDate(day)}
            day={day}
            slots={slots.get(isoDate(day)) ?? []}
            today={today}
            dim={expanded && day.getMonth() !== month.getMonth()}
            showWeekday={!expanded}
            height={expanded ? 68 : 84}
            limit={expanded ? 3 : 4}
          />
        ))}
      </div>
    </section>
  );
}

function when(slot: Occurrence, now: Date): string {
  if (slot.date === isoDate(now)) return `Today ${slot.at}`;
  if (slot.date === isoDate(addDays(now, 1))) return `Tomorrow ${slot.at}`;
  const [year, month, day] = slot.date.split('-').map(Number);
  const date = new Date(year!, month! - 1, day!);
  return `${date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} ${slot.at}`;
}

/** The next few firings. Used on Home and, one row deep, on a ceremony's own
 *  page — the same rows from the same source, so they cannot disagree. */
export function Upcoming({
  ceremonies,
  count = 5,
  empty = 'Nothing scheduled.',
}: {
  ceremonies: Scheduled[];
  count?: number;
  empty?: string;
}) {
  const now = new Date();
  const next = upcoming(ceremonies, now, count);
  if (next.length === 0) {
    return <p className="font-body text-[11px] text-muted-foreground/70">{empty}</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {next.map((slot) => (
        <li key={`${slot.date}-${slot.ceremony.name}`} className="flex items-baseline gap-2">
          <span
            aria-hidden
            className="h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full"
            style={{ background: tint(slot.ceremony.mode) }}
          />
          <span className="min-w-0 flex-1 truncate font-body text-[12px] text-foreground">
            {slot.ceremony.name}
          </span>
          <span className="shrink-0 font-code text-[10px] text-muted-foreground/70">
            {when(slot, now)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A ceremony page's own line of the schedule: only what is declared against
 *  this mode, and silent when nothing is. A page that says "nothing scheduled"
 *  every time you visit is noise; a page that says when the next one is is not. */
export function NextUp({ modes }: { modes: string[] }) {
  const { ceremonies } = useSchedule();
  const mine = ceremonies.filter((ceremony) => modes.includes(ceremony.mode));
  if (mine.length === 0) return null;
  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-border/60">
      <h2 className="font-body text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Scheduled
      </h2>
      <div className="mt-3">
        <Upcoming ceremonies={mine} count={3} />
      </div>
    </div>
  );
}
