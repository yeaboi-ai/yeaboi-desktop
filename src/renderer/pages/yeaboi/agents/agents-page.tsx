'use client';

// The Agents family — one page over four modes, addressed by the route, read
// machine-wide. A project's scoped view of the same reports is
// agents-project-page.tsx; the views themselves are components/agents.
//
// The rule the terminal established and this keeps: the page opens on the last
// saved report, stamped with its age, while a fresh pass runs behind it. A scan
// reads every session log on the machine, so a loading screen would be the
// normal experience rather than the first-run one.

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
  type AgentModes,
  type AgentRunState,
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
        void refresh();
      },
      (e: Error) => setError(e.message),
    );
    // The route is the only input; a mode change re-runs the whole open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  async function refresh() {
    setRefreshing(true);
    setRun(emptyAgentRun());
    let state = emptyAgentRun();
    try {
      await runAgentMode(kind, (line) => {
        state = reduceAgentRun(state, line);
        setRun(state);
      });
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

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-foreground">{mode?.label ?? 'Agents'}</h1>
          <p className="text-[13px] text-muted-foreground mt-1">{mode?.blurb ?? ''}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
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

      {(refreshing || !report) && <ScanProgress run={run} />}

      {!report ? (
        <Section title="Nothing yet">
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <DuckMark state="idle" size={28} /> The first pass reads every session log on this
            machine. It takes a moment.
          </p>
        </Section>
      ) : (
        <ReportView kind={kind} report={report} />
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
