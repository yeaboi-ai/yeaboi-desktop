'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, GitBranch, Loader2 } from 'lucide-react';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { HarnessConfig } from '@/components/harness/harness-config';
import { logger } from '@/lib/logger';

interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

interface HarnessStatus {
  id: string;
  project_id: string;
  status: string;
  repo_url: string | null;
  repo_name: string | null;
  created_at: string;
}

export function AgentHarnessPanel() {
  const { authFetch, ready } = useAuthFetch();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [statuses, setStatuses] = useState<Record<string, HarnessStatus | null>>({});
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const resp = await authFetch('/api/projects');
      const list: ProjectSummary[] = resp.ok ? await resp.json() : [];
      setProjects(list);

      const entries = await Promise.all(
        list.map(async (p) => {
          try {
            const sResp = await authFetch(`/api/projects/${p.id}/harness/status`);
            if (sResp.ok) return [p.id, (await sResp.json()) as HarnessStatus] as const;
          } catch {
            // No harness yet — treated as null below.
          }
          return [p.id, null] as const;
        }),
      );
      setStatuses(Object.fromEntries(entries));
    } finally {
      setLoading(false);
    }
  }, [authFetch, ready]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const selectedProject = projects.find((p) => p.id === selectedId) ?? null;
  const selectedStatus = selectedId ? (statuses[selectedId] ?? null) : null;

  async function handlePreview(repoName: string) {
    if (!selectedId) return;
    setBusy(true);
    try {
      const resp = await authFetch(`/api/projects/${selectedId}/harness/preview`);
      if (!resp.ok) {
        logger.warn('Harness preview failed');
        return;
      }
      const data = await resp.json();
      logger.info('Harness preview ready', { repoName, files: data.files?.length });
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerate(repoName: string, githubToken: string) {
    if (!selectedId) return;
    setBusy(true);
    try {
      const resp = await authFetch(`/api/projects/${selectedId}/harness/generate`, {
        method: 'POST',
        body: JSON.stringify({
          repo_name: repoName,
          github_token: githubToken || null,
          create_repo: !!githubToken,
        }),
      });
      if (resp.ok) {
        const data: HarnessStatus = await resp.json();
        setStatuses((prev) => ({ ...prev, [selectedId]: data }));
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading projects…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-body font-medium tracking-[0.15em] uppercase text-muted-foreground mb-1">
          Project Harness
        </p>
        <p className="text-xs font-body text-muted-foreground/60 max-w-xl">
          Each project has its own scaffold and GitHub repo. The harness is what the agent uses to
          push branches and open PRs. Pick a project to configure.
        </p>
      </div>

      {projects.length === 0 ? (
        <p className="text-xs text-muted-foreground/60">
          No projects yet — create one from the Projects page.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {projects.map((p) => {
            const status = statuses[p.id];
            const ready = !!status?.repo_url;
            const isSelected = selectedId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedId(isSelected ? null : p.id)}
                className={`text-left rounded-lg border p-4 transition-colors ${
                  isSelected
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border/50 bg-card/40 hover:border-primary/30'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-body font-medium text-foreground truncate">
                        {p.name}
                      </span>
                      {ready ? (
                        <span className="text-[8px] font-body text-success px-1.5 py-0.5 rounded bg-success/10">
                          Ready
                        </span>
                      ) : (
                        <span className="text-[8px] font-body text-muted-foreground/50 px-1.5 py-0.5 rounded bg-muted/30">
                          Not set up
                        </span>
                      )}
                    </div>
                    {status?.repo_url ? (
                      <p className="mt-1 flex items-center gap-1 text-[10px] font-mono text-muted-foreground/60 truncate">
                        <GitBranch className="h-3 w-3 shrink-0" />
                        {status.repo_name || status.repo_url}
                      </p>
                    ) : (
                      <p className="mt-1 text-[10px] font-body text-muted-foreground/40 line-clamp-1">
                        {p.description || 'No scaffold yet'}
                      </p>
                    )}
                  </div>
                  <ChevronRight
                    className={`h-3.5 w-3.5 text-muted-foreground/40 shrink-0 transition-transform ${
                      isSelected ? 'rotate-90' : ''
                    }`}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selectedProject && (
        <HarnessConfig
          projectId={selectedProject.id}
          projectName={selectedProject.name}
          status={selectedStatus}
          onPreview={handlePreview}
          onGenerate={handleGenerate}
          loading={busy}
        />
      )}
    </div>
  );
}
