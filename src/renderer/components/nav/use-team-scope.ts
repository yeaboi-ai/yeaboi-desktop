'use client';

// Which org and team the workspace is scoped to. Lifted out of the sidebar
// unchanged in behaviour: the stored ids scope /api/projects, so this has to
// keep working wherever the controls that set it end up being drawn.

import { useCallback, useEffect, useState } from 'react';

import {
  dispatchTeamChange,
  getStoredOrgId,
  getStoredTeamId,
  setStoredOrgId,
  setStoredTeamId,
  useAuthFetch,
} from '@/hooks/use-auth-fetch';
import { logger } from '@/lib/logger';
import type { Audience } from '@shared/audience';

export interface Scoped {
  id: string;
  name: string;
  slug: string;
}

export interface TeamScope {
  orgs: Scoped[];
  teams: Scoped[];
  orgId: string | null;
  teamId: string | null;
  /** The first load has answered, so the controls can appear without flashing
   *  an empty select first. */
  loaded: boolean;
  chooseOrg: (id: string) => void;
  chooseTeam: (id: string) => void;
}

export function useTeamScope(audience: Audience): TeamScope {
  const { authFetch, ready } = useAuthFetch();
  const [orgs, setOrgs] = useState<Scoped[]>([]);
  const [teams, setTeams] = useState<Scoped[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!ready) return;
    // Orgs and teams scope the planning workspace, which Solo and Team share;
    // the agents world reads local session telemetry and has neither.
    if (audience === 'agents') {
      setLoaded(true);
      return;
    }
    const storedOrg = getStoredOrgId();
    const storedTeam = getStoredTeamId();
    setOrgId(storedOrg);
    setTeamId(storedTeam);

    void (async () => {
      try {
        const orgResp = await authFetch('/api/orgs');
        const orgData: Scoped[] = orgResp.ok ? await orgResp.json() : [];
        setOrgs(orgData);

        const active = storedOrg || orgData[0]?.id || null;
        if (!storedOrg && active) {
          setStoredOrgId(active);
          setOrgId(active);
        }
        if (!active) return;

        const teamResp = await authFetch(`/api/orgs/${active}/teams`);
        const teamData: Scoped[] = teamResp.ok ? await teamResp.json() : [];
        setTeams(teamData);
        if (!storedTeam && teamData[0]) {
          setStoredTeamId(teamData[0].id);
          setTeamId(teamData[0].id);
        }
      } catch {
        /* a scope that will not load is a scope the selects simply do not offer */
      } finally {
        setLoaded(true);
      }
    })();
  }, [ready, authFetch, audience]);

  const refreshTeams = useCallback(
    (org: string) => {
      authFetch(`/api/orgs/${org}/teams`)
        .then((r) => (r.ok ? r.json() : []))
        .then((data: Scoped[]) => {
          setTeams(data);
          if (!getStoredTeamId() && data[0]) {
            setStoredTeamId(data[0].id);
            setTeamId(data[0].id);
          }
        })
        .catch(() => logger.warn('Failed to refresh teams'));
    },
    [authFetch],
  );

  // A team added in a browser should appear here without a restart.
  useEffect(() => {
    if (!orgId || !ready) return;
    const onFocus = () => refreshTeams(orgId);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [orgId, ready, refreshTeams]);

  const chooseOrg = useCallback(
    (next: string) => {
      setStoredOrgId(next);
      setOrgId(next);
      localStorage.removeItem('current_team_id');
      setTeamId(null);
      refreshTeams(next);
      dispatchTeamChange();
    },
    [refreshTeams],
  );

  const chooseTeam = useCallback((next: string) => {
    setStoredTeamId(next);
    setTeamId(next);
    dispatchTeamChange();
  }, []);

  return { orgs, teams, orgId, teamId, loaded, chooseOrg, chooseTeam };
}
