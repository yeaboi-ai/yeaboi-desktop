// The context scope's wire — the options a picker draws from, the preview a
// scope resolves to, and the labels a run carries. Every read goes through
// apiGetOptional: a sidecar older than the routes answers 404, and null is
// how a picker knows to draw nothing rather than fail.

import { apiGetOptional, apiPost } from './api';
import type { ContextOptions, ContextPreview, ContextScope } from '@/lib/context/scope';

export interface SessionLabels {
  mode: string;
  session_id: string;
  run_id: string;
  project_label: string;
  tags: string[];
  scope: ContextScope | null;
  created_at: string;
  updated_at: string;
}

/** null means the sidecar predates the context routes. */
export function loadContextOptions(mode = ''): Promise<ContextOptions | null> {
  const suffix = mode ? `?mode=${encodeURIComponent(mode)}` : '';
  return apiGetOptional<ContextOptions>(`/api/context/options${suffix}`);
}

export function previewContext(
  context: ContextScope | string,
  options: { mode?: string; rows?: boolean } = {},
): Promise<ContextPreview> {
  return apiPost<ContextPreview>('/api/context/preview', {
    context,
    ...(options.mode ? { mode: options.mode } : {}),
    ...(options.rows ? { rows: true } : {}),
  });
}

export function loadLabels(
  mode: string,
  sessionId: string,
  runId = '',
): Promise<SessionLabels | null> {
  const suffix = runId ? `?run_id=${encodeURIComponent(runId)}` : '';
  return apiGetOptional<SessionLabels>(
    `/api/sessions/${encodeURIComponent(mode)}/${encodeURIComponent(sessionId)}/labels${suffix}`,
  );
}

export function setLabels(
  mode: string,
  sessionId: string,
  patch: { runId?: string; projectLabel?: string; tags?: string[]; mergeTags?: boolean },
): Promise<SessionLabels> {
  const body: Record<string, unknown> = {};
  if (patch.runId) body['run_id'] = patch.runId;
  if (patch.projectLabel !== undefined) body['project_label'] = patch.projectLabel;
  if (patch.tags !== undefined) body['tags'] = patch.tags;
  if (patch.mergeTags !== undefined) body['merge_tags'] = patch.mergeTags;
  return apiPost<SessionLabels>(
    `/api/sessions/${encodeURIComponent(mode)}/${encodeURIComponent(sessionId)}/labels`,
    body,
  );
}

/** The three keys every run body carries when a scope was chosen. */
export function contextBody(
  scope: ContextScope | null,
  projectLabel = '',
  tags: readonly string[] = [],
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (scope) body['context'] = scope;
  if (projectLabel.trim()) body['project_label'] = projectLabel.trim();
  if (tags.length) body['tags'] = [...tags];
  return body;
}
