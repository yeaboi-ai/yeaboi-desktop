// Which duck reads a headline. The backend names one; this is the net under
// it: a topic's duck when the name is missing or unknown, and a steady spread
// over the roster when the topic says nothing either.

import type { Audience } from '@shared/audience';
import { PERSONA_IDS, isPersonaId, type PersonaId } from '@shared/personas';
import type { NewsItem, NewsTopic } from './types';

/** The same table the backend classifies with (yeaboi.news.topics). */
export const TOPIC_PERSONA: Record<NewsTopic, PersonaId | null> = {
  security: 'detective',
  policy: 'martial',
  compute: 'astronaut',
  media: 'dj',
  models: 'wizard',
  research: 'teacher',
  tooling: 'engineer',
  howto: 'chef',
  general: null,
};

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export function personaFor(item: Pick<NewsItem, 'id' | 'topic' | 'persona'>): PersonaId {
  if (isPersonaId(item.persona)) return item.persona;
  const byTopic = TOPIC_PERSONA[item.topic as NewsTopic];
  if (byTopic) return byTopic;
  return PERSONA_IDS[hash(item.id) % PERSONA_IDS.length]!;
}

/** Which mark the paper's components draw. Every edition is a duck today. */
export type MarkKind = 'duck' | 'robo';
