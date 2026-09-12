'use client';

// The finished plan, read: what is in it and each sprint's stories, with the
// ways to save, publish, push or board it underneath (plan-actions.tsx).

import { useEffect, useState } from 'react';
import { type Plan, isEmptyPlan, loadPlan, planCounts, storiesOf } from '@/lib/yeaboi/plan';
import { PlanActions } from '@/components/planning/plan-actions';
import { Badge } from '@/components/ui/badge';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card ring-1 ring-border/60 p-5">
      <h2 className="text-[13px] font-body font-medium text-foreground mb-3">{title}</h2>
      {children}
    </section>
  );
}

export interface PlanPanelProps {
  sessionId: string;
  /** The board's own row for this plan, pre-selecting the board push target. */
  projectId?: string;
  /** Makes (or finds) that row on first use. */
  ensureProject?: () => Promise<string | null>;
  /** The blueprint changed since this plan was generated. */
  stale?: boolean;
  /** Shown instead of the plan's own project name (the page already says it). */
  hideHeading?: boolean;
}

export function PlanPanel({
  sessionId,
  projectId,
  ensureProject,
  stale,
  hideHeading,
}: PlanPanelProps) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState('');

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

  if (error)
    return <p className="text-[13px] text-destructive">Could not open the plan: {error}</p>;
  if (!plan) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  const counts = planCounts(plan);
  const project = plan.project ?? {};

  return (
    <div className="space-y-4">
      {!hideHeading && (
        <div>
          <h1 className="font-display text-2xl text-foreground">{project.name || 'The plan'}</h1>
          {project.description && (
            <p className="text-[13px] text-muted-foreground mt-1">{project.description}</p>
          )}
        </div>
      )}

      {stale && (
        <div className="rounded-xl bg-secondary/40 ring-1 ring-border/60 px-4 py-3 text-[12px] text-muted-foreground">
          The blueprint has changed since this plan was generated. Regenerate it to catch up.
        </div>
      )}

      {isEmptyPlan(plan) ? (
        <Section title="Nothing to show yet">
          <p className="text-[13px] text-muted-foreground">
            This plan has no epics, stories, tasks or sprints yet. They appear here as the
            conversation produces them.
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
              {project.tech_stack?.length ? <span>{project.tech_stack.join(', ')}</span> : null}
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

      <Section title="What it can become">
        <PlanActions
          sessionId={plan.session_id ?? sessionId}
          plan={plan}
          projectId={projectId}
          ensureProject={ensureProject}
        />
      </Section>
    </div>
  );
}
