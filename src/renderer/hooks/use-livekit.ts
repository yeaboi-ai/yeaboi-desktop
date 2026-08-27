"use client";

import { useState, useCallback, useRef, useEffect } from "react";

type FetchFn = (url: string, options?: RequestInit) => Promise<Response>;

export function useLiveKit(sessionId: string, fetchFn?: FetchFn) {
  const [token, setToken] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  // Participant name encoded in the token, returned by the backend. Used as
  // the canonical speaker label so browser-side Deepgram and the agent's
  // server-side STT post under the same name.
  const [participantName, setParticipantName] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchFnRef = useRef<FetchFn>(fetchFn ?? fetch);
  useEffect(() => {
    fetchFnRef.current = fetchFn ?? fetch;
  }, [fetchFn]);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const resp = await fetchFnRef.current(`/api/sessions/${sessionId}/livekit-token`, {
        method: "POST",
      });
      if (!resp.ok) {
        throw new Error(`Failed to get token: ${resp.status}`);
      }
      const data = await resp.json();
      setToken(data.token);
      setUrl(data.url);
      setParticipantName(data.participant_name ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect");
    } finally {
      setIsConnecting(false);
    }
  }, [sessionId]);

  const disconnect = useCallback(() => {
    setToken(null);
    setUrl(null);
    setParticipantName(null);
  }, []);

  return { token, url, participantName, isConnecting, error, connect, disconnect };
}
