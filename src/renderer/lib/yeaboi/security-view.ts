// The security page's pure decisions: how issues group by verdict, what each
// verdict is called and how it is toned, what a row says beside its title.
// Kept out of the components so vitest (node, no DOM) can pin them.

import type { PostureCell, PostureTone } from '@/components/yeaboi/posture-strip';
import type { SecurityFindingRow, SecurityFix, SecurityIssue } from '@/lib/yeaboi/ops';

export const VERDICTS = ['needs-decision', 'unsure', 'test-data', 'handled', 'info'] as const;
export type Verdict = (typeof VERDICTS)[number];

export const VERDICT_LABEL: Record<Verdict, string> = {
  'needs-decision': 'Needs a decision',
  unsure: 'Worth a look',
  'test-data': 'Looks like test data',
  handled: 'Handled',
  info: 'Informational',
};

export const VERDICT_HINT: Record<Verdict, string> = {
  'needs-decision': 'The command ran, or a live-looking key sat in a command or in what you typed.',
  unsure:
    'A generic shape, or a signal scanned before its context was recorded. The replay settles it.',
  'test-data': 'Written into or read from test, fixture, docs or plan files. Not run, not a risk.',
  handled: 'Dismissed, fixed or rotated. Undo brings one back.',
  info: 'Counted, not listed.',
};

/** Only a settings fact that bypasses approval by default is drawn as destructive;
 *  every transcript match is at most a warning, because it is a shape, not a breach. */
export function verdictTone(verdict: string, pattern = ''): PostureTone {
  if (pattern === 'permission-bypass-default') return 'bad';
  if (verdict === 'needs-decision') return 'warn';
  if (verdict === 'handled') return 'good';
  return 'idle';
}

export const asVerdict = (word: string): Verdict =>
  (VERDICTS as readonly string[]).includes(word) ? (word as Verdict) : 'unsure';

export function issuesOf(report: Record<string, unknown>): SecurityIssue[] {
  return ((report['issues'] as SecurityIssue[] | undefined) ?? []).map((issue) => ({
    ...issue,
    finding_keys: issue.finding_keys ?? [],
    fixes: issue.fixes ?? [],
  }));
}

export function findingsOf(report: Record<string, unknown>): SecurityFindingRow[] {
  return ((report['findings'] as Partial<SecurityFindingRow>[] | undefined) ?? []).map((row) => ({
    key: row.key ?? '',
    category: row.category ?? '',
    pattern: row.pattern ?? '',
    severity: row.severity ?? '',
    location: row.location ?? '',
    line_no: Number(row.line_no ?? 0),
    occurrences: Number(row.occurrences ?? 1),
    verdict: row.verdict ?? '',
    verdict_reason: row.verdict_reason ?? '',
    context: row.context ?? '',
    target: row.target ?? '',
    snippet: row.snippet ?? '',
    at: row.at ?? '',
    session_id: row.session_id ?? '',
    project_label: row.project_label ?? '',
    fixes: row.fixes ?? [],
  }));
}

export function groupIssues(report: Record<string, unknown>): Record<Verdict, SecurityIssue[]> {
  const groups: Record<Verdict, SecurityIssue[]> = {
    'needs-decision': [],
    unsure: [],
    'test-data': [],
    handled: [],
    info: [],
  };
  for (const issue of issuesOf(report)) groups[asVerdict(issue.verdict)].push(issue);
  return groups;
}

/** Findings per verdict as the report counted them (issues, not files). */
export function verdictCounts(report: Record<string, unknown>): Record<Verdict, number> {
  const counts: Record<Verdict, number> = {
    'needs-decision': 0,
    unsure: 0,
    'test-data': 0,
    handled: 0,
    info: 0,
  };
  for (const pair of (report['verdict_counts'] as [string, number][] | undefined) ?? []) {
    counts[asVerdict(pair[0])] = Number(pair[1] ?? 0);
  }
  return counts;
}

/** One cell per issue, in verdict order, so the strip reads left-to-right as the page does. */
export function postureCells(report: Record<string, unknown>): PostureCell[] {
  const cells: PostureCell[] = [];
  const groups = groupIssues(report);
  for (const verdict of VERDICTS) {
    if (verdict === 'info') continue;
    for (const issue of groups[verdict]) {
      cells.push({ key: issue.id, tone: verdictTone(verdict, issue.pattern), title: issue.title });
    }
  }
  return cells;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-08-23…` → `Aug 23`; anything else comes back as given. */
export function shortDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const month = MONTHS[Number(match[2]) - 1] ?? match[2];
  return `${month} ${Number(match[3])}`;
}

/** The quiet line under an issue's title: where it fired and when. */
export function issueMeta(issue: SecurityIssue): string {
  const parts: string[] = [];
  if (issue.category === 'secret' || issue.category === 'risky_tool') {
    parts.push(`${issue.sessions} session${issue.sessions === 1 ? '' : 's'}`);
  } else {
    parts.push(issue.category === 'mcp' ? 'MCP config' : 'settings');
  }
  if (issue.signals > 1) parts.push(`${issue.signals} signals`);
  if (issue.last_seen) parts.push(`last ${shortDate(issue.last_seen)}`);
  parts.push(issue.severity);
  return parts.join(' · ');
}

/** The button a row carries: the first fix that is not a dismissal. */
export function primaryFix(issue: SecurityIssue): SecurityFix | undefined {
  return issue.fixes.find((fix) => fix.kind !== 'dismiss') ?? issue.fixes[0];
}

/** What a finding row says about itself in the sheet's signal list. */
export function findingLine(row: SecurityFindingRow): string {
  const parts: string[] = [row.project_label || row.location.split('/').pop() || row.location];
  if (row.session_id) parts.push(row.session_id.slice(0, 8));
  if (row.at) parts.push(shortDate(row.at));
  if (row.occurrences > 1) parts.push(`${row.occurrences} lines`);
  return parts.join(' · ');
}

/** The sentence a dismissal reason prompt opens with, per fix. */
export function reasonPlaceholder(fixId: string): string {
  return fixId === 'dismiss' ? 'e.g. a known installer we trust' : '';
}
