"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface TranscriptEntry {
  id: string;
  speaker_name: string | null;
  text: string;
  is_final: boolean;
  created_at: string;
}

type FetchFn = (url: string, opts?: RequestInit) => Promise<Response>;

export function useDeepgramTranscript(
  active: boolean,
  fetchFn: FetchFn,
  speakerName: string = "You",
  muted: boolean = false,
  language: string = "en",
  keyterms: string[] = [],
) {
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mutedRef = useRef(muted);
  // Track when the user first started this utterance (first interim) so the
  // final inherits the same timestamp — prevents row reorder/jitter when the
  // agent's persisted record arrives with an earlier backend timestamp.
  const utteranceStartRef = useRef<string | null>(null);

  // Keep mutedRef in sync — used inside MediaRecorder callback
  useEffect(() => {
    mutedRef.current = muted;
    // Also disable/enable the actual audio tracks as a safety net
    const stream = streamRef.current;
    if (stream) {
      stream.getAudioTracks().forEach((t) => { t.enabled = !muted; });
    }
    console.log(`[Deepgram] Mic ${muted ? "muted" : "unmuted"}`);
  }, [muted]);

  const stop = useCallback(() => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Stabilize keyterms reference to avoid unnecessary re-renders
  const keytermsKey = keyterms.join(",");

  useEffect(() => {
    if (!active) {
      stop();
      return;
    }

    let cancelled = false;

    (async () => {
      // Get Deepgram API key from backend
      try {
        console.log("[Deepgram] Fetching token...");
        // The web app proxied this through Next; the desktop asks the
        // backend's authed route directly.
        const resp = await fetchFn("/api/sessions/deepgram-token");
        if (!resp.ok || cancelled) { console.log("[Deepgram] Token fetch failed:", resp.status); return; }
        const data = await resp.json();
        const key = data.key;
        if (!key || cancelled) { console.log("[Deepgram] No key returned"); return; }
        console.log("[Deepgram] Got token, requesting mic...");

        // Get microphone stream with noise suppression and echo cancellation
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            sampleRate: { ideal: 16000 },
          },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        console.log("[Deepgram] Mic acquired, connecting WebSocket...");

        // Connect to Deepgram WebSocket
        const params = new URLSearchParams({
          model: "nova-3",
          language,
          punctuate: "true",
          smart_format: "true",
          filler_words: "true",
          interim_results: "true",
          utterance_end_ms: "1500",
          endpointing: "500",
        });
        // Add vocabulary keyterms for Nova-3 (improves name/term recognition)
        for (const term of keyterms) {
          params.append("keyterm", term);
        }
        const wsUrl = `wss://api.deepgram.com/v1/listen?${params}`;
        console.log("[Deepgram] Connecting to:", wsUrl.replace(key, "***"));
        const ws = new WebSocket(wsUrl, ["token", key]);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log("[Deepgram] Connected, starting audio capture");
          if (cancelled) { ws.close(); return; }

          // Use MediaRecorder to send audio chunks
          const recorder = new MediaRecorder(stream, {
            mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
              ? "audio/webm;codecs=opus"
              : "audio/webm",
          });
          mediaRecorderRef.current = recorder;

          recorder.ondataavailable = (e) => {
            if (e.data.size > 0 && ws.readyState === WebSocket.OPEN && !mutedRef.current) {
              ws.send(e.data);
            }
          };

          recorder.start(250); // Send audio every 250ms
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "Results") {
              const alt = data.channel?.alternatives?.[0];
              if (!alt || !alt.transcript) return;

              const text = alt.transcript.trim();
              if (!text) return;

              const isFinal = data.is_final;
              const timestamp = new Date().toISOString();

              if (isFinal) {
                const entryId = `dg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                const utteranceStart = utteranceStartRef.current ?? timestamp;
                utteranceStartRef.current = null;
                setEntries((prev) => [
                  ...prev.filter((e) => e.is_final),
                  {
                    id: entryId,
                    speaker_name: speakerName,
                    text,
                    is_final: true,
                    created_at: utteranceStart,
                  },
                ]);
                // The web app also best-effort-saved each final browser-side
                // through a Next proxy holding the internal secret. The
                // desktop renderer must not hold that secret, and the LiveKit
                // agent persists the transcript server-side anyway — so the
                // browser-side save is deliberately dropped here.
              } else {
                // Capture the start time on the first interim of this utterance
                // so the eventual final entry can inherit it.
                if (!utteranceStartRef.current) utteranceStartRef.current = timestamp;
                // Interim — replace the last non-final entry
                setEntries((prev) => {
                  // Skip an interim that exactly echoes the most-recent final
                  // for this speaker. Deepgram occasionally emits a tail-audio
                  // interim right after the utterance final, and rendering
                  // both side-by-side looks like a duplicate row.
                  const lastFinal = [...prev].reverse().find(
                    (e) => e.is_final && e.speaker_name === speakerName,
                  );
                  if (lastFinal) {
                    const a = lastFinal.text.toLowerCase().trim();
                    const b = text.toLowerCase().trim();
                    if (a === b) return prev;
                  }
                  return [
                    ...prev.filter((e) => e.is_final),
                    {
                      id: "dg-interim",
                      speaker_name: speakerName,
                      text,
                      is_final: false,
                      created_at: utteranceStartRef.current ?? timestamp,
                    },
                  ];
                });
              }
            }
          } catch {
            // Ignore parse errors
          }
        };

        ws.onerror = () => {
          // Browser WebSocket error events carry no useful info — details come from onclose
          console.warn("[Deepgram] WebSocket error (see onclose for details)");
        };

        ws.onclose = (ev) => {
          if (ev.code !== 1000) {
            console.warn(`[Deepgram] WebSocket closed: code=${ev.code} reason=${ev.reason || "none"}`);
          }
          mediaRecorderRef.current?.stop();
          mediaRecorderRef.current = null;
        };
      } catch (err) {
        console.warn("[Deepgram] Setup failed:", err);
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, language]);

  const clear = useCallback(() => setEntries([]), []);

  return { entries, clear };
}
