// The facilitator's voice settings as data: plain labels, defaults filled in,
// a name for every persona and one for none.

import { describe, expect, it } from 'vitest';
import {
  ASSERTIVENESS_LEVELS,
  INVOLVEMENT_LEVELS,
  PACE_LEVELS,
  PERSONAS,
  TECHNICAL_COMFORT_LEVELS,
  VOICE_WAITING_LINE,
  personaName,
  voiceConfigOf,
} from '../src/renderer/lib/planning/voice';

describe('the dials', () => {
  it('use plain words and unique values', () => {
    for (const levels of [
      ASSERTIVENESS_LEVELS,
      INVOLVEMENT_LEVELS,
      PACE_LEVELS,
      TECHNICAL_COMFORT_LEVELS,
    ]) {
      expect(new Set(levels.map((l) => l.value)).size).toBe(levels.length);
      for (const level of levels) {
        expect(level.label).not.toMatch(/[·→]/);
        expect(level.label).not.toMatch(/\b[A-Z]{2,}\b/);
      }
    }
    expect(new Set(PERSONAS.map((p) => p.id)).size).toBe(PERSONAS.length);
    expect(VOICE_WAITING_LINE).toMatch(/\.$/);
  });
});

describe('personaName', () => {
  it('names a known persona and falls back to the facilitator', () => {
    expect(personaName('pm')).toBe('Product Manager');
    expect(personaName('nobody')).toBe('Facilitator');
    expect(personaName(undefined)).toBe('Facilitator');
  });
});

describe('voiceConfigOf', () => {
  it('fills the backend defaults for a missing or partial config', () => {
    expect(voiceConfigOf(null)).toEqual({
      persona: 'default',
      assertiveness: 'balanced',
      involvement: 'facilitator',
      pace: 'balanced',
      technical_comfort: 'comfortable',
    });
    expect(voiceConfigOf({ persona: 'mentor', pace: 'deep', muted: true })).toMatchObject({
      persona: 'mentor',
      pace: 'deep',
      assertiveness: 'balanced',
    });
  });

  it('ignores a value that is not a string', () => {
    expect(voiceConfigOf({ persona: 3, assertiveness: '' }).persona).toBe('default');
    expect(voiceConfigOf({ persona: 3, assertiveness: '' }).assertiveness).toBe('balanced');
  });
});
