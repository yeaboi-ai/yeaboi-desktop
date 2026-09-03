'use client';

// New analysis — the setup wizard, then the run.
//
// Which steps apply is asked of the backend (POST /api/analysis/steps), not
// decided here: the terminal walks the same wizard, and a second copy of the
// rules is a second thing to drift.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { quip } from '@/lib/yeaboi/ambience';
import {
  type AnalysisOptions,
  type RunLine,
  type RunRequest,
  type StepPlan,
  cancelRun,
  emptyRun,
  loadAnalysisOptions,
  loadRoster,
  planSteps,
  runAnalysis,
  reduceRun,
} from '@/lib/yeaboi/dashboards';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { ProjectScopeLine } from '@/components/yeaboi/project-scope-line';
import { useProjectScope } from '@/hooks/yeaboi/use-project-scope';
import { scopedRunBody } from '@/lib/yeaboi/project-scope';
import { useAudience } from '@/components/providers/audience-provider';
import { Button } from '@/components/ui/button';

const STEP_TITLES: Record<string, string> = {
  features: 'What should I look at?',
  sources: 'Where should I read it from?',
  github_owners: 'Which GitHub owners?',
  azdo_projects: 'Which Azure DevOps projects?',
  depth: 'How deep?',
  model: 'Which model for the small jobs?',
  window: 'How far back?',
  members: 'Whose work?',
  review: 'Ready',
};

const COMPONENT_TITLES: Record<string, string> = {
  delivery: 'Delivery',
  code: 'Code',
  docs: 'Docs',
};

