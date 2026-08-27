"use client";

import { useCallback, useRef, useState } from "react";
import { useLiveKitDataChannel } from "./use-livekit-data-channel";

export interface DrawPoint {
  /** Normalized 0..1 horizontal position on the shared-screen surface. */
  x: number;
  /** Normalized 0..1 vertical position on the shared-screen surface. */
  y: number;
}

export interface DrawStroke {
  points: DrawPoint[];
  /** ms-since-epoch the stroke was completed — drives the fade. */
  ts: number;
  /** Local id so the canvas can key/animate strokes. */
  id: number;
}

/** Strokes older than this (ms) are dropped — Slack-style ephemeral ink. */
export const STROKE_TTL_MS = 4000;

/** Drop strokes older than the TTL. */
function pruneStrokes(list: DrawStroke[], now: number): DrawStroke[] {
  return list.filter((s) => now - s.ts < STROKE_TTL_MS);
}

/**
 * Broadcast and receive pen strokes drawn on a shared-screen tile over the
 * LiveKit `screen_draw` topic. Local strokes are added optimistically and sent
 * to peers; remote strokes are merged in. The agent worker also subscribes,
 * compositing recent strokes onto the screenshot it sends to Claude.
 *
 * Strokes self-expire after STROKE_TTL_MS. Must be used inside a `<LiveKitRoom>`.
 */
export function useScreenDraw() {
  const [strokes, setStrokes] = useState<DrawStroke[]>([]);
  const idRef = useRef(0);

  const addLocalStroke = useCallback((points: DrawPoint[]) => {
    const now = Date.now();
    idRef.current += 1;
    const stroke: DrawStroke = { points, ts: now, id: idRef.current };
    setStrokes((prev) => pruneStrokes([...prev, stroke], now));
  }, []);

  const { send } = useLiveKitDataChannel<"screen_draw">({
    topic: "screen_draw",
    onEvent: (event) => {
      const payload = event.payload as { points?: DrawPoint[] } | undefined;
      const points = payload?.points;
      if (!Array.isArray(points) || points.length === 0) return;
      addLocalStroke(points);
    },
  });

  /** Add a locally-drawn stroke: render it immediately and broadcast it. */
  const addStroke = useCallback(
    (points: DrawPoint[]) => {
      if (points.length === 0) return;
      addLocalStroke(points);
      try {
        send<{ points: DrawPoint[] }>("screen_draw", { points });
      } catch (err) {
        // The room may be reconnecting/disconnected — the stroke still renders
        // locally; peers/agent just miss this one. Don't throw out of the
        // pointer-event handler.
        console.warn("[screen-draw] send failed:", err);
      }
    },
    [send, addLocalStroke],
  );

  /** Drop expired strokes — call from the canvas animation loop. */
  const pruneExpired = useCallback(() => {
    const now = Date.now();
    setStrokes((prev) => {
      const next = pruneStrokes(prev, now);
      return next.length === prev.length ? prev : next;
    });
  }, []);

  return { strokes, addStroke, pruneExpired };
}
