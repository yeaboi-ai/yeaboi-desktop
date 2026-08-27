"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthFetch } from "@/hooks/use-auth-fetch";
import type { TicketLink } from "@/hooks/use-ticket";

export interface CardSearchHit {
  id: string;
  friendly_id: string | null;
  title: string;
  column_id: string;
  project_id: string | null;
}

export function useCardLinks(cardId: string | null | undefined) {
  const { authFetch } = useAuthFetch();
  const [links, setLinks] = useState<TicketLink[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cancelledRef = useRef(false);

  const load = useCallback(async () => {
    if (!cardId) return;
    const resp = await authFetch(`/api/card-links-proxy/${cardId}`);
    if (!resp.ok || cancelledRef.current) return;
    const data: TicketLink[] = await resp.json();
    setLinks(data);
  }, [authFetch, cardId]);

  useEffect(() => {
    cancelledRef.current = false;
    load();
    return () => {
      cancelledRef.current = true;
    };
  }, [load]);

  const create = useCallback(
    async (target: string, link_type: string) => {
      if (!cardId) return false;
      setBusy(true);
      setError(null);
      try {
        const resp = await authFetch(`/api/card-links-proxy/${cardId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target, link_type }),
        });
        if (!resp.ok) {
          const msg = (await resp.json().catch(() => null))?.error ?? `Failed (${resp.status})`;
          setError(String(msg));
          return false;
        }
        await load();
        return true;
      } finally {
        setBusy(false);
      }
    },
    [authFetch, cardId, load],
  );

  const remove = useCallback(
    async (linkId: string) => {
      if (!cardId) return;
      const resp = await authFetch(`/api/card-links-proxy/${cardId}/${linkId}`, {
        method: "DELETE",
      });
      if (resp.ok) await load();
    },
    [authFetch, cardId, load],
  );

  return { links, error, busy, create, remove, refetch: load };
}

// Lightweight search hook for the typeahead — debounced inside the picker.
export function useCardSearch() {
  const { authFetch } = useAuthFetch();

  const search = useCallback(
    async (q: string, projectId?: string | null): Promise<CardSearchHit[]> => {
      const trimmed = q.trim();
      if (!trimmed) return [];
      const params = new URLSearchParams({ q: trimmed });
      if (projectId) params.set("project_id", projectId);
      const resp = await authFetch(`/api/cards-search-proxy?${params.toString()}`);
      if (!resp.ok) return [];
      return (await resp.json()) as CardSearchHit[];
    },
    [authFetch],
  );

  return { search };
}