interface Answers {
  features: string[];
  components: Record<string, string[]>;
  github_owners: string[];
  azdo_projects: string[];
  depth: string;
  model: string | null;
  window_days: number;
  members: string[] | null;
  source: string;
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

const checkRow = 'flex items-start gap-2.5 cursor-pointer';
const checkInput = 'mt-0.5 accent-[var(--primary)]';

function AnalysisSetupBody() {
  const { audience } = useAudience();
  const scope = useProjectScope();
  const [scopeNote, setScopeNote] = useState('');
  const [options, setOptions] = useState<AnalysisOptions | null>(null);
  const [answers, setAnswers] = useState<Answers | null>(null);
  const [plan, setPlan] = useState<StepPlan | null>(null);
  const [index, setIndex] = useState(0);
  const [roster, setRoster] = useState<string[] | null>(null);
  const [run, setRun] = useState(emptyRun());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadAnalysisOptions().then(
      (opts) => {
        setOptions(opts);
        setAnswers({
          features: Object.keys(opts.features_available).filter(
            (key) => opts.features_available[key],
          ),
          components: { ...opts.grid },
          github_owners: [],
          azdo_projects: [],
          depth: opts.default_depth,
          model: null,
          window_days: opts.default_window_days,
          members: null,
          source: '',
        });
      },
      (e: Error) => setError(e.message),
    );
  }, []);

  // The applicable steps change whenever a selection does, so the plan is
  // re-asked rather than patched.
  useEffect(() => {
    if (!answers || !options) return;
    // Solo runs never ask the members step; the backend also coerces a stale
    // pick out of the run payload (contracts/v1/app_http.md).
    planSteps({
      ...answers,
      grid: options.grid,
      model_offered: false,
      solo: audience === 'solo',
    }).then(setPlan, (e: Error) => setError(e.message));
  }, [answers, options, audience]);

  if (error && !options) return <Notice title="Could not open the setup" items={[error]} />;
  if (!options || !answers || !plan) {
    return <p className="text-[13px] text-muted-foreground">Loading…</p>;
  }

  const step = plan.steps[Math.min(index, plan.steps.length - 1)] ?? 'review';
  const set = (patch: Partial<Answers>) => setAnswers({ ...answers, ...patch });
  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  async function fetchRoster() {
    const trackers = answers!.components.delivery ?? [];
    const envelope = await loadRoster(trackers.length === 1 ? trackers[0]! : 'both');
    setRoster(envelope.ok ? envelope.data.members.map((m) => m.name) : []);
    if (!envelope.ok) setError(envelope.error?.message ?? 'team_roster failed');
  }

  async function start() {
    if (busy) return;
    setBusy(true);
    setError('');
    let state = emptyRun();
    setRun(state);
    // A project that cannot be scoped still gets its analysis, as a one-off.
    let engineId = '';
    setScopeNote('');
    try {
      engineId = await scope.engineId();
    } catch (e) {
      setScopeNote(`${(e as Error).message} This analysis is a one-off instead.`);
    }
    try {
      await runAnalysis(scopedRunBody(plan!.run as RunRequest, engineId), (line: RunLine) => {
        state = reduceRun(state, line);
        setRun(state);
      });
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
    if (state.error) setError(state.error);
    else quip('analysis_done');
  }

  if (busy || run.finished) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-2xl text-foreground">
          {run.finished ? 'Analysis finished' : 'Analysing…'}
        </h1>
        <Section title="Progress">
          <ol className="space-y-1">
            {run.phases.map((phase, i) => (
              <li key={`${i}-${phase}`} className="text-[12px] text-muted-foreground">
                {phase}
              </li>
            ))}
            {!run.phases.length && <li className="text-[12px] text-muted-foreground">Starting…</li>}
          </ol>
        </Section>
        {run.cancelled && <Notice title="Cancelled" items={['Nothing was saved.']} />}
        {error && <Notice title="That run did not finish" items={[error]} />}
        {scopeNote && <p className="text-[12px] text-muted-foreground">{scopeNote}</p>}
        <div className="flex items-center gap-3">
          {busy && run.opId && (
            <Button size="sm" variant="outline" onClick={() => void cancelRun(run.opId)}>
              Stop
            </Button>
          )}
          {run.finished && !run.error && (
            <Link
              href="/team/analysis"
              className="text-[13px] font-medium text-primary hover:underline"
            >
              See the results
            </Link>
          )}
          {run.finished && (
            <Link
              href="/team/analysis"
              className="text-[12px] text-muted-foreground hover:text-foreground"
            >
              Back to saved analyses
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-foreground">New analysis</h1>
        {scope.scoped && (
          <div className="mt-1">
            <ProjectScopeLine name={scope.project?.name ?? 'this project'} onClear={scope.clear} />
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {plan.steps.map((key, i) => (
          <span
            key={key}
            className={`rounded-full px-3 py-1 text-[11px] ${
              i === index
                ? 'bg-primary/10 text-foreground ring-1 ring-primary/40'
                : 'bg-secondary/40 text-muted-foreground'
            }`}
          >
            {STEP_TITLES[key] ?? key}
          </span>
        ))}
      </div>

      <Section title={STEP_TITLES[step] ?? step}>
        {step === 'features' && (
          <div className="space-y-2">
            {options.features.map((feature) => (
              <label key={feature.key} className={checkRow}>
                <input
                  type="checkbox"
                  className={checkInput}
                  disabled={!options.features_available[feature.key]}
                  checked={answers.features.includes(feature.key)}
                  onChange={() => set({ features: toggle(answers.features, feature.key) })}
                />
                <span className="text-[13px] text-foreground">
                  <strong className="font-medium">{feature.label}</strong>
                  {!options.features_available[feature.key] && (
                    <span className="text-muted-foreground"> — nothing configured for it</span>
                  )}
                </span>
              </label>
            ))}
          </div>
        )}

        {step === 'sources' &&
          Object.entries(plan.grid).map(([component, sources]) =>
            sources.length ? (
              <div key={component} className="mb-3 last:mb-0">
                <h3 className="text-[12px] font-medium text-foreground mb-2">
                  {COMPONENT_TITLES[component] ?? component}
                </h3>
                <div className="space-y-2">
                  {sources.map((source) => (
                    <label key={source} className={checkRow}>
                      <input
                        type="checkbox"
                        className={checkInput}
                        checked={(answers.components[component] ?? []).includes(source)}
                        onChange={() =>
                          set({
                            components: {
                              ...answers.components,
                              [component]: toggle(answers.components[component] ?? [], source),
                            },
                          })
                        }
                      />
                      <span className="text-[13px] text-foreground">{source}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null,
          )}

        {(step === 'github_owners' || step === 'azdo_projects') && (
          <label className="block">
            <span className="text-[11px] font-body text-muted-foreground uppercase tracking-wide">
              One per line
            </span>
            <textarea
              rows={4}
              value={(step === 'github_owners'
                ? answers.github_owners
                : answers.azdo_projects
              ).join('\n')}
              onChange={(e) => {
                const values = e.target.value
                  .split('\n')
                  .map((v) => v.trim())
                  .filter(Boolean);
                set(
                  step === 'github_owners' ? { github_owners: values } : { azdo_projects: values },
                );
              }}
              className="mt-1 w-full rounded-lg bg-secondary/40 border border-border/40 px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          </label>
        )}

        {step === 'depth' && (
          <div className="space-y-2">
            {options.depths.map((depth) => (
              <label key={depth} className={checkRow}>
                <input
                  type="radio"
                  className={checkInput}
                  checked={answers.depth === depth}
                  onChange={() => set({ depth })}
                />
                <span className="text-[13px] text-foreground">
                  <strong className="font-medium">{depth}</strong>
                  <span className="text-muted-foreground">
                    {depth === 'quick'
                      ? ' — no LLM calls, deterministic explanations'
                      : ' — reads and explains tickets'}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}

        {step === 'window' && (
          <div className="space-y-2">
            {options.window_presets.map((days) => (
              <label key={days} className={checkRow}>
                <input
                  type="radio"
                  className={checkInput}
                  checked={answers.window_days === days}
                  onChange={() => set({ window_days: days })}
                />
                <span className="text-[13px] text-foreground">{days} days</span>
              </label>
            ))}
          </div>
        )}

        {step === 'members' && (
          <>
            {roster === null ? (
              <Button size="sm" variant="outline" onClick={() => void fetchRoster()}>
                Load the roster
              </Button>
            ) : roster.length ? (
              <div className="space-y-2">
                {roster.map((name) => (
                  <label key={name} className={checkRow}>
                    <input
                      type="checkbox"
                      className={checkInput}
                      checked={(answers.members ?? []).includes(name)}
                      onChange={() => set({ members: toggle(answers.members ?? [], name) })}
                    />
                    <span className="text-[13px] text-foreground">{name}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                Nobody came back — the analysis will cover the whole team.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground mt-3">
              Leave everyone unpicked to analyse the whole team.
            </p>
          </>
        )}

        {step === 'review' && (
          <ul className="space-y-1.5 text-[13px] text-muted-foreground">
            <li>
              <strong className="text-foreground font-medium">Looking at</strong>{' '}
              {answers.features.join(', ') || 'nothing selected'}
            </li>
            <li>
              <strong className="text-foreground font-medium">Reading</strong>{' '}
              {Object.entries(plan.run.components)
                .filter(([, v]) => v.length)
                .map(([k, v]) => `${k}: ${v.join('/')}`)
                .join(' · ') || 'nothing selected'}
            </li>
            <li>
              <strong className="text-foreground font-medium">Depth</strong> {plan.run.depth}
            </li>
            <li>
              <strong className="text-foreground font-medium">Window</strong> {plan.run.window_days}{' '}
              days
            </li>
            <li>
              <strong className="text-foreground font-medium">People</strong>{' '}
              {answers.members?.length ? answers.members.join(', ') : 'the whole team'}
            </li>
          </ul>
        )}
      </Section>

      {error && <Notice title="Something went wrong" items={[error]} />}

      <div className="flex items-center gap-3">
        {index > 0 && (
          <Button size="sm" variant="outline" onClick={() => setIndex(index - 1)}>
            Back
          </Button>
        )}
        {step === 'review' ? (
          <Button size="sm" disabled={!answers.features.length} onClick={() => void start()}>
            Run the analysis
          </Button>
        ) : (
          <Button size="sm" onClick={() => setIndex(index + 1)}>
            Next
          </Button>
        )}
        <Link
          href="/team/analysis"
          className="text-[12px] text-muted-foreground hover:text-foreground"
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}

export default function AnalysisSetupPage() {
  return (
    <BackendGate>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <AnalysisSetupBody />
      </div>
    </BackendGate>
  );
}
