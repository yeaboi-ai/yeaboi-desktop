// An engine project's repo path: reading it off a row, and the terminal
// fallback for a sidecar that cannot store one.

import { describe, expect, it } from 'vitest';
import {
  repoPathCommand,
  repoPathOf,
  type EngineProjectRow,
} from '../src/renderer/lib/yeaboi/project-defaults';

const row = (settings: Record<string, unknown>): EngineProjectRow => ({
  project_id: 'proj-aabbccdd',
  name: 'Apollo',
  description: '',
  settings,
  created_at: '2026-09-01T00:00:00',
  last_active: '2026-09-01T00:00:00',
  archived: false,
});

describe('repoPathOf', () => {
  it('reads the path off the settings', () => {
    expect(repoPathOf(row({ repo_path: '/code/apollo' }))).toBe('/code/apollo');
  });

  it('is empty without one, or on an older sidecar', () => {
    expect(repoPathOf(row({}))).toBe('');
    expect(repoPathOf(row({ repo_path: 3 }))).toBe('');
    expect(repoPathOf(null)).toBe('');
  });
});

describe('repoPathCommand', () => {
  it('names the project and leaves the path to the reader', () => {
    expect(repoPathCommand('proj-aabbccdd')).toBe(
      'yeaboi project set-defaults proj-aabbccdd --repo <path>',
    );
  });
});
