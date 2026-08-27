'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WsEvent } from '@/lib/ws';
import { useAuthFetch } from '@/hooks/use-auth-fetch';

export interface Suggestion {
  id: string;
  project_id: string;
  session_id: string | null;
  section: string;
  content: string;
  edited_content: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  /** Verbatim text of an existing bullet this suggestion contradicts/updates.
   *  When set, the UI offers a "Replace" action that strips the old bullet
   *  before merging the new one; falls back to plain "Accept" otherwise. */
  supersedes_bullet: string | null;
}

interface UseSuggestionsArgs {
  projectId: string | null;
  sessionId: string;
  wsEvents: WsEvent[];
  enabled?: boolean;
}

/**
 * Manages the queue of pending blueprint suggestions for a session.
 *
 * The agent's extractions are no longer applied to the blueprint directly
 * — they land here as pending items the user can accept (with optional
 * inline edits), reject, or bulk-accept by section. The hook keeps the
 * pending list in sync via WebSocket events fanned out from the backend.
 */
export function useSuggestions({
  projectId,
  sessionId,
  wsEvents,
  enabled = true,
}: UseSuggestionsArgs) {
  const { authFetch, ready } = useAuthFetch();
  const [pending, setPending] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  // Track which event indexes we've already drained so re-renders don't
  // double-apply the same payload (the parent appends to wsEvents forever).
  const drainedRef = useRef(0);

  const refetch = useCallback(async () => {
    if (!projectId || !ready || !enabled) return;
    setLoading(true);
    try {
      const url = `/api/projects/${projectId}/blueprint-suggestions?session_id=${sessionId}`;
      const resp = await authFetch(url);
      if (resp.ok) {
        const data = (await resp.json()) as Suggestion[];
        setPending(data);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId, sessionId, authFetch, ready, enabled]);

  useEffect(() => {
    if (!enabled) return;
    refetch();
  }, [refetch, enabled]);

  // Drain new WS events. We only look at events past the last drained index
  // so resetting the array (e.g. on reconnect) re-applies cleanly.
  useEffect(() => {
    if (!enabled) return;
    if (wsEvents.length < drainedRef.current) {
      drainedRef.current = 0;
    }
    const fresh = wsEvents.slice(drainedRef.current);
    drainedRef.current = wsEvents.length;
    if (fresh.length === 0) return;

    setPending((prev) => {
      let next = prev;
      for (const ev of fresh) {
        if (ev.type === 'suggestion_added') {
          const p = ev.payload as Partial<Suggestion> | undefined;
          if (!p?.id || p.session_id !== sessionId) continue;
          // Backend hasn't sent edited_content/reviewed_* on add — fill defaults.
          const s: Suggestion = {
            id: p.id,
            project_id: p.project_id ?? projectId ?? '',
            session_id: p.session_id ?? null,
            section: p.section ?? '',
            content: p.content ?? '',
            edited_content: p.edited_content ?? null,
            status: (p.status as Suggestion['status']) ?? 'pending',
            created_at: p.created_at ?? new Date().toISOString(),
            reviewed_at: p.reviewed_at ?? null,
            reviewed_by: p.reviewed_by ?? null,
            supersedes_bullet: p.supersedes_bullet ?? null,
          };
          if (next.some((x) => x.id === s.id)) continue;
          next = [...next, s];
        } else if (ev.type === 'suggestion_resolved') {
          const p = ev.payload as { id?: string } | undefined;
          if (!p?.id) continue;
          if (!next.some((x) => x.id === p.id)) continue;
          next = next.filter((x) => x.id !== p.id);
        }
      }
      return next;
    });
  }, [wsEvents, sessionId, projectId, enabled]);

  const accept = useCallback(
    async (id: string, editedContent?: string, replace?: boolean) => {
      if (!projectId) return false;
      // Optimistic remove — re-add on failure.
      const before = pending;
      setPending((prev) => prev.filter((s) => s.id !== id));
      try {
        const resp = await authFetch(
          `/api/projects/${projectId}/blueprint-suggestions/${id}/accept`,
          {
            method: 'POST',
            body: JSON.stringify({
              edited_content: editedContent ?? null,
              replace: replace ?? false,
            }),
          },
        );
        if (!resp.ok) {
          setPending(before);
          return false;
        }
        return true;
      } catch {
        setPending(before);
        return false;
      }
    },
    [projectId, authFetch, pending],
  );

  const reject = useCallback(
    async (id: string) => {
      if (!projectId) return false;
      const before = pending;
      setPending((prev) => prev.filter((s) => s.id !== id));
      try {
        const resp = await authFetch(
          `/api/projects/${projectId}/blueprint-suggestions/${id}/reject`,
          { method: 'POST' },
        );
        if (!resp.ok) {
          setPending(before);
          return false;
        }
        return true;
      } catch {
        setPending(before);
        return false;
      }
    },
    [projectId, authFetch, pending],
  );

  const bulkAcceptSection = useCallback(
    async (section: string) => {
      if (!projectId) return false;
      const before = pending;
      setPending((prev) => prev.filter((s) => s.section !== section));
      try {
        const resp = await authFetch(
          `/api/projects/${projectId}/blueprint-suggestions/bulk-accept`,
          {
            method: 'POST',
            body: JSON.stringify({ section, session_id: sessionId }),
          },
        );
        if (!resp.ok) {
          setPending(before);
          return false;
        }
        return true;
      } catch {
        setPending(before);
        return false;
      }
    },
    [projectId, sessionId, authFetch, pending],
  );

  return { pending, loading, refetch, accept, reject, bulkAcceptSection };
}
