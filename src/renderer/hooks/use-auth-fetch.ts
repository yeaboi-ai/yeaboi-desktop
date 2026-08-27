'use client';

import { useCallback, useEffect, useState } from 'react';
import { requestProviderHealthRefresh } from '@/components/providers/provider-health-provider';
import { apiFetch, getAuth } from '@/lib/api-base';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Org / Team context helpers (module-level, safe to import outside the hook)
// ---------------------------------------------------------------------------

export function getStoredOrgId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('current_org_id');
}

export function clearStoredOrgId() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('current_org_id');
}

export function clearStoredTeamId() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('current_team_id');
}

export function setStoredOrgId(id: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('current_org_id', id);
}

export function getStoredTeamId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('current_team_id');
}

export function setStoredTeamId(id: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('current_team_id', id);
}

/** Dispatch when team or org changes so page components re-fetch. */
export function dispatchTeamChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('team-change'));
}

/**
 * Hook that provides an authenticated fetch function for client components.
 * The token comes from the main process over the preload bridge (see
 * lib/api-base.ts); this hook adds the 403 stale-org retry and the 402
 * provider-health nudge on top of the shared apiFetch.
 *
 * `teamVersion` increments on team/org change — include it in useEffect deps
 * to re-fetch data when the user switches teams.
 */
export function useAuthFetch() {
  const [ready, setReady] = useState(false);
  const [teamVersion, setTeamVersion] = useState(0);

  useEffect(() => {
    getAuth()
      .then((auth) => setReady(auth !== null))
      .catch(() => logger.warn('Failed to fetch auth token'));
  }, []);

  // Listen for team-change events
  useEffect(() => {
    const handler = () => setTeamVersion((v) => v + 1);
    window.addEventListener('team-change', handler);
    return () => window.removeEventListener('team-change', handler);
  }, []);

  const authFetch = useCallback(
    async (url: string, options: RequestInit = {}): Promise<Response> => {
      const traceId = crypto.randomUUID().replace(/-/g, '');
      const spanId = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
      const traceHeaders: Record<string, string> = {
        traceparent: `00-${traceId}-${spanId}-01`,
        'X-Request-Id': traceId.slice(0, 32),
      };

      const orgId = getStoredOrgId();
      const teamId = getStoredTeamId();

      let response = await apiFetch(url, {
        ...options,
        headers: { ...traceHeaders, ...(options.headers as Record<string, string>) },
      });

      // Stale identity recovery: a 403 here typically means the
      // X-Org-Id / X-Team-Id we sent points at a deleted or no-longer-
      // accessible team/org (e.g. after a DB wipe or a team transfer).
      // Without this branch, callers like the projects list silently
      // render an empty workspace because they coerce !ok responses to
      // []. Clear the stale identity headers, dispatch team-change so
      // listeners re-fetch, and retry the request once with the
      // first-membership fallback path on the backend.
      if (response.status === 403 && (orgId || teamId)) {
        if (orgId) clearStoredOrgId();
        if (teamId) clearStoredTeamId();
        dispatchTeamChange();
        logger.warn('authFetch: 403 with org/team headers — clearing stale identity and retrying', {
          url,
          hadOrgId: !!orgId,
          hadTeamId: !!teamId,
        });
        // Retried without the (now cleared) org/team localStorage keys.
        response = await apiFetch(url, {
          ...options,
          headers: { ...traceHeaders, ...(options.headers as Record<string, string>) },
        });
      }

      // A 402 from any backend route means a provider error or hard-spend
      // limit short-circuit. Trigger an immediate health-summary refresh so
      // the global banner appears within ~1s rather than at the next 60s
      // polling tick.
      if (response.status === 402) {
        requestProviderHealthRefresh();
      }
      return response;
    },
    [],
  );

  return { authFetch, ready, teamVersion };
}
