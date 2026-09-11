'use client';

// Everything the room's call needs from the vendored backend, behind the
// plan's linked row: the LiveKit call, the session socket (mounted only while
// a drawer that reads it is open), the voice agent's transcript, the people
// the tiles name, and the facilitator's ai_config. Nothing here runs until
// `ensure()` has made the row — most plans never take a call.

import { useCallback, useEffect, useState } from 'react';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { useCallState } from '@/hooks/use-call-state';
import { useSessionRecordings } from '@/hooks/use-session-recordings';
import { useSessionWs } from '@/hooks/use-session-ws';
import type { UseRoomLinkResult } from '@/hooks/planning/use-room-link';
import { logger } from '@/lib/logger';

export interface TranscriptEntry {
  id: string;
  speaker_name: string | null;
  text: string;
  is_final: boolean;
  created_at: string;
}

export interface TeamMember {
  id: string;
  name: string | null;
  email: string;
}

export interface Participant {
  id: string;
  user_id: string;
  role: string;
  user_name?: string | null;
  user_email?: string | null;
  recording_consent?: boolean | null;
}

const RECORDING_POLL_MS = 5_000;

export function useRoomVoice(link: UseRoomLinkResult, socketWanted: boolean) {
  const { authFetch, ready } = useAuthFetch();
  const vendoredId = link.vendoredId ?? '';
  const call = useCallState({ sessionId: vendoredId, authFetch });
  const socket = useSessionWs(socketWanted ? vendoredId : '');
  const recordings = useSessionRecordings(vendoredId || undefined, {
    pollMs: call.inCall ? RECORDING_POLL_MS : 0,
  });
  const [agentEntries, setAgentEntries] = useState<TranscriptEntry[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [joinPending, setJoinPending] = useState(false);

  useEffect(() => {
    if (!ready || !vendoredId) return;
    authFetch('/api/team-proxy')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: TeamMember[]) => setTeamMembers(Array.isArray(rows) ? rows : []))
      .catch(() => setTeamMembers([]));
  }, [authFetch, ready, vendoredId]);

  /** The row again, with its participants — the list route trims them. */
  const refreshSession = useCallback(async () => {
    if (!vendoredId) return;
    try {
      const resp = await authFetch(`/api/sessions/${vendoredId}`);
      if (resp.ok) link.setSession(await resp.json());
    } catch (e) {
      logger.warn('room: session refresh failed', e);
    }
  }, [authFetch, link, vendoredId]);

  const patchAiConfig = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!vendoredId || !link.session) return;
      const previous = (link.session.ai_config ?? {}) as Record<string, unknown>;
      const ai_config = { ...previous, ...patch };
      link.setSession({ ...link.session, ai_config });
      try {
        const resp = await authFetch(`/api/sessions/${vendoredId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ai_config }),
        });
        if (resp.ok) link.setSession(await resp.json());
      } catch (e) {
        logger.warn('room: ai_config patch failed', e);
      }
    },
    [authFetch, link, vendoredId],
  );

  // A call on a plan that has no row yet: make the row first, then join once
  // the call hook has been handed its id on the next render.
  const startCall = useCallback(async () => {
    const row = await link.ensure();
    if (!row) return;
    setJoinPending(true);
  }, [link]);

  useEffect(() => {
    if (!joinPending || !vendoredId || call.inCall || call.isConnecting) return;
    setJoinPending(false);
    logger.info('room: joining the call', { vendoredId });
    void call.join();
  }, [call, joinPending, vendoredId]);

  const endCall = useCallback(() => {
    logger.info('room: leaving the call', { vendoredId });
    call.leave();
  }, [call, vendoredId]);

  const participants = ((link.session?.participants as Participant[] | undefined) ?? []).filter(
    Boolean,
  );

  return {
    vendoredId,
    call,
    socket,
    recordings,
    agentEntries,
    setAgentEntries,
    teamMembers,
    participants,
    refreshSession,
    patchAiConfig,
    startCall,
    endCall,
    joining: joinPending || call.isConnecting || link.ensuring,
  };
}

export type RoomVoice = ReturnType<typeof useRoomVoice>;
