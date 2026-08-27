"use client";

import { useState } from "react";

import { useLiveKitDataChannel } from "./use-livekit-data-channel";

export interface RaisedHandInfo {
  /** LiveKit identity. */
  who: string;
  /** Sender-supplied display name. */
  name: string | null;
  /** ms since epoch — orders the queue. */
  at: number;
}

interface RaisedHandPayload {
  raised: boolean;
  name: string | null;
}

interface Result {
  /** Map of identity → raised-hand info (insertion order ≈ raise order). */
  raised: Map<string, RaisedHandInfo>;
  /** The local participant's identity. Empty string outside a LiveKitRoom. */
  me: string;
  /** Whether the local user currently has their hand up. */
  iAmRaised: boolean;
  /** Toggle the local user's hand state. */
  toggle: () => void;
  /** Lower a specific participant's hand. Used by hosts; safe no-op otherwise. */
  lower: (who: string) => void;
}

/**
 * Shared hand-raise state via the "hands" LiveKit data channel.
 *
 * Multiple consumers can call this hook (e.g. the RaiseHand button + each
 * participant tile to render a hand badge). Each call maintains its own state
 * snapshot, but they all subscribe to the same underlying broadcast, so every
 * consumer sees every raise/lower event.
 *
 * MUST be called inside a `<LiveKitRoom>` context.
 */
export function useRaisedHands(myName: string | null = null): Result {
  const [raised, setRaised] = useState<Map<string, RaisedHandInfo>>(new Map());

  const { send, me } = useLiveKitDataChannel<"hands">({
    topic: "hands",
    includeLocalEcho: true,
    onEvent: (event) => {
      if (event.type !== "hand") return;
      const p = event.payload as RaisedHandPayload;
      setRaised((prev) => {
        const next = new Map(prev);
        if (p.raised) {
          // Preserve original raise time so the queue order is stable.
          const existing = next.get(event.from);
          next.set(event.from, {
            who: event.from,
            name: p.name,
            at: existing?.at ?? event.ts,
          });
        } else {
          next.delete(event.from);
        }
        return next;
      });
    },
  });

  const iAmRaised = raised.has(me);

  const toggle = () => {
    send<RaisedHandPayload>("hand", { raised: !iAmRaised, name: myName });
  };

  // Lower someone else's hand by impersonating their identity in the
  // outgoing event. This is best-effort — non-host clients should not
  // surface this control. Backend enforcement isn't in scope yet.
  const lower = (who: string) => {
    if (who === me) {
      send<RaisedHandPayload>("hand", { raised: false, name: myName });
    } else {
      // We can't truly "lower" someone else's hand via the data channel
      // (events are scoped to the sender's identity). Optimistically remove
      // them from the local view; they'll re-appear if they re-broadcast.
      setRaised((prev) => {
        if (!prev.has(who)) return prev;
        const next = new Map(prev);
        next.delete(who);
        return next;
      });
    }
  };

  return { raised, me, iAmRaised, toggle, lower };
}
