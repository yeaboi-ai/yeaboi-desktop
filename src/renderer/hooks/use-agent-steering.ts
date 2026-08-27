"use client";

import { useCallback, useEffect, useRef } from "react";
import { useLiveKitDataChannel } from "./use-livekit-data-channel";

export type SteeringAction = "interrupt" | "wait" | "dig";

interface SteeringPayload {
  /** Empty for now — kept for forward compat (per-action options). */
  reason?: string;
}

/**
 * Publishes participant-initiated steering events to the LiveKit `agent_steering`
 * topic. The agent worker subscribes to this topic and reacts in real time
 * (~50ms): `interrupt` cuts speech, `wait` pauses for 15s, `dig` forces an
 * elaboration reply. Must be used inside a `<LiveKitRoom>` context.
 *
 * The returned `steer` is stable across renders (ref-backed) so consumers can
 * safely depend on it in effects without triggering re-render loops — `send`
 * from useDataChannel changes identity each render as the channel object
 * is rebuilt.
 */
export function useAgentSteering() {
  const { send } = useLiveKitDataChannel<"agent_steering">({ topic: "agent_steering" });
  const sendRef = useRef(send);
  sendRef.current = send;

  const steer = useCallback((action: SteeringAction) => {
    sendRef.current<SteeringPayload>(action, {});
  }, []);

  return { steer };
}

interface AgentSteeringBridgeProps {
  /** Called once the steer function is available. */
  onReady: (steer: ((action: SteeringAction) => void) | null) => void;
}

/**
 * Tiny bridge that exposes the steering function to components outside the
 * LiveKitRoom context (e.g. the transcript chips that live in the History
 * tab). Mount this inside `<LiveKitRoom>`; it captures the `steer` function
 * via the `onReady` callback and clears it on unmount.
 */
export function AgentSteeringBridge({ onReady }: AgentSteeringBridgeProps) {
  const { steer } = useAgentSteering();
  useEffect(() => {
    onReady(steer);
    return () => onReady(null);
  }, [steer, onReady]);
  return null;
}
