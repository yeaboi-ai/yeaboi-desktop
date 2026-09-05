'use client';

// One issue in full: why it matters, the fixes as buttons, the replay of a
// signal, and where it fired. Opens in the same resizable side sheet the
// kanban card uses, so it already remembers its width and closes on Esc.

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ResizableSheet } from '@/components/ui/resizable-sheet';
import { ReplayTimeline } from '@/components/agents/replay-timeline';
import type { SecurityActions } from '@/components/agents/use-security-actions';
import {
  loadSecurityReplay,
  loadSecuritySignals,
  type Replay,
  type SecurityFindingRow,
  type SecurityFix,
  type SecurityIssue,
  type SecuritySignal,
} from '@/lib/yeaboi/ops';
import {
  VERDICT_LABEL,
  asVerdict,
  findingLine,
  findingsOf,
  issueMeta,
  reasonPlaceholder,
} from '@/lib/yeaboi/security-view';
import { cn } from '@/lib/utils';

const TRANSCRIPT = new Set(['secret', 'risky_tool']);
const LINE_CHIPS = 12;

function FixRow({
  fix,
  primary,
  busy,
  initialAsking,
  onRun,
}: {
  fix: SecurityFix;
  primary: boolean;
  busy: boolean;
  initialAsking: boolean;
  onRun: (fix: SecurityFix, reason?: string) => void;
}) {
  const [asking, setAsking] = useState(initialAsking);
  const [reason, setReason] = useState('');
  const needsReason = fix.id === 'dismiss';
  if (fix.kind === 'manual') {
    return (
      <li className="py-2">
        <p className="text-[13px] text-foreground">{fix.label}</p>
        <p className="text-[12px] text-muted-foreground">{fix.detail}</p>
        {fix.target && <p className="font-code text-[11px] text-muted-foreground">{fix.target}</p>}
      </li>
    );
  }
  return (
    <li className="flex flex-col gap-2 py-2">
      <div className="flex items-start gap-3">
        {fix.kind === 'link' ? (
          <a
            href={fix.target}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: primary ? 'default' : 'outline', size: 'sm' })}
          >
            {fix.label}
          </a>
        ) : (
          <Button
            variant={primary ? 'default' : 'outline'}
            size="sm"
            disabled={busy}
            onClick={() => (needsReason ? setAsking((v) => !v) : onRun(fix))}
          >
            {fix.label}
          </Button>
        )}
        <p className="pt-1 text-[12px] text-muted-foreground">{fix.detail}</p>
      </div>
      {asking && needsReason && (
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            value={reason}
            placeholder={reasonPlaceholder(fix.id)}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && reason.trim()) onRun(fix, reason.trim());
              if (e.key === 'Escape') setAsking(false);
            }}
          />
          <Button
            size="sm"
            disabled={!reason.trim() || busy}
            onClick={() => onRun(fix, reason.trim())}
          >
            Dismiss
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAsking(false)}>
            Keep
          </Button>
        </div>
      )}
    </li>
  );
}

