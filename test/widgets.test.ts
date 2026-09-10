// The dashboard's widget preferences: what a stored blob is allowed to say,
// and what the dashboard draws from it.

import { describe, expect, it } from 'vitest';
import {
  MIN_SIZE,
  WIDGET_DEFAULTS,
  WIDGET_IDS,
  WIDGET_SIZES,
  mergeWidgetPrefs,
  moveWidget,
  normalizeWidgetPrefs,
  resizeWidget,
  toggleWidget,
  visibleWidgets,
  widgetSize,
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

describe('widgetSize', () => {
  it('gives a widget its own default until someone resizes it', () => {
    expect(widgetSize(WIDGET_DEFAULTS, 'shared')).toEqual(WIDGET_SIZES['shared']);
  });

  it('clamps a stored size to what the window can show', () => {
    // The preference is kept as written — a wide widget is wide again on a
    // wide window — but a three-column widget in a one-column window is one.
    const wide = mergeWidgetPrefs(WIDGET_DEFAULTS, { sizes: { usage: { w: 3, h: 5 } } });
    expect(widgetSize(wide, 'usage', 1).w).toBe(1);
    expect(widgetSize(wide, 'usage', 3).w).toBe(3);
    expect(wide.sizes['usage']).toEqual({ w: 3, h: 5 });
  });

  it('refuses a size that would collapse the tile', () => {
    const silly = mergeWidgetPrefs(WIDGET_DEFAULTS, { sizes: { boards: { w: 0, h: -4 } } });
    expect(widgetSize(silly, 'boards')).toEqual(MIN_SIZE);
  });

  it('drops junk out of a stored sizes blob', () => {
    const prefs = normalizeWidgetPrefs({
      sizes: { boards: { w: 2, h: 4 }, nonsense: { w: 2, h: 2 }, usage: 'wide', shared: { w: 2 } },
    });
    expect(prefs.sizes).toEqual({ boards: { w: 2, h: 4 } });
  });
});

describe('moveWidget', () => {
  it('puts a widget where the drop said, counting drawn widgets', () => {
    const moved = mergeWidgetPrefs(WIDGET_DEFAULTS, moveWidget(WIDGET_DEFAULTS, 'usage', 0));
    expect(visibleWidgets(moved)[0]).toBe('usage');
  });

  it('sends it to the end when the index is past everything', () => {
    const moved = mergeWidgetPrefs(WIDGET_DEFAULTS, moveWidget(WIDGET_DEFAULTS, 'boards', 99));
    expect(visibleWidgets(moved).at(-1)).toBe('boards');
  });

  it('keeps every widget exactly once', () => {
    const moved = mergeWidgetPrefs(WIDGET_DEFAULTS, moveWidget(WIDGET_DEFAULTS, 'shared', 3));
    expect([...moved.order].sort()).toEqual([...WIDGET_IDS].sort());
  });

  it('indexes by what is drawn, not by what is stored', () => {
    // A hidden widget sitting earlier in the order must not shift the drop:
    // the index came from counting tiles on screen.
    const off = mergeWidgetPrefs(WIDGET_DEFAULTS, toggleWidget(WIDGET_DEFAULTS, 'boards', false));
    const moved = mergeWidgetPrefs(off, moveWidget(off, 'coming-up', 1));
    expect(visibleWidgets(moved)[1]).toBe('coming-up');
  });
});

describe('toggleWidget', () => {
  it('takes one off and puts it back where it was', () => {
    const order = visibleWidgets(WIDGET_DEFAULTS);
    const off = mergeWidgetPrefs(WIDGET_DEFAULTS, toggleWidget(WIDGET_DEFAULTS, 'usage', false));
    expect(visibleWidgets(off)).not.toContain('usage');
    const on = mergeWidgetPrefs(off, toggleWidget(off, 'usage', true));
    expect(visibleWidgets(on)).toEqual(order);
  });
});

describe('resizeWidget', () => {
  it("stores one widget's size without disturbing the others", () => {
    const first = mergeWidgetPrefs(
      WIDGET_DEFAULTS,
      resizeWidget(WIDGET_DEFAULTS, 'boards', { w: 2, h: 6 }),
    );
    const second = mergeWidgetPrefs(first, resizeWidget(first, 'shared', { w: 1, h: 8 }));
    expect(second.sizes).toEqual({ boards: { w: 2, h: 6 }, shared: { w: 1, h: 8 } });
  });
});
