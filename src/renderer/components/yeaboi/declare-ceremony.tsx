'use client';

// Declaring a ceremony: a mode, a time, the days, and where the run lands.
//
// Installing one installs an OS job, so the backend answers with the cadence
// it wrote and the terminal command that would have written the same thing.

import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Picker } from '@/components/ui/picker';
import { ConnectorSheet } from '@/components/yeaboi/connector-sheet';
import { type ConnectionRow, loadConnections } from '@/lib/yeaboi/connections';
import { type CeremoniesPage, declareCeremony } from '@/lib/yeaboi/ops';
import { loadSettings } from '@/lib/yeaboi/settings';
import { cn } from '@/lib/utils';

const INPUT =
  'mt-1 w-full rounded-lg bg-secondary/40 border border-border/40 px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40';

const LABEL = 'text-[11px] font-body text-muted-foreground uppercase tracking-wide';
/** A field inside a section, which the section's own label already frames. */
const SUB = 'text-[10.5px] font-body text-muted-foreground/70 uppercase tracking-wide';
/** The one-press cadences beside the day keys. */
const QUICK =
  'rounded-md px-1.5 py-0.5 font-body text-[11px] text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground';

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

/** The modes this list offers: the rooms a team turns up to, then the readouts
 *  that arrive on their own. The agent reports are the agents world's own and
 *  are not offered here. */
const GROUPS = [
  { title: 'Ceremonies', keys: ['standup', 'retro', 'poker'] },
  { title: 'Analyses', keys: ['report', 'weekly-review'] },
];

function offered(modes: CeremoniesPage['modes']): (CeremoniesPage['modes'][number] & {
  group?: string;
})[] {
  return GROUPS.flatMap(({ title, keys }) =>
    keys
      .flatMap((key) => modes.filter((mode) => mode.key === key))
      .map((mode, at) => (at === 0 ? { ...mode, group: title } : mode)),
  );
}

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border/40 pt-3 first:border-0 first:pt-0">
      <p className={LABEL}>{title}</p>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

