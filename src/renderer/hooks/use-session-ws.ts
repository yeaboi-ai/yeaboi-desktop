"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WsEvent } from "@/lib/ws";
import { createSessionWs } from "@/lib/ws";

const TAG = "[ws]";

export function useSessionWs(sessionId: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<WsEvent[]>([]);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    console.info(TAG, "fetching ws-token");
    fetch("/api/ws-token")
      .then((r) => r.json())
      .then((data) => {
        if (data.token) {
          console.info(TAG, "ws-token acquired");
          setToken(data.token);
        } else {
          console.warn(TAG, "ws-token response missing token", data);
        }
      })
      .catch((err) => {
        console.error(TAG, "ws-token fetch failed", err);
      });
  }, []);

  useEffect(() => {
    if (!token || !sessionId) return;

    console.info(TAG, "connecting", { sessionId });
    const ws = createSessionWs(sessionId, token);
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
      const timeout = setTimeout(() => {
        if (wsRef.current === ws) {
          console.info(TAG, "reconnecting", { sessionId });
          const newWs = createSessionWs(sessionId, token);
          wsRef.current = newWs;
          newWs.onopen = ws.onopen;
          newWs.onclose = ws.onclose;
          newWs.onmessage = ws.onmessage;
          newWs.onerror = ws.onerror;
        }
      }, 3000);
      return () => clearTimeout(timeout);
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

    return () => {
      console.info(TAG, "disconnecting (effect cleanup)", { sessionId });
      wsRef.current = null;
      ws.close();
    };
  }, [sessionId, token]);

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
