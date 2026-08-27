'use client';

// Transcript review — check a standup report against the meeting that
// discussed it, and see which diagnosed gaps have been filed.
//
// Filing writes public GitHub issues, so it is a separate, explicit act with
// its own button; the review itself never publishes.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { callTool } from '@/lib/yeaboi/api';
import { loadStandup } from '@/lib/yeaboi/dashboards';
import { appendSpoken } from '@/lib/yeaboi/voice';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { MicButton } from '@/components/yeaboi/mic-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface Gap {
  fingerprint: string;
  category: string;
  scope: string;
  title: string;
  detail: string;
  root_cause: string;
  priority: string;
}

interface Review {
  review_id: number;
  standup_date: string;
  reviewed_at: string;
  gaps: Gap[];
  config_suggestions: Gap[];
  accuracy_note: string;
  claims_matched: number;
  claims_missing: number;
  claims_contradicted: number;
}

interface GapsView {
  session_id: string;
  latest_review: Review | null;
  gap_issues: { fingerprint?: string; issue_number?: number; title?: string }[];
  nudge: { missed_dates: string[]; level?: string } | null;
}

const PRIORITY_VARIANT: Record<string, 'destructive' | 'secondary' | 'outline'> = {
  critical: 'destructive',
  high: 'destructive',
  medium: 'secondary',
  low: 'outline',
};

function Section({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-card ring-1 ring-border/60 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[13px] font-body font-medium text-foreground">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

function Notice({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl bg-card ring-1 ring-destructive/30 p-4">
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      {items.map((item) => (
        <p key={item} className="text-[12px] text-muted-foreground mt-1">
          {item}
        </p>
      ))}
    </div>
  );
}

function StandupReviewBody() {
  const [sessionId, setSessionId] = useState('');
  const [view, setView] = useState<GapsView | null>(null);
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    loadStandup().then(
      (dash) => {
        setSessionId(dash.session_id);
        void refresh(dash.session_id);
      },
      (e: Error) => setError(e.message),
    );
  }, []);

  async function refresh(id: string) {
    const envelope = await callTool<GapsView>('standup_gaps', { session_id: id });
    if (envelope.ok) setView(envelope.data);
    else setError(envelope.error?.message ?? 'standup_gaps failed');
  }

  async function review(args: object, label: string) {
    if (busy) return;
    setBusy(label);
    setError('');
    setNote('');
    const envelope = await callTool('standup_review', { session_id: sessionId, ...args });
    setBusy('');
    if (!envelope.ok) {
      setError(envelope.error?.message ?? 'standup_review failed');
      return;
    }
    setPaste('');
    setNote(label === 'file' ? 'Filed. Issue numbers appear in the ledger below.' : 'Reviewed.');
    await refresh(sessionId);
  }

  if (error && !view) return <Notice title="Could not load the review" items={[error]} />;
  if (!view) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  const latest = view.latest_review;
  const filed = new Set(view.gap_issues.filter((e) => e.issue_number).map((e) => e.fingerprint));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-foreground">Transcript review</h1>
        <p className="text-[13px] text-muted-foreground mt-1">
          What the standup missed, and why — a missing integration, an unconfigured source, or a
          summary that dropped what it collected.
        </p>
      </div>

      {view.nudge?.missed_dates.length ? (
        <Notice
          title="Unchecked standups"
          items={[
            `${view.nudge.missed_dates.length} standup${
              view.nudge.missed_dates.length === 1 ? '' : 's'
            } ran without being checked against their meeting — oldest ${
              view.nudge.missed_dates[view.nudge.missed_dates.length - 1]
            }.`,
          ]}
        />
      ) : null}

      <Section title="Review a meeting">
        <textarea
          rows={6}
          placeholder="Paste the transcript here, or use Sweep to read ~/.yeaboi/transcripts…"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          className="w-full rounded-lg bg-secondary/40 border border-border/40 px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <MicButton onText={(text) => setPaste((prior) => appendSpoken(prior, text))} />
          <Button
            size="sm"
            disabled={!!busy || !paste.trim()}
            onClick={() => void review({ transcript_text: paste }, 'paste')}
          >
            {busy === 'paste' ? 'Reviewing…' : 'Review this transcript'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!!busy}
            onClick={() => void review({}, 'sweep')}
          >
            {busy === 'sweep' ? 'Sweeping…' : 'Sweep the transcript folder'}
          </Button>
        </div>
      </Section>

      {error && <Notice title="That review did not finish" items={[error]} />}
      {note && <p className="text-[11px] text-muted-foreground">{note}</p>}

      {latest ? (
        <>
          <Section title={`Latest review · ${latest.standup_date}`}>
            <p className="text-[13px] text-muted-foreground">
              {latest.claims_matched} matched · {latest.claims_missing} missing ·{' '}
              {latest.claims_contradicted} contradicted
            </p>
            {latest.accuracy_note && (
              <p className="text-[11px] text-muted-foreground mt-2">{latest.accuracy_note}</p>
            )}
          </Section>

          <Section
            title="Gaps in yeaboi"
            actions={
              latest.gaps.length ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!busy}
                  onClick={() => void review({ file_issues: true, include_reviewed: true }, 'file')}
                >
                  {busy === 'file' ? 'Filing…' : 'File as GitHub issues'}
                </Button>
              ) : undefined
            }
          >
            {latest.gaps.length ? (
              <ul className="space-y-3">
                {latest.gaps.map((gap) => (
                  <li key={gap.fingerprint} className="text-[13px]">
                    <span className="flex items-center gap-2">
                      <Badge variant={PRIORITY_VARIANT[gap.priority] ?? 'outline'}>
                        {gap.priority}
                      </Badge>
                      <strong className="text-foreground font-medium">{gap.title}</strong>
                      {filed.has(gap.fingerprint) && (
                        <span className="text-[11px] text-muted-foreground"> · filed</span>
                      )}
                    </span>
                    <p className="text-muted-foreground mt-1">{gap.detail}</p>
                    {gap.root_cause && (
                      <p className="text-[11px] text-muted-foreground mt-1">{gap.root_cause}</p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                Nothing to file — the report covered what the meeting discussed.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground mt-3">
              Filing writes public issues on the yeaboi repo. Nothing is sent until you press it.
            </p>
          </Section>

          <Section title="Fix in your config">
            {latest.config_suggestions.length ? (
              <ul className="space-y-3">
                {latest.config_suggestions.map((gap) => (
                  <li key={gap.fingerprint} className="text-[13px]">
                    <strong className="text-foreground font-medium">{gap.title}</strong>
                    <p className="text-muted-foreground mt-1">{gap.detail}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                No configuration changes suggested.
              </p>
            )}
          </Section>
        </>
      ) : (
        <Section title="No review yet">
          <p className="text-[13px] text-muted-foreground">
            Paste a transcript above, or drop one into ~/.yeaboi/transcripts and sweep.
          </p>
        </Section>
      )}

      <p>
        <Link
          href="/humans/standup"
          className="text-[12px] text-muted-foreground hover:text-foreground"
        >
          Back to the standup
        </Link>
      </p>
    </div>
  );
}

export default function StandupReviewPage() {
  return (
    <BackendGate>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <StandupReviewBody />
      </div>
    </BackendGate>
  );
}