export function SecurityIssueSheet({
  report,
  issue,
  open,
  askReason = false,
  onOpenChange,
  actions,
}: {
  report: Record<string, unknown>;
  issue: SecurityIssue | null;
  open: boolean;
  /** Open with the dismiss reason input already showing (the row's primary fix was a dismissal). */
  askReason?: boolean;
  onOpenChange: (open: boolean) => void;
  actions: SecurityActions;
}) {
  const [signal, setSignal] = useState(0);
  const [line, setLine] = useState(0);
  const [lines, setLines] = useState<SecuritySignal[]>([]);
  const [replay, setReplay] = useState<Replay | null>(null);
  const [replayNote, setReplayNote] = useState('');
  const [notice, setNotice] = useState('');

  const rows: SecurityFindingRow[] = issue
    ? findingsOf(report).filter((row) => issue.finding_keys.includes(row.key))
    : [];
  const shown = rows.length ? Math.min(signal, rows.length - 1) : 0;
  const current = rows[shown];
  const hasTranscript = issue ? TRANSCRIPT.has(issue.category) : false;

  useEffect(() => {
    setSignal(0);
    setLine(0);
    setNotice('');
  }, [issue?.id]);

  // Where the current finding fired more than once, the stored lines are one
  // request away; each becomes a chip that replays that line.
  useEffect(() => {
    setLine(0);
    setLines([]);
    if (!open || !current || !hasTranscript || current.occurrences <= 1) return;
    let cancelled = false;
    loadSecuritySignals(current.key).then(
      (result) => {
        if (!cancelled) setLines(result.signals);
      },
      () => {
        if (!cancelled) setLines([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, current?.key, current?.occurrences, hasTranscript]);

  useEffect(() => {
    if (!open || !hasTranscript) {
      setReplay(null);
      setReplayNote(
        hasTranscript ? '' : 'This is a fact about a config file; there is no session to replay.',
      );
      return;
    }
    if (!current) {
      setReplay(null);
      setReplayNote('No transcript row is stored for this issue; re-run the scan.');
      return;
    }
    let cancelled = false;
    setReplay(null);
    setReplayNote('Loading the replay…');
    loadSecurityReplay(current.key, line).then(
      (result) => {
        if (cancelled) return;
        setReplay(result);
        setReplayNote('');
      },
      (e: Error) => {
        if (!cancelled) setReplayNote(`No replay: ${e.message}`);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, current?.key, line, hasTranscript]);

  if (!issue) return null;
  const verdict = asVerdict(issue.verdict);

  async function run(fix: SecurityFix, reason?: string) {
    if (!issue) return;
    setNotice(await actions.fix(issue, fix, reason));
  }

  return (
    <ResizableSheet
      open={open}
      onOpenChange={onOpenChange}
      storageKey="security.sheet"
      headerSlot={
        <Badge variant={verdict === 'needs-decision' ? 'secondary' : 'outline'}>
          {VERDICT_LABEL[verdict]}
        </Badge>
      }
    >
      <div className="space-y-6 p-6">
        <header>
          <h2 className="font-display text-[22px] leading-tight text-foreground">{issue.title}</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">{issueMeta(issue)}</p>
        </header>

        {issue.why && (
          <section>
            <h3 className="text-[13px] font-medium text-foreground">Why it matters</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{issue.why}</p>
          </section>
        )}

        <section>
          <h3 className="text-[13px] font-medium text-foreground">Fix</h3>
          <ul className="mt-1 divide-y divide-border/50">
            {issue.fixes.map((fix, index) => (
              <FixRow
                key={`${issue.id}:${fix.id}`}
                fix={fix}
                primary={index === 0}
                busy={actions.busy}
                initialAsking={askReason && fix.id === 'dismiss'}
                onRun={run}
              />
            ))}
          </ul>
          {notice && <p className="mt-2 text-[12px] text-foreground">{notice}</p>}
        </section>

        {hasTranscript && (
          <section>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[13px] font-medium text-foreground">
                Replay
                {current && (
                  <span className="ml-2 font-normal text-muted-foreground">
                    {current.project_label || 'session'} · {current.session_id.slice(0, 8)}
                    {current.at ? ` · ${current.at.slice(0, 10)}` : ''}
                  </span>
                )}
              </h3>
              {rows.length > 1 && (
                <div className="flex items-center gap-1 text-[12px] text-muted-foreground">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Previous place it fired"
                    onClick={() => setSignal((shown - 1 + rows.length) % rows.length)}
                  >
                    <ChevronLeft className="size-3.5" />
                  </Button>
                  {shown + 1} of {rows.length}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Next place it fired"
                    onClick={() => setSignal((shown + 1) % rows.length)}
                  >
                    <ChevronRight className="size-3.5" />
                  </Button>
                </div>
              )}
            </div>
            {current?.verdict_reason && (
              <p className="mt-1 text-[12px] text-muted-foreground">{current.verdict_reason}.</p>
            )}
            {lines.length > 1 && (
              <div
                className="mt-2 flex flex-wrap items-center gap-1"
                role="group"
                aria-label="Lines that matched"
              >
                <span className="text-[11px] text-muted-foreground">
                  {lines.length} lines in this session
                </span>
                {lines.slice(0, LINE_CHIPS).map((entry) => {
                  const active = entry.line_no === (line || current?.line_no);
                  return (
                    <button
                      key={entry.line_no}
                      type="button"
                      onClick={() => setLine(entry.line_no)}
                      title={entry.snippet}
                      className={cn(
                        'rounded-full px-2 py-0.5 font-code text-[11px] ring-1',
                        active
                          ? 'bg-warning/10 text-foreground ring-warning/60'
                          : 'text-muted-foreground ring-border/60 hover:text-foreground',
                      )}
                    >
                      {entry.line_no}
                    </button>
                  );
                })}
                {lines.length > LINE_CHIPS && (
                  <span className="text-[11px] text-muted-foreground">
                    and {lines.length - LINE_CHIPS} more
                  </span>
                )}
              </div>
            )}
            <div className="mt-3">
              {replay ? (
                <ReplayTimeline replay={replay} />
              ) : (
                <p className="text-[12px] text-muted-foreground">{replayNote}</p>
              )}
            </div>
          </section>
        )}

        {rows.length > 0 && (
          <section>
            <h3 className="text-[13px] font-medium text-foreground">
              Where it fired ({rows.length})
            </h3>
            <ul className="mt-1 divide-y divide-border/50">
              {rows.map((row, index) => (
                <li key={row.key} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[13px] text-foreground">{findingLine(row)}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {row.verdict_reason}
                      {row.target ? ` — ${row.target}` : ''}
                    </p>
                    {row.snippet && (
                      <p className="mt-0.5 truncate font-code text-[11px] text-muted-foreground">
                        {row.snippet}
                      </p>
                    )}
                  </div>
                  {hasTranscript && (
                    <Button
                      variant={index === shown ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => setSignal(index)}
                    >
                      Replay
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </ResizableSheet>
  );
}
