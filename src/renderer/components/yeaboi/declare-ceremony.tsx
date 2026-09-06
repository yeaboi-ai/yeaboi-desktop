'use client';

// Declaring a ceremony: a mode, a time, the days, and where the run lands.
//
// Installing one installs an OS job, so the backend answers with the cadence
// it wrote and the terminal command that would have written the same thing.

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { type CeremoniesPage, declareCeremony } from '@/lib/yeaboi/ops';

const INPUT =
  'mt-1 w-full rounded-lg bg-secondary/40 border border-border/40 px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40';

const LABEL = 'text-[11px] font-body text-muted-foreground uppercase tracking-wide';

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
  const [weekdays, setWeekdays] = useState(
    weekday ? String(weekday) : (first?.default_weekdays ?? '1-5'),
  );
  // `desktop` and not `terminal`: the backend drops the terminal channel from
  // every fan-out (stdout is the handshake), so a ceremony delivering only
  // there would run and reach nobody.
  const [channels, setChannels] = useState<string[]>(['desktop']);
  const [busy, setBusy] = useState(false);
  const picked = page.modes.find((option) => option.key === mode);

  async function submit() {
    setBusy(true);
    try {
      const declared = await declareCeremony({ name, mode, at, weekdays, channels });
      onDone(`${declared.ceremony.name} — ${declared.cadence}. ${declared.command}`);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className={LABEL}>Mode</span>
        <select
          value={mode}
          onChange={(e) => {
            const key = e.target.value;
            setMode(key);
            const option = page.modes.find((row) => row.key === key);
            if (option) {
              setAt(option.default_at);
              if (!weekday) setWeekdays(option.default_weekdays);
            }
          }}
          className={INPUT}
        >
          {page.modes.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {picked && (
        <p className="text-[12px] text-muted-foreground">
          {picked.blurb} · about ${picked.est_cost_usd.toFixed(2)} a run
        </p>
      )}
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
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={LABEL}>At</span>
          <input type="text" value={at} onChange={(e) => setAt(e.target.value)} className={INPUT} />
        </label>
        <label className="block">
          <span className={LABEL}>Days</span>
          <input
            type="text"
            value={weekdays}
            onChange={(e) => setWeekdays(e.target.value)}
            className={INPUT}
          />
        </label>
      </div>
      <div>
        <span className={LABEL}>Deliver to</span>
        <div className="mt-1.5 flex flex-wrap gap-3">
          {page.channels.map((channel) => (
            <label key={channel} className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={channels.includes(channel)}
                onChange={() =>
                  setChannels((chosen) =>
                    chosen.includes(channel)
                      ? chosen.filter((c) => c !== channel)
                      : [...chosen, channel],
                  )
                }
                className="accent-[var(--primary)]"
              />
              <span className="text-[13px] text-foreground">{channel}</span>
            </label>
          ))}
        </div>
      </div>
      <Button size="sm" disabled={busy || !name || !mode} onClick={() => void submit()}>
        {busy ? 'Installing…' : 'Declare and install'}
      </Button>
    </div>
  );
}
