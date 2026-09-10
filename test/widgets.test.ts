// The dashboard's widget preferences: what a stored blob is allowed to say,
// and what the dashboard draws from it.

import { describe, expect, it } from 'vitest';
import {
  WIDGET_DEFAULTS,
  WIDGET_IDS,
  mergeWidgetPrefs,
  normalizeWidgetPrefs,
  visibleWidgets,
} from '../src/shared/widgets';

describe('normalizeWidgetPrefs', () => {
  it('is the defaults for anything unreadable', () => {
    expect(normalizeWidgetPrefs(undefined)).toEqual(WIDGET_DEFAULTS);
    expect(normalizeWidgetPrefs('nonsense')).toEqual(WIDGET_DEFAULTS);
    expect(normalizeWidgetPrefs({ order: 'usage' })).toEqual(WIDGET_DEFAULTS);
  });

  it('drops unknown ids and collapses duplicates', () => {
    const prefs = normalizeWidgetPrefs({ order: ['usage', 'usage', 'nope'], hidden: ['nope'] });
    expect(prefs.order[0]).toBe('usage');
    expect(prefs.order.filter((id) => id === 'usage')).toHaveLength(1);
    expect(prefs.hidden).toEqual([]);
  });

  it('keeps a widget the stored order predates, at the end', () => {
    const prefs = normalizeWidgetPrefs({ order: ['usage'] });
    expect(prefs.order[0]).toBe('usage');
    expect([...prefs.order].sort()).toEqual([...WIDGET_IDS].sort());
  });

  it('is idempotent', () => {
    const once = normalizeWidgetPrefs({ order: ['coming-up', 'usage'], hidden: ['shared'] });
    expect(normalizeWidgetPrefs(once)).toEqual(once);
  });
});

describe('visibleWidgets', () => {
  it('draws the stored order, less what is hidden', () => {
    const prefs = normalizeWidgetPrefs({ order: ['usage', 'boards'], hidden: ['boards'] });
    const drawn = visibleWidgets(prefs);
    expect(drawn[0]).toBe('usage');
    expect(drawn).not.toContain('boards');
  });

  it('draws nothing this build does not know how to draw', () => {
    expect(visibleWidgets(WIDGET_DEFAULTS, new Set(['usage']))).toEqual(['usage']);
  });

  it('turning one back on returns it to where it was', () => {
    const off = normalizeWidgetPrefs({ order: ['usage', 'boards', 'shared'], hidden: ['boards'] });
    const on = mergeWidgetPrefs(off, { hidden: [] });
    expect(visibleWidgets(on).slice(0, 3)).toEqual(['usage', 'boards', 'shared']);
  });
});
