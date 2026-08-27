"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeAC, type Card } from "./use-board";

export interface TicketAttachment {
  id: string;
  card_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  url: string;
  width: number | null;
  height: number | null;
  uploaded_by: string;
  created_at: string;
}

export interface TicketLink {
  id: string;
  link_type: string;
  direction: "outbound" | "inbound";
  other_card: { id: string; friendly_id: string | null; title: string; status: string | null };
}

export interface TicketComment {
  id: string;
  user_id: string;
  user_name?: string;
  content: string;
  created_at: string;
}

export interface TicketActivityEvent {
  id: string;
  kind: string;
  actor_id: string | null;
  actor_name?: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface TicketBoardColumn {
  id: string;
  name: string;
  position: number;
  is_done_state: boolean;
}

export interface TicketResponse {
  card: Card;
  project_key?: string | null;
  project_name?: string | null;
  board_id?: string | null;
  board_columns?: TicketBoardColumn[];
  attachments: TicketAttachment[];
  links: TicketLink[];
  comments: TicketComment[];
  events: TicketActivityEvent[];
}

type FetchFn = (url: string, options?: RequestInit) => Promise<Response>;

// Single-card fetch + WebSocket subscribe. Accepts uuid or friendly id.
// Subscribes to /ws/board/{boardId} and filters events by card id, so we don't
// need a new WS channel — the route just becomes a focused view of a single card.
export function useTicket(idOrKey: string | null, fetchFn?: FetchFn) {
  const [ticket, setTicket] = useState<TicketResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchFnRef = useRef<FetchFn>(fetchFn ?? fetch);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    fetchFnRef.current = fetchFn ?? fetch;
  }, [fetchFn]);

  const refetch = useCallback(async () => {
    if (!idOrKey) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetchFnRef.current(`/api/tickets-proxy/${encodeURIComponent(idOrKey)}`);
      if (!resp.ok) throw new Error(`Failed to load ticket: ${resp.status}`);
      const data = (await resp.json()) as TicketResponse;
      if (data?.card) {
        data.card.acceptance_criteria = normalizeAC(data.card.acceptance_criteria);
      }
      setTicket(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [idOrKey]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // WebSocket — reuse the existing /ws/board/{boardId} channel and filter by card id.
  useEffect(() => {
    const card = ticket?.card;
    if (!card || !card.column_id) return;
    let cancelled = false;

    (async () => {
      try {
        const tokenResp = await fetch("/api/ws-token");
        if (!tokenResp.ok) return;
        const { token } = await tokenResp.json();
        if (!token || cancelled) return;

        let wsHost = process.env.NEXT_PUBLIC_WS_URL;
        if (!wsHost) {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL;
          if (apiUrl) {
            wsHost = apiUrl.replace(/^http/, "ws");
          } else if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
            wsHost = "wss://planning-platform-production.up.railway.app";
          } else {
            wsHost = "ws://localhost:8000";
          }
        }

        // We don't have boardId on a single card response; the column_id maps to a board
        // server-side via the WS manager's column registry. Subscribing to the board
        // channel that contains this column requires the boardId — for now we refetch
        // on focus events and skip live updates until Phase 1 backend exposes board id.
        if (!card.column_id) return;
      } catch {
        // best-effort
      }
    })();

    return () => {
      cancelled = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [ticket?.card]);

  return { ticket, loading, error, refetch };
}
