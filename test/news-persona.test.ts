// Which duck reads which headline, when the backend's name is missing.

import { describe, expect, it } from 'vitest';
import { PERSONA_IDS } from '../src/shared/personas';
import { TOPIC_PERSONA, markKind, personaFor } from '../src/renderer/lib/news/persona';
import type { NewsTopic } from '../src/renderer/lib/news/types';

describe('personaFor', () => {
  it('keeps a persona from the roster', () => {
    expect(personaFor({ id: 'x', topic: 'security', persona: 'chef' })).toBe('chef');
  });

  it('falls back to the topic when the name is missing or unknown', () => {
    expect(personaFor({ id: 'x', topic: 'security', persona: 'pirate' })).toBe('detective');
    expect(personaFor({ id: 'x', topic: 'howto', persona: null })).toBe('chef');
    expect(personaFor({ id: 'x', topic: 'models' })).toBe('wizard');
  });

  it('maps every topic but general to the roster', () => {
    for (const [topic, persona] of Object.entries(TOPIC_PERSONA)) {
      if (topic === 'general') expect(persona).toBeNull();
      else expect(PERSONA_IDS).toContain(persona);
    }
  });

  it('spreads the general ones over the whole roster, the same id the same way', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      seen.add(personaFor({ id: `story-${i}`, topic: 'general' as NewsTopic, persona: null }));
    }
    expect([...seen].sort()).toEqual([...PERSONA_IDS].sort());
    expect(personaFor({ id: 'story-7', topic: 'general' })).toBe(
      personaFor({ id: 'story-7', topic: 'general' }),
    );
  });

  it('spreads an unknown topic too', () => {
    expect(PERSONA_IDS).toContain(personaFor({ id: 'y', topic: 'weather', persona: undefined }));
  });
});

describe('markKind', () => {
  it('draws the robo in the Agents world and the duck elsewhere', () => {
    expect(markKind('agents')).toBe('robo');
    expect(markKind('team')).toBe('duck');
    expect(markKind('solo')).toBe('duck');
  });
});
