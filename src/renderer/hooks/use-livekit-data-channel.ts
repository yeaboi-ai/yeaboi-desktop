"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDataChannel, useLocalParticipant } from "@livekit/components-react";

/**
 * Tagged JSON envelope sent over a LiveKit data channel.
 * Wave 4 features (reactions, raise-hand, intent badges) all use this shape.
 */
export interface LiveKitDataEvent<T extends string = string, P = unknown> {
  type: T;
  payload: P;
  /** Participant identity (LiveKit). Set by the sender; trusted for UI only. */
  from: string;
  /** ms since epoch — useful for ordering. */
  ts: number;
}

interface Options<T extends string> {
  /** Channel topic. Use one per feature so handlers can scope cleanly. */
  topic: T;
  /** Optional handler — runs on every message received from peers (not local echo). */
  onEvent?: (event: LiveKitDataEvent) => void;
  /** When true, locally-sent events are also delivered to `onEvent` (useful for unified UI state). */
  includeLocalEcho?: boolean;
}

/**
 * Send/receive tagged events over a LiveKit data channel.
 * Must be used inside a `<LiveKitRoom>` context.
 */
export function useLiveKitDataChannel<T extends string>({ topic, onEvent, includeLocalEcho }: Options<T>) {
  const { localParticipant } = useLocalParticipant();
  const [latest, setLatest] = useState<LiveKitDataEvent | null>(null);
  const onEventRef = useRef(onEvent);
  // Sync the ref outside of render so re-running the channel handler picks up
  // the latest closure without forcing useDataChannel to resubscribe.
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const channel = useDataChannel(topic, (msg) => {
    try {
      const text = new TextDecoder().decode(msg.payload);
      const parsed = JSON.parse(text) as LiveKitDataEvent;
      setLatest(parsed);
      onEventRef.current?.(parsed);
    } catch (err) {
      // Malformed peer payload — ignore. Logging at warn would be noisy under load.
      void err;
    }
  });

  const send = useCallback(
    <P>(type: string, payload: P) => {
      const event: LiveKitDataEvent<string, P> = {
        type,
        payload,
        from: localParticipant?.identity ?? "anon",
        ts: Date.now(),
      };
      const data = new TextEncoder().encode(JSON.stringify(event));
      channel.send(data, { topic });
      if (includeLocalEcho) {
        setLatest(event as LiveKitDataEvent);
        onEventRef.current?.(event as LiveKitDataEvent);
      }
    },
    [channel, topic, localParticipant?.identity, includeLocalEcho],
  );

  // Local participant identity for callers that need to filter out their own events.
  const me = localParticipant?.identity ?? "anon";

  return { send, latest, me };
}
