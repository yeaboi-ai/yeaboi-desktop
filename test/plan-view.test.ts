// The plan view's pure rules: seven sections in order with the missing ones
// standing in as empty, artifact cards mapped onto sections, and the turn an
// edit becomes.

import { describe, expect, it } from 'vitest';
import type { PlanView } from '../src/renderer/lib/planning/plan-view';
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

describe('sectionItems', () => {
  const view: PlanView = {
    session_id: 's',
    stage: 'review',
    intake_mode: 'smart',
    sections: [],
    intake: {
      completed: true,
      confirmed: true,
      prior_art_pending: false,
      prior_art: [],
      phases: [
        {
          key: 'context',
          label: 'Project context',
          questions: [
            { number: 1, label: 'Project', answer: 'A pond', source: 'answered', skipped: false },
            { number: 2, label: 'Users', answer: '', source: 'skipped', skipped: true },
          ],
        },
      ],
    },
    analysis: { name: 'Pond', description: 'Ducks live here', goals: ['Swim'], risks: [] },
    epic: {
      reviewed: true,
      calibration_profile_id: '',
      name: 'Pond',
      description: 'Ducks live here',
      goals: ['Swim'],
    },
    features: [{ id: 'f1', title: 'Feed', description: 'Corn', priority: 'high' }],
    stories: [{ id: 's1', title: 'Throw corn', story_points: 3 }],
    tasks: [{ id: 't1', title: 'Buy corn' }],
    sprints: [
      { id: 'sp1', name: 'Sprint 1', goal: 'Feed them', capacity_points: 10, story_ids: ['s1'] },
    ],
  };

  it('draws each section as lines with a quiet note', async () => {
    const { sectionItems, sectionText } = await import('../src/renderer/lib/planning/plan-view');
    expect(sectionItems(view, 'intake')).toEqual([
      { id: 'q:1', text: 'Project: A pond', note: 'Project context', source: 'answered' },
      { id: 'q:2', text: 'Users: skipped', note: 'Project context', source: 'skipped' },
    ]);
    expect(sectionItems(view, 'analysis').map((i) => i.text)).toEqual(['Ducks live here', 'Swim']);
    expect(sectionItems(view, 'epic')).toEqual([
      { id: 'epic', text: 'Pond', note: 'Ducks live here' },
      { id: 'epic:goal:0', text: 'Swim', note: 'Goal' },
    ]);
    expect(sectionItems(view, 'features')[0]).toEqual({
      id: 'f1',
      text: 'Feed',
      note: 'high, Corn',
    });
    expect(sectionItems(view, 'stories')[0]!.note).toBe('3 points');
    expect(sectionItems(view, 'tasks')[0]!.text).toBe('Buy corn');
    expect(sectionItems(view, 'sprints')[0]!.note).toBe('Feed them, 1 stories');
    expect(sectionText(view, 'stories')).toBe('Throw corn (3 points)');
  });

  it('is empty for a missing view or section', async () => {
    const { sectionItems } = await import('../src/renderer/lib/planning/plan-view');
    expect(sectionItems(null, 'stories')).toEqual([]);
    expect(sectionItems({ ...view, tasks: undefined }, 'tasks')).toEqual([]);
  });
});
