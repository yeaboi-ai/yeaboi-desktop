// The call's lifecycle, one hook: mint a room token and join, dispatch the
// voice agent, watch whether it actually arrived, keep the elapsed-time
// string ticking, and take everything down again on leave. The room itself
// (tracks, tiles, controls) lives in CallLayer — this is only the state
// around it.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveKit } from '@/hooks/use-livekit';

type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

const AGENT_POLL_MS = 5_000;

function timerString(startedAt: number | null): string {
  if (!startedAt) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export function useCallState({
  sessionId,
  authFetch,
}: {
  sessionId: string;
  authFetch: AuthFetch;
}) {
  const livekit = useLiveKit(sessionId, authFetch);
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [agentInCall, setAgentInCall] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [timer, setTimer] = useState('');
  const inCall = Boolean(livekit.token);
  const inCallRef = useRef(inCall);
  inCallRef.current = inCall;

  const dispatchAgent = useCallback(async () => {
    setAgentStatus('connecting');
    await authFetch(`/api/sessions/${sessionId}/dispatch-agent`, { method: 'POST' }).catch(
      () => undefined,
    );
  }, [authFetch, sessionId]);

  const detachAgent = useCallback(async () => {
    setAgentStatus(null);
    setAgentInCall(false);
    await authFetch(`/api/sessions/${sessionId}/detach-agent`, { method: 'POST' }).catch(
      () => undefined,
    );
  }, [authFetch, sessionId]);

  const join = useCallback(async () => {
    await livekit.connect();
    setStartedAt(Date.now());
    // The facilitator joins with you — detaching is the explicit act, not
    // joining alone.
    void dispatchAgent();
  }, [livekit, dispatchAgent]);

  const leave = useCallback(() => {
    void detachAgent();
    livekit.disconnect();
    setStartedAt(null);
    setTimer('');
  }, [detachAgent, livekit]);

  // The clock in the huddle bar.
  useEffect(() => {
    if (!inCall || !startedAt) return;
    const tick = () => setTimer(timerString(startedAt));
    tick();
    const handle = setInterval(tick, 1_000);
    return () => clearInterval(handle);
  }, [inCall, startedAt]);

  // Did the agent actually arrive? LiveKit dispatch is fire-and-forget, so
  // the backend's room check is the truth worth polling — but only in-call.
  useEffect(() => {
    if (!inCall) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await authFetch(`/api/sessions/${sessionId}/agent-status`);
        if (!response.ok || cancelled) return;
        const body = (await response.json()) as { in_room?: boolean; status?: string };
        if (cancelled) return;
        setAgentInCall(Boolean(body.in_room));
        if (body.in_room) setAgentStatus('connected');
      } catch {
        /* transient */
      }
    };
    void poll();
    const handle = setInterval(() => void poll(), AGENT_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [inCall, authFetch, sessionId]);

  return {
    inCall,
    token: livekit.token ?? '',
    url: livekit.url ?? '',
    participantName: livekit.participantName,
    isConnecting: livekit.isConnecting,
    error: livekit.error,
    join,
    leave,
    agentStatus,
    agentInCall,
    dispatchAgent,
    detachAgent,
    micMuted,
    setMicMuted,
    captionsOn,
    toggleCaptions: () => setCaptionsOn((on) => !on),
    timer,
  };
}
