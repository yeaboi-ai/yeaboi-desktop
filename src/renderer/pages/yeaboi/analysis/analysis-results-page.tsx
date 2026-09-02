'use client';

// Team Analysis results — the cards a run earned.
//
// The card list and its order come from the backend (analysis/dashboard.py);
// every number below is read straight off the stored TeamProfile, so this page
// and the terminal's are looking at the same figures.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'react-router';
import { maskText } from '@/lib/yeaboi/boards';
import { type AnalysisResult, loadAnalysisResult } from '@/lib/yeaboi/dashboards';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { useAudience } from '@/components/providers/audience-provider';
import { ResultActions } from '@/components/yeaboi/result-actions';
import { Badge } from '@/components/ui/badge';

type Profile = Record<string, any>;

const pct = (value: number | undefined) => `${Math.round(value ?? 0)}%`;
const num = (value: number | undefined, digits = 1) => (value ?? 0).toFixed(digits);

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

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary/40 px-3 py-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-[13px] font-medium text-foreground">{value}</p>
    </div>
  );
}

function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">{children}</div>;
}

function DataTable({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px] text-left">
        <thead>
          <tr>
            {head.map((label) => (
              <th
                key={label}
                className="py-1.5 pr-3 text-[10px] uppercase tracking-wide text-muted-foreground font-medium"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-foreground">{children}</tbody>
      </table>
    </div>
  );
}

const cell = 'py-1.5 pr-3 border-t border-border/40';

function AnalysisResultsBody() {
  // The result's team id rides the query string so the route path stays a
  // literal (the old page read it off the hash).
  const { audience } = useAudience();
  const [searchParams] = useSearchParams();
  const teamId = searchParams.get('id') ?? '';
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [open, setOpen] = useState('');
  const [error, setError] = useState('');
  const [mask, setMask] = useState<[string, string][]>([]);
  const [anonNote, setAnonNote] = useState('');

  useEffect(() => {
    if (!teamId) {
      setError('No analysis was named — pick one from Team Analysis.');
      return;
    }
    loadAnalysisResult(teamId, { solo: audience === 'solo' }).then(
      (body) => {
        setResult(body);
        setOpen(body.cards[0]?.key ?? '');
      },
      (e: Error) => setError(e.message),
    );
  }, [teamId, audience]);

  if (error) return <Notice title="Could not open that analysis" items={[error]} />;
  if (!result) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  const profile = result.profile as Profile;

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl text-foreground">
            {maskText(profile.team_name || profile.project_key, mask)}
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            {profile.source} · {profile.sample_sprints} sprints · {profile.sample_stories} stories ·{' '}
            {profile.updated_at || profile.created_at}
          </p>
        </div>
        <Link
          href="/team/analysis"
          className="text-[12px] text-muted-foreground hover:text-foreground"
        >
          All analyses
        </Link>
      </header>

      <ResultActions
        refer={{ kind: 'analysis', session_id: teamId }}
        mode="analysis"
        anonNote={anonNote}
        onAnonymize={(replacements, note) => {
          setMask(replacements);
          setAnonNote(note);
        }}
      />

      <div className="flex flex-wrap gap-1.5">
        {result.cards.map((card) => (
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

      <ResultCard
        cardKey={open}
        title={result.cards.find((c) => c.key === open)?.title ?? ''}
        profile={profile}
        examples={result.examples}
      />
    </div>
  );
}

function ResultCard({
  cardKey,
  title,
  profile,
  examples,
}: {
  cardKey: string;
  title: string;
  profile: Profile;
  examples: Record<string, any>;
}) {
  switch (cardKey) {
    case 'velocity':
      return (
        <Section title={title}>
          <StatGrid>
            <StatTile label="Velocity" value={`${num(profile.velocity_avg, 0)} pts`} />
            <StatTile label="Variance" value={`± ${num(profile.velocity_stddev, 0)}`} />
            <StatTile label="Completion" value={pct(profile.sprint_completion_rate)} />
            <StatTile label="Spill" value={pct(profile.spillover?.carried_over_pct)} />
          </StatGrid>
          <p className="text-[13px] text-muted-foreground">
            {profile.sprints_fully_completed} sprint
            {profile.sprints_fully_completed === 1 ? '' : 's'} finished whole,{' '}
            {profile.sprints_partially_completed} did not.
          </p>
          {profile.spillover?.most_common_spillover_reason && (
            <p className="text-[11px] text-muted-foreground mt-2">
              Most work spills because: {profile.spillover.most_common_spillover_reason}
            </p>
          )}
        </Section>
      );

    case 'team':
      return (
        <Section title={title}>
          <StatGrid>
            <StatTile label="Stories analysed" value={String(profile.sample_stories ?? 0)} />
            <StatTile label="Sprints analysed" value={String(profile.sample_sprints ?? 0)} />
            <StatTile
              label="Avg spill / sprint"
              value={`${num(profile.spillover?.avg_spillover_pts)} pts`}
            />
          </StatGrid>
          <ContributorList examples={examples} />
        </Section>
      );

    case 'estimation':
      return (
        <Section title={title}>
          <StatGrid>
            <StatTile label="Estimates hold" value={pct(profile.estimation_accuracy_pct)} />
          </StatGrid>
          <DataTable head={['Points', 'Cycle time', 'Tasks', 'Overshoot', 'Sample']}>
            {(profile.point_calibrations ?? []).map((cal: Profile) => (
              <tr key={cal.point_value}>
                <td className={cell}>{cal.point_value}</td>
                <td className={cell}>{num(cal.avg_cycle_time_days)} days</td>
                <td className={cell}>{num(cal.typical_task_count)}</td>
                <td className={cell}>{pct(cal.overshoot_pct)}</td>
                <td className={cell}>{cal.sample_count}</td>
              </tr>
            ))}
          </DataTable>
          {!(profile.point_calibrations ?? []).length && (
            <p className="text-[13px] text-muted-foreground">
              Not enough estimated stories to calibrate points yet.
            </p>
          )}
        </Section>
      );

    case 'workflow': {
      const dod = profile.dod_signal ?? {};
      return (
        <Section title={title}>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
            <StatTile label="Have comments" value={pct(dod.stories_with_comments_pct)} />
            <StatTile label="Link a PR" value={pct(dod.stories_with_pr_link_pct)} />
            <StatTile label="Mention review" value={pct(dod.stories_with_review_mention_pct)} />
            <StatTile label="Mention testing" value={pct(dod.stories_with_testing_mention_pct)} />
            <StatTile label="Mention deploy" value={pct(dod.stories_with_deploy_mention_pct)} />
          </div>
          <h3 className="text-[12px] font-medium text-foreground mb-2">
            What actually happens before a ticket closes
          </h3>
          <ul className="list-disc pl-5 space-y-1 text-[13px] text-muted-foreground">
            {(dod.common_checklist_items ?? []).map((item: string) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {!(dod.common_checklist_items ?? []).length && (
            <p className="text-[13px] text-muted-foreground">
              No consistent pre-close behaviour was detectable.
            </p>
          )}
        </Section>
      );
    }

    case 'writing': {
      const writing = profile.writing_patterns ?? {};
      return (
        <Section title={title}>
          <StatGrid>
            <StatTile label="Median ACs" value={num(writing.median_ac_count)} />
            <StatTile label="Median tasks" value={num(writing.median_task_count_per_story)} />
            <StatTile
              label="Stories with subtasks"
              value={pct(writing.stories_with_subtasks_pct)}
            />
            <StatTile label="Epics described" value={pct(writing.epics_with_description_pct)} />
          </StatGrid>
          <p className="flex flex-wrap gap-1.5">
            <Badge variant={writing.uses_given_when_then ? 'default' : 'outline'}>
              {writing.uses_given_when_then ? 'Given/When/Then' : 'Prose acceptance criteria'}
            </Badge>
            <Badge variant={writing.subtasks_use_consistent_naming ? 'default' : 'outline'}>
              {writing.subtasks_use_consistent_naming
                ? 'Consistent subtask naming'
                : 'Subtask naming varies'}
            </Badge>
          </p>
          {(writing.common_personas ?? []).length ? (
            <p className="text-[11px] text-muted-foreground mt-2">
              Personas used: {(writing.common_personas ?? []).join(', ')}
            </p>
          ) : null}
          {(writing.common_subtask_patterns ?? []).length ? (
            <>
              <h3 className="text-[12px] font-medium text-foreground mt-3 mb-2">
                Recurring subtasks
              </h3>
              <ul className="list-disc pl-5 space-y-1 text-[13px] text-muted-foreground">
                {(writing.common_subtask_patterns ?? []).map((pattern: string) => (
                  <li key={pattern}>{pattern}</li>
                ))}
              </ul>
            </>
          ) : null}
        </Section>
      );
    }

    case 'trends':
      return (
        <Section title={title}>
          <h3 className="text-[12px] font-medium text-foreground mb-2">
            Story shapes by discipline
          </h3>
          <DataTable head={['Discipline', 'Avg points', 'Avg ACs', 'Avg tasks', 'Sample']}>
            {(profile.story_shapes ?? []).map((shape: Profile) => (
              <tr key={shape.discipline}>
                <td className={cell}>{shape.discipline}</td>
                <td className={cell}>{num(shape.avg_points)}</td>
                <td className={cell}>{num(shape.avg_ac_count)}</td>
                <td className={cell}>{num(shape.avg_task_count)}</td>
                <td className={cell}>{shape.sample_count}</td>
              </tr>
            ))}
          </DataTable>
          {!(profile.story_shapes ?? []).length && (
            <p className="text-[13px] text-muted-foreground">
              Not enough labelled stories to compare disciplines.
            </p>
          )}
        </Section>
      );

    case 'recommendations':
      return (
        <Section title={title}>
          <RecommendationList examples={examples} />
        </Section>
      );

    case 'ai-adoption': {
      const ai = profile.ai_adoption ?? {};
      return (
        <Section title={title}>
          <StatGrid>
            <StatTile label="Footprint" value={pct(ai.footprint_pct)} />
            <StatTile label="Commits read" value={String(ai.scanned_commits ?? 0)} />
            <StatTile label="PRs read" value={String(ai.scanned_prs ?? 0)} />
            <StatTile label="AI-marked" value={String((ai.ai_commits ?? 0) + (ai.ai_prs ?? 0))} />
          </StatGrid>
          <Notice
            title="This is a lower bound"
            items={[
              'Only tools that leave a textual trace in commit or PR metadata are counted. Inline autocomplete leaves none, so real usage is at least this.',
            ]}
          />
          {(ai.per_tool ?? []).length ? (
            <>
              <h3 className="text-[12px] font-medium text-foreground mt-3 mb-2">By tool</h3>
              <ul className="list-disc pl-5 space-y-1 text-[13px] text-muted-foreground">
                {(ai.per_tool ?? []).map(([tool, count]: [string, number]) => (
                  <li key={tool}>
                    {tool} — {count}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {(ai.repos_scanned ?? []).length ? (
            <p className="text-[11px] text-muted-foreground mt-2">
              Scanned: {(ai.repos_scanned ?? []).join(', ')}
            </p>
          ) : null}
        </Section>
      );
    }

    case 'code-health':
      return (
        <Section title={title}>
          <HealthTable examples={examples} />
        </Section>
      );

    case 'documentation': {
      const docs = profile.doc_quality ?? {};
      return (
        <Section title={title}>
          <StatGrid>
            <StatTile label="Pages read" value={String(docs.pages_scanned ?? 0)} />
            <StatTile label="Clarity" value={num(docs.avg_clarity, 0)} />
            <StatTile label="Usefulness" value={num(docs.avg_usefulness, 0)} />
            <StatTile label="With an owner" value={String(docs.owned_pages ?? 0)} />
          </StatGrid>
          <p className="text-[13px] text-muted-foreground">
            {docs.clear_pages ?? 0} clear · {docs.mixed_pages ?? 0} mixed ·{' '}
            {docs.unclear_pages ?? 0} unclear · {docs.ai_marked_pages ?? 0} disclose AI help
          </p>
          {(docs.flagged_pages ?? []).length ? (
            <>
              <h3 className="text-[12px] font-medium text-foreground mt-3 mb-2">Worth a look</h3>
              <ul className="list-disc pl-5 space-y-1 text-[13px] text-muted-foreground">
                {(docs.flagged_pages ?? []).map(([pageTitle, reason]: [string, string]) => (
                  <li key={pageTitle}>
                    <strong className="text-foreground font-medium">{pageTitle}</strong> — {reason}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Section>
      );
    }

    case 'insights':
      return (
        <Section title={title}>
          <InsightGroups examples={examples} />
        </Section>
      );

    default:
      return null;
  }
}

function ContributorList({ examples }: { examples: Record<string, any> }) {
  const contributors: Profile[] = examples?.contributors ?? examples?.member_activity ?? [];
  if (!contributors.length) {
    return (
      <p className="text-[13px] text-muted-foreground">No per-person breakdown in this run.</p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {contributors.map((person) => (
        <li key={person.name} className="text-[13px] text-muted-foreground">
          <strong className="text-foreground font-medium">{person.name}</strong>{' '}
          <span>
            {person.stories ?? person.completed ?? 0} stories · {num(person.points ?? 0, 0)} pts
          </span>
        </li>
      ))}
    </ul>
  );
}

function RecommendationList({ examples }: { examples: Record<string, any> }) {
  const items: (string | Profile)[] = examples?.recommendations ?? [];
  if (!items.length) {
    return (
      <p className="text-[13px] text-muted-foreground">
        Nothing to recommend — this team&apos;s numbers hold together.
      </p>
    );
  }
  return (
    <ul className="list-disc pl-5 space-y-1 text-[13px] text-muted-foreground">
      {items.map((item, index) => (
        <li key={typeof item === 'string' ? item : index}>
          {typeof item === 'string' ? item : item.text}
        </li>
      ))}
    </ul>
  );
}

function HealthTable({ examples }: { examples: Record<string, any> }) {
  const health = examples?.repository_health ?? examples?.ai_adoption?.repository_health ?? {};
  const rows = Object.entries(health as Record<string, any>);
  if (!rows.length) {
    return <p className="text-[13px] text-muted-foreground">No code-health signal in this run.</p>;
  }
  return (
    <DataTable head={['Repository', 'Signal']}>
      {rows.map(([repo, value]) => (
        <tr key={repo}>
          <td className={cell}>{repo}</td>
          <td className={cell}>
            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
          </td>
        </tr>
      ))}
    </DataTable>
  );
}

function InsightGroups({ examples }: { examples: Record<string, any> }) {
  const insights = examples?.insights ?? {};
  const groups: [string, string][] = [
    ['start', 'Start'],
    ['stop', 'Stop'],
    ['keep', 'Keep'],
    ['try', 'Try'],
  ];
  const any = groups.some(([key]) => (insights[key] ?? []).length);
  if (!any) {
    return (
      <p className="text-[13px] text-muted-foreground">
        No coaching insights in this run — it may have been a quick pass.
      </p>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {groups.map(([key, label]) => (
        <div key={key}>
          <h3 className="text-[12px] font-medium text-foreground mb-2">{label}</h3>
          <ul className="list-disc pl-5 space-y-1 text-[13px] text-muted-foreground">
            {(insights[key] ?? []).map((item: string | Profile, index: number) => (
              <li key={typeof item === 'string' ? item : index}>
                {typeof item === 'string' ? item : item.text}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function AnalysisResultsPage() {
  return (
    <BackendGate>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <AnalysisResultsBody />
      </div>
    </BackendGate>
  );
}
