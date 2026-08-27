'use client';

// The finished plan — read it, save it, publish it, push it to a board.
//
// Four of planning's tools (plan_get, plan_export, plan_publish, plan_sync)
// are called from here. Publish and sync both write somewhere real, so
// neither runs on a click alone — each asks once, in the words of what it is
// about to do.

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { Envelope } from '@/lib/yeaboi/api';
import {
  PLAN_DESTINATIONS,
  PLAN_FORMATS,
  PLAN_TRACKERS,
  type Plan,
  exportPlan,
  isEmptyPlan,
  loadPlan,
  outcomeMessage,
  planCounts,
  publishPlan,
  storiesOf,
  syncPlan,
} from '@/lib/yeaboi/plan';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { PlanImportDialog } from '@/components/yeaboi/plan-import-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type Pending = { verb: string; run: () => Promise<void>; warning: string } | null;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card ring-1 ring-border/60 p-5">
      <h2 className="text-[13px] font-body font-medium text-foreground mb-3">{title}</h2>
      {children}
    </section>
  );
}

function PlanBody({ sessionId }: { sessionId: string }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<Pending>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    loadPlan(sessionId).then(
      (envelope) => {
        if (!envelope.ok) {
          setError(envelope.error?.message ?? 'plan_get failed');
          return;
        }
        setPlan(envelope.data);
      },
      (e: Error) => setError(e.message),
    );
  }, [sessionId]);

  async function run(label: string, call: () => Promise<Envelope<Record<string, unknown>>>) {
    setBusy(label);
    setMessage('');
    setWarnings([]);
    try {
      const envelope = await call();
      setMessage(outcomeMessage(envelope));
      setWarnings(envelope.warnings ?? []);
    } catch (e) {
      setMessage((e as Error).message);
    }
    setBusy('');
  }

  if (error)
    return <p className="text-[13px] text-destructive">Could not open the plan: {error}</p>;
  if (!plan) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  const id = plan.session_id ?? sessionId;
  const counts = planCounts(plan);
  const project = plan.project ?? {};

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-foreground">{project.name || 'The plan'}</h1>
        {project.description && (
          <p className="text-[13px] text-muted-foreground mt-1">{project.description}</p>
        )}
      </div>

      {isEmptyPlan(plan) ? (
        <Section title="Nothing to show yet">
          <p className="text-[13px] text-muted-foreground">
            This conversation has not produced a plan yet — finish the intake and the epics,
            stories, tasks and sprints appear here.
          </p>
        </Section>
      ) : (
        <>
          <Section title="What is in it">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
              <span>{counts.epics} epics</span>
              <span>{counts.stories} stories</span>
              <span>{counts.tasks} tasks</span>
              <span>{counts.sprints} sprints</span>
              {project.tech_stack?.length ? <span>{project.tech_stack.join(' · ')}</span> : null}
            </div>
          </Section>

          {(plan.sprints ?? []).map((sprint, index) => (
            <Section
              key={`${sprint.name ?? 'sprint'}-${index}`}
              title={sprint.name || `Sprint ${index + 1}`}
            >
              {sprint.goal && (
                <p className="text-[12px] text-muted-foreground mb-2">{sprint.goal}</p>
              )}
              <ul className="space-y-1.5">
                {storiesOf(plan, sprint).map((story) => (
                  <li
                    key={story.id}
                    className="flex items-center gap-2 text-[13px] text-foreground"
                  >
                    <Badge variant="outline">{story.story_points ?? 0}</Badge>
                    {story.title || story.id}
                  </li>
                ))}
              </ul>
            </Section>
          ))}
        </>
      )}

      <Section title="Save it">
        <div className="flex flex-wrap gap-2">
          {PLAN_FORMATS.map((format) => (
            <Button
              key={format.key}
              variant="outline"
              size="sm"
              disabled={Boolean(busy)}
              title={format.note}
              onClick={() => void run(format.key, () => exportPlan(id, format.key))}
            >
              {busy === format.key ? 'Saving…' : format.label}
            </Button>
          ))}
        </div>
      </Section>

      <Section title="Publish it as a page">
        <div className="flex flex-wrap gap-2">
          {PLAN_DESTINATIONS.map((destination) => (
            <Button
              key={destination.key}
              variant="outline"
              size="sm"
              disabled={Boolean(busy)}
              onClick={() =>
                setConfirm({
                  verb: `Publish to ${destination.label}`,
                  warning: `This creates a page in your ${destination.label} workspace.`,
                  run: () => run(destination.key, () => publishPlan(id, destination.key, 'plan')),
                })
              }
            >
              {busy === destination.key ? 'Publishing…' : destination.label}
            </Button>
          ))}
        </div>
      </Section>

      <Section title="Put it on the board">
        <p className="text-[12px] text-muted-foreground mb-3">
          Stories become cards on a project&apos;s kanban board here in the app — sprints as waves,
          epics as labels. Ship can pick them up from there.
        </p>
        <Button size="sm" disabled={isEmptyPlan(plan)} onClick={() => setImporting(true)}>
          Send to board
        </Button>
      </Section>

      <Section title="Push it to an external tracker">
        <div className="flex flex-wrap gap-2">
          {PLAN_TRACKERS.map((tracker) => (
            <Button
              key={tracker.key}
              variant="outline"
              size="sm"
              disabled={Boolean(busy)}
              onClick={() =>
                setConfirm({
                  verb: `Push to ${tracker.label}`,
                  warning: `This creates ${counts.stories} stories and ${counts.tasks} tasks as real tickets in ${tracker.label}. Re-running skips anything it already made.`,
                  run: () => run(tracker.key, () => syncPlan(id, tracker.key, '')),
                })
              }
            >
              {busy === tracker.key ? 'Pushing…' : tracker.label}
            </Button>
          ))}
        </div>
      </Section>

      {message && <p className="text-[13px] text-foreground">{message}</p>}
      {warnings.length > 0 && (
        <Section title="Notices">
          <ul className="space-y-1">
            {warnings.map((w) => (
              <li key={w} className="text-[12px] text-muted-foreground">
                {w}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {importing && <PlanImportDialog plan={plan} onClose={() => setImporting(false)} />}

      {confirm && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={confirm.verb}
            className="w-[420px] max-w-[calc(100vw-3rem)] rounded-2xl bg-card shadow-2xl ring-1 ring-border/70 p-5"
          >
            <h2 className="text-sm font-medium text-foreground mb-2">{confirm.verb}?</h2>
            <p className="text-[13px] text-muted-foreground">{confirm.warning}</p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button
                size="sm"
                onClick={() => {
                  const pending = confirm;
                  setConfirm(null);
                  void pending.run();
                }}
              >
                {confirm.verb}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PlanPage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('id') ?? '';
  return (
    <BackendGate>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <PlanBody key={sessionId} sessionId={sessionId} />
      </div>
    </BackendGate>
  );
}
