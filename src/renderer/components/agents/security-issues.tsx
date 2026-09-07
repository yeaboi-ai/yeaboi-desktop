'use client';

// The security page as a list of decisions. It opens with one sentence, shows
// the issues that need something under it with their first fix as a button,
// and folds everything that does not (test data, handled, informational, the
// write-up) behind a count. Clicking a row opens the issue sheet.

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { PostureStrip } from '@/components/yeaboi/posture-strip';
import { SecurityIssueSheet } from '@/components/agents/security-issue-sheet';
import type { SecurityActions } from '@/components/agents/use-security-actions';
import type { SecurityIssue } from '@/lib/yeaboi/ops';
import {
  VERDICT_HINT,
  VERDICT_LABEL,
  groupIssues,
  issueMeta,
  postureCells,
  primaryFix,
  verdictCounts,
  type Verdict,
} from '@/lib/yeaboi/security-view';
import { cn } from '@/lib/utils';

type Report = Record<string, unknown>;
const text = (report: Report, field: string): string => String(report[field] ?? '');
const num = (report: Report, field: string): number => Number(report[field] ?? 0);
const list = (report: Report, field: string): string[] => (report[field] as string[]) ?? [];

function IssueRow({
  issue,
  emphasis,
  busy,
  onOpen,
  onFix,
}: {
  issue: SecurityIssue;
  emphasis: boolean;
  busy: boolean;
  onOpen: (issue: SecurityIssue) => void;
  onFix: (issue: SecurityIssue) => void;
}) {
  const fix = primaryFix(issue);
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(issue)}>
        <p
          className={cn(
            'text-[14px] leading-snug',
            emphasis ? 'font-medium text-foreground' : 'text-foreground',
          )}
        >
          {issue.title}
        </p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">{issueMeta(issue)}</p>
      </button>
      <div className="flex shrink-0 items-center gap-2">
        {fix && fix.kind !== 'manual' && (
          <Button
            variant={emphasis ? 'default' : 'outline'}
            size="sm"
            disabled={busy}
            onClick={() => onFix(issue)}
          >
            {fix.label}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => onOpen(issue)}>
          {issue.category === 'secret' || issue.category === 'risky_tool' ? 'Replay' : 'Why'}
        </Button>
      </div>
    </li>
  );
}

