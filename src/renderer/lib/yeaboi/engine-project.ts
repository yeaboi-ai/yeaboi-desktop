// The engine-side project a platform project is a client of.
//
// Minted lazily on the first engine-touching run — never at platform-project
// creation, where the sidecar may be down and creating a project must not
// fail over it. The pointer lives on the platform row (yeaboi_project_id);
// a lost PATCH just mints a second engine project on a later run, which is
// survivable — the iteration's yeaboi_session_id keeps every generated plan
// reachable regardless.

import { callTool } from './api';

type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

export interface EngineLinkable {
  id: string;
  name: string;
  description?: string | null;
  yeaboi_project_id?: string | null;
}

/** Return the engine project id for a platform project, minting one if needed. */
export async function ensureEngineProject(
  authFetch: AuthFetch,
  project: EngineLinkable,
): Promise<string> {
  if (project.yeaboi_project_id) return project.yeaboi_project_id;
  const envelope = await callTool<{ project_id: string }>('project_create', {
    name: project.name,
    description: project.description ?? '',
  });
  if (!envelope.ok || !envelope.data?.project_id) {
    throw new Error(
      envelope.ok
        ? 'project_create returned no id'
        : (envelope.error?.message ?? 'project_create failed'),
    );
  }
  const engineId = envelope.data.project_id;
  const patch = await authFetch(`/api/projects/${project.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ yeaboi_project_id: engineId }),
  });
  if (!patch.ok) {
    // The engine row exists and this run can still scope by it; only the
    // pointer write failed, so the next run may mint a duplicate. Say so
    // without failing the run the user actually asked for.
    console.warn(`engine-project: pointer PATCH failed (${patch.status}); continuing scoped`);
  }
  return engineId;
}
