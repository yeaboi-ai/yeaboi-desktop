'use client';

// The vendored session row a plan's call, recordings and board hang off.
// Made lazily, the first time a drawer needs it, and found again by the
// engine id it carries — most plans never take a call, so nothing is made
// up front.

import { useCallback, useRef, useState } from 'react';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { linkBody, linkQuery, pickLinked, type LinkedSession } from '@/lib/planning/room-link';

export interface RoomSession extends LinkedSession {
  name?: string | null;
  title?: string | null;
  status?: string;
  join_code?: string;
  ai_config?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface UseRoomLinkResult {
  /** The vendored row's id once one exists; null until `ensure()` has run. */
  vendoredId: string | null;
  session: RoomSession | null;
  setSession: (session: RoomSession | null) => void;
  /** Find or make the row. Resolves to the row, or null when the backend refused. */
  ensure: () => Promise<RoomSession | null>;
  ensuring: boolean;
  error: string | null;
}

export function useRoomLink(chatId: string, title: string, description: string): UseRoomLinkResult {
  const { authFetch } = useAuthFetch();
  const [session, setSession] = useState<RoomSession | null>(null);
  const [ensuring, setEnsuring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One in-flight lookup per plan, so two drawers opening together share it.
  const pending = useRef<{ chatId: string; promise: Promise<RoomSession | null> } | null>(null);

  const ensure = useCallback(async (): Promise<RoomSession | null> => {
    if (session && session.yeaboi_session_id === chatId) return session;
    if (pending.current?.chatId === chatId) return pending.current.promise;

    const promise = (async () => {
      setEnsuring(true);
      setError(null);
      try {
        const found = await authFetch(linkQuery(chatId));
        if (found.ok) {
          const rows = (await found.json()) as RoomSession[];
          const linked = pickLinked(rows, chatId) as RoomSession | null;
          if (linked) {
            setSession(linked);
            return linked;
          }
        }
        const made = await authFetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(linkBody(chatId, title, description)),
        });
        if (!made.ok) {
          setError(`The room could not be opened (${made.status}).`);
          return null;
        }
        const row = (await made.json()) as RoomSession;
        setSession(row);
        return row;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The room could not be opened.');
        return null;
      } finally {
        setEnsuring(false);
        pending.current = null;
      }
    })();
    pending.current = { chatId, promise };
    return promise;
  }, [authFetch, chatId, description, session, title]);

  return {
    vendoredId: session?.id ?? null,
    session,
    setSession,
    ensure,
    ensuring,
    error,
  };
}
