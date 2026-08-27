'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import type { TicketAttachment } from '@/hooks/use-ticket';

interface State {
  attachments: TicketAttachment[];
  uploading: boolean;
  error: string | null;
}

export function useCardAttachments(cardId: string | null | undefined) {
  const { authFetch } = useAuthFetch();
  const [state, setState] = useState<State>({ attachments: [], uploading: false, error: null });
  const cancelledRef = useRef(false);

  const load = useCallback(async () => {
    if (!cardId) return;
    const resp = await authFetch(`/api/card-attachments-proxy/${cardId}`);
    if (!resp.ok || cancelledRef.current) return;
    const data: TicketAttachment[] = await resp.json();
    setState((s) => ({ ...s, attachments: data, error: null }));
  }, [authFetch, cardId]);

  useEffect(() => {
    cancelledRef.current = false;
    load();
    return () => {
      cancelledRef.current = true;
    };
  }, [load]);

  const upload = useCallback(
    async (files: FileList | File[]) => {
      if (!cardId) return;
      setState((s) => ({ ...s, uploading: true, error: null }));
      try {
        for (const file of Array.from(files)) {
          const fd = new FormData();
          fd.append('file', file);
          const resp = await authFetch(`/api/card-attachments-proxy/${cardId}`, {
            method: 'POST',
            body: fd,
          });
          if (!resp.ok) {
            const msg =
              (await resp.json().catch(() => null))?.error ?? `Upload failed (${resp.status})`;
            setState((s) => ({ ...s, error: String(msg) }));
            break;
          }
        }
        await load();
      } finally {
        setState((s) => ({ ...s, uploading: false }));
      }
    },
    [authFetch, cardId, load],
  );

  const remove = useCallback(
    async (attachmentId: string) => {
      if (!cardId) return;
      const resp = await authFetch(`/api/card-attachments-proxy/${cardId}/${attachmentId}`, {
        method: 'DELETE',
      });
      if (resp.ok) await load();
    },
    [authFetch, cardId, load],
  );

  return { ...state, upload, remove, refetch: load };
}
