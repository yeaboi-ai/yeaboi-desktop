// The security page's pure decisions: grouping by verdict, tones, the row copy.

import { describe, expect, it } from 'vitest';
import type { SecurityFindingRow, SecurityIssue } from '../src/renderer/lib/yeaboi/ops';
import {
  asVerdict,
  findingLine,
  findingsOf,
  groupIssues,
  issuesOf,
  issueMeta,
  postureCells,
  primaryFix,
  shortDate,
  verdictCounts,
  verdictTone,
} from '../src/renderer/lib/yeaboi/security-view';

const issue = (over: Partial<SecurityIssue> = {}): SecurityIssue => ({
  id: 'risky_tool:curl-pipe-shell',
  category: 'risky_tool',
  pattern: 'curl-pipe-shell',
  title: 'An agent piped a download into a shell',
  why: 'why',
  verdict: 'needs-decision',
  severity: 'high',
  signals: 17,
  sessions: 3,
  files: 3,
  last_seen: '2026-08-23',
  finding_keys: ['k1', 'k2'],
  fixes: [
    {
      id: 'guard-hook',
      kind: 'write',
      label: 'Block this in Claude Code',
      target: '',
      detail: '',
      scope: 'user',
    },
    { id: 'dismiss', kind: 'dismiss', label: 'Dismiss', target: '', detail: '', scope: '' },
  ],
  ...over,
});

describe('verdictTone', () => {
  it('draws a decision as a warning, never destructive', () => {
    expect(verdictTone('needs-decision')).toBe('warn');
    expect(verdictTone('unsure')).toBe('idle');
    expect(verdictTone('test-data')).toBe('idle');
    expect(verdictTone('handled')).toBe('good');
  });

  it('reserves destructive for a bypass-by-default setting', () => {
    expect(verdictTone('needs-decision', 'permission-bypass-default')).toBe('bad');
  });
});

describe('grouping', () => {
  const report = {
    issues: [
      issue(),
      issue({ id: 'b', verdict: 'test-data' }),
      issue({ id: 'c', verdict: 'bogus' }),
    ],
    verdict_counts: [
      ['needs-decision', 1],
      ['test-data', 1],
      ['info', 2],
    ],
  };

  it('groups by verdict and reads an unknown word as unsure', () => {
    const groups = groupIssues(report);
    expect(groups['needs-decision'].map((i) => i.id)).toEqual(['risky_tool:curl-pipe-shell']);
    expect(groups['test-data'].map((i) => i.id)).toEqual(['b']);
    expect(groups.unsure.map((i) => i.id)).toEqual(['c']);
    expect(asVerdict('handled')).toBe('handled');
  });

  it('counts what the report counted and fills the rest with zero', () => {
    expect(verdictCounts(report)).toEqual({
      'needs-decision': 1,
      unsure: 0,
      'test-data': 1,
      handled: 0,
      info: 2,
    });
  });

  it('draws one strip cell per issue in verdict order, info excluded', () => {
    expect(postureCells(report).map((c) => [c.key, c.tone])).toEqual([
      ['risky_tool:curl-pipe-shell', 'warn'],
      ['c', 'idle'],
      ['b', 'idle'],
    ]);
  });

  it('tolerates a report from an older sidecar with no issues', () => {
    expect(groupIssues({ findings: [] })['needs-decision']).toEqual([]);
    expect(postureCells({})).toEqual([]);
    expect(verdictCounts({})).toEqual({
      'needs-decision': 0,
      unsure: 0,
      'test-data': 0,
      handled: 0,
      info: 0,
    });
  });

  it('fills in what a mid-vintage sidecar leaves out', () => {
    const [only] = issuesOf({ issues: [{ id: 'x', verdict: 'unsure' }] });
    expect(only?.finding_keys).toEqual([]);
    expect(only?.fixes).toEqual([]);
    const [row] = findingsOf({ findings: [{ key: 'k' }] });
    expect(row?.session_id).toBe('');
    expect(findingLine(row!)).toBe('');
  });
});

describe('row copy', () => {
  it('says where an issue fired and when', () => {
    expect(issueMeta(issue())).toBe('3 sessions · 17 signals · last Aug 23 · high');
    expect(issueMeta(issue({ sessions: 1, signals: 1, last_seen: '' }))).toBe('1 session · high');
    expect(issueMeta(issue({ category: 'settings', signals: 1 }))).toBe(
      'settings · last Aug 23 · high',
    );
  });

  it('formats dates short and passes anything else through', () => {
    expect(shortDate('2026-08-23T10:00:00Z')).toBe('Aug 23');
    expect(shortDate('yesterday')).toBe('yesterday');
  });

  it('picks the first fix that is not a dismissal as the button', () => {
    expect(primaryFix(issue())?.id).toBe('guard-hook');
    const only = issue({
      fixes: [
        { id: 'dismiss', kind: 'dismiss', label: 'Dismiss', target: '', detail: '', scope: '' },
      ],
    });
    expect(primaryFix(only)?.id).toBe('dismiss');
    expect(primaryFix(issue({ fixes: [] }))).toBeUndefined();
  });

  it('describes a finding by repo, session, date and lines', () => {
    const row: SecurityFindingRow = {
      key: 'k',
      category: 'risky_tool',
      pattern: 'curl-pipe-shell',
      severity: 'high',
      location: '/x/y/sess.jsonl',
      line_no: 5,
      occurrences: 15,
      verdict: 'needs-decision',
      verdict_reason: 'the command actually ran',
      context: 'command',
      target: '',
      snippet: '',
      at: '2026-08-23T13:11:00Z',
      session_id: 'eabce931-2a3c',
      project_label: 'yeaboi.ai/python-version',
      fixes: [],
    };
    expect(findingLine(row)).toBe('yeaboi.ai/python-version · eabce931 · Aug 23 · 15 lines');
    expect(findingLine({ ...row, project_label: '', session_id: '', at: '', occurrences: 1 })).toBe(
      'sess.jsonl',
    );
  });
});
