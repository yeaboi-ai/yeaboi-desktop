'use client';

// The verbs the security page acts through, shared by the machine-wide page
// and a project's scoped tab so the two cannot drift. Every verb answers with
// the re-derived report and swaps it in: no scan runs for a dismissal, a fix
// or the info toggle.

import { useCallback, useState } from 'react';
import {
  applySecurityFix,
  loadAgentLatest,
  setSecurityVerdict,
  type SecurityFix,
  type SecurityIssue,
} from '@/lib/yeaboi/ops';

export type Report = Record<string, unknown>;

export interface SecurityActions {
  includeInfo: boolean;
  busy: boolean;
  /** Apply one fix to an issue; the notice to show comes back. */
  fix: (issue: SecurityIssue, fix: SecurityFix, reason?: string) => Promise<string>;
  /** Set many findings aside (or bring them back); the notice comes back. */
  verdict: (
    keys: string[],
    verdict: 'test-data' | 'dismiss' | 'undo',
    reason?: string,
  ) => Promise<string>;
  /** List or fold the informational findings — a re-derive, not a scan; a notice comes back on failure. */
  toggleInfo: () => Promise<string>;
}

export function useSecurityActions({
  setReport,
  projectId = '',
}: {
  setReport: (report: Report) => void;
  projectId?: string;
}): SecurityActions {
  const [includeInfo, setIncludeInfo] = useState(false);
  const [busy, setBusy] = useState(false);

  const fix = useCallback(
    async (issue: SecurityIssue, chosen: SecurityFix, reason = ''): Promise<string> => {
      if (chosen.kind === 'manual') return chosen.detail;
      setBusy(true);
      try {
        const result = await applySecurityFix(issue.finding_keys[0] ?? '', chosen.id, {
          keys: issue.finding_keys,
          reason,
          includeInfo,
        });
        if (result.report) setReport(result.report);
        if (!result.ok) return `Couldn't apply: ${result.detail ?? 'unknown reason'}`;
        return result.pr_url
          ? `${result.detail ?? 'Done.'} ${result.pr_url}`
          : (result.detail ?? 'Done.');
      } catch (e) {
        return (e as Error).message;
      } finally {
        setBusy(false);
      }
    },
    [includeInfo, setReport],
  );

  const verdict = useCallback(
    async (
      keys: string[],
      word: 'test-data' | 'dismiss' | 'undo',
      reason = '',
    ): Promise<string> => {
      if (keys.length === 0) return 'Nothing to change.';
      setBusy(true);
      try {
        const result = await setSecurityVerdict(keys, word, { reason, includeInfo });
        if (result.report) setReport(result.report);
        if (word === 'undo') return 'Restored.';
        if (word === 'test-data') {
          return keys.length === 1
            ? 'Marked as test data.'
            : `Marked ${keys.length} findings as test data.`;
        }
        return 'Dismissed.';
      } catch (e) {
        return (e as Error).message;
      } finally {
        setBusy(false);
      }
    },
    [includeInfo, setReport],
  );

  const toggleInfo = useCallback(async (): Promise<string> => {
    const next = !includeInfo;
    try {
      const latest = await loadAgentLatest('security', {
        includeInfo: next,
        ...(projectId ? { projectId } : {}),
      });
      if (!latest?.report)
        return 'This sidecar cannot list the informational findings without a scan.';
      setIncludeInfo(next);
      setReport(latest.report);
      return '';
    } catch (e) {
      return (e as Error).message;
    }
  }, [includeInfo, projectId, setReport]);

  return { includeInfo, busy, fix, verdict, toggleInfo };
}
