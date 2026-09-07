// An engine project's row and its defaults — the repo path the Agents world
// scopes its reports by. The read tolerates an older sidecar (null), so the
// page can say what to do instead of failing.

import { apiGetOptional, apiPost } from './api';

export interface EngineProjectRow {
  project_id: string;
  name: string;
  description: string;
  settings: Record<string, unknown>;
  created_at: string;
  last_active: string;
  archived: boolean;
  session_ids?: string[];
}

/** null means the sidecar predates the projects routes. */
export const loadEngineProject = (engineId: string): Promise<EngineProjectRow | null> =>
  apiGetOptional(`/api/projects/${encodeURIComponent(engineId)}`);

export const setEngineProjectDefaults = (
  engineId: string,
  defaults: Record<string, string>,
): Promise<EngineProjectRow> =>
  apiPost(`/api/projects/${encodeURIComponent(engineId)}/defaults`, { defaults });

/** The absolute repo path a project's reports are scoped to, or ''. */
export function repoPathOf(row: EngineProjectRow | null): string {
  const value = row?.settings?.['repo_path'];
  return typeof value === 'string' ? value : '';
}

/** The terminal command that sets the path, for a sidecar that cannot. */
export function repoPathCommand(engineId: string): string {
  return `yeaboi project set-defaults ${engineId} --repo <path>`;
}
