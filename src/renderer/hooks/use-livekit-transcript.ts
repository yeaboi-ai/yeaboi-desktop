'use client';

import { useCallback, useEffect, useState } from 'react';
import { RoomEvent, type Participant, type TranscriptionSegment } from 'livekit-client';
import { useMaybeRoomContext } from '@livekit/components-react';

interface TranscriptEntry {
  id: string;
  speaker_name: string | null;
  text: string;
  is_final: boolean;
  created_at: string;
}

// Tavus's avatar joins as a separate "tavus-avatar-agent" participant that
// publishes the same audio + transcription as the original agent. Skipping it
// prevents the transcript from showing every line twice.
const AVATAR_MIRROR_RE = /tavus|avatar/i;

/**
 * Subscribes to LiveKit's TTS-aligned transcription stream and exposes it as
 * TranscriptEntry rows shaped like useDeepgramTranscript. Each segment.id is
 * stable across interim/final, so re-emitting an entry with the same id
 * replaces the prior interim — same UX as the user-side Deepgram stream.
 *
 * `displayDelayMs` shifts transcript rendering forward in time so it aligns
 * with the audio the user actually hears. Tavus's lip-sync renderer adds
 * ~600-1000ms of latency between when the agent generates text and when the
 * matching audio + video reach the user; without this delay the transcript
 * shows up before the avatar speaks.
 */
export function useLiveKitTranscript(
  fallbackSpeakerName: string = 'AI Facilitator',
  displayDelayMs: number = 800,
) {
  const room = useMaybeRoomContext();
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);

  useEffect(() => {
    if (!room) return;

    const pendingTimers = new Set<ReturnType<typeof setTimeout>>();

    const onSegments = (segments: TranscriptionSegment[], participant?: Participant) => {
      // Skip the local participant — their STT echoes back via the agent, but
      // the user-side Deepgram hook is the authoritative source for that text.
      if (participant?.isLocal) return;
      // Skip Tavus's avatar mirror participant — segments from it duplicate
      // the original agent's transcription one-for-one.
      if (AVATAR_MIRROR_RE.test(participant?.identity || '')) return;

      const speaker = participant?.name?.trim() || fallbackSpeakerName;

      const apply = () => {
        setEntries((prev) => {
          const map = new Map(prev.map((e) => [e.id, e]));
          for (const seg of segments) {
            const id = `lk-${seg.id}`;
            const tsSource = seg.firstReceivedTime || Date.now();
            map.set(id, {
              id,
              speaker_name: speaker,
              text: seg.text,
              is_final: seg.final,
              created_at: new Date(tsSource).toISOString(),
            });
          }
          return [...map.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
        });
      };

      if (displayDelayMs > 0) {
        const timer = setTimeout(() => {
          pendingTimers.delete(timer);
          apply();
        }, displayDelayMs);
        pendingTimers.add(timer);
      } else {
        apply();
      }
    };

    room.on(RoomEvent.TranscriptionReceived, onSegments);
    return () => {
      room.off(RoomEvent.TranscriptionReceived, onSegments);
      pendingTimers.forEach((t) => clearTimeout(t));
      pendingTimers.clear();
    };
  }, [room, fallbackSpeakerName, displayDelayMs]);

  const clear = useCallback(() => setEntries([]), []);

  return { entries, clear };
}
