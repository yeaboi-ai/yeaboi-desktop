'use client';

// Standup schedule — the terminal's six-step wizard as one form.
//
// Saving installs (or removes) the OS jobs: standup/schedule.py does both, so
// the two surfaces can never leave a machine with a config that says "10:00"
// and a launchd job that says something else.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  type ScheduleView,
  loadSchedule,
  loadStandup,
  saveSchedule,
  weekdaySpec,
} from '@/lib/yeaboi/dashboards';
import { PageShell } from '@/components/page-shell';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { Button } from '@/components/ui/button';
import { useAudience } from '@/components/providers/audience-provider';

const TIME_PRESETS = ['09:00', '09:30', '10:00', '10:30', '11:00'];
const LEAD_PRESETS = [5, 10, 15, 30];
const REMINDERS: [number, string][] = [
  [0, 'No reminder'],
  [30, '30 minutes after'],
  [60, '1 hour after'],
  [120, '2 hours after'],
];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CHANNEL_HINTS: Record<string, string> = {
  terminal: 'print in the terminal the run opens',
  desktop: 'system notification',
  slack: 'post to Slack (needs SLACK_WEBHOOK_URL)',
  email: 'send via SMTP (needs STANDUP_SMTP_* settings)',
};

/** "1-5" / "1,3,5" → the weekday numbers it names. */
function parseWeekdays(spec: string): number[] {
  const days = new Set<number>();
  for (const part of spec.split(',')) {
    const bounds = part.split('-').map((n) => Number.parseInt(n, 10));
    const from = bounds[0];
    if (from === undefined || Number.isNaN(from)) continue;
    const to = bounds[1];
    const last = to === undefined || Number.isNaN(to) ? from : to;
    for (let day = from; day <= last; day += 1) days.add(day);
  }
  return [...days].sort();
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card ring-1 ring-border/60 p-5">
      <h2 className="text-[13px] font-body font-medium text-foreground mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Notice({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl bg-card ring-1 ring-destructive/30 p-4">
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      {items.map((item) => (
        <p key={item} className="text-[12px] text-muted-foreground mt-1">
          {item}
        </p>
      ))}
    </div>
  );
}

const selectClass =
  'mt-1 w-full rounded-lg bg-secondary/40 border border-border/40 px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40';

function StandupScheduleBody() {
  const { audience } = useAudience();
  const [view, setView] = useState<ScheduleView | null>(null);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadStandup()
      .then((dash) => {
        if (!dash.session_id) throw new Error('No project yet — plan one first.');
        return loadSchedule(dash.session_id);
      })
      .then(
        (saved) => {
          setView(saved);
          setDays(parseWeekdays(saved.weekdays));
        },
        (e: Error) => setError(e.message),
      );
  }, []);

  async function save() {
    if (!view || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await saveSchedule({
        ...view,
        weekdays: weekdaySpec(days),
        solo: audience === 'solo',
      });
      setMessage(result.message);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  if (error && !view) return <Notice title="No schedule to set up" items={[error]} />;
  if (!view) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  const set = (patch: Partial<ScheduleView>) => setView({ ...view, ...patch });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-foreground">Standup schedule</h1>
        <p className="text-[13px] text-muted-foreground mt-1">
          The job runs {view.lead_minutes} minutes before the standup, so the summary is waiting
          when the meeting starts.
        </p>
      </div>

      <Section title="When">
        <label className="block mb-3">
          <span className="text-[11px] font-body text-muted-foreground uppercase tracking-wide">
            Standup at
          </span>
          <select
            value={view.time}
            onChange={(e) => set({ time: e.target.value })}
            className={selectClass}
          >
            {[...new Set([...TIME_PRESETS, view.time])].sort().map((time) => (
              <option key={time} value={time}>
                {time}
              </option>
            ))}
          </select>
        </label>
        <label className="block mb-3">
          <span className="text-[11px] font-body text-muted-foreground uppercase tracking-wide">
            Deliver
          </span>
          <select
            value={String(view.lead_minutes)}
            onChange={(e) => set({ lead_minutes: Number(e.target.value) })}
            className={selectClass}
          >
            {[...new Set([...LEAD_PRESETS, view.lead_minutes])]
              .sort((a, b) => a - b)
              .map((lead) => (
                <option key={lead} value={String(lead)}>
                  {lead} minutes before
                </option>
              ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((label, index) => {
            const day = index + 1;
            return (
              <button
                key={label}
                type="button"
                className={`rounded-full px-3 py-1 text-[12px] transition-colors ${
                  days.includes(day)
                    ? 'bg-primary/10 text-foreground ring-1 ring-primary/40'
                    : 'bg-secondary/40 text-muted-foreground hover:bg-secondary/70'
                }`}
                onClick={() =>
                  setDays(days.includes(day) ? days.filter((d) => d !== day) : [...days, day])
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Where it goes">
        <div className="space-y-2">
          {view.valid_channels.map((channel) => (
            <label key={channel} className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 accent-[var(--primary)]"
                checked={view.delivery_channels.includes(channel)}
                onChange={() =>
                  set({
                    delivery_channels: view.delivery_channels.includes(channel)
                      ? view.delivery_channels.filter((c) => c !== channel)
                      : [...view.delivery_channels, channel],
                  })
                }
              />
              <span className="text-[13px] text-foreground">
                <strong className="font-medium">{channel}</strong>
                <span className="text-muted-foreground"> — {CHANNEL_HINTS[channel] ?? ''}</span>
              </span>
            </label>
          ))}
        </div>
      </Section>

      <Section title="Afterwards">
        <label className="block mb-3">
          <span className="text-[11px] font-body text-muted-foreground uppercase tracking-wide">
            Remind me to drop the transcript
          </span>
          <select
            value={String(view.remind_after)}
            onChange={(e) => set({ remind_after: Number(e.target.value) })}
            className={selectClass}
          >
            {REMINDERS.map(([minutes, label]) => (
              <option key={minutes} value={String(minutes)}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <p className="text-[11px] text-muted-foreground">
          A reminder only fires alongside a scheduled standup — switching the schedule off removes
          both jobs.
        </p>
      </Section>

      <label className="flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5 accent-[var(--primary)]"
          checked={view.enabled}
          onChange={() => set({ enabled: !view.enabled })}
        />
        <span className="text-[13px] text-foreground font-medium">
          Run this standup on a schedule
        </span>
      </label>

      {error && <Notice title="Could not save" items={[error]} />}
      {message && <p className="text-[11px] text-muted-foreground">{message}</p>}

      <div className="flex items-center gap-3">
        <Button size="sm" disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save schedule'}
        </Button>
        <Link
          href="/team/standup"
          className="text-[12px] text-muted-foreground hover:text-foreground"
        >
          Back to the standup
        </Link>
      </div>
    </div>
  );
}

export default function StandupSchedulePage() {
  return (
    <PageShell width="narrow">
      <BackendGate>
        <StandupScheduleBody />
      </BackendGate>
    </PageShell>
  );
}
