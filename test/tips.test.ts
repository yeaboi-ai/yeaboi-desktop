// The tip rotation — pure clock and text logic, ported with the tips.

import { describe, expect, it } from 'vitest';
import {
  FADE_FRACTION,
  MODE_ROUTES,
  TIP_ROTATE_MS,
  buildTipsText,
  cleanTipText,
  groupTips,
  resolveIndex,
  tipBrightness,
  tipRoute,
  type Tip,
} from '../src/renderer/lib/yeaboi/tips';

const tip = (over: Partial<Tip> = {}): Tip => ({
  key: 'k',
  text: 'Tip: something',
  mode_key: null,
  is_new: false,
  is_beta: false,
  ...over,
});

describe('resolveIndex', () => {
  it('advances one tip per rotation window', () => {
    expect(resolveIndex(0, 0, 5)).toBe(0);
    expect(resolveIndex(TIP_ROTATE_MS - 1, 0, 5)).toBe(0);
    expect(resolveIndex(TIP_ROTATE_MS, 0, 5)).toBe(1);
    expect(resolveIndex(TIP_ROTATE_MS * 2, 0, 5)).toBe(2);
  });

  it('wraps around the list', () => {
    expect(resolveIndex(TIP_ROTATE_MS * 5, 0, 5)).toBe(0);
    expect(resolveIndex(TIP_ROTATE_MS * 7, 0, 5)).toBe(2);
  });

  it('shifts by the browse offset without pausing rotation', () => {
    // Same instant, offset moved on by one — and time still advances the index.
    expect(resolveIndex(0, 1, 5)).toBe(1);
    expect(resolveIndex(TIP_ROTATE_MS, 1, 5)).toBe(2);
  });

  it('browses backwards past zero', () => {
    expect(resolveIndex(0, -1, 5)).toBe(4);
    expect(resolveIndex(0, -7, 5)).toBe(3);
  });

  it('never divides by an empty list', () => {
    expect(resolveIndex(TIP_ROTATE_MS, 3, 0)).toBe(0);
  });

  it('treats a negative clock as the start', () => {
    expect(resolveIndex(-5_000, 0, 5)).toBe(0);
  });
});

describe('tipBrightness', () => {
  it('fades up from nothing at the top of a window', () => {
    expect(tipBrightness(0)).toBe(0);
    expect(tipBrightness(TIP_ROTATE_MS * FADE_FRACTION * 0.5)).toBeCloseTo(0.5, 5);
  });

  it('holds at full through the middle', () => {
    expect(tipBrightness(TIP_ROTATE_MS * 0.5)).toBe(1);
    expect(tipBrightness(TIP_ROTATE_MS * (FADE_FRACTION + 0.01))).toBe(1);
  });

  it('fades back down at the end of a window', () => {
    expect(tipBrightness(TIP_ROTATE_MS * (1 - FADE_FRACTION * 0.5))).toBeCloseTo(0.5, 5);
    expect(tipBrightness(TIP_ROTATE_MS - 1)).toBeLessThan(0.01);
  });

  it('repeats every window', () => {
    expect(tipBrightness(TIP_ROTATE_MS * 3.5)).toBe(1);
    expect(tipBrightness(TIP_ROTATE_MS * 3)).toBe(0);
  });
});

describe('cleanTipText', () => {
  it('strips the leading emoji and the Tip: prefix', () => {
    expect(cleanTipText('\u{1f50d} Tip: Analysis reads your board')).toBe(
      'Analysis reads your board',
    );
  });

  it('strips a variation selector too', () => {
    expect(cleanTipText('\u{1f5fa}️ Tip: Planning starts as a chat')).toBe(
      'Planning starts as a chat',
    );
  });

  it('leaves a plain sentence alone', () => {
    expect(cleanTipText('Analysis reads your board')).toBe('Analysis reads your board');
  });

  it('keeps a tip that opens on inline code', () => {
    // Stripping a run of punctuation instead of cutting at the marker ate the
    // opening backtick here.
    expect(cleanTipText('\u{1f512} Tip: `yeaboi provenance audit` verifies the log')).toBe(
      '`yeaboi provenance audit` verifies the log',
    );
  });

  it('leaves a later "Tip: " in prose alone', () => {
    expect(cleanTipText('Rename the Tip: column')).toBe('Rename the Tip: column');
  });

  it('handles a tip with no Tip: prefix', () => {
    expect(cleanTipText('\u{1f3b5} press Ctrl+P for focus music')).toBe(
      'press Ctrl+P for focus music',
    );
  });
});

