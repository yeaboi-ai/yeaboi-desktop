'use client';

// New delivery report — pick a period, confirm the sources, then the run.
//
// Which extra step a period earns, and what a set of checked sprints makes as a
// window, are asked of the backend: the terminal walks the same flow, and a
// second copy of either rule is a second thing to drift.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { quip } from '@/lib/yeaboi/ambience';
import {
  type ModeRunState,
  type ReportingOptions,
  type SprintList,
  cancelModeRun,
  emptyModeRun,
  loadReportingOptions,
  loadSprints,
  reduceModeRun,
  resolveWindow,
  runReport,
} from '@/lib/yeaboi/modes';
import { ContextPicker } from '@/components/context/context-picker';
import { useContextScope } from '@/hooks/yeaboi/use-context-scope';
import { PageShell } from '@/components/page-shell';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { Button } from '@/components/ui/button';
import { useAudience } from '@/components/providers/audience-provider';

const QUARTER = 'quarter';
const WINDOW = 'window';

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

const inputClass =
  'mt-1 w-full rounded-lg bg-secondary/40 border border-border/40 px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40';

function ReportingSetupBody() {
  const router = useRouter();
  const { audience } = useAudience();
  const reads = useContextScope('reporting');
  const [options, setOptions] = useState<ReportingOptions | null>(null);
  const [period, setPeriod] = useState('');
  const [theme, setTheme] = useState('midnight');
  const [sources, setSources] = useState<Record<string, string[]> | null>(null);
  const [sprints, setSprints] = useState<SprintList | null>(null);
  const [checked, setChecked] = useState<number[]>([]);
  const [range, setRange] = useState({ start: '', end: '' });
  const [run, setRun] = useState<ModeRunState>(emptyModeRun());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadReportingOptions().then(
      (opts) => {
        setOptions(opts);
        setPeriod(opts.periods[0]?.key ?? '');
        setSources({ ...opts.sources.grid });
        setRange({ start: opts.default_window.start, end: opts.default_window.end });
      },
      (e: Error) => setError(e.message),
    );
  }, []);

  // The quarter's sprint list is loaded only when the quarter is chosen —
  // it costs a tracker round-trip.
  useEffect(() => {
    if (period !== QUARTER || sprints) return;
    loadSprints('').then(
      (list) => {
        setSprints(list);
        setChecked(list.checked);
      },
      (e: Error) => setError(e.message),
    );
  }, [period, sprints]);

  if (error && !options) return <Notice title="Could not open reporting" items={[error]} />;
  if (!options || !sources) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  const toggleSource = (component: string, name: string) => {
    const current = sources[component] ?? [];
    setSources({
      ...sources,
      [component]: current.includes(name) ? current.filter((s) => s !== name) : [...current, name],
    });
  };

  const toggleSprint = (index: number) =>
    setChecked(checked.includes(index) ? checked.filter((i) => i !== index) : [...checked, index]);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError('');
    let state = emptyModeRun();
    setRun(state);
    try {
      const body: Record<string, unknown> = {
        period,
        theme,
        sources,
        solo: audience === 'solo',
        ...reads.body(),
      };
      if (period === QUARTER && sprints) {
        // Empty checks and no sprint list are different answers: with no list
        // at all the backend already handed back the calendar-quarter window.
        const resolved = sprints.sprints.length
          ? await resolveWindow(sprints.sprints, checked)
          : sprints.fallback;
        Object.assign(body, resolved);
      }
      if (period === WINDOW) {
        body.window_start = range.start;
        body.window_end = range.end;
      }
      await runReport(body, (line) => {
        state = reduceModeRun(state, line);
        setRun(state);
      });
      if (state.done) {
        quip('report_done');
        router.push('/team/reporting');
      }
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  const canRun = period !== WINDOW || Boolean(range.start && range.end);

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-foreground">New report</h1>
          <p className="text-[13px] text-muted-foreground mt-1">{options.sources.summary}</p>
        </div>
        <Link
          href="/team/reporting"
          className="text-[12px] text-muted-foreground hover:text-foreground"
        >
          Back
        </Link>
      </header>

      {error && <Notice title="Could not generate the report" items={[error]} />}

      <Section title="Period">
        <div className="space-y-2">
          {options.periods.map((option) => (
            <label key={option.key} className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="radio"
                name="period"
                checked={period === option.key}
                onChange={() => setPeriod(option.key)}
                className="mt-0.5 accent-[var(--primary)]"
              />
              <span>
                <strong className="block text-[13px] font-body font-medium text-foreground">
                  {option.label}
                </strong>
                <span className="block text-[11px] text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </Section>

      {period === WINDOW && (
        <Section title="Custom range">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] font-body text-muted-foreground uppercase tracking-wide">
                Start
              </span>
              <input
                type="date"
                value={range.start}
                onChange={(e) => setRange({ ...range, start: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-body text-muted-foreground uppercase tracking-wide">
                End
              </span>
              <input
                type="date"
                value={range.end}
                onChange={(e) => setRange({ ...range, end: e.target.value })}
                className={inputClass}
              />
            </label>
          </div>
        </Section>
      )}

      {period === QUARTER && sprints && sprints.sprints.length > 0 && (
        <Section title="Which sprints make up the quarter">
          <div className="space-y-2">
            {sprints.sprints.map((sprint, index) => (
              <label key={sprint.name} className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked.includes(index)}
                  onChange={() => toggleSprint(index)}
                  className="mt-0.5 accent-[var(--primary)]"
                />
                <span>
                  <strong className="block text-[13px] font-body font-medium text-foreground">
                    {sprint.name}
                  </strong>
                  <span className="block text-[11px] text-muted-foreground">
                    {sprint.start_date} → {sprint.end_date}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </Section>
      )}

      {period === QUARTER && sprints && sprints.sprints.length === 0 && (
        <Notice
          title="No sprint list available"
          items={['The report will cover the calendar quarter instead.']}
        />
      )}

      {options.sources.step_applies && (
        <Section title="Sources">
          <div className="space-y-4">
            {Object.entries(options.sources.grid).map(([component, available]) => (
              <div key={component}>
                <p className="text-[13px] font-body font-medium text-foreground">{component}</p>
                <p className="text-[11px] text-muted-foreground mb-1.5">
                  {options.sources.descriptions[component]}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {available.map((name) => (
                    <label key={name} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(sources[component] ?? []).includes(name)}
                        onChange={() => toggleSource(component, name)}
                        className="accent-[var(--primary)]"
                      />
                      <span className="text-[12px] text-foreground">
                        {options.sources.titles[name] ?? name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Presentation theme">
        <div className="flex flex-wrap gap-2">
          {options.themes.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setTheme(name)}
              style={{ borderColor: options.palettes[name]?.accent ?? undefined }}
              className={`rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
                theme === name
                  ? 'bg-primary/10 text-foreground ring-1 ring-primary/40'
                  : 'bg-secondary/40 text-muted-foreground hover:bg-secondary/70'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </Section>

      <ContextPicker
        mode="reporting"
        options={reads.options}
        scope={reads.scope}
        onChange={reads.setScope}
        disabled={busy}
      />

      <div className="flex items-center gap-2">
        <Button disabled={busy || !canRun} onClick={() => void start()}>
          {busy ? 'Generating…' : 'Generate report'}
        </Button>
        {busy && run.opId && (
          <Button variant="secondary" onClick={() => void cancelModeRun(run.opId)}>
            Stop
          </Button>
        )}
      </div>

      {run.phases.length > 0 && (
        <Section title="Progress">
          <ol className="space-y-1">
            {run.phases.map((phase, i) => (
              <li key={`${phase}-${i}`} className="text-[12px] text-muted-foreground">
                {phase}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {run.cancelled && <Notice title="Stopped" items={['Nothing was saved.']} />}
      {run.error && <Notice title="The run failed" items={[run.error]} />}
    </div>
  );
}

export default function ReportingSetupPage() {
  return (
    <PageShell width="narrow">
      <BackendGate>
        <ReportingSetupBody />
      </BackendGate>
    </PageShell>
  );
}
