// The blueprint→intake mapper — pure, so the bridge's rules are testable
// without either backend: section → question number, the team-size and
// sprint-length regexes, the repo_url → project-type derivation, and the
// project_context headings the engine's keyword extraction reads.

import { describe, expect, it } from 'vitest';
import {
  SECTION_LABELS,
  contextOf,
  mapBlueprintToIntake,
} from '../src/renderer/lib/yeaboi/blueprint-intake';

const PROJECT = { name: 'Duckboard', description: 'A kanban for ducks.', repo_url: null };

const FULL_BLUEPRINT: Record<string, string> = {
  project_overview: 'A kanban board for ducks with realtime sync.',
  goals_constraints: 'Ship an MVP this quarter.',
  users_personas: 'Scrum masters herding ducks.',
  team_capacity: '4 engineers, 2 backend and 2 frontend, on 1-week sprints.',
  architecture: 'Event-sourced core.',
  tech_stack: 'TypeScript, Postgres.',
  api_integrations: 'Slack webhooks.',
  ui_ux: 'Duck-first design.',
  security_compliance: 'SOC2 someday.',
  infrastructure: 'Fly.io.',
  risks_unknowns: 'Realtime sync is unproven.',
  out_of_scope: 'Mobile apps.',
  open_questions: 'Which CRDT library?',
};

describe('mapBlueprintToIntake', () => {
  const args = mapBlueprintToIntake(PROJECT, FULL_BLUEPRINT);

  it('maps the sections onto their question numbers', () => {
    expect(args.answers['3']).toBe('Scrum masters herding ducks.');
    expect(args.answers['4']).toBe('Ship an MVP this quarter.');
    expect(args.answers['11']).toBe('TypeScript, Postgres.');
    expect(args.answers['12']).toBe('Slack webhooks.');
    expect(args.answers['23']).toBe('Mobile apps.');
    expect(args.answers['26']).toBe('Markdown');
  });

  it('regexes team size and sprint length out of team_capacity', () => {
    expect(args.answers['6']).toBe('4');
    expect(args.answers['7']).toContain('2 backend');
    expect(args.answers['8']).toBe('1 weeks');
  });

  it('concatenates the constraint and risk sections with labels', () => {
    expect(args.answers['13']).toContain('Architecture:\nEvent-sourced core.');
    expect(args.answers['13']).toContain('Infrastructure:\nFly.io.');
    expect(args.answers['13']).toContain('Security & compliance:\nSOC2 someday.');
    expect(args.answers['21']).toContain('Realtime sync is unproven.');
    expect(args.answers['21']).toContain('Which CRDT library?');
  });

  it('derives greenfield vs existing from repo_url', () => {
    expect(args.answers['2']).toBe('Greenfield');
    expect(args.answers['15']).toBe('New build');
    expect(args.answers['17']).toBeUndefined();

    const withRepo = mapBlueprintToIntake(
      { ...PROJECT, repo_url: 'https://github.com/x/y' },
      FULL_BLUEPRINT,
    );
    expect(withRepo.answers['2']).toBe('Existing codebase');
    expect(withRepo.answers['15']).toBe('Existing codebase');
    expect(withRepo.answers['17']).toBe('https://github.com/x/y');
  });

  it('builds the description from name, description and overview', () => {
    expect(args.description).toContain('Duckboard');
    expect(args.description).toContain('A kanban for ducks.');
    expect(args.description).toContain('realtime sync');
  });

  it('omits unfilled sections instead of sending empty answers', () => {
    const sparse = mapBlueprintToIntake(PROJECT, { project_overview: 'Just this.' });
    expect(sparse.answers['3']).toBeUndefined();
    expect(sparse.answers['11']).toBeUndefined();
    expect(sparse.answers['6']).toBeUndefined();
    expect(sparse.answers['8']).toBeUndefined();
  });

  it('refuses when there is nothing to plan from', () => {
    expect(() => mapBlueprintToIntake({ name: 'X', description: '' }, {})).toThrow(
      /Project overview/,
    );
    // A project description alone is enough.
    expect(() => mapBlueprintToIntake({ name: 'X', description: 'An app.' }, {})).not.toThrow();
  });
});

describe('contextOf', () => {
  it('carries every filled section verbatim under its heading', () => {
    const context = contextOf(FULL_BLUEPRINT);
    for (const [slug, label] of Object.entries(SECTION_LABELS)) {
      expect(context).toContain(`## ${label}`);
      expect(context).toContain(FULL_BLUEPRINT[slug]!);
    }
  });

  it('skips empty sections', () => {
    const context = contextOf({ tech_stack: 'Rust.' });
    expect(context).toBe('## Tech stack\nRust.');
  });
});
