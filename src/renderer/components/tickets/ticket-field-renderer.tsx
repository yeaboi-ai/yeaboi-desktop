'use client';

import type { Card, CardUpdate } from '@/hooks/use-board';
import type {
  TicketBoardColumn,
  TicketLink,
  TicketComment,
  TicketActivityEvent,
} from '@/hooks/use-ticket';
import type { FieldLayoutEntry } from '@/hooks/use-ticket-templates';
import { Input } from '@/components/ui/input';
import { AcceptanceCriteria } from './acceptance-criteria';
import {
  AssigneeSelect,
  FibonacciPoints,
  LabelsEditor,
  PriorityChips,
  SidebarSection,
  StatusSelect,
  SyncControls,
} from './ticket-sidebar';
import { TicketActivity } from './ticket-activity';
import { TicketDescription } from './ticket-description';
import { TicketLinksPanel } from './ticket-links-panel';

interface TeamMember {
  id: string;
  name: string | null;
  email: string;
}

export interface FieldRendererContext {
  card: Card;
  teamMembers: TeamMember[];
  boardColumns: TicketBoardColumn[];
  availableLabels: string[];
  links: TicketLink[];
  comments: TicketComment[];
  events: TicketActivityEvent[];
  beginEditing: () => void;
  endEditing: () => void;
  persistPatch: (patch: CardUpdate) => Promise<void> | void;
  addComment: (content: string) => Promise<void>;
}

/** Renders a single field based on the layout entry's type. Used both in the
 *  main column and the sidebar — the entry's `placement` is decided upstream
 *  in the workspace, this component just dispatches on `type` and wraps with
 *  a `<SidebarSection label>` when the placement calls for it.
 *
 *  Pass `headless` when an outer toolbar already renders the field's label
 *  (e.g. layout-edit mode). The renderer then returns the body without any
 *  heading wrapper to avoid duplicate labels.
 */
export function TicketField({
  entry,
  ctx,
  inSidebar,
  headless = false,
}: {
  entry: FieldLayoutEntry;
  ctx: FieldRendererContext;
  inSidebar: boolean;
  headless?: boolean;
}) {
  if (!entry.visible) return null;

  const body = renderFieldBody(entry, ctx, headless);
  if (body == null) return null;

  if (headless) return <>{body}</>;

  if (inSidebar) {
    return <SidebarSection label={entry.label}>{body}</SidebarSection>;
  }

  if (needsMainHeading(entry)) {
    return (
      <section>
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
          {entry.label}
        </h3>
        {body}
      </section>
    );
  }
  return <>{body}</>;
}

function needsMainHeading(entry: FieldLayoutEntry): boolean {
  // The big main-column components carry their own heading already; custom
  // main-column fields and any future ones don't.
  return !['rich_text', 'acceptance_criteria', 'activity'].includes(entry.type);
}

function renderFieldBody(
  entry: FieldLayoutEntry,
  ctx: FieldRendererContext,
  headless: boolean,
): React.ReactNode {
  const { card, persistPatch } = ctx;
  switch (entry.type) {
    case 'title':
      // Title renders in the header; nothing to draw in main/sidebar.
      return null;
    case 'rich_text':
      return (
        <TicketDescription
          label={entry.label}
          description={card.description}
          acceptanceCriteria={[]}
          showAcceptanceCriteria={false}
          showHeading={!headless}
          cardId={card.id}
          onDescriptionChange={(description) => void persistPatch({ description })}
          onAcceptanceCriteriaChange={() => {}}
          onEditingStart={ctx.beginEditing}
          onEditingStop={ctx.endEditing}
        />
      );
    case 'acceptance_criteria':
      return (
        <AcceptanceCriteria
          criteria={card.acceptance_criteria}
          onChange={(next) => void persistPatch({ acceptance_criteria: next })}
          showHeading={!headless}
        />
      );
    case 'activity':
      return (
        <TicketActivity
          cardId={card.id}
          comments={ctx.comments}
          events={ctx.events}
          onAddComment={ctx.addComment}
        />
      );
    case 'status':
      return (
        <StatusSelect
          card={card}
          columns={ctx.boardColumns}
          onPatch={(p) => void persistPatch(p)}
        />
      );
    case 'priority':
      return (
        <PriorityChips priority={card.priority ?? null} onPatch={(p) => void persistPatch(p)} />
      );
    case 'assignee':
      return (
        <AssigneeSelect
          card={card}
          teamMembers={ctx.teamMembers}
          onPatch={(p) => void persistPatch(p)}
        />
      );
    case 'story_points':
      return (
        <FibonacciPoints
          value={card.story_points}
          onChange={(v) => void persistPatch({ story_points: v })}
        />
      );
    case 'labels':
      return (
        <LabelsEditor
          labels={card.labels}
          available={ctx.availableLabels}
          onChange={(next) => void persistPatch({ labels: next })}
        />
      );
    case 'sync':
      return <SyncControls card={card} />;
    case 'links':
      return <TicketLinksPanel cardId={card.id} initial={ctx.links} />;
    case 'text':
    case 'number':
    case 'date':
    case 'url':
    case 'select':
    case 'multi_select':
      return <CustomFieldInput entry={entry} card={card} persistPatch={persistPatch} />;
    default:
      return null;
  }
}

// Generic editor for a single custom field, sourced from card.custom_fields.
export function CustomFieldInput({
  entry,
  card,
  persistPatch,
}: {
  entry: FieldLayoutEntry;
  card: Card;
  persistPatch: FieldRendererContext['persistPatch'];
}) {
  const slug = entry.key.replace(/^custom:/, '');
  const value = (card.custom_fields ?? {})[slug];

  const update = (next: unknown) => {
    const merged = { ...(card.custom_fields ?? {}), [slug]: next };
    void persistPatch({ custom_fields: merged } as unknown as CardUpdate);
  };

  switch (entry.type) {
    case 'number':
      return (
        <Input
          type="number"
          value={value == null ? '' : String(value)}
          onChange={(e) => update(e.target.value === '' ? null : Number(e.target.value))}
        />
      );
    case 'date':
      return (
        <Input
          type="date"
          value={value == null ? '' : String(value)}
          onChange={(e) => update(e.target.value || null)}
        />
      );
    case 'url':
      return (
        <Input
          type="url"
          placeholder="https://"
          value={value == null ? '' : String(value)}
          onChange={(e) => update(e.target.value)}
        />
      );
    case 'select':
      return (
        <select
          value={value == null ? '' : String(value)}
          onChange={(e) => update(e.target.value || null)}
          className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="">—</option>
          {(entry.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    case 'multi_select': {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-1">
          {(entry.options ?? []).map((opt) => {
            const active = arr.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => update(active ? arr.filter((x) => x !== opt) : [...arr, opt])}
                className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                  active
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      );
    }
    default:
      return (
        <Input
          value={value == null ? '' : String(value)}
          onChange={(e) => update(e.target.value)}
        />
      );
  }
}
