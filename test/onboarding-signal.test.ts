// The first-run decision: only a genuinely fresh machine meets the wizard.
// The env half mirrors the TUI's own is_first_run() — ~/.yeaboi/.env missing
// or holding no key=value entries — via the same parser main feeds sidecars.

import { describe, expect, it } from 'vitest';
import { parseDotenv } from '../src/shared/dotenv';
import { needsOnboarding } from '../src/shared/onboarding';

describe('needsOnboarding', () => {
  it('gates a fresh machine', () => {
    expect(needsOnboarding({}, undefined, false)).toBe(true);
  });

  it('never re-gates once the wizard finished or was skipped', () => {
    expect(needsOnboarding({}, true, false)).toBe(false);
  });

  it('leaves an existing TUI user alone — any configured key counts', () => {
    expect(needsOnboarding({ ANTHROPIC_API_KEY: 'sk-ant-x' }, undefined, false)).toBe(false);
    expect(needsOnboarding({ LLM_PROVIDER: 'ollama' }, undefined, false)).toBe(false);
  });

  it('leaves an existing desktop user (pre-wizard identity) alone', () => {
    expect(needsOnboarding({}, undefined, true)).toBe(false);
  });

  it('an explicit false flag still gates until finish', () => {
    expect(needsOnboarding({}, false, false)).toBe(true);
  });
});

describe('parseDotenv', () => {
  it('parses the TUI subset: comments, quotes, blank lines', () => {
    const raw = [
      '# yeaboi config',
      '',
      'LLM_PROVIDER=anthropic',
      'ANTHROPIC_API_KEY="sk-ant-abc"',
      "LLM_MODEL='claude-sonnet-4-6'",
      'not a line',
      '=orphan',
      '1BAD_KEY=x',
    ].join('\n');
    expect(parseDotenv(raw)).toEqual({
      LLM_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'sk-ant-abc',
      LLM_MODEL: 'claude-sonnet-4-6',
    });
  });

  it('an empty or comment-only file parses to no keys — the TUI first-run test', () => {
    expect(parseDotenv('')).toEqual({});
    expect(parseDotenv('# nothing yet\n\n')).toEqual({});
  });
});
