'use client';

// Weekly Review — the Solo world's own mode: the latest review of your week,
// the actions carried into this one, and the button that runs the next.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { DuckMark } from '@/components/brand/duck';
import { PageShell } from '@/components/page-shell';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { BetaChip } from '@/components/yeaboi/beta-chip';
import { ReviewBody } from '@/components/yeaboi/review-body';
import { Button, buttonVariants } from '@/components/ui/button';
import { ContextPicker } from '@/components/context/context-picker';
import { useContextScope } from '@/hooks/yeaboi/use-context-scope';
import { useNdjsonRun } from '@/hooks/yeaboi/use-ndjson-run';
import {
  type ReviewAction,
  type ReviewActionStatus,
  type ReviewHome,
  MARKABLE_STATUSES,
  carriedStatusesPayload,
  deleteReview,
  loadReviewHome,
  nextActionStatus,
  reviewHeadline,
} from '@/lib/yeaboi/modes';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card ring-1 ring-border/60 p-5">
      <h2 className="text-[13px] font-body font-medium text-foreground mb-3">{title}</h2>
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

const MARK_LABEL: Record<ReviewActionStatus, string> = {
  pending: 'still open',
  done: 'done',
  dropped: 'dropped',
  carried: 'still open',
};

function CarriedList({
  carried,
  marks,
  onMark,
}: {
  carried: ReviewAction[];
  marks: Record<string, ReviewActionStatus>;
  onMark: (id: string, status: ReviewActionStatus) => void;
}) {
  if (!carried.length)
    return (
      <p className="text-[12px] text-muted-foreground">
        Nothing carried over — the first review starts the list.
      </p>
    );
  return (
    <ul className="space-y-2">
      {carried.map((action) => {
        const mark = marks[action.id] ?? (action.status as ReviewActionStatus);
        return (
          <li key={action.id} className="flex items-center justify-between gap-3">
            <span
              className={`text-[12px] text-foreground ${mark === 'dropped' ? 'line-through opacity-60' : ''}`}
            >
              {action.text}
            </span>
            <button
              type="button"
              onClick={() => onMark(action.id, nextActionStatus(mark))}
              className="shrink-0 rounded-full bg-secondary/60 px-2.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
              title={`Mark as ${MARK_LABEL[nextActionStatus(mark)]}`}
            >
              {MARK_LABEL[MARKABLE_STATUSES.includes(mark) ? mark : 'pending']}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ReviewHub() {
  const [home, setHome] = useState<ReviewHome | null | 'unsupported'>(null);
  const [error, setError] = useState('');
  const [marks, setMarks] = useState<Record<string, ReviewActionStatus>>({});
  const stream = useNdjsonRun();
  const reads = useContextScope('review');

  const refresh = useCallback(async () => {
    try {
      const body = await loadReviewHome();
      setHome(body ?? 'unsupported');
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function run() {
    if (home === null || home === 'unsupported' || stream.status === 'running') return;
    const outcome = await stream.start('/api/solo/review/run', {
      carried_statuses: carriedStatusesPayload(home.carried, marks),
      ...reads.body(),
    });
    // A failed run recorded nothing, so the marks are still the user's to send.
    if (outcome !== 'done') return;
    setMarks({});
    await refresh();
  }

  async function remove(runId: number) {
    try {
      await deleteReview(runId);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (home === 'unsupported')
    return (
      <Notice
        title="Weekly Review needs a newer yeaboi"
        items={['Update the backend from the settings page to review your week here.']}
      />
    );
  if (error && !home) return <Notice title="Could not load your reviews" items={[error]} />;
  if (!home) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  const running = stream.status === 'running';

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-foreground flex items-center gap-2">
            Weekly Review <BetaChip />
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            Your own week, reviewed: what went well, what to change, and whether you are on track
            against your plan.
          </p>
        </div>
        <Button size="sm" onClick={() => void run()} disabled={running}>
          {running ? 'Reviewing…' : "Run this week's review"}
        </Button>
      </header>

      <ContextPicker
        mode="review"
        options={reads.options}
        scope={reads.scope}
        onChange={reads.setScope}
        disabled={running}
      />

      {home.beta_notice && (
        <div className="rounded-2xl bg-card ring-1 ring-border/60 p-4">
          <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <DuckMark state="idle" size={20} /> {home.beta_notice}
          </p>
        </div>
      )}
      {error && <Notice title="Something went wrong" items={[error]} />}
      {stream.run.error && <Notice title="The review stopped" items={[stream.run.error]} />}

      {running && (
        <Section title="Working">
          <ol className="space-y-1">
            {stream.run.phases.map((phase, index) => (
              <li key={`${index}-${phase}`} className="text-[12px] text-muted-foreground">
                {phase}
              </li>
            ))}
            {!stream.run.phases.length && (
              <li className="text-[12px] text-muted-foreground">Starting…</li>
            )}
          </ol>
          <p className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
            <DuckMark state="idle" size={20} /> A review cannot be stopped part-way — it finishes or
            it fails.
          </p>
        </Section>
      )}

      <Section title="Carried into this week">
        <p className="text-[12px] text-muted-foreground mb-3">
          Mark what happened to last week's actions before you run; the review acknowledges the wins
          and rolls the rest forward.
        </p>
        <CarriedList
          carried={home.carried}
          marks={marks}
          onMark={(id, status) => setMarks((all) => ({ ...all, [id]: status }))}
        />
      </Section>

      {home.latest ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[13px] font-body font-medium text-foreground">
              {reviewHeadline(home.latest.review)}
            </h2>
            <Link
              href={`/solo/review/report?id=${home.latest.run_id}`}
              className={buttonVariants({ size: 'sm', variant: 'secondary' })}
            >
              Open
            </Link>
          </div>
          <ReviewBody review={home.latest.review} />
        </>
      ) : (
        <Section title="No reviews yet">
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <DuckMark state="idle" size={28} /> Run one on a Friday: yeaboi reads your standups,
            what shipped and your sprint plan, then drafts the review for you to correct.
          </div>
        </Section>
      )}

      {home.history.length > 0 && (
        <Section title="Past weeks">
          <ul className="space-y-2">
            {home.history.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3">
                <Link
                  href={`/solo/review/report?id=${row.id}`}
                  className="text-[12px] text-foreground hover:underline"
                >
                  Week {row.week_label}
                  {row.project_name ? ` · ${row.project_name}` : ''}
                  <span className="text-muted-foreground">
                    {' '}
                    · {row.action_count} action{row.action_count === 1 ? '' : 's'}
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => void remove(row.id)}
                  className="text-[11px] text-muted-foreground hover:text-destructive"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

export default function ReviewPage() {
  return (
    <PageShell width="narrow">
      <BackendGate>
        <ReviewHub />
      </BackendGate>
    </PageShell>
  );
}
