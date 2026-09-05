'use client';

// The Agents family — one page over three modes, addressed by the route, read
// machine-wide. A project's scoped view of the same reports is
// agents-project-page.tsx; the views themselves are components/agents.
//
// The rule the terminal established and this keeps: the page opens on the last
// saved report, stamped with its age, and re-runs the pass behind it only when
// the backend says that report is stale (`latest.fresh`). A scan reads every
// session log on the machine and ends in an LLM call, so re-running on every
// open was the thing that "kept running in the background".

import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { DuckMark } from '@/components/brand/duck';
import {
  Notice,
  ReportView,
  ScanProgress,
  Section,
  type Report,
} from '@/components/agents/agent-report';
import {
  AGENT_WINDOWS,
  type AgentModes,
  type AgentRunState,
  dismissAgentFinding,
  emptyAgentRun,
  exportAgentReport,
  loadAgentLatest,
  loadAgentModes,
  reduceAgentRun,
  runAgentMode,
} from '@/lib/yeaboi/ops';
import { PageShell } from '@/components/page-shell';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** The agents mode a `/agents/<kind>` pathname addresses. */
function agentKindFromPathname(pathname: string): string {
  return pathname.startsWith('/agents/') ? pathname.slice('/agents/'.length) : '';
}

function AgentsBody() {
  const { pathname } = useLocation();
  const kind = agentKindFromPathname(pathname);
  const [modes, setModes] = useState<AgentModes | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [asOf, setAsOf] = useState('');
  const [run, setRun] = useState<AgentRunState>(emptyAgentRun);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [windowDays, setWindowDays] = useState(30);
  const [includeInfo, setIncludeInfo] = useState(false);
  const [dismissing, setDismissing] = useState<{ key: string; pattern: string } | null>(null);
  const [reason, setReason] = useState('');
  const windowed = kind === 'usage' || kind === 'advisor';

  useEffect(() => {
    loadAgentModes().then(setModes, (e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    setReport(null);
    setAsOf('');
    setNotice('');
    loadAgentLatest(kind).then(
      (latest) => {
        if (!latest) {
          setError('This sidecar has no such report. Update yeaboi to read it here.');
          return;
        }
        setReport(latest.report);
        setAsOf(latest.as_of);
        const saved = Number(latest.report?.['window_days'] ?? 0);
        if (saved > 0) setWindowDays(saved);
        if (!latest.report || !latest.fresh) void refresh();
      },
      (e: Error) => setError(e.message),
    );
    // The route is the only input; a mode change re-runs the whole open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  async function refresh(opts: { windowDays?: number; includeInfo?: boolean } = {}) {
    setRefreshing(true);
    setRun(emptyAgentRun());
    let state = emptyAgentRun();
    const runOpts = {
      ...(windowed ? { windowDays: opts.windowDays ?? windowDays } : {}),
      ...(kind === 'security' ? { includeInfo: opts.includeInfo ?? includeInfo } : {}),
    };
    try {
      await runAgentMode(
        kind,
        (line) => {
          state = reduceAgentRun(state, line);
          setRun(state);
        },
        runOpts,
      );
      if (state.report) {
        setReport(state.report);
        setAsOf('');
      } else if (state.error) {
        // A failed background refresh keeps the stale report on screen: losing a
        // good dashboard over it is the worse outcome.
        setNotice(state.error);
      }
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  const mode = modes?.modes.find((option) => option.kind === kind || option.key === kind);
  if (error) return <Notice title="Could not open this mode" items={[error]} />;

  function pickWindow(days: number) {
    setWindowDays(days);
    void refresh({ windowDays: days });
  }

  function toggleInfo() {
    const next = !includeInfo;
    setIncludeInfo(next);
    void refresh({ includeInfo: next });
  }

  async function confirmDismiss() {
    if (!dismissing) return;
    try {
      await dismissAgentFinding(dismissing.key, reason.trim());
      setNotice(`Dismissed ${dismissing.pattern} — ${reason.trim()}`);
      setDismissing(null);
      setReason('');
      void refresh();
    } catch (e) {
      setNotice((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-foreground">{mode?.label ?? 'Agents'}</h1>
          <p className="text-[13px] text-muted-foreground mt-1">{mode?.blurb ?? ''}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {windowed && (
            <div
              className="flex items-center rounded-md ring-1 ring-border/60"
              role="group"
              aria-label="Window"
            >
              {AGENT_WINDOWS.map((days) => (
                <Button
                  key={days}
                  variant={days === windowDays ? 'default' : 'ghost'}
                  size="sm"
                  disabled={refreshing}
                  onClick={() => pickWindow(days)}
                >
                  {days}d
                </Button>
              ))}
            </div>
          )}
          {kind === 'security' && (
            <Button variant="outline" size="sm" disabled={refreshing} onClick={toggleInfo}>
              {includeInfo ? 'Hide info' : 'Show info'}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={!report}
            onClick={() =>
              void exportAgentReport(kind, 'copy').then(
                (result) =>
                  void navigator.clipboard.writeText(result.markdown ?? '').then(
                    () => setNotice('Copied the report to the clipboard.'),
                    () => setNotice('Could not reach the clipboard.'),
                  ),
                (e: Error) => setNotice(e.message),
              )
            }
          >
            Copy
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!report}
            onClick={() =>
              void exportAgentReport(kind, 'files').then(
                (result) => setNotice(result.message ?? 'Exported.'),
                (e: Error) => setNotice(e.message),
              )
            }
          >
            Export
          </Button>
          <Button size="sm" disabled={refreshing} onClick={() => void refresh()}>
            {refreshing ? 'Refreshing…' : 'Re-run'}
          </Button>
        </div>
      </header>

      {modes && <p className="text-[12px] text-muted-foreground">{modes.beta_notice}</p>}
      {notice && <Notice title="Note" items={[notice]} />}
      {asOf && refreshing && (
        <p className="text-[12px] text-muted-foreground">
          Showing the report saved at {asOf} while a fresh pass runs.
        </p>
      )}
      {asOf && !refreshing && report && (
        <p className="text-[12px] text-muted-foreground">
          Saved at {asOf}
          {modes?.fresh_minutes ? ` · re-runs on open after ${modes.fresh_minutes} min` : ''} ·
          Re-run scans now.
        </p>
      )}
      {dismissing && (
        <Section title={`Dismiss ${dismissing.pattern}`}>
          <p className="text-[12px] text-muted-foreground mb-2">
            Say why this finding is expected. The reason is kept with the dismissal, and the report
            counts it rather than hiding it.
          </p>
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={reason}
              placeholder="e.g. fixture key in the redaction tests"
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && reason.trim()) void confirmDismiss();
                if (e.key === 'Escape') setDismissing(null);
              }}
            />
            <Button size="sm" disabled={!reason.trim()} onClick={() => void confirmDismiss()}>
              Dismiss
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDismissing(null)}>
              Keep
            </Button>
          </div>
        </Section>
      )}

      {(refreshing || !report) && <ScanProgress run={run} />}

      {!report ? (
        <Section title="Nothing yet">
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <DuckMark state="idle" size={28} /> The first pass reads every session log on this
            machine. It takes a moment.
          </p>
        </Section>
      ) : (
        <ReportView
          kind={kind}
          report={report}
          actions={
            kind === 'security'
              ? { onDismiss: (key, pattern) => setDismissing({ key, pattern }), infoToggle: true }
              : {}
          }
        />
      )}
    </div>
  );
}

export default function AgentsPage() {
  return (
    <PageShell>
      <BackendGate>
        <AgentsBody />
      </BackendGate>
    </PageShell>
  );
}
