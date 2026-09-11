'use client';

// The project's plan — the yeaboi engine's epics/stories/tasks/sprints for
// this project's current blueprint iteration. The iteration row carries which
// engine session generated it (yeaboi_session_id) and from which snapshot
// (plan_source_snapshot_id); a newer snapshot means the blueprint moved on
// and the panel shows a staleness banner. No plan yet → the Generate dialog.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { PageShell } from '@/components/page-shell';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { GeneratePlanDialog } from '@/components/projects/generate-plan-dialog';
import { PlanPanel } from '@/components/projects/plan-panel';
import { Button } from '@/components/ui/button';

interface IterationRow {
  id: string;
  iteration_number: number;
  label: string;
  yeaboi_session_id?: string | null;
  plan_source_snapshot_id?: string | null;
}

export default function ProjectPlanPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const { authFetch, ready } = useAuthFetch();

  const [projectName, setProjectName] = useState('');
  const [iteration, setIteration] = useState<IterationRow | null>(null);
  const [latestSnapshotId, setLatestSnapshotId] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [projResp, itersResp, blueprintResp] = await Promise.all([
      authFetch(`/api/sessions/${projectId}`),
      authFetch(`/api/sessions/${projectId}/iterations`),
      authFetch(`/api/sessions/${projectId}/blueprint`),
    ]);
    if (!projResp.ok) throw new Error(`project → ${projResp.status}`);
    const project = (await projResp.json()) as { name: string };
    setProjectName(project.name);
    if (itersResp.ok) {
      const rows = (await itersResp.json()) as IterationRow[];
      setIteration(rows[rows.length - 1] ?? null);
    }
    if (blueprintResp.ok) {
      const snapshot = (await blueprintResp.json()) as { id: string };
      setLatestSnapshotId(snapshot.id);
    }
    setLoaded(true);
  }, [authFetch, projectId]);

  useEffect(() => {
    if (!ready) return;
    load().catch((e: Error) => setError(e.message));
  }, [ready, load]);

  const sessionId = iteration?.yeaboi_session_id ?? '';
  const stale = useMemo(
    () =>
      Boolean(
        sessionId &&
        iteration?.plan_source_snapshot_id &&
        latestSnapshotId &&
        iteration.plan_source_snapshot_id !== latestSnapshotId,
      ),
    [sessionId, iteration, latestSnapshotId],
  );

  return (
    <PageShell width="narrow" className="space-y-4">
      <BackendGate>
        <div className="flex items-center gap-3">
          <Link
            href={`/sessions/${projectId}`}
            className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {projectName || 'Project'}
          </Link>
          {loaded && (
            <Button
              size="sm"
              variant={sessionId ? 'outline' : 'default'}
              className="ml-auto"
              onClick={() => setGenerating(true)}
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              {sessionId ? 'Regenerate plan' : 'Generate plan'}
            </Button>
          )}
        </div>

        {error && <p className="text-[13px] text-destructive">Could not open the plan: {error}</p>}

        {loaded && !sessionId && !error && (
          <section className="rounded-2xl bg-card ring-1 ring-border/60 p-5">
            <h2 className="text-[13px] font-body font-medium text-foreground mb-2">No plan yet</h2>
            <p className="text-[13px] text-muted-foreground">
              Fill in the blueprint, then generate — yeaboi&apos;s planning engine turns it into
              epics, stories, tasks and sprints, and puts the stories on the board.
            </p>
          </section>
        )}

        {sessionId && (
          <PlanPanel key={sessionId} sessionId={sessionId} projectId={projectId} stale={stale} />
        )}

        {generating && (
          <GeneratePlanDialog
            projectId={projectId}
            onClose={() => setGenerating(false)}
            onGenerated={() => {
              load().catch(() => undefined);
            }}
          />
        )}
      </BackendGate>
    </PageShell>
  );
}
