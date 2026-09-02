'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Lock, Sparkles } from 'lucide-react';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { BlueprintDocument } from '@/components/blueprint/blueprint-document';
import { BlueprintExportMenu } from '@/components/blueprint/blueprint-export-menu';
import type { BulletSource } from '@/components/blueprint/bullet-source-chip';
import { GeneratePlanDialog } from '@/components/projects/generate-plan-dialog';

interface Iteration {
  id: string;
  iteration_number: number;
  label: string;
  status: string;
  share_token?: string | null;
  share_enabled?: boolean;
}

interface SnapshotDetail {
  id: string;
  version_number: number;
  iteration_id: string | null;
  content: Record<string, string>;
  created_by: string;
  created_by_label: string;
  section_sources: Record<string, BulletSource | string> | null;
  bullet_sources: Record<string, Record<string, BulletSource | string>> | null;
  created_at: string;
}

interface CoverageResponse {
  scores: Record<string, number>;
  overall: number;
}

export default function BlueprintPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const { authFetch, ready } = useAuthFetch();

  const [projectName, setProjectName] = useState<string>('');
  const [iterations, setIterations] = useState<Iteration[]>([]);
  const [activeIterationId, setActiveIterationId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotDetail | null>(null);
  const [coverage, setCoverage] = useState<CoverageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const router = useRouter();

  // Initial fetch — project name + iterations list. Selects the latest
  // iteration as active by default.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        const [projResp, itersResp] = await Promise.all([
          authFetch(`/api/projects/${projectId}`),
          authFetch(`/api/projects/${projectId}/iterations`),
        ]);
        if (cancelled) return;
        if (projResp.ok) {
          const proj = await projResp.json();
          setProjectName(proj.name ?? '');
        }
        if (itersResp.ok) {
          const iters: Iteration[] = await itersResp.json();
          setIterations(iters);
          // The router orders ascending; pick the latest as active.
          const latest = iters[iters.length - 1];
          if (latest) setActiveIterationId(latest.id);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, ready, authFetch]);

  // Snapshot + coverage for the active iteration. Refetch when iteration
  // selection changes. The snapshot endpoint already returns the latest
  // snapshot for a given iteration so we don't need a separate "current"
  // call.
  const fetchActive = useCallback(async () => {
    if (!ready || !activeIterationId) return;
    setLoading(true);
    try {
      const [snapResp, covResp] = await Promise.all([
        authFetch(`/api/projects/${projectId}/blueprint?iteration_id=${activeIterationId}`),
        authFetch(
          `/api/projects/${projectId}/blueprint/coverage?iteration_id=${activeIterationId}`,
        ),
      ]);
      if (snapResp.ok) {
        // GET /blueprint returns the snapshot record directly (not the
        // detail schema), so it's missing bullet_sources/section_sources.
        // Fetch the detail by id to get provenance.
        const bp = await snapResp.json();
        const detailResp = await authFetch(
          `/api/projects/${projectId}/blueprint/snapshots/${bp.id}`,
        );
        if (detailResp.ok) {
          setSnapshot(await detailResp.json());
        } else {
          setSnapshot({
            id: bp.id,
            version_number: bp.version_number,
            iteration_id: activeIterationId,
            content: bp.content || {},
            created_by: bp.created_by,
            created_by_label: bp.created_by_label || '',
            section_sources: null,
            bullet_sources: null,
            created_at: bp.created_at,
          });
        }
      }
      if (covResp.ok) {
        setCoverage(await covResp.json());
      }
    } finally {
      setLoading(false);
    }
  }, [projectId, activeIterationId, ready, authFetch]);

  useEffect(() => {
    void fetchActive();
  }, [fetchActive]);

  const activeIteration = useMemo(
    () => iterations.find((i) => i.id === activeIterationId) ?? null,
    [iterations, activeIterationId],
  );

  const headerActions = useMemo(() => {
    if (!activeIteration) return null;
    return (
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setGenerating(true)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] transition-colors"
          title="Turn the blueprint into epics, stories, tasks and sprints"
        >
          <Sparkles className="h-3 w-3" />
          Generate plan
        </button>
        <BlueprintExportMenu
          projectId={projectId}
          iterationId={activeIteration.id}
          initialShareEnabled={activeIteration.share_enabled ?? false}
          initialShareToken={activeIteration.share_token ?? null}
        />
      </div>
    );
  }, [projectId, activeIteration]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border/40">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center gap-3 text-sm">
          <Link
            href={`/projects/${projectId}`}
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {projectName || 'Project'}
          </Link>
          {iterations.length > 1 && (
            <div className="ml-auto flex items-center gap-1">
              {iterations.map((iter) => {
                const active = iter.id === activeIterationId;
                return (
                  <button
                    key={iter.id}
                    onClick={() => setActiveIterationId(iter.id)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                      active
                        ? 'bg-foreground/[0.10] text-foreground border border-border'
                        : 'text-muted-foreground/70 hover:text-muted-foreground hover:bg-foreground/[0.05]'
                    }`}
                  >
                    {iter.label}
                    {iter.status === 'locked' && (
                      <Lock className="h-2.5 w-2.5 text-muted-foreground/50" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {error && <div className="max-w-4xl mx-auto px-6 py-4 text-sm text-destructive">{error}</div>}

      {loading && !snapshot ? (
        <div className="max-w-4xl mx-auto px-6 py-20 text-center text-muted-foreground">
          Loading blueprint…
        </div>
      ) : snapshot && activeIteration ? (
        <BlueprintDocument
          content={snapshot.content}
          bulletSources={snapshot.bullet_sources}
          sectionSources={snapshot.section_sources}
          coverageScores={coverage?.scores}
          iterationLabel={activeIteration.label}
          versionNumber={snapshot.version_number}
          iterationStatus={activeIteration.status}
          updatedAt={snapshot.created_at}
          updatedByLabel={snapshot.created_by_label}
          headerActions={headerActions}
        />
      ) : (
        <div className="max-w-4xl mx-auto px-6 py-20 text-center text-muted-foreground">
          No blueprint yet — start a session to build one.
        </div>
      )}

      {generating && (
        <GeneratePlanDialog
          projectId={projectId}
          onClose={() => setGenerating(false)}
          onGenerated={() => router.push(`/projects/${projectId}/plan`)}
        />
      )}
    </div>
  );
}
