import { describe, expect, it } from 'vitest';
import {
  groupChecks,
  needsAttention,
  UNGROUPED,
  type Check,
  type CheckStatus,
  type Report,
} from '../src/renderer/lib/yeaboi/system-check';

function check(key: string, status: CheckStatus, category?: string): Check {
  return { key, label: key, status, detail: '', hint: '', feature: '', category };
}

const CATEGORIES = [
  { key: 'ai', title: 'AI & models', blurb: '' },
  { key: 'tools', title: 'Tools on PATH', blurb: '' },
  { key: 'machine', title: 'This machine', blurb: '' },
];

function report(checks: Check[], categories = CATEGORIES): Report {
  return { summary: '', categories, checks };
}

describe('needsAttention', () => {
  it('covers every non-ok status, including unsupported', () => {
    const checks = [
      check('a', 'ok'),
      check('b', 'missing'),
      check('c', 'unsupported'),
      check('d', 'unknown'),
    ];
    expect(needsAttention(checks).map((c) => c.key)).toEqual(['b', 'c', 'd']);
  });
});

describe('groupChecks', () => {
  it('groups in the declared order and drops empty categories', () => {
    const sections = groupChecks(
      report([check('a', 'ok', 'machine'), check('b', 'ok', 'ai'), check('c', 'ok', 'machine')]),
    );
    expect(sections.map((s) => s.category.key)).toEqual(['ai', 'machine']);
    expect(sections[1].rows.map((r) => r.key)).toEqual(['a', 'c']);
  });

  it('renders every check exactly once when the backend sends no categories', () => {
    // The older-backend path: no `categories`, and no `category` on a check.
    const checks = [check('a', 'ok'), check('b', 'missing'), check('c', 'unknown')];
    const sections = groupChecks({ summary: '', checks });
    expect(sections).toHaveLength(1);
    expect(sections[0].category).toEqual(UNGROUPED[0]);
    expect(sections[0].rows.map((r) => r.key)).toEqual(['a', 'b', 'c']);
  });

  it('keeps a check whose category the payload never declared', () => {
    const sections = groupChecks(
      report([check('a', 'ok', 'ai'), check('orphan', 'missing', 'nope')]),
    );
    const rendered = sections.flatMap((s) => s.rows.map((r) => r.key));
    expect(rendered).toContain('orphan');
    expect(rendered).toHaveLength(2);
  });

  it('counts readiness over the whole category, not the filtered rows', () => {
    const sections = groupChecks(
      report([
        check('a', 'ok', 'tools'),
        check('b', 'ok', 'tools'),
        check('c', 'missing', 'tools'),
      ]),
      true,
    );
    expect(sections).toHaveLength(1);
    expect(sections[0].rows.map((r) => r.key)).toEqual(['c']);
    expect(sections[0].ok).toBe(2);
    expect(sections[0].total).toBe(3);
  });

  it('returns nothing when the filter matches nothing', () => {
    expect(groupChecks(report([check('a', 'ok', 'ai')]), true)).toEqual([]);
  });

  it('returns nothing for an empty report', () => {
    expect(groupChecks(report([]))).toEqual([]);
    expect(groupChecks({ summary: '', checks: [] })).toEqual([]);
  });
});
