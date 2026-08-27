"use client";

/**
 * OpenAI Realtime API voice hook.
 *
 * Protocol: JSON events over WebSocket
 * Audio: PCM16 at 24kHz, base64-encoded
 * Server VAD handles turn detection automatically.
 *
 * Backend provides an ephemeral token so the API key never hits the browser.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { logger } from "@/lib/logger";

type FetchFn = (url: string, options?: RequestInit) => Promise<Response>;

interface UseRealtimeVoiceOptions {
  sessionId: string;
  fetchFn?: FetchFn;
  onText?: (text: string) => void;
  onTranscript?: (text: string, role: "user" | "assistant") => void;
  onStatusChange?: (status: RealtimeVoiceStatus) => void;
  autoPreload?: boolean;
  muted?: boolean;
}

export type RealtimeVoiceStatus =
  | "idle"
  | "preloading"
  | "ready"
  | "connecting"
  | "connected"
  | "error";

const SAMPLE_RATE = 24000;

export function useRealtimeVoice({
  sessionId,
  fetchFn,
  onText,
  onTranscript,
  onStatusChange,
  autoPreload = true,
  muted = false,
}: UseRealtimeVoiceOptions) {
  const [status, setStatus] = useState<RealtimeVoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const speakingTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fetchRef = useRef<FetchFn>(fetchFn ?? fetch);
  const onTextRef = useRef(onText);
  const onTranscriptRef = useRef(onTranscript);
  const configRef = useRef<{ ws_url: string; token: string; instructions: string; voice: string } | null>(null);
  const preloadedRef = useRef(false);

  useEffect(() => { fetchRef.current = fetchFn ?? fetch; }, [fetchFn]);
  useEffect(() => { onTextRef.current = onText; }, [onText]);
  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);

  // Mute/unmute: disable mic stream tracks so no audio reaches OpenAI
  useEffect(() => {
    const stream = streamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => { t.enabled = !muted; });
  }, [muted]);

  const updateStatus = useCallback((s: RealtimeVoiceStatus) => {
    setStatus(s);
    onStatusChange?.(s);
  }, [onStatusChange]);

  // ── Preload: get ephemeral token from backend ──

  const preload = useCallback(async () => {
    if (preloadedRef.current) return;
    preloadedRef.current = true;
    updateStatus("preloading");
    try {
      // Just check if the endpoint exists (don't cache token — it expires in 60s)
      const resp = await fetchRef.current(`/api/sessions/${sessionId}/realtime-config`);
      if (resp.ok) {
        updateStatus("ready");
        logger.debug("[RealtimeVoice] Preloaded — ready");
      } else {
        updateStatus("idle");
      }
    } catch {
      updateStatus("idle");
    }
  }, [sessionId, updateStatus]);

  useEffect(() => {
    if (autoPreload && sessionId) {
      const timer = setTimeout(() => preload(), 500);
      return () => clearTimeout(timer);
    }
  }, [autoPreload, sessionId, preload]);

  // ── Playback worklet ──

  const WORKLET_CODE = `
class RealtimePlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
    this.readOffset = 0;
    this.port.onmessage = (e) => {
      if (e.data && e.data.samples) {
        this.buffer.push(e.data.samples);
      }
    };
  }
  process(inputs, outputs) {
    const out = outputs[0][0];
    let written = 0;
    while (written < out.length && this.buffer.length > 0) {
      const frame = this.buffer[0];
      const avail = frame.length - this.readOffset;
      const need = out.length - written;
      const n = Math.min(avail, need);
      for (let i = 0; i < n; i++) {
        out[written + i] = frame[this.readOffset + i];
      }
      written += n;
      this.readOffset += n;
      if (this.readOffset >= frame.length) {
        this.buffer.shift();
        this.readOffset = 0;
      }
    }
    for (let i = written; i < out.length; i++) out[i] = 0;
    return true;
  }
}
registerProcessor('realtime-playback', RealtimePlaybackProcessor);
`;

  // ── Cleanup ──

  const cleanup = useCallback(() => {
    if (processorRef.current) { processorRef.current.disconnect(); processorRef.current = null; }
    if (sourceRef.current) { sourceRef.current.disconnect(); sourceRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (workletNodeRef.current) { workletNodeRef.current.disconnect(); workletNodeRef.current = null; }
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null; }
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    clearTimeout(speakingTimeoutRef.current);
    setIsSpeaking(false);
  }, []);

  // ── Connect ──

  const connect = useCallback(async () => {
    if (wsRef.current) return;
    updateStatus("connecting");
    setError(null);

    try {
      // Always fetch fresh config — ephemeral token expires in 60s
      const resp = await fetchRef.current(`/api/sessions/${sessionId}/realtime-config`);
      if (!resp.ok) throw new Error("Realtime voice not available");
      const config = await resp.json();
      configRef.current = config;

      // Get mic
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: SAMPLE_RATE, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      // AudioContext at 24kHz for playback
      const audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
      audioCtxRef.current = audioCtx;
      await audioCtx.resume();

      // Register playback worklet
      const blob = new Blob([WORKLET_CODE], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      await audioCtx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);

      const workletNode = new AudioWorkletNode(audioCtx, "realtime-playback");
      workletNode.connect(audioCtx.destination);
      workletNodeRef.current = workletNode;

      // Open WebSocket to OpenAI Realtime API
      const ws = new WebSocket(config!.ws_url, [
        "realtime",
        `openai-insecure-api-key.${config!.token}`,
        "openai-beta.realtime-v1",
      ]);
      wsRef.current = ws;

      ws.onopen = () => {
        logger.debug("[RealtimeVoice] WebSocket connected");

        // Configure session — voice/model set during token creation
        ws.send(JSON.stringify({
          type: "session.update",
          session: {
            type: "realtime",
            output_modalities: ["audio"],
            audio: {
              input: {
                format: "pcm16",
                transcription: { model: "gpt-4o-mini-transcribe" },
                turn_detection: { type: "server_vad" },
              },
              output: {
                format: "pcm16",
              },
            },
          },
        }));

        // Start capturing and sending mic audio
        startMicCapture(stream, audioCtx, ws);
        updateStatus("connected");
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleServerEvent(msg, workletNode);
        } catch {
          // ignore non-JSON
        }
      };

      ws.onerror = () => { setError("Connection error"); updateStatus("error"); };
      ws.onclose = () => { cleanup(); updateStatus("idle"); };

    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
      updateStatus("error");
      cleanup();
    }
  }, [sessionId, updateStatus, cleanup]);

  // ── Mic capture: PCM16 → base64 → input_audio_buffer.append ──

  const startMicCapture = useCallback((stream: MediaStream, audioCtx: AudioContext, ws: WebSocket) => {
    const source = audioCtx.createMediaStreamSource(stream);
    sourceRef.current = source;

    // ScriptProcessor for raw PCM access (AudioWorklet would be better but this is simpler)
    const processor = audioCtx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const input = e.inputBuffer.getChannelData(0);

      // Convert float32 [-1,1] → int16 PCM
      const pcm16 = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      // Base64 encode
      const bytes = new Uint8Array(pcm16.buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      ws.send(JSON.stringify({
        type: "input_audio_buffer.append",
        audio: base64,
      }));
    };

    source.connect(processor);
    processor.connect(audioCtx.destination); // Required for ScriptProcessor to fire
  }, []);

  // ── Handle server events ──

  const handleServerEvent = useCallback((msg: any, workletNode: AudioWorkletNode) => {
    switch (msg.type) {
      case "response.audio.delta": {
        // Decode base64 PCM16 → Float32 → worklet
        const bytes = atob(msg.delta);
        const pcm16 = new Int16Array(bytes.length / 2);
        for (let i = 0; i < pcm16.length; i++) {
          pcm16[i] = bytes.charCodeAt(i * 2) | (bytes.charCodeAt(i * 2 + 1) << 8);
        }
        const float32 = new Float32Array(pcm16.length);
        for (let i = 0; i < pcm16.length; i++) {
          float32[i] = pcm16[i] / 32768;
        }
        workletNode.port.postMessage({ samples: float32 });
        // Track AI speaking state based on audio activity
        setIsSpeaking(true);
        clearTimeout(speakingTimeoutRef.current);
        speakingTimeoutRef.current = setTimeout(() => setIsSpeaking(false), 300);
        break;
      }

      case "response.audio_transcript.delta": {
        // AI speaking text (streaming)
        onTextRef.current?.(msg.delta);
        break;
      }

      case "response.audio_transcript.done": {
        // Complete AI transcript
        if (msg.transcript) {
          onTranscriptRef.current?.(msg.transcript, "assistant");
        }
        break;
      }

      case "conversation.item.input_audio_transcription.completed": {
        // User speech transcript
        if (msg.transcript) {
          onTranscriptRef.current?.(msg.transcript, "user");
        }
        break;
      }

      case "error": {
        logger.error("[RealtimeVoice] Server error:", JSON.stringify(msg.error, null, 2));
        setError(msg.error?.message || "Server error");
        break;
      }

      case "session.created":
      case "session.updated":
        logger.debug("[RealtimeVoice]", msg.type);
        break;

      case "input_audio_buffer.speech_started":
        logger.debug("[RealtimeVoice] Speech detected");
        break;

      case "input_audio_buffer.speech_stopped":
        logger.debug("[RealtimeVoice] Speech ended");
        break;

      default:
        break;
    }
  }, []);

  const disconnect = useCallback(() => { cleanup(); updateStatus("idle"); }, [cleanup, updateStatus]);
  useEffect(() => { return () => cleanup(); }, [cleanup]);

  return {
    status, error, preload, connect, disconnect,
    isConnected: status === "connected",
    isAvailable: configRef.current !== null,
    isSpeaking,
  };
}
