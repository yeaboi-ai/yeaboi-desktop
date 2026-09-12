// The context scope's pure rules: the engine's JSON twin comes out
// unchanged, every source materialises before one is switched off, a default
// tag cannot be removed, and the summaries read as one plain line.

import { describe, expect, it } from 'vitest';
import {
  visibleTags,
  ALL_WINDOW,
  SOURCES,
  WINDOW_PRESETS,
  addTag,
  allSources,
  customTags,
  defaultScope,
  isIncognito,
  noSources,
  normalizeTag,
  previewLine,
  removeTag,
  runBody,
  scopeSummary,
  serializeScope,
  setProject,
  toggleSource,
  wantsSource,
  windowFromKey,
  windowKey,
  windowLabel,
  type ContextOptions,
  type ContextScope,
} from '../src/renderer/lib/context/scope';

const OPTIONS: ContextOptions = {
  sources: SOURCES.map((key) => ({ key, label: key, hint: '', count: 0 })),
  windows: [],
  projects: ['Atlas'],
  tags: [],
  default: null,
  defaults: { tags: ['mode:standup', 'world:team', '2026-09'] },
};

describe('defaultScope', () => {
  it('starts with every source, no window and the default tags', () => {
    const scope = defaultScope(OPTIONS);
    expect(scope.sources).toBeNull();
    expect(scope.window).toEqual(ALL_WINDOW);
    expect(scope.tags).toEqual(['mode:standup', 'world:team', '2026-09']);
    expect(scope.projects).toEqual([]);
  });

  it("starts from the mode's saved scope when there is one, default tags folded in", () => {
    const saved: ContextScope = {
      sources: ['standup'],
      window: { kind: 'sprints', count: 2 },
      projects: ['Atlas'],
      tags: ['q3'],
      limits: {},
    };
    const scope = defaultScope({ ...OPTIONS, default: saved });
    expect(scope.sources).toEqual(['standup']);
    expect(scope.tags).toEqual(['mode:standup', 'world:team', '2026-09', 'q3']);
  });

  it('copes with a sidecar that answered nothing', () => {
    expect(defaultScope(null).tags).toEqual([]);
  });
});

describe('toggleSource', () => {
  it('materialises every source before switching one off, in engine order', () => {
    const scope = toggleSource(defaultScope(OPTIONS), 'retro');
    expect(scope.sources).toEqual(SOURCES.filter((key) => key !== 'retro'));
    expect(wantsSource(scope, 'retro')).toBe(false);
    expect(wantsSource(scope, 'standup')).toBe(true);
  });

  it('switches a source back on in its place and reaches incognito by the last one', () => {
    let scope: ContextScope = { ...defaultScope(OPTIONS), sources: ['plan'] };
    scope = toggleSource(scope, 'standup');
    expect(scope.sources).toEqual(['plan', 'standup']);
    scope = toggleSource(toggleSource(scope, 'plan'), 'standup');
    expect(isIncognito(scope)).toBe(true);
    expect(isIncognito(allSources(scope))).toBe(false);
    expect(noSources(scope).sources).toEqual([]);
  });
});

describe('windows', () => {
  it('round-trips every preset through its key', () => {
    for (const preset of WINDOW_PRESETS) {
      expect(windowKey(windowFromKey(preset.key))).toBe(preset.key);
    }
  });

  it('reads the sprint count and the custom dates', () => {
    expect(windowFromKey('sprints:3')).toEqual({ kind: 'sprints', count: 3 });
    expect(windowFromKey('sprints:0')).toEqual({ kind: 'sprints', count: 1 });
    expect(windowFromKey('custom', { start: '2026-08-04', end: '' })).toEqual({
      kind: 'custom',
      start: '2026-08-04',
      end: '',
    });
    expect(windowFromKey('nonsense')).toEqual(ALL_WINDOW);
  });

  it('says the window in words', () => {
    expect(windowLabel({ kind: 'sprints', count: 2 })).toBe('last 2 sprints');
    expect(windowLabel({ kind: 'custom', start: '2026-08-04', end: '' })).toBe('4 Aug to today');
    expect(windowLabel({ kind: 'custom', start: '2026-08-04', end: '2026-09-11' })).toBe(
      '4 Aug to 11 Sep',
    );
    expect(windowLabel(ALL_WINDOW)).toBe('everything');
  });
});

describe('tags and project', () => {
  it('normalises a tag the way the engine stores it', () => {
    expect(normalizeTag('  Team A ')).toBe('team-a');
    expect(normalizeTag('a'.repeat(50))).toHaveLength(40);
    expect(normalizeTag('  ')).toBe('');
  });

  it('adds a tag once and never removes a default one', () => {
    let scope = addTag(defaultScope(OPTIONS), 'Q3 ');
    scope = addTag(scope, 'q3');
    expect(scope.tags).toEqual(['mode:standup', 'world:team', '2026-09', 'q3']);
    scope = removeTag(scope, 'mode:standup', OPTIONS.defaults.tags);
    expect(scope.tags).toContain('mode:standup');
    scope = removeTag(scope, 'q3', OPTIONS.defaults.tags);
    expect(scope.tags).not.toContain('q3');
  });

  it('holds one project label, or none', () => {
    expect(setProject(defaultScope(OPTIONS), ' Atlas ').projects).toEqual(['Atlas']);
    expect(setProject(defaultScope(OPTIONS), '').projects).toEqual([]);
  });
});

