'use client';

import { Link as LinkIcon, MessageSquare, RefreshCw } from 'lucide-react';
import type { Card, CardUpdate } from '@/hooks/use-board';
import type { FieldLayoutEntry } from '@/hooks/use-ticket-templates';
import { CustomFieldInput } from './ticket-field-renderer';
import { RichTextEditor } from './rich-text-editor';
import {
  AssigneeSelect,
  FibonacciPoints,
  LabelsEditor,
  PriorityChips,
  StatusSelect,
} from './ticket-sidebar';

// Sample card the Studio Template tab binds preview-mode renderers to. Values
// pulled from the draft (defaults) override these where set.
export interface PreviewDraftDefaults {
  defaultPriority: string | null;
  defaultStoryPoints: number | null;
  defaultLabels: string[];
}

const SAMPLE_CARD_BASE: Card = {
  id: 'preview',
  column_id: 'preview-col',
  position: 0,
  title: 'Example feature ticket',
  description: 'Sample description shown in the Studio preview.',
  priority: 'medium',
  story_points: null,
  assignee_id: null,
  labels: [],
  acceptance_criteria: [
    { text: 'User can …', done: false },
    { text: 'System persists …', done: true },
  ],
  parent_card_id: null,
  depends_on: [],
  auto_approve: false,
  agent_status: null,
  agent_pr_url: null,
  agent_branch: null,
  agent_log: [],
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
  custom_fields: {},
};

export function buildSampleCard(d: PreviewDraftDefaults): Card {
  return {
    ...SAMPLE_CARD_BASE,
    priority: d.defaultPriority ?? SAMPLE_CARD_BASE.priority,
    story_points: d.defaultStoryPoints,
    labels: d.defaultLabels,
  };
}

const NOOP_PATCH: (p: CardUpdate) => void = () => {};

// In Studio Template tab the surrounding `LayoutEditToolbar` already renders
// the field's label as an editable input that visually matches a section
// heading, so this dispatcher renders ONLY the body. No outer SidebarSection,
// no h3 wrapper — the toolbar owns the label.
export function TemplatePreviewField({
  entry,
  draftDefaults,
}: {
  entry: FieldLayoutEntry;
  draftDefaults: PreviewDraftDefaults;
}) {
  return <>{renderPreviewBody(entry, draftDefaults)}</>;
}

function renderPreviewBody(entry: FieldLayoutEntry, d: PreviewDraftDefaults): React.ReactNode {
  switch (entry.type) {
    case 'title':
      return null;
    case 'rich_text':
      return <PreviewDescription />;
    case 'acceptance_criteria':
      return <PreviewAcceptanceCriteria />;
    case 'activity':
      return (
        <PreviewStub
          icon={<MessageSquare className="h-3.5 w-3.5" />}
          text="Comments and activity will appear here"
        />
      );
    case 'status':
      return <StatusSelect card={buildSampleCard(d)} columns={[]} onPatch={NOOP_PATCH} />;
    case 'priority':
      return <PriorityChips priority={d.defaultPriority ?? 'medium'} onPatch={NOOP_PATCH} />;
    case 'assignee':
      return <AssigneeSelect card={buildSampleCard(d)} teamMembers={[]} onPatch={NOOP_PATCH} />;
    case 'story_points':
      return <FibonacciPoints value={d.defaultStoryPoints} onChange={() => {}} />;
    case 'labels':
      return (
        <LabelsEditor labels={d.defaultLabels} available={d.defaultLabels} onChange={() => {}} />
      );
    case 'sync':
      return (
        <PreviewStub
          icon={<RefreshCw className="h-3.5 w-3.5" />}
          text="Jira / Azure DevOps push controls"
        />
      );
    case 'links':
      return (
        <PreviewStub icon={<LinkIcon className="h-3.5 w-3.5" />} text="Linked tickets and PRs" />
      );
    case 'text':
    case 'number':
    case 'date':
    case 'url':
    case 'select':
    case 'multi_select':
      return <CustomFieldInput entry={entry} card={buildSampleCard(d)} persistPatch={NOOP_PATCH} />;
    default:
      return null;
  }
}

function PreviewDescription() {
  return (
    <RichTextEditor
      value="<p>Sample description with <strong>rich formatting</strong>. Drop images, paste files, add headings — see the toolbar above.</p>"
      readOnly
    />
  );
}

function PreviewAcceptanceCriteria() {
  return (
    <ul className="text-sm space-y-1 text-muted-foreground">
      <li className="flex items-center gap-2">
        <input type="checkbox" readOnly /> User can complete the primary flow
      </li>
      <li className="flex items-center gap-2">
        <input type="checkbox" checked readOnly />{' '}
        <span className="line-through">System persists the result across reloads</span>
      </li>
    </ul>
  );
}

function PreviewStub({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 flex items-center gap-2 text-xs text-muted-foreground">
      {icon}
      {text}
    </div>
  );
}
