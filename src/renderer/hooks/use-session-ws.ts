"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAuth } from "@/lib/api-base";
import type { WsEvent } from "@/lib/ws";
import { createSessionWs } from "@/lib/ws";

const TAG = "[ws]";

export function useSessionWs(sessionId: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<WsEvent[]>([]);

  useEffect(() => {
    if (!sessionId) return;
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    // A token is minted fresh for every (re)connect — the web app reused the
    // mount-time token, which made reconnects after 1h die on a stale JWT.
    const connect = async () => {
      const auth = await getAuth(true);
      if (!auth || disposed) return;
      console.info(TAG, "connecting", { sessionId });
      const ws = createSessionWs(sessionId, auth.token, auth.wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.info(TAG, "open", { sessionId });
        setConnected(true);
      };
      ws.onerror = (ev) => {
        console.error(TAG, "error", ev);
      };
      ws.onclose = (ev) => {
        console.warn(TAG, "close", { code: ev.code, reason: ev.reason, sessionId });
        setConnected(false);
        if (disposed || wsRef.current !== ws) return;
        reconnectTimer = setTimeout(() => {
          if (wsRef.current === ws && !disposed) {
            console.info(TAG, "reconnecting", { sessionId });
            void connect();
          }
        }, 3000);
      };
      ws.onmessage = (event) => {
        try {
          const data: WsEvent = JSON.parse(event.data);
          const keys = data.payload ? Object.keys(data.payload) : [];
          console.debug(TAG, "recv", data.type, { payloadKeys: keys });
          setEvents((prev) => [...prev, data]);
        } catch (err) {
          console.error(TAG, "recv malformed", { raw: event.data, err });
        }
      };
    };

    void connect();

    return () => {
      console.info(TAG, "disconnecting (effect cleanup)", { sessionId });
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
    };
  }, [sessionId]);

  const send = useCallback((event: WsEvent) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      console.debug(TAG, "send", event.type, { payloadKeys: event.payload ? Object.keys(event.payload) : [] });
      ws.send(JSON.stringify(event));
    } else {
      console.warn(TAG, "send dropped — ws not open", {
        type: event.type,
        readyState: ws?.readyState,
      });
    }
  }, []);

  return { connected, events, send };
}
