// When a declared ceremony actually fires.
//
// The backend hands the app a cadence as a *label* ("Mon–Fri at 09:00") — good
// for a row, useless for a grid, which needs dates. So the spec is expanded
// here using the scheduler's own rules: `weekday_list` in
// ceremonies/scheduler.py, Mon=1..Sun=7, ranges and lists, defaulting to the
// working week. Anything that reads differently from the scheduler would put a
// meeting on a day nothing happens, which is worse than no calendar.
//
// Paused ceremonies never occur, and a one-shot skip removes exactly its own
// date rather than the whole cadence.

export interface Scheduled {
  name: string;
  mode: string;
  /** "09:00", the local time of day it fires. */
  at: string;
  /** "1-5", "1,3,5" — Mon=1..Sun=7. */
  weekdays: string;
  enabled: boolean;
  /** An ISO date this cadence skips exactly once. */
  skipNext?: string;
  /** Where its output lands: terminal, desktop, slack, email. */
  channels: string[];
}

export interface Occurrence {
  /** Local ISO date, `YYYY-MM-DD`. */
  date: string;
  /** Minutes past midnight, so occurrences sort without parsing again. */
  minutes: number;
  at: string;
  ceremony: Scheduled;
}

/** Mon=1..Sun=7, matching the scheduler rather than `Date#getDay`. */
export function weekdayList(spec: string): number[] {
  const days: number[] = [];
  for (const raw of spec.split(',')) {
    const chunk = raw.trim();
    if (!chunk) continue;
    if (chunk.includes('-')) {
      const [lo, hi] = chunk.split('-', 2).map((part) => Number.parseInt(part, 10));
      if (Number.isNaN(lo) || Number.isNaN(hi)) continue;
      for (let day = lo; day <= hi; day += 1) days.push(day);
    } else {
      const day = Number.parseInt(chunk, 10);
      if (!Number.isNaN(day)) days.push(day);
    }
  }
  const kept = days.filter((day) => day >= 1 && day <= 7);
  return kept.length > 0 ? [...new Set(kept)].sort((a, b) => a - b) : [1, 2, 3, 4, 5];
}

/** "09:00" → 540. Anything unparseable fires at midnight rather than vanishing:
 *  a ceremony on the wrong line is visible, one dropped is not. */
export function minutesOfDay(at: string): number {
  const [hours, mins] = at.split(':', 2).map((part) => Number.parseInt(part, 10));
  if (Number.isNaN(hours)) return 0;
  return hours * 60 + (Number.isNaN(mins) ? 0 : mins);
}

export function isoDate(day: Date): string {
  const month = `${day.getMonth() + 1}`.padStart(2, '0');
  const date = `${day.getDate()}`.padStart(2, '0');
  return `${day.getFullYear()}-${month}-${date}`;
}

/** Mon=1..Sun=7 for a local date. */
function weekdayOf(day: Date): number {
  return day.getDay() === 0 ? 7 : day.getDay();
}

export function addDays(day: Date, count: number): Date {
  const next = new Date(day);
  next.setDate(next.getDate() + count);
  return next;
}

/** Every firing between `from` and `until`, inclusive of both dates, in order. */
export function occurrences(ceremonies: Scheduled[], from: Date, until: Date): Occurrence[] {
  const found: Occurrence[] = [];
  for (const ceremony of ceremonies) {
    if (!ceremony.enabled) continue;
    const days = weekdayList(ceremony.weekdays);
    const minutes = minutesOfDay(ceremony.at);
    for (let day = new Date(from); day <= until; day = addDays(day, 1)) {
      if (!days.includes(weekdayOf(day))) continue;
      const date = isoDate(day);
      if (ceremony.skipNext === date) continue;
      found.push({ date, minutes, at: ceremony.at, ceremony });
    }
  }
  return found.sort((a, b) => a.date.localeCompare(b.date) || a.minutes - b.minutes);
}

/** The next `count` firings from `now`, today's remaining ones included. */
export function upcoming(ceremonies: Scheduled[], now: Date, count = 5): Occurrence[] {
  const today = isoDate(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return occurrences(ceremonies, now, addDays(now, 28))
    .filter((slot) => slot.date !== today || slot.minutes >= nowMinutes)
    .slice(0, count);
}

/** The days a month grid has to draw: whole weeks, Monday first, so the grid is
 *  rectangular and the month sits inside it. */
export function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = addDays(first, -(weekdayOf(first) - 1));
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const end = addDays(last, 7 - weekdayOf(last));
  const days: Date[] = [];
  for (let day = new Date(start); day <= end; day = addDays(day, 1)) days.push(new Date(day));
  return days;
}
