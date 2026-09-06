'use client';

// Declaring a ceremony: a mode, a time, the days, and where the run lands.
//
// Installing one installs an OS job, so the backend answers with the cadence
// it wrote and the terminal command that would have written the same thing.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Picker } from '@/components/ui/picker';
import { type CeremoniesPage, declareCeremony } from '@/lib/yeaboi/ops';
import { loadSettings } from '@/lib/yeaboi/settings';
import { cn } from '@/lib/utils';

const INPUT =
  'mt-1 w-full rounded-lg bg-secondary/40 border border-border/40 px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40';

const LABEL = 'text-[11px] font-body text-muted-foreground uppercase tracking-wide';

const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, step) => String(step * 5).padStart(2, '0'));

/** Mon=1..Sun=7, the scheduler's numbering. */
const DAYS = [
  { day: 1, short: 'M', label: 'Monday' },
  { day: 2, short: 'T', label: 'Tuesday' },
  { day: 3, short: 'W', label: 'Wednesday' },
  { day: 4, short: 'T', label: 'Thursday' },
  { day: 5, short: 'F', label: 'Friday' },
  { day: 6, short: 'S', label: 'Saturday' },
  { day: 7, short: 'S', label: 'Sunday' },
];

const WEEKDAYS = [1, 2, 3, 4, 5];
const EVERY_DAY = [1, 2, 3, 4, 5, 6, 7];

/** "1-5", "1,3,5" → the days it names. */
function daysOf(spec: string): number[] {
  const days: number[] = [];
  for (const chunk of spec.split(',')) {
    const part = chunk.trim();
    if (!part) continue;
    if (part.includes('-')) {
      const [lo, hi] = part.split('-', 2).map((piece) => Number.parseInt(piece, 10));
      if (Number.isNaN(lo!) || Number.isNaN(hi!)) continue;
      for (let day = lo!; day <= hi!; day += 1) days.push(day);
    } else {
      const day = Number.parseInt(part, 10);
      if (!Number.isNaN(day)) days.push(day);
    }
  }
  return [...new Set(days.filter((day) => day >= 1 && day <= 7))].sort((a, b) => a - b);
}

/** The days back as a spec, runs of three or more written as ranges. */
function specOf(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let at = 0; at < sorted.length;) {
    let end = at;
    while (end + 1 < sorted.length && sorted[end + 1] === sorted[end]! + 1) end += 1;
    const run = end - at + 1;
    if (run >= 3) parts.push(`${sorted[at]}-${sorted[end]}`);
    else for (let one = at; one <= end; one += 1) parts.push(String(sorted[one]));
    at = end + 1;
  }
  return parts.join(',');
}

/** How the cadence reads back, so the form says what it is about to install. */
function cadence(days: number[], at: string): string {
  if (days.length === 0) return 'No day picked yet';
  const named = days.map((day) => DAYS[day - 1]!.label.slice(0, 3));
  const every =
    specOf(days) === '1-5'
      ? 'Mon–Fri'
      : specOf(days) === '1-7'
        ? 'every day'
        : named.length > 3
          ? `${named.slice(0, 3).join(', ')} +${named.length - 3}`
          : named.join(', ');
  return `${every} at ${at}`;
}

function Tick({
  on,
  disabled,
  label,
  onClick,
}: {
  on: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-body text-[12px] transition-colors',
        'focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:outline-none',
        disabled
          ? 'cursor-not-allowed border-border/30 text-muted-foreground/40'
          : on
            ? 'border-primary/60 bg-primary/10 text-foreground'
            : 'border-border/40 text-muted-foreground hover:border-border hover:text-foreground',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex h-3.5 w-3.5 items-center justify-center rounded-[4px] border',
          on ? 'border-primary bg-primary text-primary-foreground' : 'border-border/60',
        )}
      >
        {on && <Check className="h-2.5 w-2.5" />}
      </span>
      {label}
    </button>
  );
}