function Group({
  verdict,
  issues,
  count,
  open,
  action,
  children,
}: {
  verdict: Verdict;
  issues: SecurityIssue[];
  count: number;
  open: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(open);
  if (issues.length === 0 && count === 0) return null;
  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div className="flex items-center justify-between gap-3">
        <CollapsibleTrigger className="flex items-center gap-2 py-1 text-left">
          <ChevronRight
            className={cn(
              'size-3.5 text-muted-foreground transition-transform',
              expanded && 'rotate-90',
            )}
          />
          <span className="text-[13px] font-medium text-foreground">{VERDICT_LABEL[verdict]}</span>
          <span className="text-[13px] tabular-nums text-muted-foreground">{count}</span>
        </CollapsibleTrigger>
        {action}
      </div>
      <CollapsibleContent>
        <p className="mb-1 text-[12px] text-muted-foreground">{VERDICT_HINT[verdict]}</p>
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function SecurityIssues({ report, actions }: { report: Report; actions: SecurityActions }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [askReason, setAskReason] = useState(false);
  const [notice, setNotice] = useState('');
  const groups = groupIssues(report);
  const counts = verdictCounts(report);
  const hiddenInfo = num(report, 'hidden_info_count');
  const newKeys = list(report, 'new_findings');
  const resolved = list(report, 'resolved_findings');
  const all = Object.values(groups).flat();
  const openIssue = all.find((issue) => issue.id === openId) ?? null;
  const mcp = (report['mcp_servers'] as Record<string, unknown>[] | undefined) ?? [];
  const recommendations = list(report, 'recommendations');
  const summary = text(report, 'summary');
  const verdictLine = text(report, 'verdict_line');

  function open(issue: SecurityIssue, ask = false) {
    setAskReason(ask);
    setOpenId(issue.id);
  }

  async function fixFromRow(issue: SecurityIssue) {
    const fix = primaryFix(issue);
    if (!fix) return;
    if (fix.kind === 'link' || fix.id === 'dismiss') {
      open(issue, fix.id === 'dismiss');
      return;
    }
    setNotice(await actions.fix(issue, fix));
  }

  async function toggleInfo() {
    setNotice(await actions.toggleInfo());
  }

  async function markAll(issues: SecurityIssue[]) {
    setNotice(
      await actions.verdict(
        issues.flatMap((issue) => issue.finding_keys),
        'test-data',
      ),
    );
  }

  function rows(issues: SecurityIssue[], emphasis = false) {
    return (
      <ul className="divide-y divide-border/50">
        {issues.map((issue) => (
          <IssueRow
            key={issue.id}
            issue={issue}
            emphasis={emphasis}
            busy={actions.busy}
            onOpen={(i) => open(i)}
            onFix={fixFromRow}
          />
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <p className="max-w-[28ch] font-display text-[28px] leading-tight text-foreground">
          {verdictLine || `Posture: ${text(report, 'posture') || 'unknown'}`}
        </p>
        <PostureStrip className="mt-3 max-w-md" cells={postureCells(report)} label={verdictLine} />
        <p className="mt-2 text-[12px] text-muted-foreground">
          {num(report, 'sessions_scanned')} sessions
          {text(report, 'posture_reason') ? ` · ${text(report, 'posture_reason')}` : ''}
          {newKeys.length > 0 || resolved.length > 0
            ? ` · +${newKeys.length} new / −${resolved.length} resolved since the last scan`
            : ''}
        </p>
        {notice && <p className="mt-2 text-[13px] text-foreground">{notice}</p>}
      </section>

      {groups['needs-decision'].length > 0 && (
        <section>
          <h2 className="text-[13px] font-medium text-foreground">
            {VERDICT_LABEL['needs-decision']}
          </h2>
          <p className="text-[12px] text-muted-foreground">{VERDICT_HINT['needs-decision']}</p>
          {rows(groups['needs-decision'], true)}
        </section>
      )}
      {groups['needs-decision'].length === 0 && all.length > 0 && (
        <p className="text-[13px] text-muted-foreground">
          Nothing needs a decision. What is folded below is there if you are curious.
        </p>
      )}
      {groups.unsure.length > 0 && (
        <section>
          <h2 className="text-[13px] font-medium text-foreground">{VERDICT_LABEL.unsure}</h2>
          <p className="text-[12px] text-muted-foreground">{VERDICT_HINT.unsure}</p>
          {rows(groups.unsure)}
        </section>
      )}

      <Group
        verdict="test-data"
        issues={groups['test-data']}
        count={counts['test-data']}
        open={false}
        action={
          groups['test-data'].length > 0 ? (
            <Button
              variant="outline"
              size="sm"
              disabled={actions.busy}
              onClick={() => void markAll(groups['test-data'])}
            >
              Mark all {groups['test-data'].length} as test data
            </Button>
          ) : undefined
        }
      >
        {rows(groups['test-data'])}
      </Group>
      <Group verdict="handled" issues={groups.handled} count={counts.handled} open={false}>
        {rows(groups.handled)}
      </Group>
      <Group
        verdict="info"
        issues={groups.info}
        count={counts.info}
        open={false}
        action={
          hiddenInfo > 0 || actions.includeInfo ? (
            <Button variant="ghost" size="sm" onClick={() => void toggleInfo()}>
              {actions.includeInfo ? 'Fold them away' : `List the ${hiddenInfo} folded`}
            </Button>
          ) : undefined
        }
      >
        {groups.info.length > 0 ? (
          rows(groups.info)
        ) : (
          <p className="text-[12px] text-muted-foreground">Folded.</p>
        )}
      </Group>

      {mcp.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="group flex items-center gap-2 py-1">
            <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90" />
            <span className="text-[13px] font-medium text-foreground">MCP servers</span>
            <span className="text-[13px] tabular-nums text-muted-foreground">{mcp.length}</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="divide-y divide-border/50">
              {mcp.map((row) => (
                <li
                  key={`${String(row['scope'])}/${String(row['name'])}`}
                  className="flex items-center justify-between py-2 text-[13px]"
                >
                  <span className="text-foreground">
                    {String(row['name'])}
                    <span className="ml-2 text-muted-foreground">
                      {String(row['scope'])} · {String(row['transport'])}
                    </span>
                  </span>
                  <span className="text-[12px] text-muted-foreground">
                    {((row['flags'] as string[]) ?? []).join(', ') || 'no flags'}
                  </span>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}

      {(summary && summary !== verdictLine) || recommendations.length > 0 ? (
        <Collapsible>
          <CollapsibleTrigger className="group flex items-center gap-2 py-1">
            <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90" />
            <span className="text-[13px] font-medium text-foreground">Full write-up</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            {summary && summary !== verdictLine && (
              <p className="text-[13px] leading-relaxed text-muted-foreground">{summary}</p>
            )}
            {recommendations.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-muted-foreground">
                {recommendations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      <SecurityIssueSheet
        report={report}
        issue={openIssue}
        open={openIssue !== null}
        askReason={askReason}
        onOpenChange={(o) => !o && setOpenId(null)}
        actions={actions}
      />
    </div>
  );
}
