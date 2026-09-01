'use client';

// Roadmap intake — point yeaboi at the quarterly roadmap, pick a project,
// plan it.
//
// A Planning sub-page, like the terminal's intake card: Plan This hands the
// chosen project's description to the chat rather than opening a mode of its
// own.
//
// Share/anonymize actions (the old ResultActions strip) arrive with the
// global export dialog in a later phase.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DuckMark } from '@/components/brand/duck';
import { quip } from '@/lib/yeaboi/ambience';
import { createChat } from '@/lib/yeaboi/chat';
import {
  type ModeRunState,
  type RoadmapAnalysisView,
  type RoadmapSourceOption,
  type SavedRoadmap,
  analyzeRoadmap,
  emptyModeRun,
  loadRoadmapOptions,
  loadSavedRoadmaps,
  planProject,
  reduceModeRun,
} from '@/lib/yeaboi/modes';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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

function RoadmapBody() {
  const router = useRouter();
  const [sources, setSources] = useState<RoadmapSourceOption[] | null>(null);
  const [saved, setSaved] = useState<SavedRoadmap[]>([]);
  const [kind, setKind] = useState('confluence');
  const [locator, setLocator] = useState('');
  const [analysis, setAnalysis] = useState<RoadmapAnalysisView | null>(null);
  const [roadmapId, setRoadmapId] = useState(0);
  const [run, setRun] = useState<ModeRunState>(emptyModeRun());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadRoadmapOptions().then(
      (body) => {
        setSources(body.sources);
        setKind(body.sources[0]?.key ?? 'confluence');
      },
      (e: Error) => setError(e.message),
    );
    loadSavedRoadmaps().then(
      (body) => setSaved(body.roadmaps),
      () => undefined,
    );
  }, []);

  if (error && !sources) return <Notice title="Could not open roadmap intake" items={[error]} />;
  if (!sources) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  const chosen = sources.find((source) => source.key === kind) ?? sources[0]!;

  async function analyze(reuseId = roadmapId) {
    if (busy || !locator.trim()) return;
    setBusy(true);
    setError('');
    let state = emptyModeRun();
    setRun(state);
    try {
      await analyzeRoadmap(
        { source_type: kind, locator: locator.trim(), roadmap_id: reuseId },
        (line) => {
          state = reduceModeRun(state, line);
          setRun(state);
        },
      );
      if (state.done) {
        setAnalysis((state.done.analysis as RoadmapAnalysisView) ?? null);
        setRoadmapId(Number(state.done.roadmap_id ?? 0));
        quip('roadmap_done');
      }
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  async function plan(index: number) {
    try {
      // The backend decides both halves: the description a project plans
      // from, and whether it is large enough for the full intake.
      const picked = await planProject(roadmapId, index);
      const view = await createChat(picked.description, picked.intake_mode);
      router.push(`/team/planning/chat?id=${encodeURIComponent(view.project_id)}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl text-foreground">Roadmap intake</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            Point yeaboi at the quarterly roadmap and it proposes what to plan next.
          </p>
        </div>
        <Link
          href="/team/planning"
          className="text-[12px] text-muted-foreground hover:text-foreground"
        >
          Back
        </Link>
      </header>

      {error && <Notice title="That did not work" items={[error]} />}
      {run.error && <Notice title="The analysis failed" items={[run.error]} />}

      <Section title="Where does the roadmap live?">
        <div className="space-y-2 mb-3">
          {sources.map((source) => (
            <label key={source.key} className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="radio"
                name="source"
                checked={kind === source.key}
                onChange={() => setKind(source.key)}
                className="mt-0.5 accent-[var(--primary)]"
              />
              <span>
                <strong className="block text-[13px] font-body font-medium text-foreground">
                  {source.label}
                </strong>
                <span className="block text-[11px] text-muted-foreground">{source.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <label className="block">
          <span className="text-[11px] font-body text-muted-foreground uppercase tracking-wide">
            {chosen.prompt}
          </span>
          <input
            type="text"
            value={locator}
            onChange={(e) => setLocator(e.target.value)}
            className="mt-1 w-full rounded-lg bg-secondary/40 border border-border/40 px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        </label>
        <div className="mt-3">
          <Button size="sm" disabled={busy || !locator.trim()} onClick={() => void analyze()}>
            {busy ? 'Analyzing…' : analysis ? 'Re-analyze' : 'Analyze'}
          </Button>
        </div>
      </Section>

      {run.phases.length > 0 && !analysis && (
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

      {analysis && (
        <>
          <Section title={analysis.source_label || 'Roadmap'}>
            <p className="text-[13px] text-muted-foreground">{analysis.summary}</p>
          </Section>
          {analysis.warnings?.length > 0 && <Notice title="Notices" items={analysis.warnings} />}
          <div className="space-y-3">
            {analysis.projects.map((project, index) => (
              <Section key={`${project.name}-${index}`} title={project.name}>
                <p className="text-[13px] text-muted-foreground flex items-start gap-2">
                  <Badge variant="outline">{project.size}</Badge>
                  <span>{project.description}</span>
                </p>
                <div className="mt-3">
                  <Button size="sm" onClick={() => void plan(index)}>
                    Plan this
                  </Button>
                </div>
              </Section>
            ))}
          </div>
          {analysis.projects.length === 0 && (
            <Section title="Nothing to plan">
              <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <DuckMark state="idle" size={28} /> No concrete projects came out of that document —
                check its content, or try another source.
              </p>
            </Section>
          )}
        </>
      )}

      {!analysis && saved.length > 0 && (
        <Section title="Saved roadmaps">
          <ul className="space-y-1.5">
            {saved.map((row) => (
              <li key={row.id} className="text-[12px] text-muted-foreground">
                <strong className="text-foreground">{row.label}</strong> · {row.project_count}{' '}
                project(s) · {String(row.analyzed_at).slice(0, 10)}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

export default function RoadmapPage() {
  return (
    <BackendGate>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <RoadmapBody />
      </div>
    </BackendGate>
  );
}
