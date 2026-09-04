'use client';

// The schedule, as dates rather than as a list of cadences.
//
// Everything here is a view over `/api/ceremonies` — what is declared, when it
// fires, and where its output lands. Nothing is stored on this side: declaring,
// pausing and removing a ceremony installs or removes an OS job, so those stay
// where they were, and this reads the result.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
/** How far back and forward the week strip runs. A week behind so yesterday is
 *  one nudge away; five weeks on so it does not end mid-scroll. */
const BEHIND = 7;
const AHEAD = 35;

/** How long a week's worth of travel takes, and its shape: all deceleration.
 *  The browser's own smooth scroll eases in as well as out, which on a strip
 *  this short reads as a lurch and a stop rather than a glide. */
const GLIDE_MS = 620;

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
  /** The calendar is changing shape and this cell is on its way out. */
  leaving = false,
  delay = 0,
}: {
  day: Date;
  slots: Occurrence[];
  today: string;
  dim?: boolean;
  showWeekday?: boolean;
  height: number;
  limit: number;
  leaving?: boolean;
  delay?: number;
}) {
  const date = isoDate(day);
  return (
    <div
      // A tint rather than an outlined card. On a light theme a white cell with
      // a grey ring on a near-white page reads as a row of boxes; the day is
      // the shape, and it only needs to be a shade off the page.
      className={`rounded-xl p-1.5 transition-colors ${
        date === today ? 'bg-secondary ring-1 ring-border/60' : 'bg-secondary/40'
      } ${dim ? 'opacity-40' : ''} ${leaving ? 'cell-out' : ''}`}
      style={{ minHeight: height, animationDelay: `${delay}ms` }}
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
/** How long the days take to leave before the other shape arrives: the last
 *  cell's delay plus its own run. */
const LEAVE_MS = 160;
const LEAVE_STEP_MS = 12;
const LEAVE_CAP_MS = 140;

export function Schedule({ ceremonies }: { ceremonies: Scheduled[] }) {
  const [expanded, setExpanded] = useState(false);
  /** True while the days on screen are leaving and the other shape is waiting
   *  behind them. */
  const [leaving, setLeaving] = useState(false);
  const [month, setMonth] = useState(() => new Date());
  const [direction, setDirection] = useState(0);
  const today = isoDate(new Date());
  const strip = useRef<HTMLDivElement>(null);

  // The week is a window onto a longer run of days: a week back so yesterday is
  // one nudge away, five weeks on so the strip does not end while you are
  // reading it. Scrolling it is the interaction; the buttons do the same move
  // for the keyboard and the mouse.
  const days = useMemo(() => {
    const start = addDays(new Date(), -BEHIND);
    return Array.from({ length: BEHIND + AHEAD }, (_, index) => addDays(start, index));
  }, []);
  const monthDays = useMemo(() => monthGrid(month), [month]);
  const slots = useMemo(
    () => byDate(ceremonies, expanded ? monthDays : days),
    [ceremonies, expanded, monthDays, days],
  );

  /** One week of the strip, whatever it is currently wide. */
  const stride = () => strip.current?.clientWidth ?? 0;

  // The strip is scrolled by hand rather than by the browser: it leaves at
  // full speed and coasts to a stop, and a hand on the strip takes it back
  // mid-glide.
  const gliding = useRef(0);
  // Snapping is suspended for the length of a glide: with it on, every frame's
  // write was pulled to the nearest day and a curve came out as a march of
  // equal steps, one cell wide.
  const stopGlide = () => {
    cancelAnimationFrame(gliding.current);
    gliding.current = 0;
    if (strip.current) strip.current.style.scrollSnapType = '';
  };
  const glide = (to: number) => {
    const box = strip.current;
    if (!box) return;
    stopGlide();
    box.style.scrollSnapType = 'none';
    const from = box.scrollLeft;
    const target = Math.max(0, Math.min(box.scrollWidth - box.clientWidth, to));
    const began = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - began) / GLIDE_MS);
      box.scrollLeft = from + (target - from) * (1 - Math.pow(1 - t, 4));
      if (t < 1) gliding.current = requestAnimationFrame(tick);
      else stopGlide();
    };
    gliding.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => cancelAnimationFrame(gliding.current), []);

  // Today starts at the left edge, with the week behind it scrolled off.
  useEffect(() => {
    if (expanded || !strip.current) return;
    strip.current.scrollLeft = (stride() / 7) * BEHIND;
  }, [expanded]);

  const step = (by: number) => {
    if (expanded) {
      setDirection(by);
      setMonth(new Date(month.getFullYear(), month.getMonth() + by, 1));
      return;
    }
    glide((strip.current?.scrollLeft ?? 0) + by * stride());
  };

  const now = () => {
    setDirection(0);
    setMonth(new Date());
    glide((stride() / 7) * BEHIND);
  };

  return (
    <section>
      {/* The controls lead the row. A week needs no title — the days say which
          week it is — and a month puts its name after the controls that
          changed it. */}
      <header className="flex items-center gap-2 px-1">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={expanded ? 'Previous month' : 'Previous week'}
            onClick={() => step(-1)}
            className={STEP}
          >
            ‹
          </button>
          <button type="button" onClick={now} className={STEP}>
            Today
          </button>
          <button
            type="button"
            aria-label={expanded ? 'Next month' : 'Next week'}
            onClick={() => step(1)}
            className={STEP}
          >
            ›
          </button>
          <button
            type="button"
            onClick={() => {
              if (leaving) return;
              // The days go before the other shape comes: a month grid
              // appearing over a week strip is two calendars in one frame.
              setLeaving(true);
              window.setTimeout(() => {
                setDirection(expanded ? -1 : 1);
                setMonth(new Date());
                setExpanded(!expanded);
                setLeaving(false);
              }, LEAVE_MS + LEAVE_CAP_MS);
            }}
            className={`${STEP} ml-1`}
          >
            {expanded ? 'Week' : 'Month'}
          </button>
        </div>
        {expanded && (
          <h2 className="font-body text-[13px] font-medium text-foreground">
            {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </h2>
        )}
      </header>

      {expanded ? (
        <div
          key={isoDate(month)}
          data-slide={direction > 0 ? 'forward' : direction < 0 ? 'back' : 'none'}
          className="mt-4 grid grid-cols-7 gap-2"
        >
          {DAY_LABELS.map((label) => (
            <div
              key={label}
              className="pb-1 font-body text-[10px] uppercase tracking-wide text-muted-foreground/60"
            >
              {label}
            </div>
          ))}
          {monthDays.map((day, index) => (
            <DayCell
              key={isoDate(day)}
              day={day}
              slots={slots.get(isoDate(day)) ?? []}
              today={today}
              dim={day.getMonth() !== month.getMonth()}
              height={68}
              limit={3}
              leaving={leaving}
              delay={Math.min(index * LEAVE_STEP_MS, LEAVE_CAP_MS)}
            />
          ))}
        </div>
      ) : (
        <div
          ref={strip}
          key={expanded ? 'month' : 'week'}
          data-slide={direction > 0 ? 'forward' : direction < 0 ? 'back' : 'none'}
          onPointerDown={stopGlide}
          onWheel={stopGlide}
          className="mt-4 flex snap-x snap-proximity gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {days.map((day, index) => (
            <div
              key={isoDate(day)}
              // A seventh of the strip, less its share of the six gaps between
              // them, so exactly one week is in view at any width.
              className="w-[calc((100%-48px)/7)] shrink-0 snap-start"
            >
              <DayCell
                day={day}
                slots={slots.get(isoDate(day)) ?? []}
                today={today}
                showWeekday
                height={84}
                limit={4}
                leaving={leaving}
                delay={Math.min(index * LEAVE_STEP_MS, LEAVE_CAP_MS)}
              />
            </div>
          ))}
        </div>
      )}
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
    // Its own spacing, because it is its own decision whether to draw at all —
    // a wrapper carrying the margin left 16px of nothing above the page title
    // on every surface where nothing is scheduled.
    <div className="mb-4 rounded-2xl bg-card p-4 ring-1 ring-border/60">
      <h2 className="font-body text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Scheduled
      </h2>
      <div className="mt-3">
        <Upcoming ceremonies={mine} count={3} />
      </div>
    </div>
  );
}
