'use client';

// Daily Standup — the dashboard, card for card with the terminal's.
//
// The card list comes from the backend (standup/dashboard.py decides which
// cards a report earns), so this file draws cards rather than choosing them.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DuckMark } from '@/components/brand/duck';
import { quip } from '@/lib/yeaboi/ambience';
import { useAudience } from '@/components/providers/audience-provider';
import {
  type ArtifactEdits,
  type ArtifactRef,
  applyArtifactEdits,
  loadArtifactEdits,
  maskText,
} from '@/lib/yeaboi/boards';
import {
  type DashboardCard,
  type MemberUpdate,
  type RunLine,
  type StandupDashboard,
  deleteRun,
  emptyRun,
  loadStandup,
  ratePractice,
  reduceRun,
  runStandup,
} from '@/lib/yeaboi/dashboards';
import { appendSpoken } from '@/lib/yeaboi/voice';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { NextUp } from '@/components/yeaboi/calendar';
import { Surface } from '@/components/yeaboi/surface';
import { MicButton } from '@/components/yeaboi/mic-button';
import { ResultActions } from '@/components/yeaboi/result-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type Tone = 'done' | 'inprogress' | 'blocked' | 'todo';

const CONFIDENCE_TONE: Record<string, Tone> = {
  'On track': 'done',
  'At risk': 'inprogress',
  Behind: 'blocked',
};

const TONE_VARIANT: Record<Tone, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  done: 'default',
  inprogress: 'secondary',
  blocked: 'destructive',
  todo: 'outline',
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

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary/40 px-3 py-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-[13px] font-medium text-foreground">{value}</p>
    </div>
  );
}