describe('groupTips', () => {
  it('sorts by mode_key, then ambience, then the rest', () => {
    const groups = groupTips([
      tip({ key: 'voice', text: 'Tip: dictate' }),
      tip({ key: 'team-analysis', mode_key: 'team-analysis' }),
      tip({ key: 'provenance' }),
      tip({ key: 'meta:theme' }),
      tip({ key: 'music' }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['modes', 'workflows', 'setup']);
    expect(groups[0]!.tips.map((t) => t.key)).toEqual(['team-analysis']);
    expect(groups[1]!.tips.map((t) => t.key)).toEqual(['provenance']);
    expect(groups[2]!.tips.map((t) => t.key)).toEqual(['voice', 'meta:theme', 'music']);
  });

  it('drops empty groups', () => {
    expect(groupTips([tip({ mode_key: 'retro' })]).map((g) => g.key)).toEqual(['modes']);
    expect(groupTips([])).toEqual([]);
  });
});

describe('buildTipsText', () => {
  it('marks BETA over NEW and names the mode it opens', () => {
    const text = buildTipsText(
      [
        tip({ text: '\u{1f50d} Tip: reads your board', mode_key: 'team-analysis', is_new: true }),
        tip({
          text: '\u{1f6a2} Tip: ships a story',
          mode_key: 'ship',
          is_beta: true,
          is_new: true,
        }),
        tip({ text: '\u{1f4a1} Tip: switch themes' }),
      ],
      { 'team-analysis': 'Analysis', ship: 'Ship' },
    );
    expect(text).toBe(
      [
        '# yeaboi — Tips',
        '',
        '- reads your board (NEW) → opens Analysis',
        '- ships a story (BETA) → opens Ship',
        '- switch themes',
        '',
      ].join('\n'),
    );
  });

  it('omits the arrow when the mode has no title', () => {
    expect(buildTipsText([tip({ text: 'Tip: x', mode_key: 'nope' })])).toContain('- x\n');
  });
});

describe('tipRoute', () => {
  it('resolves the mode keys the capabilities endpoint actually serves', () => {
    // These are _MODE_CARDS keys, not the short names — the home grid used to
    // key its table on the short ones and silently opened nothing.
    expect(tipRoute({ mode_key: 'team-analysis' })).toBe('/humans/analysis');
    expect(tipRoute({ mode_key: 'project-planning' })).toBe('/humans/planning');
    expect(tipRoute({ mode_key: 'daily-standup' })).toBe('/humans/standup');
  });

  it('is null for a tip that names no mode', () => {
    expect(tipRoute({ mode_key: null })).toBeNull();
    expect(tipRoute({ mode_key: 'not-a-mode' })).toBeNull();
  });

  it('covers every mode_key the tip list ships', () => {
    // Mirrors the keys carried by _FEATURE_TIPS; a new carded tip that lands
    // without a route here would render an Open button that goes nowhere.
    const shipped = [
      'team-analysis',
      'project-planning',
      'daily-standup',
      'retro',
      'poker',
      'performance',
      'reporting',
      'usage',
      'settings',
      'agent-usage',
      'agent-advisor',
      'agent-standup',
      'agent-security',
      'ship',
    ];
    for (const key of shipped) expect(MODE_ROUTES[key], key).toBeTruthy();
  });
});
