'use client';

// A card the engine pushed into the conversation: the section it stands for,
// drawn from the plan view so the chat can never drift from what the
// pipeline produced, and a line into the blueprint for the rest.

import {
  artifactSection,
  sectionItems,
  SECTION_TITLES,
  type PlanView,
} from '@/lib/planning/plan-view';

const CARD_TITLES: Record<string, string> = {
  intake_summary: 'Your answers',
  prior_art: 'Prior art',
  analysis: 'Analysis',
  epic: 'Epic',
  features: 'Features',
  stories: 'Stories',
  tasks: 'Tasks',
  sprints: 'Sprints',
  sprint_plan: 'Sprints',
  recap: 'The plan',
};

const SHOWN = 6;

export function ArtifactCard({
  kind,
  plan,
  onOpen,
}: {
  kind: string;
  plan: PlanView | null;
  onOpen: () => void;
}) {
  const section = artifactSection(kind);
  const items = section ? sectionItems(plan, section) : [];
  const title = CARD_TITLES[kind] ?? (section ? SECTION_TITLES[section] : kind);
  const more = items.length - SHOWN;
  return (
    <div className="max-w-[88%] rounded-2xl bg-card px-4 py-3 ring-1 ring-border/60">
      <p className="font-display text-[16px] text-foreground">{title}</p>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {items.slice(0, SHOWN).map((item) => (
            <li key={item.id} className="text-[13px] leading-snug text-foreground/90">
              {item.text}
              {item.note && <span className="ml-2 text-muted-foreground">{item.note}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[12px] text-muted-foreground">Read it in full in the blueprint.</p>
      )}
      <button
        type="button"
        onClick={onOpen}
        className="mt-2 text-[12px] text-primary underline-offset-2 hover:underline"
      >
        {more > 0 ? `${more} more in the blueprint` : 'Open in the blueprint'}
      </button>
    </div>
  );
}