function Dot({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${
        active ? 'bg-primary' : 'bg-border'
      }`}
    />
  );
}

const inputClass =
  'mt-1 w-full rounded-lg bg-secondary/40 border border-border/40 px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40';

function StandupBody() {
  const { audience } = useAudience();
  const [data, setData] = useState<StandupDashboard | null>(null);
  const [error, setError] = useState('');
  const [run, setRun] = useState(emptyRun());
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState('summary');
  const [runId, setRunId] = useState(0);
  const [showRuns, setShowRuns] = useState(false);
  const [mask, setMask] = useState<[string, string][]>([]);
  const [anonNote, setAnonNote] = useState('');
  const [showEditor, setShowEditor] = useState(false);

  useEffect(() => {
    void refresh(runId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  async function refresh(id = runId) {
    try {
      setData(await loadStandup('', id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function drop(id: number) {
    await deleteRun(id);
    // Deleting the run that is open puts the page back on the latest one.
    if (id === runId) setRunId(0);
    else await refresh();
  }

  async function generate(deliver: boolean) {
    if (!data?.session_id || busy) return;
    setBusy(true);
    setError('');
    let state = emptyRun();
    setRun(state);
    try {
      await runStandup(
        data.session_id,
        deliver,
        (line: RunLine) => {
          state = reduceRun(state, line);
          setRun(state);
        },
        { solo: audience === 'solo' },
      );
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
    if (state.error) setError(state.error);
    // The report is re-read rather than taken off the stream: the run also
    // wrote the review, the nudge and the history this page shows.
    else {
      quip('standup_done');
      await refresh();
    }
  }

  if (error && !data) return <Notice title="Could not load the standup" items={[error]} />;
  if (!data) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  const report = data.report;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-foreground">Daily Standup</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            {data.session_name || 'No project yet'}
            {report ? ` · ${report.date}` : ' · nothing generated yet'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            size="sm"
            disabled={busy || !data.session_id}
            onClick={() => void generate(false)}
          >
            {busy ? 'Generating…' : 'Generate'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !report}
            onClick={() => void generate(true)}
          >
            Generate &amp; deliver
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowRuns(!showRuns)}>
            {showRuns ? 'Hide past runs' : `Past runs (${data.history.length})`}
          </Button>
          <Link
            href="/team/standup/setup"
            className="text-[12px] text-muted-foreground hover:text-foreground"
          >
            Setup
          </Link>
          <Link
            href="/team/standup/schedule"
            className="text-[12px] text-muted-foreground hover:text-foreground"
          >
            Schedule
          </Link>
          <Link
            href="/team/standup/review"
            className="text-[12px] text-muted-foreground hover:text-foreground"
          >
            Transcript review
          </Link>
        </div>
      </header>

      {report && (
        <>
          <ResultActions
            refer={{ kind: 'standup', session_id: data.session_id, run_id: runId }}
            mode="standup"
            anonNote={anonNote}
            onAnonymize={(replacements, note) => {
              setMask(replacements);
              setAnonNote(note);
            }}
          />
          <div>
            <Button size="sm" variant="outline" onClick={() => setShowEditor(!showEditor)}>
              {showEditor ? 'Hide corrections' : 'Corrections'}
            </Button>
          </div>
          {showEditor && (
            <ArtifactEditor
              refer={{ kind: 'standup', session_id: data.session_id, run_id: runId }}
              onApplied={() => void refresh()}
            />
          )}
        </>
      )}

      {showRuns && (
        <Section title="Past runs">
          <ul className="space-y-1.5">
            {data.history.map((entry) => (
              <li key={entry.id} className="flex items-center gap-2 text-[13px]">
                <Dot active={entry.id === runId || (!runId && entry === data.history[0])} />
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => setRunId(entry.id)}
                >
                  {entry.standup_date} · day {entry.sprint_day} · {entry.confidence_pct}%
                </button>
                <span className="text-[12px] text-muted-foreground flex items-center gap-2">
                  {entry.status}
                  <Button size="xs" variant="ghost" onClick={() => void drop(entry.id)}>
                    Delete
                  </Button>
                </span>
              </li>
            ))}
          </ul>
          {!data.history.length && (
            <p className="text-[13px] text-muted-foreground">No runs yet.</p>
          )}
          {runId ? (
            <p className="text-[11px] text-muted-foreground mt-2">
              Showing a past run.{' '}
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => setRunId(0)}
              >
                Back to the latest
              </button>
            </p>
          ) : null}
        </Section>
      )}

      {busy && (
        <Section title="Working">
          <ol className="space-y-1">
            {run.phases.map((phase, index) => (
              <li key={`${index}-${phase}`} className="text-[12px] text-muted-foreground">
                {phase}
              </li>
            ))}
            {!run.phases.length && <li className="text-[12px] text-muted-foreground">Starting…</li>}
          </ol>
          <p className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
            <DuckMark state="idle" size={20} /> A standup run cannot be stopped part-way — it
            finishes or it fails.
          </p>
        </Section>
      )}

      {error && <Notice title="That run did not finish" items={[error]} />}

      {report && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile label="Sprint" value={report.sprint_name || '—'} />
          <StatTile
            label="Sprint day"
            value={
              report.sprint_total_days ? `${report.sprint_day} of ${report.sprint_total_days}` : '—'
            }
          />
          <StatTile label="Confidence" value={report.confidence_label || '—'} />
          <StatTile label="Updates" value={String(report.member_updates.length)} />
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {data.cards.map((card) => (
          <button
            key={card.key}
            type="button"
            className={`rounded-full px-3 py-1 text-[12px] transition-colors ${
              card.key === open
                ? 'bg-primary/10 text-foreground ring-1 ring-primary/40'
                : 'bg-secondary/40 text-muted-foreground hover:bg-secondary/70'
            }`}
            onClick={() => setOpen(card.key)}
          >
            {card.title}
          </button>
        ))}
      </div>

      <CardBody
        card={data.cards.find((c) => c.key === open) ?? data.cards[0]!}
        data={data}
        mask={mask}
        onRated={() => void refresh()}
      />
    </div>
  );
}

function CardBody({
  card,
  data,
  mask,
  onRated,
}: {
  card: DashboardCard;
  data: StandupDashboard;
  /** Non-empty while the page is masked — the same data, drawn differently. */
  mask: [string, string][];
  onRated: () => void;
}) {
  const report = data.report;
  if (card.member) {
    const member = report?.member_updates.find((m) => m.name === card.member);
    return member ? (
      <MemberCard
        member={member}
        sessionId={data.session_id}
        active={data.active.includes(member.name)}
        mask={mask}
        onRated={onRated}
      />
    ) : null;
  }
  switch (card.key) {
    case 'summary':
      return (
        <Section title="Team Summary">
          <p className="text-[13px] text-muted-foreground">
            {maskText(report?.team_summary ?? '', mask) || 'No summary yet.'}
          </p>
          {report?.confidence_label && (
            <p className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
              <Badge variant={TONE_VARIANT[CONFIDENCE_TONE[report.confidence_label] ?? 'todo']}>
                {report.confidence_label} · {report.confidence_pct}%
              </Badge>{' '}
              {report.confidence_rationale}
            </p>
          )}
        </Section>
      );
    case 'my_update': {
      const mine = report?.member_updates.find((m) => m.name === data.my_name);
      return mine ? (
        <MemberCard
          member={mine}
          sessionId={data.session_id}
          active={data.active.includes(mine.name)}
          mask={mask}
          onRated={onRated}
        />
      ) : (
        <Section title="My Update">
          <p className="text-[13px] text-muted-foreground">No update yet — Generate asks for it.</p>
        </Section>
      );
    }
    case 'team':
      return (
        <Section title="Team">
          <ul className="space-y-1.5">
            {(report?.member_updates ?? [])
              .filter((m) => m.name !== data.my_name)
              .map((m) => (
                <li key={m.name} className="flex items-start gap-2 text-[13px]">
                  <span className="mt-1.5">
                    <Dot active={data.active.includes(m.name)} />
                  </span>
                  <strong className="text-foreground font-medium shrink-0">{m.name}</strong>
                  <span className="text-muted-foreground">
                    {m.summary || 'No activity detected.'}
                  </span>
                </li>
              ))}
          </ul>
        </Section>
      );
    case 'conflicts':
      return (
        <Section title="Conflicts">
          <ul className="list-disc pl-5 space-y-1 text-[13px] text-muted-foreground">
            {(report?.conflicts ?? []).map((conflict) => (
              <li key={conflict.entity_id}>
                <strong className="text-foreground font-medium">{conflict.entity_id}</strong> —{' '}
                {maskText(conflict.summary, mask)}
              </li>
            ))}
          </ul>
        </Section>
      );
    case 'activity':
      return (
        <Section title="Activity">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(report?.activity_counts ?? []).map(([source, count]) => (
              <StatTile key={source} label={source} value={String(count)} />
            ))}
          </div>
          {!report?.activity_counts.length && (
            <p className="text-[13px] text-muted-foreground">No sources reported activity.</p>
          )}
        </Section>
      );
    case 'gaps':
      return (
        <Section
          title="Transcript Review"
          actions={
            <Link href="/team/standup/review" className="text-[12px] text-primary hover:underline">
              Open
            </Link>
          }
        >
          {data.nudge?.missed_dates.length ? (
            <p className="text-[13px] text-muted-foreground">
              {data.nudge.missed_dates.length} standup
              {data.nudge.missed_dates.length === 1 ? '' : 's'} went unchecked — oldest{' '}
              {data.nudge.missed_dates[data.nudge.missed_dates.length - 1]}.
            </p>
          ) : null}
          {data.review ? (
            <p className="text-[13px] text-muted-foreground">
              {data.review.gaps.length} gap{data.review.gaps.length === 1 ? '' : 's'} found ·{' '}
              {data.gap_issues.filter((entry) => entry.issue_number).length} filed.
            </p>
          ) : (
            <p className="text-[13px] text-muted-foreground">Not reviewed yet.</p>
          )}
        </Section>
      );
    case 'schedule': {
      const config = (data.config ?? {}) as { enabled?: boolean; time?: string; weekdays?: string };
      return (
        <Section
          title="Schedule"
          actions={
            <Link
              href="/team/standup/schedule"
              className="text-[12px] text-primary hover:underline"
            >
              Set up
            </Link>
          }
        >
          {data.config ? (
            <p className="text-[13px] text-muted-foreground">
              {config.enabled ? 'Enabled' : 'Off'} · {config.time ?? '—'} · {config.weekdays ?? '—'}
              {data.schedule.installed
                ? ` · installed (${data.schedule.platform ?? 'os'})`
                : ' · no OS job'}
            </p>
          ) : (
            <p className="text-[13px] text-muted-foreground">Not configured.</p>
          )}
        </Section>
      );
    }
    case 'notices':
      return (
        <Section title="Notices">
          <Notice title="What could not be read" items={report?.warnings ?? []} />
        </Section>
      );
    default:
      return null;
  }
}

function MemberCard({
  member,
  sessionId,
  active,
  mask,
  onRated,
}: {
  member: MemberUpdate;
  sessionId: string;
  active: boolean;
  mask: [string, string][];
  onRated: () => void;
}) {
  const [rated, setRated] = useState<Record<string, string>>({});

  async function rate(rule: string, verdict: string) {
    setRated((prior) => ({ ...prior, [rule]: verdict }));
    await ratePractice(sessionId, member.name, rule, verdict);
    onRated();
  }

  return (
    <Section
      title={maskText(member.name, mask)}
      actions={
        <Badge variant={active ? 'default' : 'outline'}>{active ? 'active' : 'quiet'}</Badge>
      }
    >
      <p className="text-[13px] text-muted-foreground">
        {maskText(member.summary, mask) || 'No activity detected.'}
      </p>
      {member.blockers && (
        <div className="mt-3">
          <Notice title="Blocked" items={[maskText(member.blockers, mask)]} />
        </div>
      )}
      {member.self_report && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          ✍ {maskText(member.self_report, mask)}
        </p>
      )}
      {member.links?.length ? (
        <ul className="mt-2 space-y-1">
          {member.links.map(([label, url]) => (
            <li key={url}>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="text-[12px] text-primary hover:underline"
              >
                {label || url}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {member.practices?.length ? (
        <div className="mt-3">
          <h3 className="text-[12px] font-medium text-foreground mb-2">Practices</h3>
          {member.practices.map((signal) => (
            <div
              key={signal.rule}
              className="flex items-center justify-between gap-3 py-1.5 border-t border-border/40 text-[13px]"
            >
              <span className="text-muted-foreground">{signal.detail}</span>
              {rated[signal.rule] ? (
                <span className="text-[11px] text-muted-foreground shrink-0">
                  Thanks — remembered.
                </span>
              ) : (
                <span className="flex items-center gap-1.5 shrink-0">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => void rate(signal.rule, 'confirmed')}
                  >
                    Fair
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => void rate(signal.rule, 'excused')}
                  >
                    Not this one
                  </Button>
                </span>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </Section>
  );
}

// ── Corrections ────────────────────────────────────────────────────────────
//
// The correction panel — what a reader may fix on a generated artifact, and
// what has already been fixed.
//
// It goes through the same allowlist, the same caps and the same append-only
// log a teammate in the browser does: the edit is applied by
// `artifact_edit_apply`, never by writing to the store. That is the whole point
// of the engine — a correction made here and one made on a shared document are
// the same operation with the same refusals.
//
// Names in the history are **self-declared** (whoever held the link typed
// them), which is why this says so rather than presenting them as an audit
// trail.
//
// (Ported from the old components/ArtifactEditor.tsx — it lives inline here
// until the shared component is re-established in the new tree.)

function ArtifactEditor({ refer, onApplied }: { refer: ArtifactRef; onApplied?: () => void }) {
  const [data, setData] = useState<ArtifactEdits | null>(null);
  const [error, setError] = useState('');
  const [path, setPath] = useState('');
  const [value, setValue] = useState('');
  const [author, setAuthor] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refer.kind, refer.session_id, refer.run_id]);

  async function refresh() {
    try {
      const next = await loadArtifactEdits(refer);
      setData(next);
      if (!path && next.artifact.fields.length) setPath(next.artifact.fields[0]!.path);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function apply() {
    if (!path || !value.trim()) return;
    setBusy(true);
    setMessage('');
    try {
      const envelope = await applyArtifactEdits(refer, [{ op: 'set', path, value }], author);
      const result = envelope.data as { applied?: number; refused?: { reason: string }[] };
      if (result.refused?.length) {
        setMessage(`Refused: ${result.refused[0]!.reason}`);
      } else {
        setMessage(`Applied ${result.applied ?? 0}.`);
        setValue('');
        quip('artifact_done');
        onApplied?.();
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  if (error) return <Notice title="Could not load the corrections" items={[error]} />;
  if (!data) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  const field = data.artifact.fields.find((row) => row.path === path);
  return (
    <Section title={`Correct this ${data.artifact.label.toLowerCase()}`}>
      {!data.artifact.headless && (
        <Notice
          title="Read-only here"
          items={[data.artifact.note || 'This artifact is only correctable on a shared document.']}
        />
      )}
      {data.artifact.headless && (
        <div className="space-y-3">
          <label className="block">
            <span className="text-[11px] font-body text-muted-foreground uppercase tracking-wide">
              Field
            </span>
            <select value={path} onChange={(e) => setPath(e.target.value)} className={inputClass}>
              {data.artifact.fields.map((row) => (
                <option key={row.path} value={row.path}>
                  {row.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-body text-muted-foreground uppercase tracking-wide">
              New value{field ? ` (max ${field.max_length})` : ''}
            </span>
            <textarea
              rows={3}
              maxLength={field?.max_length}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className={inputClass}
            />
            <div className="mt-1.5">
              <MicButton onText={(text) => setValue((prior) => appendSpoken(prior, text))} />
            </div>
          </label>
          <label className="block">
            <span className="text-[11px] font-body text-muted-foreground uppercase tracking-wide">
              Your name
            </span>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className={inputClass}
            />
          </label>
          <Button size="sm" disabled={busy || !value.trim()} onClick={() => void apply()}>
            {busy ? 'Applying…' : 'Apply correction'}
          </Button>
        </div>
      )}
      {message && <p className="mt-2 text-[11px] text-muted-foreground">{message}</p>}
      <h3 className="text-[12px] font-medium text-foreground mt-4 mb-1">
        {data.count} {data.count === 1 ? 'correction' : 'corrections'} on record
      </h3>
      {data.count > 0 && (
        <p className="text-[11px] text-muted-foreground mb-2">
          Names are {data.attribution} — not an audit trail.
        </p>
      )}
      <ul className="space-y-1">
        {data.edits.map((edit) => (
          <li key={edit.id} className="text-[12px] text-muted-foreground">
            <strong className="text-foreground font-medium">{edit.author || 'anonymous'}</strong>{' '}
            {edit.op} <code className="font-mono text-[11px]">{edit.path}</code>
            <span className="text-[11px]"> {edit.at}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export default function StandupPage() {
  return (
    <BackendGate>
      <Surface>
        <NextUp modes={['standup']} />
        <StandupBody />
      </Surface>
    </BackendGate>
  );
}
