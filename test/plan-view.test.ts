// The plan view's pure rules: seven sections in order with the missing ones
// standing in as empty, artifact cards mapped onto sections, and the turn an
// edit becomes.

import { describe, expect, it } from 'vitest';
import {
  PLAN_SECTIONS,
  SECTION_TITLES,
  acceptedCount,
  artifactSection,
  editTurn,
  sectionsOf,
} from '../src/renderer/lib/planning/plan-view';

describe('sectionsOf', () => {
  it('always yields the seven sections in order', () => {
    const sections = sectionsOf(null);
    expect(sections.map((s) => s.kind)).toEqual([...PLAN_SECTIONS]);
    expect(sections.every((s) => s.status === 'empty' && s.version === 0)).toBe(true);
    expect(sections[0]!.title).toBe(SECTION_TITLES.intake);
  });

  it('keeps what the wire says and fills the rest as empty', () => {
    const sections = sectionsOf({
      sections: [
        { kind: 'analysis', title: 'Analysis', status: 'accepted', version: 2, versions: 2 },
        { kind: 'intake', title: 'Your answers', status: 'accepted', version: 1, versions: 1 },
      ],
    });
    expect(sections.map((s) => s.status)).toEqual([
      'accepted',
      'accepted',
      'empty',
      'empty',
      'empty',
      'empty',
      'empty',
    ]);
    expect(sections[1]!.version).toBe(2);
    expect(acceptedCount(sections)).toBe(2);
  });
});

describe('artifactSection', () => {
  it('maps every card kind the chat pushes onto its section', () => {
    expect(artifactSection('intake_summary')).toBe('intake');
    expect(artifactSection('prior_art')).toBe('intake');
    expect(artifactSection('analysis')).toBe('analysis');
    expect(artifactSection('epic')).toBe('epic');
    expect(artifactSection('features')).toBe('features');
    expect(artifactSection('stories')).toBe('stories');
    expect(artifactSection('tasks')).toBe('tasks');
    expect(artifactSection('sprints')).toBe('sprints');
    expect(artifactSection('sprint_plan')).toBe('sprints');
  });

  it('is null for a card that is not a section', () => {
    expect(artifactSection('recap')).toBeNull();
    expect(artifactSection('tool_write')).toBeNull();
  });
});

describe('editTurn', () => {
  it('re-asks an intake answer by number', () => {
    expect(editTurn('intake', 'anything', 6)).toBe('edit 6');
  });

  it('refines any other section by chatting, prefixed for the gate', () => {
    expect(editTurn('features', '  split epic 2 ')).toBe('edit features: split epic 2');
    expect(editTurn('intake', 'more users')).toBe('edit intake: more users');
  });
});
