'use client';

// "Send to board" — a yeaboi plan becoming cards on a planning-platform
// project's kanban board (lib/yeaboi/board-bridge.ts).
//
// Two steps: pick the project, then confirm the split the preview computed —
// which stories become new cards and which update cards from an earlier
// import (matched by yeaboi_story_id, so re-running never duplicates).

import { useEffect, useState } from 'react';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import {
  type ImportPreview,
  mapPlan,
  previewImport,
  runImport,
} from '@/lib/yeaboi/board-bridge';
import type { Plan } from '@/lib/yeaboi/plan';
import { duckQuip } from '@/lib/duck-events';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';

interface ProjectRow {
  id: string;
  name: string;
}

export interface PlanImportDialogProps {
  plan: Plan;
  onClose: () => void;
}

export function PlanImportDialog({ plan, onClose }: PlanImportDialogProps) {
  const { authFetch, ready } = useAuthFetch();
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [projectId, setProjectId] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const mapped = mapPlan(plan);

  useEffect(() => {
    if (!ready) return;
    authFetch('/api/projects')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`projects → ${r.status}`))))
      .then((rows: ProjectRow[]) => {
        setProjects(rows);
        if (rows.length) setProjectId((prior) => prior || rows[0]!.id);
      })
      .catch((e: Error) => setError(e.message));
  }, [ready, authFetch]);

  useEffect(() => {
    if (!projectId || !ready) return;
    setPreview(null);
    setError('');
    previewImport(authFetch, projectId, mapped).then(setPreview, (e: Error) =>
      setError(e.message),
    );
    // mapped is derived from a stable plan prop — the project is the input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, ready]);

  async function run() {
    if (!preview || busy) return;
    setBusy(true);
    setError('');
    try {
      const summary = await runImport(authFetch, projectId, preview);
      toast.success({
        title: 'Plan on the board',
        description: `${summary.created} card${summary.created === 1 ? '' : 's'} created, ${summary.updated} updated.`,
      });
      duckQuip('wizard.committed');
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-background/60 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Send to board"
        className="w-[480px] max-w-[calc(100vw-3rem)] rounded-2xl bg-card shadow-2xl ring-1 ring-border/70 p-5"
      >
        <h2 className="text-sm font-medium text-foreground mb-1">Send to board</h2>
        <p className="text-[12px] text-muted-foreground mb-4">
          {mapped.length} stories from this plan become cards; sprints become waves, epics become
          labels. Re-running updates the cards it made before — it never duplicates or deletes.
        </p>

        {!projects && !error && <p className="text-[12px] text-muted-foreground">Loading…</p>}
        {projects && projects.length === 0 && (
          <p className="text-[12px] text-muted-foreground">
            No projects yet — create one in the Workspace first.
          </p>
        )}

        {projects && projects.length > 0 && (
          <label className="block mb-3">
            <span className="text-[11px] font-body text-muted-foreground uppercase tracking-wide">
              Project
            </span>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="mt-1 w-full rounded-lg bg-secondary/40 border border-border/40 px-3 py-2 text-[13px] text-foreground"
            >
              {projects.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {preview && (
          <div className="rounded-xl bg-secondary/40 px-3 py-2 text-[12px] text-muted-foreground mb-3">
            {preview.create.length} new card{preview.create.length === 1 ? '' : 's'} ·{' '}
            {preview.update.length} updated from an earlier import
          </div>
        )}

        {error && <p className="text-[12px] text-destructive mb-3">{error}</p>}

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={busy || !preview || !mapped.length} onClick={() => void run()}>
            {busy ? 'Sending…' : 'Send to board'}
          </Button>
        </div>
      </div>
    </div>
  );
}
