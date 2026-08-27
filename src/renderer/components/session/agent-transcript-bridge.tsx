"use client";

import { useEffect } from "react";
import { useLiveKitTranscript } from "@/hooks/use-livekit-transcript";

interface TranscriptEntry {
  id: string;
  speaker_name: string | null;
  text: string;
  is_final: boolean;
  created_at: string;
}

interface Props {
  fallbackSpeakerName?: string;
  onEntries: (entries: TranscriptEntry[]) => void;
}

/**
 * Lives inside <LiveKitRoom> so useRoomContext resolves. Forwards
 * LiveKit-streamed agent transcription up to the session page state.
 */
export function AgentTranscriptBridge({ fallbackSpeakerName, onEntries }: Props) {
  const { entries } = useLiveKitTranscript(fallbackSpeakerName ?? "AI Facilitator");

  useEffect(() => {
    onEntries(entries);
  }, [entries, onEntries]);

  return null;
}
