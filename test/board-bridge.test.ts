// The plan→board mapper — pure, so the bridge's rules are testable without
// either backend: sprint order → wave, epic → label, tasks → checklist,
// and the yeaboi_ref identity that makes re-import idempotent.

import { describe, expect, it } from 'vitest';
import { mapPlan } from '../src/renderer/lib/yeaboi/board-bridge';
import type { Plan } from '../src/renderer/lib/yeaboi/plan';

const PLAN: Plan = {
  session_id: 'sess-1',
  features: [{ id: 'F1', title: 'Auth' }],
  stories: [
    { id: 'S1', title: 'Login form', story_points: 3, feature_id: 'F1', description: 'A form.' },
    { id: 'S2', title: 'Password reset', story_points: 5, feature_id: 'F1' },
    { id: 'S3', title: 'Orphan story' },
  ],
  tasks: [
    { id: 'T1', title: 'Build the form', story_id: 'S1' },
    { id: 'T2', title: 'Wire the API', story_id: 'S1' },
  ],
  sprints: [
    { name: 'Sprint 1', story_ids: ['S1'] },
    { name: 'Sprint 2', story_ids: ['S2'] },
  ],
};

describe('mapPlan', () => {
  const rows = mapPlan(PLAN);

  it('orders stories by sprint, then leftovers', () => {
    expect(rows.map((row) => row.storyId)).toEqual(['S1', 'S2', 'S3']);
  });

  it('turns the sprint index into the wave', () => {
    expect(rows[0]?.task.wave).toBe(0);
    expect(rows[1]?.task.wave).toBe(1);
    expect(rows[2]?.task.wave).toBeNull(); // no sprint owns it
  });

  it('labels every card yeaboi, plus its epic', () => {
    expect(rows[0]?.task.labels).toEqual(['yeaboi', 'epic:Auth']);
    expect(rows[2]?.task.labels).toEqual(['yeaboi']); // no epic
  });

  it('folds the story tasks into a checklist under the description', () => {
    const description = rows[0]?.task.description ?? '';
    expect(description).toContain('A form.');
    expect(description).toContain('### Tasks');
    expect(description).toContain('- [ ] Build the form');
    expect(description).toContain('- [ ] Wire the API');
  });

  it('stamps the re-import identity on every card', () => {
    for (const row of rows) {
      expect(row.task.custom_fields).toEqual({
        yeaboi_session_id: 'sess-1',
        yeaboi_story_id: row.storyId,
      });
    }
  });

  it('carries points through', () => {
    expect(rows[0]?.task.story_points).toBe(3);
    expect(rows[2]?.task.story_points).toBeNull();
  });
});
