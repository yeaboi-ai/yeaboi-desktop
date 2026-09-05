// The project a mode page runs inside, from `?project=` in its location.
//
// The platform project is read once so the page can say its name; the engine
// project (`proj-<8hex>`) is resolved only when a run starts, because minting
// one is a write and a page merely opened inside a project must not create
// anything. Dropping the param is the way back to a one-off run.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { ensureEngineProject, type EngineLinkable } from '@/lib/yeaboi/engine-project';
import { projectIdFromSearch, withProject, withoutProject } from '@/lib/yeaboi/project-scope';

export interface PlatformProject extends EngineLinkable {
  created_at?: string;
  repo_url?: string | null;
}

export interface ProjectScope {
  /** The platform project id the location carries, or ''. */
  projectId: string;
  scoped: boolean;
  project: PlatformProject | null;
  /** True while the project is being read. */
  loading: boolean;
  /** Why the project could not be read, in one sentence. */
  error: string;
  /** The engine project to scope a run by — '' for a one-off. Throws when the
   *  platform project is missing or the sidecar refuses to mint. */
  engineId: () => Promise<string>;
  /** `href` with the project carried along. */
  href: (href: string) => string;
  /** Drop the project and stay on this page as a one-off. */
  clear: () => void;
}

export function useProjectScope(): ProjectScope {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const { authFetch, ready } = useAuthFetch();
  const projectId = projectIdFromSearch(search);
  const [project, setProject] = useState<PlatformProject | null>(null);
  const [loading, setLoading] = useState(Boolean(projectId));
  const [error, setError] = useState('');
  const engineRef = useRef('');

  useEffect(() => {
    engineRef.current = '';
    setProject(null);
    setError('');
    if (!projectId) {
      setLoading(false);
      return;
    }
    if (!ready) return;
    let stale = false;
    setLoading(true);
    authFetch(`/api/projects/${encodeURIComponent(projectId)}`)
      .then(async (resp) => {
        if (!resp.ok) throw new Error(`The project could not be read (${resp.status}).`);
        return (await resp.json()) as PlatformProject;
      })
      .then(
        (row) => {
          if (stale) return;
          setProject(row);
          engineRef.current = row.yeaboi_project_id ?? '';
        },
        (e: Error) => {
          if (!stale) setError(e.message);
        },
      )
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [projectId, ready, authFetch]);

  const engineId = useCallback(async () => {
    if (!projectId) return '';
    if (engineRef.current) return engineRef.current;
    if (!project) throw new Error(error || 'The project has not loaded yet.');
    const id = await ensureEngineProject(authFetch, project);
    engineRef.current = id;
    return id;
  }, [projectId, project, error, authFetch]);

  const href = useCallback((target: string) => withProject(target, projectId), [projectId]);

  const clear = useCallback(() => {
    void navigate(withoutProject(pathname, search), { replace: true });
  }, [navigate, pathname, search]);

  return { projectId, scoped: Boolean(projectId), project, loading, error, engineId, href, clear };
}