/** One row of the form: what it is on the left, the control filling the rest. */
function Field({
  label,
  children,
  action,
  align = 'center',
}: {
  label: string;
  children: React.ReactNode;
  /** A control that belongs to the label rather than to the field. */
  action?: React.ReactNode;
  /** Where the label sits against a control taller than one row. */
  align?: 'center' | 'start';
}) {
  return (
    <div className={cn('flex gap-3', align === 'center' ? 'items-center' : 'items-start')}>
      <div className={cn('w-[68px] shrink-0', align === 'start' && 'mt-2')}>
        <p className={SUB}>{label}</p>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

function Tick({
  on,
  disabled,
  label,
  align = 'center',
  onClick,
}: {
  on: boolean;
  disabled?: boolean;
  label: string;
  /** Centred where ticks share a row evenly; left where one stands alone. */
  align?: 'center' | 'start';
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
        'inline-flex w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-body text-[12px] transition-colors',
        align === 'center' ? 'justify-center' : 'justify-start',
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
  const modes = offered(page.modes);
  // The standup rather than whatever heads the list: it is the one most
  // schedules are, and the rooms lead the list because that is the order they
  // are read in, not because one of them is the likely answer.
  const first = modes.find((mode) => mode.key === 'standup') ?? modes[0];
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
  // Setting it up happens here rather than three screens away: the same sheet
  // the Integrations catalog opens, over the form that asked for it.
  const [slackRow, setSlackRow] = useState<ConnectionRow | null>(null);
  const [connecting, setConnecting] = useState(false);
  const picked = modes.find((option) => option.key === mode);
  const [hour = '09', minute = '00'] = at.split(':');

  const readSlack = useCallback(async () => {
    try {
      const settings = await loadSettings();
      setSlackReady(settings.fields.some((f) => f.section === 'slack' && f.is_set));
    } catch {
      /* an unreadable settings answer reads as "not set up yet" */
    }
    try {
      const { connectors } = await loadConnections(true);
      setSlackRow(connectors.find((one) => one.key === 'slack') ?? null);
    } catch {
      /* without the catalog the link falls back to the settings page */
    }
  }, []);

  useEffect(() => {
    void readSlack();
  }, [readSlack]);

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
    // The fields scroll; the button that installs the job does not move.
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <Section title="What runs">
          <Field label="Mode" align="start">
            <Picker
              label="Mode"
              value={mode}
              onChange={(key) => {
                setMode(key);
                const option = modes.find((row) => row.key === key);
                if (!option) return;
                setAt(option.default_at);
                // A day picked on the grid is the reason the form is open; a
                // mode's own week does not overrule it.
                if (!weekday) setDays(daysOf(option.default_weekdays));
              }}
              options={modes.map((option) => ({
                value: option.key,
                label: option.label,
                // A room costs nothing to open; the readouts are an LLM call.
                note:
                  option.est_cost_usd > 0 ? `about $${option.est_cost_usd.toFixed(2)} a run` : '',
                ...(option.group ? { group: option.group } : {}),
              }))}
            />
            {picked && <p className="mt-1.5 text-[12px] text-muted-foreground">{picked.blurb}</p>}
          </Field>

          <Field label="Name">
            <input
              type="text"
              value={name}
              placeholder="morning-standup"
              onChange={(e) => setName(e.target.value)}
              className={INPUT}
            />
          </Field>
        </Section>

        <Section title="When">
          <Field label="Time">
            <div className="flex items-center gap-2">
              <Picker
                label="Hour"
                className="flex-1"
                value={hour}
                onChange={(next) => setAt(`${next}:${minute}`)}
                options={HOURS.map((one) => ({ value: one, label: one }))}
              />
              <span className="text-muted-foreground">:</span>
              <Picker
                label="Minute"
                className="flex-1"
                value={minute}
                onChange={(next) => setAt(`${hour}:${next}`)}
                options={MINUTES.map((one) => ({ value: one, label: one }))}
              />
            </div>
          </Field>

          <Field label="Repeats" align="start">
            <div className="flex gap-1">
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
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">{cadence(days, at)}</p>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setDays(WEEKDAYS)} className={QUICK}>
                  Weekdays
                </button>
                <button type="button" onClick={() => setDays(EVERY_DAY)} className={QUICK}>
                  Every day
                </button>
              </div>
            </div>
          </Field>
        </Section>

        <Section title="Where it lands">
          <Field label="Deliver to">
            <div
              className="grid gap-1.5"
              style={{
                gridTemplateColumns: `repeat(${page.channels.filter((c) => c !== 'slack').length}, minmax(0, 1fr))`,
              }}
            >
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
          </Field>

          {page.channels.includes('slack') && (
            <Field
              label="Slack"
              align="start"
              action={
                slackRow && (
                  <button
                    type="button"
                    onClick={() => setConnecting(true)}
                    className="mt-2 inline-flex shrink-0 items-center gap-1 font-body text-[11px] text-muted-foreground transition-colors hover:text-primary"
                  >
                    {slackReady ? 'Edit' : 'Set it up'}
                    <ArrowUpRight className="h-3 w-3" aria-hidden />
                  </button>
                )
              }
            >
              <Tick
                on={channels.includes('slack')}
                disabled={!slackReady}
                label="Post the run to Slack"
                align="start"
                onClick={() => toggleChannel('slack')}
              />
              <p className="mt-1.5 text-[11px] text-muted-foreground/80">
                {slackReady
                  ? 'Where it posts is the channel the workspace is connected to.'
                  : 'Add a webhook or a bot token and this lane opens.'}
              </p>
            </Field>
          )}
        </Section>
      </div>

      {slackRow && connecting && (
        <ConnectorSheet row={slackRow} onClose={() => setConnecting(false)} onChanged={readSlack} />
      )}

      <div className="border-t border-border/60 px-5 py-3">
        <Button
          size="sm"
          className="w-full"
          disabled={busy || !name || !mode || days.length === 0}
          onClick={() => void submit()}
        >
          {busy ? 'Installing…' : 'Declare and install'}
        </Button>
      </div>
    </div>
  );
}
