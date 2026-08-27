"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface PresenceUser {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
}

interface EditingState {
  user: PresenceUser;
  startedAt: number;
}

// Subscribes to /ws/board/{boardId} for presence + soft-lock signals on a
// specific card. Reuses the existing board WebSocket so the client only has
// one outbound connection regardless of how many panels are open.
export function useCardPresence(boardId: string | null | undefined, cardId: string | null | undefined) {
  const [viewers, setViewers] = useState<PresenceUser[]>([]);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sendRef = useRef<((event: object) => void) | null>(null);
  const cardIdRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);

  // Auto-clear stale "editing" indicators if the source user disconnects without
  // sending an explicit stop event — 30s feels right for "they probably stopped".
  useEffect(() => {
    if (!editing) return;
    const handle = setTimeout(() => setEditing(null), 30_000);
    return () => clearTimeout(handle);
  }, [editing]);

  const send = useCallback((event: object) => {
    sendRef.current?.(event);
  }, []);

  useEffect(() => {
    if (!boardId || !cardId) return;
    cancelledRef.current = false;
    cardIdRef.current = cardId;

    let ws: WebSocket | null = null;

    (async () => {
      try {
        const tokenResp = await fetch("/api/ws-token");
        if (!tokenResp.ok || cancelledRef.current) return;
        const { token } = await tokenResp.json();
        if (!token || cancelledRef.current) return;

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

        ws = new WebSocket(`${wsHost}/ws/board/${boardId}?token=${encodeURIComponent(token)}`);
        wsRef.current = ws;
        sendRef.current = (event) => {
          if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
        };

        ws.onopen = () => {
          ws?.send(JSON.stringify({ type: "presence.subscribe", payload: { card_id: cardId } }));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data) as { type: string; payload?: Record<string, unknown> };
            if (msg.type === "presence.update") {
              const payload = msg.payload as { card_id?: string; viewers?: PresenceUser[] } | undefined;
              if (payload?.card_id === cardIdRef.current) {
                setViewers(payload.viewers ?? []);
              }
              return;
            }
            if (msg.type === "card.editing.start") {
              const payload = msg.payload as
                | { card_id?: string; user?: PresenceUser }
                | undefined;
              if (payload?.card_id === cardIdRef.current && payload?.user) {
                setEditing({ user: payload.user, startedAt: Date.now() });
              }
              return;
            }
            if (msg.type === "card.editing.stop") {
              const payload = msg.payload as { card_id?: string } | undefined;
              if (payload?.card_id === cardIdRef.current) setEditing(null);
              return;
            }
          } catch {
            // ignore
          }
        };

        ws.onclose = () => {
          wsRef.current = null;
          sendRef.current = null;
        };
      } catch {
        // best-effort
      }
    })();

    return () => {
      cancelledRef.current = true;
      try {
        ws?.send(JSON.stringify({ type: "presence.unsubscribe", payload: { card_id: cardId } }));
      } catch {
        // socket already closed
      }
      ws?.close();
      wsRef.current = null;
      sendRef.current = null;
    };
  }, [boardId, cardId]);

  const beginEditing = useCallback(() => {
    if (!cardId) return;
    send({ type: "card.editing.start", payload: { card_id: cardId } });
  }, [cardId, send]);

  const endEditing = useCallback(() => {
    if (!cardId) return;
    send({ type: "card.editing.stop", payload: { card_id: cardId } });
  }, [cardId, send]);

  return { viewers, editing, beginEditing, endEditing };
}
