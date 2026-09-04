'use client';

// The schedule, as dates rather than as a list of cadences.
//
// Everything here is a view over `/api/ceremonies` — what is declared, when it
// fires, and where its output lands. Nothing is stored on this side: declaring,
// pausing and removing a ceremony installs or removes an OS job, so those stay
// where they were, and this reads the result.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

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
      data-day={date}
      // A tint rather than an outlined card. On a light theme a white cell with
      // a grey ring on a near-white page reads as a row of boxes; the day is
      // the shape, and it only needs to be a shade off the page.
      className={`rounded-xl p-1.5 transition-colors ${
        date === today ? 'bg-secondary ring-1 ring-border/60' : 'bg-secondary/40'
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
/** The days already on screen sliding to where the month puts them, and the
 *  days either side of them arriving. The ones before lead, because they are
 *  what pushes the week across. */
const MOVE_MS = 620;
const ARRIVE_MS = 420;
/** Long tail: most of the distance is covered early and the last of it is
 *  given away slowly, which is what makes the week look like it was pushed
 *  rather than moved. */
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
/** How long the surface takes to clear before the month arrives — the fade in
 *  globals.css, plus a frame to start it. */
const CLEARING_MS = 300;
/** How much of the week's return goes by before the surface starts coming
 *  back. Most of the distance is covered in the first half of the move. */
const RETURNING_MS = 260;
/** The back control's own exit, before it is taken off the row. */
const CONTROL_OUT_MS = 150;

/** The shape of the grid a day is moving through: where its rows start and
 *  end, and how far apart they are. */
interface Rows {
  left: number;
  right: number;
  pitch: number;
  width: number;
}

/** Read that shape off a set of laid-out cells, or nothing if they are all on
 *  one line — a strip has no rows to speak of. */
function rowsOf(boxes: DOMRect[]): Rows | null {
  if (boxes.length === 0) return null;
  const tops = [...new Set(boxes.map((box) => Math.round(box.top)))].sort((a, b) => a - b);
  if (tops.length < 2) return null;
  return {
    left: Math.min(...boxes.map((box) => box.left)),
    right: Math.max(...boxes.map((box) => box.right)),
    pitch: tops[1]! - tops[0]!,
    width: boxes[0]!.width,
  };
}

/**
 * The path from one address to the other, as the grid reads.
 *
 * A day that ends a row below the one it started on does not cut across the
 * calendar to get there: it runs to the end of its row, comes back in at the
 * start of the next, and carries on — the way the days themselves run. The
 * turn costs no time, so the day keeps its speed through it, and with the
 * whole path timed by distance it travels at one pace from end to end.
 *
 * Frames are relative to where the day now sits, because that is where a
 * transform starts from.
 */
function wrapped(was: DOMRect, is: DOMRect, geo: Rows | null): Keyframe[] {
  const stops: { x: number; y: number }[] = [{ x: was.left, y: was.top }];
  const seams = new Set<number>();
  const rows = geo ? Math.round((is.top - was.top) / geo.pitch) : 0;

  if (geo && rows !== 0) {
    const down = rows > 0;
    // Off the end it leaves by, and back on at the end it returns by.
    const out = down ? geo.right : geo.left - geo.width;
    const back = down ? geo.left - geo.width : geo.right;
    let y = was.top;
    for (let turn = 0; turn < Math.abs(rows); turn += 1) {
      stops.push({ x: out, y });
      seams.add(stops.length - 1);
      y += down ? geo.pitch : -geo.pitch;
      stops.push({ x: back, y });
    }
  }
  stops.push({ x: is.left, y: is.top });

  // Time by distance travelled, with the turns costing none.
  const legs = stops.slice(1).map((stop, index) => {
    if (seams.has(index)) return 0;
    const from = stops[index]!;
    return Math.hypot(stop.x - from.x, stop.y - from.y);
  });
  const total = legs.reduce((sum, leg) => sum + leg, 0) || 1;

  let run = 0;
  return stops.map((stop, index) => {
    if (index > 0) run += legs[index - 1]!;
    return {
      // A turn is instant, so the two frames either side of it share a moment
      // — nudged apart only enough to keep their order.
      offset: Math.min(1, run / total + (seams.has(index - 1) ? 0.0001 : 0)),
      transform: `translate(${stop.x - is.left}px, ${stop.y - is.top}px)`,
    };
  });
}

export function Schedule({
  ceremonies,
  /** Told when the calendar takes the whole surface, so the page can put its
   *  other panels away — a month grid and a row of tiles do not both fit, and
   *  the answer to that is not a scrollbar. */
  onExpand,
}: {
  ceremonies: Scheduled[];
  onExpand?: (expanded: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  /** The back control outlives the month view by its own exit. */
  const [backOnRow, setBackOnRow] = useState(false);
  /** Where every day sat before the calendar changed shape, so the ones that
   *  survive the change can be moved from there rather than redrawn at their
   *  new address. Set only by a swap, so a month *step* — which remounts the
   *  same grid — does not replay it. */
  const cameFrom = useRef<Map<string, DOMRect> | null>(null);
  /** One shape change at a time: the two halves are sequenced, and a second
   *  click in the middle would interleave them. */
  const midSwap = useRef(false);
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
  // Before paint, and before the hand-off below measures anything: the strip
  // arrives scrolled to nought, and a day measured there is a day the move
  // would carry to the wrong place.
  useLayoutEffect(() => {
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

  /** Takes the addresses down and changes shape. Whatever the days are doing
   *  after that is measured against these. */
  const change = useCallback((next: boolean) => {
    const seen = new Map<string, DOMRect>();
    for (const cell of document.querySelectorAll<HTMLElement>('[data-day]')) {
      const date = cell.dataset['day'];
      if (date) seen.set(date, cell.getBoundingClientRect());
    }
    cameFrom.current = seen;
    setDirection(0);
    setMonth(new Date());
    setExpanded(next);
  }, []);

  /**
   * Between the two shapes, in order.
   *
   * The surface is cleared before the month arrives and given back after the
   * week returns — the calendar never moves while something else is still
   * fading. Doing both at once also put the two on the same frames, and the
   * calendar's own move is the expensive half: the fade spent its first third
   * waiting for it.
   */
  const swap = useCallback(() => {
    if (midSwap.current) return;
    midSwap.current = true;
    if (!expanded) {
      onExpand?.(true);
      window.setTimeout(() => {
        change(true);
        midSwap.current = false;
      }, CLEARING_MS);
      return;
    }
    change(false);
    // Not after the week has landed — as it is landing. Waiting for the last
    // of a long tail and then starting a fade is most of a second of nothing
    // happening.
    window.setTimeout(() => {
      onExpand?.(false);
      midSwap.current = false;
    }, RETURNING_MS);
  }, [expanded, onExpand, change]);

  // The back control comes on with the month and stays through its own exit.
  useEffect(() => {
    if (expanded) {
      setBackOnRow(true);
      return;
    }
    const gone = window.setTimeout(() => setBackOnRow(false), CONTROL_OUT_MS);
    return () => window.clearTimeout(gone);
  }, [expanded]);

  // Escape closes the month, the way it closes anything that has taken the
  // surface. Only while it is open, and never over a dialog that has its own
  // claim on the key.
  useEffect(() => {
    if (!expanded) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('dialog[open], [role="dialog"]')) return;
      swap();
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  });

  useLayoutEffect(() => {
    const before = cameFrom.current;
    cameFrom.current = null;
    if (!before || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const cells = [...document.querySelectorAll<HTMLElement>('[data-day]')];
    const now = new Map(
      cells.map((cell) => [cell.dataset['day'] ?? '', cell.getBoundingClientRect()]),
    );
    // The grid is whichever of the two shapes has rows. The strip has one, so
    // it can say nothing about where a row ends or how far the next one is.
    const geo = rowsOf([...now.values()]) ?? rowsOf([...before.values()]);

    for (const cell of cells) {
      const was = before.get(cell.dataset['day'] ?? '');
      const is = now.get(cell.dataset['day'] ?? '');
      // One motion for every day the two shapes share: same path, same start,
      // same finish. Nothing is held back and nothing is faded in behind
      // something else — a calendar that arrives in three goes is three
      // animations, however well each one is timed.
      if (was && is) {
        if (Math.abs(was.left - is.left) < 1 && Math.abs(was.top - is.top) < 1) continue;
        cell.animate(wrapped(was, is, geo), { duration: MOVE_MS, easing: EASE });
        continue;
      }
      // Only a day neither shape had — the tail of a month the strip does not
      // reach. It has nowhere to come from.
      cell.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: ARRIVE_MS,
        easing: EASE,
        fill: 'both',
      });
    }
  }, [expanded]);

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
          {/* Out of the month and back to the week, beside the controls that
              move within it. */}
          {backOnRow && (
            <button
              type="button"
              aria-label="Back to the week"
              onClick={swap}
              className={`${STEP} ${expanded ? 'control-in' : 'control-out'}`}
            >
              <ArrowLeft className="h-3 w-3" />
            </button>
          )}
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
          <button type="button" onClick={swap} className={`${STEP} ml-1`}>
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
          className="mt-2 grid grid-cols-7 gap-2"
        >
          {DAY_LABELS.map((label) => (
            <div
              key={label}
              className="pb-1 font-body text-[10px] uppercase tracking-wide text-muted-foreground/60"
            >
              {label}
            </div>
          ))}
          {monthDays.map((day) => (
            <DayCell
              key={isoDate(day)}
              day={day}
              slots={slots.get(isoDate(day)) ?? []}
              today={today}
              dim={day.getMonth() !== month.getMonth()}
              height={84}
              limit={3}
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
          className="mt-2 flex snap-x snap-proximity gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {days.map((day) => (
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
