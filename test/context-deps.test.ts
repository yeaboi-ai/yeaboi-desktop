// Context-source toggles — the pure value model behind the panel: null =
// inherit, [] = incognito, else the enabled subset; plus the string grammar
// standup_config_set speaks.

import { describe, expect, it } from 'vitest';

import {
  CONTEXT_SOURCES,
  serializeContextSpec,
  toggleContextSource,
} from '../src/renderer/lib/yeaboi/context-deps';

const ALL = CONTEXT_SOURCES.map((s) => s.token);

describe('serializeContextSpec', () => {
  it('speaks inherit, none and csv', () => {
    expect(serializeContextSpec(null)).toBe('inherit');
    expect(serializeContextSpec([])).toBe('none');
    expect(serializeContextSpec(['retro', 'plan'])).toBe('retro,plan');
  });
});

describe('toggleContextSource', () => {
  it('materialises inherit to the full set before switching one off', () => {
    expect(toggleContextSource(null, 'retro')).toEqual(ALL.filter((t) => t !== 'retro'));
  });

  it('switches a source back on in canonical order', () => {
    expect(toggleContextSource(['plan', 'retro'], 'standup')).toEqual(['retro', 'standup', 'plan']);
  });

  it('a lone source toggled off reaches incognito', () => {
    expect(toggleContextSource(['analysis'], 'analysis')).toEqual([]);
  });
});
