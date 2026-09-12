// The recap's transcript: the engine's conversation (typed, from the plan's
// own transcript) and the room's voice turns (from the vendored session row
// the call hangs off), as one list the transcript feed can draw. Pure
// (test/recap.test.ts).

import type { Bubble } from '@/lib/yeaboi/chat';

export interface RecapEntry {
  id: string;
  speaker_name: string | null;
  text: string;
  is_final: boolean;
  created_at: string;
  /** `chat`/`ai` for typed turns, `voice_chat`/`voice_ai` for spoken ones. */
  message_type?: string;
}

/** A message row from the vendored session, as its `/messages` route returns it. */
export interface VoiceMessage {
  id: string;
  content: string;
  message_type: string;
  speaker_name?: string | null;
  created_at: string;
}

export const YOU = 'You';

/** What the reader is told when the plan has never had a call. */
export const NO_CALL_LINE =
  'No call has happened in this plan yet; this is the typed conversation.';

/** The plan's own transcript as entries. Cards and notices are not turns, so
 *  they stay out; every entry carries the plan's creation stamp, which keeps
 *  the typed conversation ahead of any later call when the two are merged. */
export function engineEntries(
  bubbles: readonly Bubble[],
  planName: string,
  at: string,
): RecapEntry[] {
  const speaker = planName.trim() || 'yeaboi';
  const rows: RecapEntry[] = [];
  bubbles.forEach((bubble, index) => {
    if (bubble.role !== 'user' && bubble.role !== 'assistant') return;
    if (!bubble.text.trim()) return;
    rows.push({
      id: `plan-${index}`,
      speaker_name: bubble.role === 'user' ? YOU : speaker,
      text: bubble.text,
      is_final: true,
      created_at: at,
      message_type: bubble.role === 'user' ? 'chat' : 'ai',
    });
  });
  return rows;
}

/** The room's voice turns. System rows are markers, not turns, except the
 *  persona switches the transcript feed uses as chapter marks. */
export function voiceEntries(messages: readonly VoiceMessage[]): RecapEntry[] {
  return messages
    .filter((m) => m.message_type !== 'system' || m.content.startsWith('Switched to '))
    .map((m) => ({
      id: m.id,
      speaker_name: m.speaker_name ?? null,
      text: m.content,
      is_final: true,
      created_at: m.created_at,
      message_type: m.message_type,
    }));
}

/** Both transcripts in time order. The sort is stable, so entries stamped
 *  alike keep the order they were given in. */
export function mergeTranscripts(
  engine: readonly RecapEntry[],
  voice: readonly RecapEntry[],
): RecapEntry[] {
  return [...engine, ...voice].sort((a, b) => a.created_at.localeCompare(b.created_at));
}
