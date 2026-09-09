// Who the duck can be: eight personas, a rotation every surface agrees on,
// and the home's pair that changes only between visits.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PERSONA,
  PERSONAS,
  PERSONA_IDS,
  PLAIN,
  ROTATE,
  ROTATE_MINUTES,
  isPersonaChoice,
  isPersonaId,
  personaAt,
  personaName,
  resolvePersona,
} from '../src/shared/personas';
import { PET_OUTFIT_RISE, petOutfit } from '../src/shared/pet-outfit';
import { currentPair, nextVisit, visitPair } from '../src/renderer/lib/home/wardrobe';
import { PERSONA_LAYERS } from '../src/renderer/lib/yeaboi/personas';

describe('the roster', () => {
  it('has eight personas, each named once, in sentence case', () => {
    expect(PERSONA_IDS).toHaveLength(8);
    expect(new Set(PERSONA_IDS).size).toBe(8);
    expect(PERSONAS.map((p) => p.id)).toEqual([...PERSONA_IDS]);
    for (const persona of PERSONAS) {
      expect(persona.id).toMatch(/^[a-z]+$/);
      expect(persona.name).toMatch(/^[A-Z][A-Za-z ]+$/);
      expect(persona.name).not.toMatch(/[·→—]/);
      expect(persona.blurb.length).toBeGreaterThan(0);
    }
    expect(personaName('martial')).toBe('Martial artist');
  });

  it('gives every persona its layers, a top one always', () => {
    for (const id of PERSONA_IDS) {
      expect(PERSONA_LAYERS[id]).toContain('top');
      for (const slot of PERSONA_LAYERS[id]) expect(['top', 'body']).toContain(slot);
    }
    expect(PERSONA_LAYERS.martial).toEqual(['body', 'top']);
  });

  it('recognises an id, rotate and plain, and nothing else', () => {
    expect(isPersonaId('chef')).toBe(true);
    expect(isPersonaId('rotate')).toBe(false);
    // plain is a choice, never a costume: nothing can be dressed in it.
    expect(isPersonaId('plain')).toBe(false);
    expect(isPersonaChoice('rotate')).toBe(true);
    expect(isPersonaChoice('plain')).toBe(true);
    expect(isPersonaChoice('chef')).toBe(true);
    expect(isPersonaChoice('pirate')).toBe(false);
    expect(isPersonaChoice(3)).toBe(false);
  });

  it('starts as the duck himself', () => {
    // A costume is something you choose, not something you arrive wearing.
    expect(DEFAULT_PERSONA).toBe(PLAIN);
  });

  it('resolves plain to no costume at all', () => {
    expect(resolvePersona(PLAIN, 0)).toBeNull();
    expect(resolvePersona('chef', 0)).toBe('chef');
    expect(resolvePersona(ROTATE, 0)).not.toBeNull();
  });
});

describe('the rotation', () => {
  const period = ROTATE_MINUTES * 60 * 1000;

  it('holds one persona for a whole period and then moves on', () => {
    expect(personaAt(0)).toBe(PERSONA_IDS[0]);
    expect(personaAt(period - 1)).toBe(PERSONA_IDS[0]);
    expect(personaAt(period)).toBe(PERSONA_IDS[1]);
  });

  it('visits every persona in turn and comes round again', () => {
    const seen = PERSONA_IDS.map((_, i) => personaAt(i * period));
    expect(seen).toEqual([...PERSONA_IDS]);
    expect(personaAt(PERSONA_IDS.length * period)).toBe(PERSONA_IDS[0]);
  });

  it('resolves a chosen persona to itself and rotate to the clock', () => {
    expect(resolvePersona('wizard', 5 * period)).toBe('wizard');
    expect(resolvePersona(ROTATE, 5 * period)).toBe(PERSONA_IDS[5]);
  });
});

describe('the pet outfit', () => {
  it('names the layer files under the pet’s own assets', () => {
    expect(petOutfit('chef')).toEqual({
      persona: 'chef',
      top: 'assets/persona-chef.png',
      body: null,
      rise: PET_OUTFIT_RISE,
    });
    expect(petOutfit('martial').body).toBe('assets/persona-martial-body.png');
  });

  it('agrees with the renderer on who has a body layer', () => {
    for (const id of PERSONA_IDS) {
      expect(petOutfit(id).body !== null).toBe(PERSONA_LAYERS[id].includes('body'));
    }
  });
});

describe('the home’s pair', () => {
  it('is two different personas on every visit', () => {
    for (let visit = 0; visit < 20; visit += 1) {
      const pair = visitPair(visit);
      expect(pair.projects).not.toBe(pair.sessions);
    }
  });

  it('shows every persona within four visits', () => {
    const seen = new Set<string>();
    for (let visit = 0; visit < 4; visit += 1) {
      const pair = visitPair(visit);
      seen.add(pair.projects);
      seen.add(pair.sessions);
    }
    expect([...seen].sort()).toEqual([...PERSONA_IDS].sort());
  });

  it('changes on a visit and holds between them', () => {
    const before = currentPair();
    const next = nextVisit();
    expect(next).not.toEqual(before);
    expect(currentPair()).toEqual(next);
    expect(currentPair()).toEqual(next);
  });
});