export function DeclareCeremony({
  page,
  weekday,
  onDone,
  onError,
}: {
  page: CeremoniesPage;
  /** The day it starts out running on, Mon=1..Sun=7 — the day that was
   *  clicked. Without one the mode's own default week is offered. */
  weekday?: number;
  /** The message the backend answered with: the cadence, and the command. */
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const first = page.modes[0];
  const [mode, setMode] = useState(first?.key ?? '');
  const [name, setName] = useState('');
  const [at, setAt] = useState(first?.default_at ?? '09:00');
  const [days, setDays] = useState<number[]>(
    weekday ? [weekday] : daysOf(first?.default_weekdays ?? '1-5'),
  );
  // `desktop` and not `terminal`: the backend drops the terminal channel from
  // every fan-out (stdout is the handshake), so a ceremony delivering only
  // there would run and reach nobody.
  const [channels, setChannels] = useState<string[]>(['desktop']);
  const [busy, setBusy] = useState(false);
  // Slack can carry a run only once its credentials are in. Unknown until the
  // settings answer, and treated as absent until then — offering a lane that
  // silently drops the report is worse than one more click.
  const [slackReady, setSlackReady] = useState(false);
  const picked = page.modes.find((option) => option.key === mode);
  const [hour = '09', minute = '00'] = at.split(':');

  useEffect(() => {
    let live = true;
    loadSettings().then(
      (settings) => {
        if (!live) return;
        setSlackReady(settings.fields.some((f) => f.section === 'slack' && f.is_set));
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);

  const toggleDay = (day: number) =>
    setDays((chosen) =>
      chosen.includes(day) ? chosen.filter((one) => one !== day) : [...chosen, day].sort(),
    );

  const toggleChannel = (channel: string) =>
    setChannels((chosen) =>
      chosen.includes(channel) ? chosen.filter((one) => one !== channel) : [...chosen, channel],
    );

  async function submit() {
    setBusy(true);
    try {
      const declared = await declareCeremony({
        name,
        mode,
        at,
        weekdays: specOf(days),
        channels,
      });
      onDone(`${declared.ceremony.name} — ${declared.cadence}. ${declared.command}`);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <span className={LABEL}>Mode</span>
        <div className="mt-1">
          <Picker
            label="Mode"
            value={mode}
            onChange={(key) => {
              setMode(key);
              const option = page.modes.find((row) => row.key === key);
              if (!option) return;
              setAt(option.default_at);
              // A day picked on the grid is the reason the form is open; a
              // mode's own week does not overrule it.
              if (!weekday) setDays(daysOf(option.default_weekdays));
            }}
            options={page.modes.map((option) => ({
              value: option.key,
              label: option.label,
              note: `about $${option.est_cost_usd.toFixed(2)} a run`,
            }))}
          />
        </div>
        {picked && <p className="mt-1.5 text-[12px] text-muted-foreground">{picked.blurb}</p>}
      </div>

      <label className="block">
        <span className={LABEL}>Name</span>
        <input
          type="text"
          value={name}
          placeholder="morning-standup"
          onChange={(e) => setName(e.target.value)}
          className={INPUT}
        />
      </label>

      <div>
        <span className={LABEL}>Time</span>
        <div className="mt-1 flex items-center gap-2">
          <Picker
            label="Hour"
            className="w-20"
            value={hour}
            onChange={(next) => setAt(`${next}:${minute}`)}
            options={HOURS.map((one) => ({ value: one, label: one }))}
          />
          <span className="text-muted-foreground">:</span>
          <Picker
            label="Minute"
            className="w-20"
            value={minute}
            onChange={(next) => setAt(`${hour}:${next}`)}
            options={MINUTES.map((one) => ({ value: one, label: one }))}
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <span className={LABEL}>Repeats</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setDays(WEEKDAYS)}
              className="rounded-md px-1.5 py-0.5 font-body text-[11px] text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
            >
              Weekdays
            </button>
            <button
              type="button"
              onClick={() => setDays(EVERY_DAY)}
              className="rounded-md px-1.5 py-0.5 font-body text-[11px] text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
            >
              Every day
            </button>
          </div>
        </div>
        <div className="mt-1.5 flex gap-1">
          {DAYS.map((one) => {
            const on = days.includes(one.day);
            return (
              <button
                key={one.day}
                type="button"
                aria-pressed={on}
                aria-label={one.label}
                onClick={() => toggleDay(one.day)}
                className={cn(
                  'h-8 flex-1 rounded-lg border font-body text-[12px] transition-colors',
                  'focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:outline-none',
                  on
                    ? 'border-primary/60 bg-primary/10 text-foreground'
                    : 'border-border/40 text-muted-foreground hover:border-border hover:text-foreground',
                )}
              >
                {one.short}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">{cadence(days, at)}</p>
      </div>

      <div>
        <span className={LABEL}>Deliver to</span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {page.channels
            .filter((channel) => channel !== 'slack')
            .map((channel) => (
              <Tick
                key={channel}
                on={channels.includes(channel)}
                label={channel}
                onClick={() => toggleChannel(channel)}
              />
            ))}
        </div>
      </div>

      {page.channels.includes('slack') && (
        <div className="rounded-xl border border-border/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className={LABEL}>Slack</span>
            {!slackReady && (
              <Link
                href="/settings/connections"
                className="inline-flex items-center gap-1 font-body text-[11px] text-muted-foreground transition-colors hover:text-primary"
              >
                Set it up
                <ArrowUpRight className="h-3 w-3" aria-hidden />
              </Link>
            )}
          </div>
          <div className="mt-1.5">
            <Tick
              on={channels.includes('slack')}
              disabled={!slackReady}
              label="Post the run to Slack"
              onClick={() => toggleChannel('slack')}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground/80">
            {slackReady
              ? 'Where it posts is the channel the workspace is connected to.'
              : 'Connect a Slack workspace in Integrations and this lane opens.'}
          </p>
        </div>
      )}

      <Button
        size="sm"
        disabled={busy || !name || !mode || days.length === 0}
        onClick={() => void submit()}
      >
        {busy ? 'Installing…' : 'Declare and install'}
      </Button>
    </div>
  );
}
