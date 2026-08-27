'use client';

import { useEffect, useState } from 'react';
import { useAuthFetch } from '@/hooks/use-auth-fetch';

export interface SessionRecording {
  id: string;
  session_id: string;
  status: 'starting' | 'active' | 'completed' | 'failed' | 'expired';
  duration_seconds: number | null;
  file_size_bytes: number | null;
  started_at: string | null;
  ended_at: string | null;
  expires_at: string | null;
  share_token: string | null;
  share_url: string | null;
  error: string | null;
}

interface UseSessionRecordingsOptions {
  /** Refetch interval in ms. Default 0 (no polling). Pass ~5_000 inside active
   *  calls so the REC badge flips on within seconds of egress starting. */
  pollMs?: number;
}

/**
 * Fetches the recordings list for a session. Used by both the recordings strip
 * in the recap surface and the REC badge on the meeting tile — sharing the
 * fetch keeps the UI consistent without two independent timers.
 */
export function useSessionRecordings(
  sessionId: string | undefined,
  { pollMs = 0 }: UseSessionRecordingsOptions = {},
) {
  const { authFetch, ready } = useAuthFetch();
  const [rows, setRows] = useState<SessionRecording[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !sessionId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const resp = await authFetch(`/api/sessions/${sessionId}/recordings`);
        if (cancelled) return;
        if (!resp.ok) {
          setError(`(${resp.status})`);
        } else {
          const data = (await resp.json()) as SessionRecording[];
          setRows(data);
          setError(null);
        }
      } catch {
        if (!cancelled) setError('network');
      } finally {
        if (!cancelled && pollMs > 0) {
          timer = setTimeout(tick, pollMs);
        }
      }
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [ready, sessionId, authFetch, pollMs]);

  const isRecording = !!rows?.some((r) => r.status === 'active' || r.status === 'starting');
  return { rows, isRecording, error };
}
