// A mode's hub: rows newest first with the stage and the labels as a quiet
// detail, and every descriptor pointing at registered pages.

import { describe, expect, it } from 'vitest';
import { HUBS, PLANNING_HUB, hubRows } from '../src/renderer/lib/yeaboi/hubs';
import type { ChatSummary } from '../src/renderer/lib/yeaboi/chat';
import registry from '../src/renderer/lib/yeaboi/routes.json';

const REGISTERED = new Set(registry.routes.map((route) => route.path));
const NOW = new Date('2026-09-11T12:00:00');

const summary = (over: Partial<ChatSummary>): ChatSummary => ({
  session_id: 's1',
  title: 'Barber booking',
  project_name: 'Barber',
  project_label: '',
  tags: [],
  stage: 'review',
  created_at: '2026-09-10T09:00:00',
  last_modified: '2026-09-10T09:00:00',
  last_node_completed: 'project_analyzer',
  counts: { features: 0, stories: 0, tasks: 0, sprints: 0 },
  ...over,
});

describe('hubRows', () => {
  it('lists plans newest first, named, with where they stand and their labels', () => {
    const rows = hubRows(
      [
        summary({ session_id: 'old', last_modified: '2026-09-01T09:00:00' }),
        summary({ session_id: 'new', project_label: 'Atlas', tags: ['q3'], stage: 'chat' }),
      ],
      NOW,
    );
    expect(rows.map((row) => row.id)).toEqual(['new', 'old']);
    expect(rows[0]).toEqual({
      id: 'new',
      title: 'Barber booking',
      detail: 'Refine, Atlas, q3',
      when: 'yesterday',
      href: '/planning/new',
    });
    expect(rows[1]!.detail).toBe('Review');
  });

  it("names a plan the engine's way until it is renamed, and escapes the id in its link", () => {
    const [named] = hubRows([summary({ title: '' })], NOW);
    expect(named!.title).toBe('Barber');
    const [row] = hubRows([summary({ session_id: 'a b', title: '', project_name: '' })], NOW);
    expect(row!.title).toBe('Untitled plan');
    expect(row!.href).toBe('/planning/a%20b');
  });
});

describe('the descriptors', () => {
  it('point only at registered pages', () => {
    for (const hub of HUBS) {
      expect(REGISTERED, `${hub.route} is not in routes.json`).toContain(hub.route);
      expect(REGISTERED, `${hub.newRoute} is not in routes.json`).toContain(
        hub.newRoute.split('?')[0],
      );
    }
  });

  it('read as sentences, not eyebrows', () => {
    for (const hub of HUBS) {
      expect(hub.subtitle).toMatch(/\.$/);
      expect(hub.emptyLine).toMatch(/\.$/);
      expect(hub.newLabel).not.toMatch(/\b[A-Z]{2,}\b/);
      expect(hub.title).not.toMatch(/[·→]/);
    }
    expect(PLANNING_HUB.key).toBe('project-planning');
    expect(PLANNING_HUB.route).toBe('/planning');
    expect(PLANNING_HUB.newRoute).toBe('/planning/new');
  });
});
