'use client';

// The plan's transcript, searchable, with the call's spoken turns merged in
// when there has been one; the notes the vendored backend extracted from the
// call; a link to the board. Without a call there is the typed conversation
// and one sentence saying so.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { RecapDoc, RecapToc } from '@/components/session/recap-doc';
import { TranscriptFeed } from '@/components/session/transcript-feed';
import { TranscriptSearch } from '@/components/session/transcript-search';
import type { TranscriptMedium } from '@/components/session/transcript-medium';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import type { RoomVoice } from '@/hooks/planning/use-room-voice';
import {
  NO_CALL_LINE,
  engineEntries,
  mergeTranscripts,
  voiceEntries,
  type RecapEntry,
  type VoiceMessage,
} from '@/lib/planning/recap';
import type { Bubble } from '@/lib/yeaboi/chat';

export function RecapDrawer({
  bubbles,
  planName,
  createdAt,
  voice,
}: {
  bubbles: readonly Bubble[];
  planName: string;
  createdAt: string;
  voice: RoomVoice;
}) {
  const { authFetch, ready } = useAuthFetch();
  const { vendoredId } = voice;
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [query, setQuery] = useState('');
  const [speakers, setSpeakers] = useState<Set<string>>(new Set());
  const [mediums, setMediums] = useState<Set<TranscriptMedium>>(new Set());
  const [scrollToTs, setScrollToTs] = useState<string | null>(null);

  const readMessages = useCallback(async () => {
    if (!ready || !vendoredId) return;
    try {
      const resp = await authFetch(`/api/sessions/${vendoredId}/messages`);
      if (resp.ok) setMessages((await resp.json()) as VoiceMessage[]);
    } catch {
      /* the typed transcript still draws */
    }
  }, [authFetch, ready, vendoredId]);

  useEffect(() => {
    void readMessages();
  }, [readMessages]);

  // A spoken turn the socket announces lands in the list on the next read.
  const socketCount = voice.socket.events.length;
  useEffect(() => {
    if (socketCount) void readMessages();
  }, [socketCount, readMessages]);

  const entries = useMemo<RecapEntry[]>(() => {
    const typed = engineEntries(bubbles, planName, createdAt);
    const spoken = voiceEntries(messages);
    const live = voice.agentEntries
      .filter((e) => !messages.some((m) => m.id === e.id))
      .map((e) => ({ ...e, message_type: 'voice_ai' }));
    return mergeTranscripts(typed, [...spoken, ...live]);
  }, [bubbles, createdAt, messages, planName, voice.agentEntries]);

  const toggle = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  return (
    <div className="space-y-6">
      {vendoredId ? (
        <section className="space-y-2">
          <p className="font-display text-[15px] italic text-foreground">Notes from the call</p>
          <RecapToc data={null} />
          <RecapDoc
            sessionId={vendoredId}
            chapters={[]}
            onSeekTo={setScrollToTs}
            canRegenerate
            containerClassName=""
          />
          <Link
            href={`/board?project=${encodeURIComponent(vendoredId)}`}
            className="inline-block text-[13px] text-primary hover:underline"
          >
            Open the board
          </Link>
        </section>
      ) : (
        <p className="text-[13px] text-muted-foreground">{NO_CALL_LINE}</p>
      )}

      <section className="space-y-3">
        <p className="font-display text-[15px] italic text-foreground">Transcript</p>
        <TranscriptSearch
          query={query}
          onQueryChange={setQuery}
          selectedSpeakers={speakers}
          onToggleSpeaker={(name) => setSpeakers((s) => toggle(s, name))}
          selectedMediums={mediums}
          onToggleMedium={(m) => setMediums((s) => toggle(s, m))}
          entries={entries}
        />
        <TranscriptFeed
          entries={entries}
          readOnly
          sessionId={vendoredId || undefined}
          searchQuery={query}
          filterSpeakers={speakers}
          filterMediums={mediums}
          scrollToTs={scrollToTs}
          onScrollHandled={() => setScrollToTs(null)}
        />
      </section>
    </div>
  );
}
