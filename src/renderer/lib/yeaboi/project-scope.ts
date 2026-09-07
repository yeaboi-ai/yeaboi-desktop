// The project a mode page runs inside, carried as `?project=<platform id>`.
//
// A mode page reached from a project keeps the id in its query string, so
// every link it offers stays inside the project and the rail stays on
// Projects; dropping the param is what makes the run a one-off again. Pure,
// so the URL rules are testable (test/project-scope.test.ts).

export const PROJECT_PARAM = 'project';

/** The platform project id a search string carries, or ''. */
export function projectIdFromSearch(search: string): string {
  return new URLSearchParams(search).get(PROJECT_PARAM) ?? '';
}

/** `href` with the project carried along; unchanged when there is no project. */
export function withProject(href: string, projectId: string): string {
  if (!projectId) return href;
  const [path, query = ''] = href.split('?', 2);
  const params = new URLSearchParams(query);
  params.set(PROJECT_PARAM, projectId);
  return `${path}?${params.toString()}`;
}

/** The same location with the project dropped — the one-off version of it. */
export function withoutProject(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  params.delete(PROJECT_PARAM);
  const rest = params.toString();
  return rest ? `${pathname}?${rest}` : pathname;
}

/** The host of a linked repo, for a row's secondary; '' when there is none. */
export function repoHost(repoUrl: string | null | undefined): string {
  if (!repoUrl) return '';
  try {
    return new URL(repoUrl).host;
  } catch {
    return repoUrl;
  }
}

/** Modes whose run carries no project on the wire, so a project opens them unscoped. */
export const UNSCOPED_MODES: ReadonlySet<string> = new Set(['ship']);

/** The link that starts `key` from inside a project: scoped, unless the mode runs unscoped. */
export function runInsideHref(key: string, route: string, projectId: string): string {
  return UNSCOPED_MODES.has(key) ? route : withProject(route, projectId);
}

/** A run body scoped to an engine project; the body itself when unscoped. */
export function scopedRunBody<T extends object>(body: T, engineId: string): T {
  return engineId ? { ...body, project_id: engineId } : body;
}
