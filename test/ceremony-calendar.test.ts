import { describe, expect, it } from 'vitest';

import {
  isoDate,
  minutesOfDay,
  monthGrid,
  occurrences,
  upcoming,
  weekdayList,
  type Scheduled,
} from '../src/shared/ceremony-calendar';

const standup = (over: Partial<Scheduled> = {}): Scheduled => ({
  name: 'morning-standup',
  mode: 'standup',
  at: '09:00',
  weekdays: '1-5',
  enabled: true,
  channels: ['slack'],
  ...over,
});

describe('weekdayList', () => {
  it('expands ranges and lists the way the scheduler does', () => {
    expect(weekdayList('1-5')).toEqual([1, 2, 3, 4, 5]);
    expect(weekdayList('1,3,5')).toEqual([1, 3, 5]);
    expect(weekdayList('1-2,6-7')).toEqual([1, 2, 6, 7]);
  });

  it('falls back to the working week rather than to nothing', () => {
    expect(weekdayList('')).toEqual([1, 2, 3, 4, 5]);
    expect(weekdayList('sometimes')).toEqual([1, 2, 3, 4, 5]);
  });

  it('drops days that are not days', () => {
    expect(weekdayList('0,3,9')).toEqual([3]);
  });
});

describe('minutesOfDay', () => {
  it('reads a time of day', () => {
    expect(minutesOfDay('09:00')).toBe(540);
    expect(minutesOfDay('17:45')).toBe(1065);
  });

  it('puts an unreadable time at midnight rather than losing it', () => {
    expect(minutesOfDay('')).toBe(0);
  });
});

describe('occurrences', () => {
  // Mon 2026-09-07 to Sun 2026-09-13.
  const monday = new Date(2026, 8, 7);
  const sunday = new Date(2026, 8, 13);

  it('fires on each weekday in the spec', () => {
    const dates = occurrences([standup()], monday, sunday).map((slot) => slot.date);
    expect(dates).toEqual(['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11']);
  });

  it('never fires a paused ceremony', () => {
    expect(occurrences([standup({ enabled: false })], monday, sunday)).toEqual([]);
  });

  it('skips exactly the skipped date and keeps the cadence', () => {
    const dates = occurrences([standup({ skipNext: '2026-09-09' })], monday, sunday).map(
      (slot) => slot.date,
    );
    expect(dates).toEqual(['2026-09-07', '2026-09-08', '2026-09-10', '2026-09-11']);
  });

  it('orders a day by time, not by ceremony', () => {
    const retro = standup({ name: 'retro', mode: 'retro', at: '15:00', weekdays: '1' });
    const early = standup({ name: 'early', at: '08:00', weekdays: '1' });
    const names = occurrences([retro, early], monday, monday).map((slot) => slot.ceremony.name);
    expect(names).toEqual(['early', 'retro']);
  });
});

describe('upcoming', () => {
  it('drops what has already happened today and keeps what has not', () => {
    // Wednesday 2026-09-09, 10:00 — past this morning's standup.
    const now = new Date(2026, 8, 9, 10, 0);
    const next = upcoming([standup()], now, 2);
    expect(next.map((slot) => slot.date)).toEqual(['2026-09-10', '2026-09-11']);
  });

  it('keeps a slot still to come today', () => {
    const now = new Date(2026, 8, 9, 8, 0);
    expect(upcoming([standup()], now, 1)[0]?.date).toBe('2026-09-09');
  });
});

describe('monthGrid', () => {
  it('draws whole weeks starting on Monday', () => {
    const days = monthGrid(new Date(2026, 8, 1));
    expect(days.length % 7).toBe(0);
    expect(days[0]!.getDay()).toBe(1);
    expect(isoDate(days[0]!)).toBe('2026-08-31');
    expect(days[days.length - 1]!.getDay()).toBe(0);
  });

  it('contains every day of the month it is for', () => {
    const dates = monthGrid(new Date(2026, 8, 1)).map(isoDate);
    expect(dates).toContain('2026-09-01');
    expect(dates).toContain('2026-09-30');
  });
});
