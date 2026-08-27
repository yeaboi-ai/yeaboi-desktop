"use client";

import { useCallback, useEffect, useState } from "react";
import { requestProviderHealthRefresh } from "@/components/providers/provider-health-provider";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Org / Team context helpers (module-level, safe to import outside the hook)
// ---------------------------------------------------------------------------

export function getStoredOrgId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("current_org_id");
}

export function clearStoredOrgId() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("current_org_id");
}

export function clearStoredTeamId() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("current_team_id");
}

export function setStoredOrgId(id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("current_org_id", id);
}

export function getStoredTeamId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("current_team_id");
}

export function setStoredTeamId(id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("current_team_id", id);
}

/** Dispatch when team or org changes so page components re-fetch. */
export function dispatchTeamChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("team-change"));
}

/**
 * Hook that provides an authenticated fetch function for client components.
 * Gets a JWT from /api/ws-token and includes it in all requests.
 *
 * `teamVersion` increments on team/org change — include it in useEffect deps
 * to re-fetch data when the user switches teams.
 */
export function useAuthFetch() {
  const [token, setToken] = useState<string | null>(null);
  const [teamVersion, setTeamVersion] = useState(0);

  useEffect(() => {
    fetch("/api/ws-token")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.token) setToken(data.token);
      })
      .catch(() => logger.warn("Failed to fetch auth token"));
  }, []);

  // Listen for team-change events
  useEffect(() => {
    const handler = () => setTeamVersion((v) => v + 1);
    window.addEventListener("team-change", handler);
    return () => window.removeEventListener("team-change", handler);
  }, []);

  const authFetch = useCallback(
    async (url: string, options: RequestInit = {}): Promise<Response> => {
      // Don't set a default Content-Type for FormData — the browser sets it with the boundary.
      const isFormData = options.body instanceof FormData;
      const traceId = crypto.randomUUID().replace(/-/g, "");
      const spanId = crypto.randomUUID().replace(/-/g, "").slice(0, 16);

      const buildBaseHeaders = (): Record<string, string> => {
        const h: Record<string, string> = {
          ...(isFormData ? {} : { "Content-Type": "application/json" }),
          traceparent: `00-${traceId}-${spanId}-01`,
          "X-Request-Id": traceId.slice(0, 32),
          ...(options.headers as Record<string, string>),
        };
        if (token) h["Authorization"] = `Bearer ${token}`;
        return h;
      };

      const orgId = getStoredOrgId();
      const teamId = getStoredTeamId();

      const headers = buildBaseHeaders();
      if (orgId) headers["X-Org-Id"] = orgId;
      if (teamId) headers["X-Team-Id"] = teamId;

      let response = await fetch(url, { ...options, headers });

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
        const retryHeaders = buildBaseHeaders(); // intentionally without org/team
        logger.warn(
          "authFetch: 403 with org/team headers — clearing stale identity and retrying",
          { url, hadOrgId: !!orgId, hadTeamId: !!teamId },
        );
        response = await fetch(url, { ...options, headers: retryHeaders });
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
    [token],
  );

  return { authFetch, ready: !!token, teamVersion };
}
