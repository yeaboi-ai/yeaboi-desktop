'use client';

// Session record + the people in it. Everything here is plain HTTP against
// the planning backend; live updates arrive via use-session-events and are
// written back through the setters this hook returns.

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { logger } from '@/lib/logger';

export interface SessionData {
  id: string;
  project_id: string;
  org_id?: string;
  status: string;
  title: string | null;
  initial_idea: string | null;
  join_code: string;
  ai_config: Record<string, unknown>;
  participants: Array<{
    id: string;
    user_id: string;
    role: string;
    user_email?: string | null;
    recording_consent?: boolean | null;
  }>;
  focus_sections: string[] | null;
}

export interface TeamMember {
  id: string;
  name: string | null;
  email: string;
  avatar_url?: string | null;
}

export function useSessionData(sessionId: string, projectId: string) {
  const { authFetch, ready } = useAuthFetch();
  const { data: authSession } = useSession();
  const [session, setSession] = useState<SessionData | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [me, setMe] = useState<{
    display_name: string | null;
    name: string | null;
    email: string;
  } | null>(null);

  // Coverage drives the "Ready to finalize" affordance and the blueprint
  // panel's per-section rings.
  const [coverageScores, setCoverageScores] = useState<Record<string, number>>({});
  const [coverageOverall, setCoverageOverall] = useState(0);
  const [personaRecs, setPersonaRecs] = useState<
    Array<{ persona: string; label: string; gaps_count: number; gap_sections: string[] }>
  >([]);

  useEffect(() => {
    if (!ready) return;
    authFetch('/api/team-proxy')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: TeamMember[]) => setTeamMembers(data))
      .catch(() => setTeamMembers([]));
    authFetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setMe(data);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Mirror the backend's `display_name or name or email` resolution so the
  // optimistic chat bubble matches what the server will persist.
  const myDisplayName =
    me?.display_name ||
    me?.name ||
    teamMembers.find((m) => m.email === authSession?.user?.email)?.name ||
    authSession?.user?.name ||
    'You';
  const currentUserId = teamMembers.find((m) => m.email === authSession?.user?.email)?.id ?? null;
  const myAvatarUrl =
    teamMembers.find((m) => m.email === authSession?.user?.email)?.avatar_url ??
    authSession?.user?.image ??
    null;
  const currentUserIsHost = (() => {
    const myEmail = authSession?.user?.email;
    if (!myEmail || !session) return false;
    return (session.participants || []).some((p) => p.user_email === myEmail && p.role === 'host');
  })();

  const patchSession = useCallback(
    async (body: Record<string, unknown>) => {
      const resp = await authFetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (resp.ok) {
        const updated = await resp.json();
        setSession(updated);
        return updated as SessionData;
      }
      return null;
    },
    [sessionId, authFetch],
  );

  const changeStatus = useCallback((status: string) => patchSession({ status }), [patchSession]);
  const saveTitle = useCallback(
    async (title: string) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      await patchSession({ title: trimmed });
    },
    [patchSession],
  );

  /**
   * Patch ai_config optimistically and persist in the background. Persona and
   * assertiveness changes also go through the chat command pipeline so the
   * facilitator acknowledges them; `addNote` lets the page drop the local
   * system-message confirmation into the chat feed.
   */
  const patchAiConfig = useCallback(
    (
      patch: Record<string, unknown>,
      hooks?: {
        addNote?: (text: string) => void;
        refreshMessages?: () => void;
      },
    ) => {
      setSession((s) => {
        if (!s) return s;
        const prev = s.ai_config || {};
        const updatedConfig = { ...prev, ...patch };
        authFetch(`/api/sessions/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ai_config: updatedConfig }),
        }).catch(() => logger.warn('Failed to persist AI config'));

        const personaLabels: Record<string, string> = {
          default: 'Senior Engineer',
          pm: 'Product Manager',
          architect: 'System Architect',
          mentor: 'Patient Mentor',
          challenger: "Devil's Advocate",
        };
        if (patch['persona'] && patch['persona'] !== prev['persona']) {
          const label = personaLabels[patch['persona'] as string] || String(patch['persona']);
          authFetch(`/api/sessions/${sessionId}/messages`, {
            method: 'POST',
            body: JSON.stringify({ content: `/persona ${patch['persona']}` }),
          })
            .then(() => hooks?.refreshMessages?.())
            .catch(() => logger.warn('Failed to send persona change'));
          hooks?.addNote?.(`Switched to **${label}**`);
        }
        if (patch['assertiveness'] && patch['assertiveness'] !== prev['assertiveness']) {
          authFetch(`/api/sessions/${sessionId}/messages`, {
            method: 'POST',
            body: JSON.stringify({ content: `/assertiveness ${patch['assertiveness']}` }),
          })
            .then(() => hooks?.refreshMessages?.())
            .catch(() => logger.warn('Failed to send assertiveness change'));
          hooks?.addNote?.(`Assertiveness set to **${patch['assertiveness']}**`);
        }
        return { ...s, ai_config: updatedConfig };
      });
    },
    [sessionId, authFetch],
  );

  const changeParticipantRole = useCallback(
    async (participantId: string, role: 'co_host' | 'member') => {
      const resp = await authFetch(
        `/api/sessions/${sessionId}/participants/${participantId}/role`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role }),
        },
      );
      if (!resp.ok) throw new Error(`role change ${resp.status}`);
      const data = (await resp.json()) as { id: string; role: string };
      setSession((s) =>
        s
          ? {
              ...s,
              participants: s.participants.map((p) =>
                p.id === data.id ? { ...p, role: data.role } : p,
              ),
            }
          : s,
      );
    },
    [sessionId, authFetch],
  );

  const fetchCoverage = useCallback(async () => {
    try {
      const resp = await authFetch(`/api/sessions/${projectId}/blueprint/coverage`);
      if (resp.ok) {
        const data = await resp.json();
        setCoverageScores(data.scores || {});
        setCoverageOverall(data.overall || 0);
        if (data.persona_recommendations) setPersonaRecs(data.persona_recommendations);
      }
    } catch {}
  }, [projectId, authFetch]);

  return {
    ready,
    authSession,
    session,
    setSession,
    teamMembers,
    me,
    myDisplayName,
    currentUserId,
    myAvatarUrl,
    currentUserIsHost,
    changeStatus,
    saveTitle,
    patchAiConfig,
    changeParticipantRole,
    coverageScores,
    coverageOverall,
    personaRecs,
    fetchCoverage,
  };
}
