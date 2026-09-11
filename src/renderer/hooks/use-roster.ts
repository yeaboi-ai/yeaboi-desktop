'use client';

// The orgs and teams that scope the planning workspace, and which are chosen.
// Solo and Team share the scoping data (the stored ids scope /api/sessions);
// only the Team world shows the pickers. The agents world reads local session
// telemetry and has neither.

import { useCallback, useEffect, useState } from 'react';
import type { Audience } from '@shared/audience';
import {
  dispatchTeamChange,
  getStoredOrgId,
  getStoredTeamId,
  setStoredOrgId,
  setStoredTeamId,
  useAuthFetch,
} from '@/hooks/use-auth-fetch';
import { logger } from '@/lib/logger';

export interface RosterEntry {
  id: string;
  name: string;
  slug: string;
}

export function useRoster(audience: Audience) {
  const { authFetch, ready } = useAuthFetch();
  const [orgs, setOrgs] = useState<RosterEntry[]>([]);
  const [teams, setTeams] = useState<RosterEntry[]>([]);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);

  const loadTeams = useCallback(
    async (orgId: string, adoptFirst: boolean) => {
      const response = await authFetch(`/api/orgs/${orgId}/teams`);
      const data: RosterEntry[] = response.ok ? await response.json() : [];
      setTeams(data);
      if (adoptFirst && data.length > 0) {
        setStoredTeamId(data[0]!.id);
        setCurrentTeamId(data[0]!.id);
      }
    },
    [authFetch],
  );

  useEffect(() => {
    if (!ready) return;
    const storedOrg = getStoredOrgId();
    const storedTeam = getStoredTeamId();
    setCurrentOrgId(storedOrg);
    setCurrentTeamId(storedTeam);
    const load = async () => {
      try {
        const response = await authFetch('/api/orgs');
        const data: RosterEntry[] = response.ok ? await response.json() : [];
        setOrgs(data);
        const orgId = storedOrg || (data.length > 0 ? data[0]!.id : null);
        if (!storedOrg && orgId) {
          setStoredOrgId(orgId);
          setCurrentOrgId(orgId);
        }
        if (orgId) await loadTeams(orgId, !storedTeam);
      } catch {
        // The sidecar is down; the pickers stay empty.
      }
    };
    void load();
  }, [ready, authFetch, audience, loadTeams]);

  // Teams change elsewhere; re-read them when the window comes back.
  useEffect(() => {
    if (!currentOrgId || !ready) return;
    const refresh = () => {
      loadTeams(currentOrgId, !getStoredTeamId()).catch(() =>
        logger.warn('Failed to refresh teams'),
      );
    };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [currentOrgId, ready, loadTeams]);

  const chooseOrg = useCallback(
    async (orgId: string) => {
      setStoredOrgId(orgId);
      setCurrentOrgId(orgId);
      localStorage.removeItem('current_team_id');
      setCurrentTeamId(null);
      try {
        await loadTeams(orgId, true);
      } catch {
        // The teams list stays as it was.
      }
      dispatchTeamChange();
    },
    [loadTeams],
  );

  const chooseTeam = useCallback((teamId: string) => {
    setStoredTeamId(teamId);
    setCurrentTeamId(teamId);
    dispatchTeamChange();
  }, []);

  return { orgs, teams, currentOrgId, currentTeamId, chooseOrg, chooseTeam };
}
