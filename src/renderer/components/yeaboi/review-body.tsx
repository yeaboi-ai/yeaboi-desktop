'use client';

// One saved Weekly Review, drawn the same way on the hub (latest) and the
// report page (any) — the plan verdict first, then the prose, then the lists.

import { DuckMark } from '@/components/brand/duck';
import { type ReviewAction, type WeeklyReview, confidenceDrift } from '@/lib/yeaboi/modes';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card ring-1 ring-border/60 p-5">
      <h2 className="text-[13px] font-body font-medium text-foreground mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary/40 px-3 py-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-[12px] text-foreground">{value}</p>
    </div>
  );
}

function Bullets({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className="text-[12px] text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-1">
      {items.map((item, index) => (
        <li key={`${index}-${item}`} className="text-[12px] text-foreground">
          {item}
        </li>
      ))}
    </ul>
  );
}

const STATUS_GLYPH: Record<string, string> = {
  pending: '○',
  done: '●',
  dropped: '×',
  carried: '→',
};

export function ActionList({ actions, empty }: { actions: ReviewAction[]; empty: string }) {
  if (!actions.length) return <p className="text-[12px] text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-1">
      {actions.map((action) => (
        <li key={action.id} className="flex items-start gap-2 text-[12px] text-foreground">
          <span className="text-muted-foreground" aria-label={action.status}>
            {STATUS_GLYPH[action.status] ?? '○'}
          </span>
          <span className={action.status === 'dropped' ? 'line-through opacity-60' : ''}>
            {action.text}
          </span>
        </li>
      ))}
    </ul>
  );
}

const PLAN_TONE: Record<string, string> = {
  on_track: 'ring-emerald-500/40',
  at_risk: 'ring-amber-500/40',
  behind: 'ring-destructive/40',
};

export function ReviewBody({ review }: { review: WeeklyReview }) {
  const sprint = review.sprint_total_days
    ? `Day ${review.sprint_day} of ${review.sprint_total_days}${review.sprint_name ? ` · ${review.sprint_name}` : ''}`
    : 'No sprint in flight';
  const drift = confidenceDrift(review);

  return (
    <div className="space-y-4">
      <div
        className={`rounded-2xl bg-card ring-1 ${PLAN_TONE[review.plan_status] ?? 'ring-border/60'} p-4`}
      >
        <p className="text-[13px] font-medium text-foreground">
          {review.plan_line || 'Nothing to measure against yet.'}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          <Stat label="Week" value={`${review.week_start} → ${review.week_end}`} />
          <Stat label="Sprint" value={sprint} />
          <Stat label="Confidence" value={drift || review.confidence_label || '—'} />
          <Stat
            label="Shipped"
            value={`${review.delivered_items.length} of ${review.planned_story_count || '?'} planned`}
          />
        </div>
      </div>

      <Section title="Summary">
        <p className="text-[13px] text-foreground whitespace-pre-wrap">
          {review.summary || 'The model had nothing to add beyond the numbers.'}
        </p>
      </Section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="What went well">
          <Bullets items={review.went_well} empty="Nothing stood out this week." />
        </Section>
        <Section title="What to change">
          <Bullets items={review.to_change} empty="No blockers or repeats to change." />
        </Section>
      </div>

      <Section title="Actions for next week">
        <ActionList actions={review.actions} empty="No new actions proposed." />
      </Section>

      {review.carried_actions.length > 0 && (
        <Section title="Carried from last week">
          <ActionList actions={review.carried_actions} empty="" />
        </Section>
      )}

      {review.standup_lines.length > 0 && (
        <Section title="The week's standups">
          <Bullets items={review.standup_lines} empty="" />
        </Section>
      )}

      {review.warnings.length > 0 && (
        <div className="rounded-2xl bg-card ring-1 ring-border/60 p-4">
          <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <DuckMark state="idle" size={20} /> {review.warnings.join(' · ')}
          </p>
        </div>
      )}
    </div>
  );
}