describe('serializeScope', () => {
  it("is the engine's JSON twin, with only the window keys its kind needs", () => {
    const scope: ContextScope = {
      sources: ['standup', 'retro'],
      window: { kind: 'sprints', count: 2, start: 'junk' },
      projects: ['Atlas'],
      tags: ['q3'],
      limits: { retro: 1 },
    };
    expect(serializeScope(scope)).toEqual({
      sources: ['standup', 'retro'],
      window: { kind: 'sprints', count: 2 },
      projects: ['Atlas'],
      tags: ['q3'],
      limits: { retro: 1 },
    });
    expect(serializeScope(defaultScope(null)).window).toEqual({ kind: 'all' });
  });
});

describe('the summaries', () => {
  it('says what a scope reads in one plain line', () => {
    expect(scopeSummary(defaultScope(OPTIONS))).toBe('All sources, everything, 3 tags');
    const narrowed: ContextScope = {
      sources: ['standup', 'retro'],
      window: { kind: 'sprints', count: 2 },
      projects: ['Atlas'],
      tags: ['q3'],
      limits: {},
    };
    expect(
      scopeSummary(narrowed, [
        { key: 'standup', label: 'Standups' },
        { key: 'retro', label: 'Retros' },
      ]),
    ).toBe('standups, retros, last 2 sprints, project Atlas, 1 tag');
    expect(scopeSummary(noSources(narrowed))).toBe('No other sessions, project Atlas, 1 tag');
  });

  it('says what the preview found, with the range', () => {
    expect(
      previewLine({
        window: { start: '2026-08-04', end: '2026-09-11', label: '' },
        sources: [
          { key: 'standup', count: 12 },
          { key: 'retro', count: 1 },
          { key: 'plan', count: 0 },
        ],
      }),
    ).toBe('12 standups, 1 retro, 4 Aug to 11 Sep');
    expect(previewLine({ window: { start: '', end: '', label: '' }, sources: [] })).toBe(
      'Nothing to read in this window',
    );
  });

  it('uses no separators the rest of the app forbids', () => {
    for (const text of [
      scopeSummary(defaultScope(OPTIONS)),
      previewLine({
        window: { start: '', end: '', label: '' },
        sources: [{ key: 'analysis', count: 1 }],
      }),
    ]) {
      expect(text).not.toMatch(/[·→—]/);
    }
  });
});

describe('runBody', () => {
  const scope: ContextScope = {
    sources: ['standup', 'retro'],
    window: { kind: 'sprints', count: 2 },
    projects: ['Atlas'],
    tags: ['mode:standup', 'q3'],
    limits: {},
  };

  it('carries the scope, the project label and the tags once the routes exist', () => {
    expect(runBody(scope, true, ['mode:standup'])).toEqual({
      context: {
        sources: ['standup', 'retro'],
        window: { kind: 'sprints', count: 2 },
        projects: ['Atlas'],
        // The filter is the reader's tag alone; the stamp labels the run.
        tags: ['q3'],
        limits: {},
      },
      project_label: 'Atlas',
      tags: ['mode:standup', 'q3'],
    });
  });

  it('reads everything when only the default tags are on, and still labels the run', () => {
    const untouched = defaultScope(OPTIONS);
    const body = runBody(untouched, true, OPTIONS.defaults.tags);
    expect((body['context'] as ContextScope).tags).toEqual([]);
    expect(body['tags']).toEqual(['mode:standup', 'world:team', '2026-09']);
    expect(serializeScope(untouched, OPTIONS.defaults.tags).tags).toEqual([]);
  });

  it('leaves the project label out when there is none', () => {
    const body = runBody({ ...scope, projects: [] }, true);
    expect(body).not.toHaveProperty('project_label');
    expect(body).toHaveProperty('context');
  });

  it('is empty for an older sidecar, so the run body is what it always was', () => {
    expect(runBody(scope, false)).toEqual({});
    expect(runBody(null, true)).toEqual({});
  });
});

describe('customTags', () => {
  it('is the tags the reader added on top of the defaults', () => {
    const scope = defaultScope(OPTIONS);
    expect(customTags(scope, OPTIONS.defaults.tags)).toEqual([]);
    expect(customTags(addTag(scope, 'Q3 launch'), OPTIONS.defaults.tags)).toEqual(['q3-launch']);
  });
});

describe('scopeFromWire', () => {
  it('takes a scope as the sidecar holds it, adding the default tags', async () => {
    const { scopeFromWire } = await import('../src/renderer/lib/context/scope');
    const options = { default: null, defaults: { tags: ['mode:planning'] } } as never;
    const scope = scopeFromWire(
      {
        sources: ['standup'],
        window: { kind: 'sprints', count: 2 },
        projects: ['apollo'],
        tags: ['q3'],
        limits: { retro: 1 },
      },
      options,
    );
    expect(scope).toEqual({
      sources: ['standup'],
      window: { kind: 'sprints', count: 2 },
      projects: ['apollo'],
      tags: ['mode:planning', 'q3'],
      limits: { retro: 1 },
    });
  });

  it('falls back to the default for junk, and keeps null sources as everything', async () => {
    const { scopeFromWire, defaultScope } = await import('../src/renderer/lib/context/scope');
    expect(scopeFromWire('nope', null)).toEqual(defaultScope(null));
    expect(scopeFromWire({ sources: null, window: { kind: 'never' } }, null)).toEqual({
      sources: null,
      window: { kind: 'all' },
      projects: [],
      tags: [],
      limits: {},
    });
  });
});

describe('visibleTags', () => {
  it("drops the engine's stamps and month marks, keeps what a reader typed", () => {
    expect(
      visibleTags(['mode:planning', 'world:team', '2026-09', 'size:smart', 'atlas', 'q3-launch']),
    ).toEqual(['atlas', 'q3-launch']);
  });
});
