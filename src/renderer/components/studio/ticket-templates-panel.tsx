'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Loader2, Plus, Save, Trash2, Wand2, X } from 'lucide-react';
import { TemplateBadge } from '@/components/tickets/template-badge';
import {
  AddCustomFieldButton,
  LayoutZoneDroppable,
  SortableLayoutField,
} from '@/components/tickets/ticket-layout-edit';
import {
  TemplatePreviewField,
  type PreviewDraftDefaults,
} from '@/components/tickets/template-preview-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuthFetch } from '@/hooks/use-auth-fetch';

// Schema mirrors backend `schemas/ticket_template.py`. We keep this colocated
// rather than sharing a generated client so the studio panel ships independently.
interface FieldSchemaEntry {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options?: string[] | null;
}

export interface FieldLayoutEntry {
  key: string;
  label: string;
  type: string;
  source: 'builtin' | 'custom';
  placement: 'main' | 'sidebar' | 'header';
  visible: boolean;
  required: boolean;
  options?: string[] | null;
}

interface TicketTemplate {
  id: string;
  org_id: string;
  project_id: string | null;
  slug: string;
  name: string;
  description: string | null;
  icon: string;
  default_priority: string | null;
  default_story_points: number | null;
  default_labels: string[];
  prompt_fragment: string;
  field_schema: FieldSchemaEntry[];
  field_layout: FieldLayoutEntry[];
  acceptance_criteria_template: string[];
  applicability: { sections?: string[] };
  is_system: boolean;
  version: number;
  sort_order: number;
}

interface Draft {
  name: string;
  description: string;
  icon: string;
  default_priority: string;
  default_story_points: string;
  default_labels: string;
  prompt_fragment: string;
  field_layout: FieldLayoutEntry[];
  acceptance_criteria_template: string;
  applicability_sections: string;
}

// Default layout used when seeding the editor for a brand-new template so the
// Template tab isn't empty before the row hits the database. The backend's
// `default_field_layout` will replace this on save with the canonical seed.
const DEFAULT_FIELD_LAYOUT: FieldLayoutEntry[] = [
  {
    key: 'title',
    label: 'Title',
    type: 'title',
    source: 'builtin',
    placement: 'header',
    visible: true,
    required: true,
  },
  {
    key: 'description',
    label: 'Description',
    type: 'rich_text',
    source: 'builtin',
    placement: 'main',
    visible: true,
    required: false,
  },
  {
    key: 'acceptance_criteria',
    label: 'Acceptance criteria',
    type: 'acceptance_criteria',
    source: 'builtin',
    placement: 'main',
    visible: true,
    required: false,
  },
  {
    key: 'activity',
    label: 'Activity',
    type: 'activity',
    source: 'builtin',
    placement: 'main',
    visible: true,
    required: false,
  },
  {
    key: 'status',
    label: 'Status',
    type: 'status',
    source: 'builtin',
    placement: 'sidebar',
    visible: true,
    required: false,
  },
  {
    key: 'priority',
    label: 'Priority',
    type: 'priority',
    source: 'builtin',
    placement: 'sidebar',
    visible: true,
    required: false,
  },
  {
    key: 'assignee',
    label: 'Assignee',
    type: 'assignee',
    source: 'builtin',
    placement: 'sidebar',
    visible: true,
    required: false,
  },
  {
    key: 'story_points',
    label: 'Story points',
    type: 'story_points',
    source: 'builtin',
    placement: 'sidebar',
    visible: true,
    required: false,
  },
  {
    key: 'labels',
    label: 'Labels',
    type: 'labels',
    source: 'builtin',
    placement: 'sidebar',
    visible: true,
    required: false,
  },
  {
    key: 'sync',
    label: 'Sync',
    type: 'sync',
    source: 'builtin',
    placement: 'sidebar',
    visible: true,
    required: false,
  },
  {
    key: 'links',
    label: 'Links',
    type: 'links',
    source: 'builtin',
    placement: 'sidebar',
    visible: true,
    required: false,
  },
];

const EMPTY_DRAFT: Draft = {
  name: '',
  description: '',
  icon: 'zap',
  default_priority: '',
  default_story_points: '',
  default_labels: '',
  prompt_fragment: '',
  field_layout: DEFAULT_FIELD_LAYOUT,
  acceptance_criteria_template: '',
  applicability_sections: '',
};

const PRIORITIES = ['', 'critical', 'high', 'medium', 'low'];

function templateToDraft(t: TicketTemplate): Draft {
  return {
    name: t.name,
    description: t.description ?? '',
    icon: t.icon,
    default_priority: t.default_priority ?? '',
    default_story_points: t.default_story_points != null ? String(t.default_story_points) : '',
    default_labels: t.default_labels.join(', '),
    prompt_fragment: t.prompt_fragment,
    field_layout: t.field_layout?.length ? t.field_layout : DEFAULT_FIELD_LAYOUT,
    acceptance_criteria_template: (t.acceptance_criteria_template ?? []).join('\n'),
    applicability_sections: (t.applicability?.sections ?? []).join(', '),
  };
}

function draftToBody(d: Draft) {
  // Custom fields are derived from the unified layout for the back-compat
  // ``field_schema`` field. The unified layout itself is the authoritative
  // source the backend stores.
  const customFields: FieldSchemaEntry[] = d.field_layout
    .filter((f) => f.source === 'custom' && f.label.trim())
    .map((f) => ({
      key: f.key.replace(/^custom:/, ''),
      label: f.label.trim(),
      type: f.type,
      required: f.required,
      options: f.options ?? null,
    }));

  return {
    name: d.name.trim(),
    description: d.description.trim() || null,
    icon: d.icon || 'zap',
    default_priority: d.default_priority || null,
    default_story_points: d.default_story_points ? Number(d.default_story_points) : null,
    default_labels: d.default_labels
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    prompt_fragment: d.prompt_fragment,
    field_schema: customFields,
    field_layout: d.field_layout,
    acceptance_criteria_template: d.acceptance_criteria_template
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
    applicability: {
      sections: d.applicability_sections
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    },
  };
}

export function TicketTemplatesPanel() {
  const { authFetch, ready } = useAuthFetch();
  const [templates, setTemplates] = useState<TicketTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    const resp = await authFetch('/api/ticket-templates');
    if (resp.ok) {
      setTemplates(await resp.json());
    }
    setLoading(false);
  }, [authFetch, ready]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const startNew = () => {
    setEditingId('new');
    setDraft(EMPTY_DRAFT);
    setError(null);
  };

  const startEdit = (t: TicketTemplate) => {
    setEditingId(t.id);
    setDraft(templateToDraft(t));
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setError(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = draftToBody(draft);
      if (!body.name) {
        setError('Name is required.');
        return;
      }
      const path =
        editingId === 'new' ? '/api/ticket-templates' : `/api/ticket-templates/${editingId}`;
      const resp = await authFetch(path, {
        method: editingId === 'new' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const detail = await resp.json().catch(() => null);
        setError(detail?.detail ?? `Save failed (${resp.status})`);
        return;
      }
      await fetchAll();
      cancelEdit();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t: TicketTemplate) => {
    if (t.is_system) return;
    if (!confirm(`Delete template "${t.name}"?`)) return;
    const resp = await authFetch(`/api/ticket-templates/${t.id}`, { method: 'DELETE' });
    if (resp.ok) await fetchAll();
  };

  if (loading && templates.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-body font-medium tracking-[0.15em] uppercase text-muted-foreground">
          Ticket templates ({templates.length})
        </p>
        <Button size="sm" onClick={startNew} disabled={editingId === 'new'}>
          <Plus className="h-3 w-3 mr-1.5" /> New template
        </Button>
      </div>

      {editingId === 'new' && (
        <Editor
          draft={draft}
          setDraft={setDraft}
          onSave={save}
          onCancel={cancelEdit}
          saving={saving}
          error={error}
          isSystem={false}
          version={1}
          slug={null}
        />
      )}

      <div className="space-y-2">
        {templates.map((t) =>
          editingId === t.id ? (
            <Editor
              key={t.id}
              draft={draft}
              setDraft={setDraft}
              onSave={save}
              onCancel={cancelEdit}
              saving={saving}
              error={error}
              isSystem={t.is_system}
              version={t.version}
              slug={t.slug}
            />
          ) : (
            <div
              key={t.id}
              role="button"
              tabIndex={0}
              onClick={() => startEdit(t)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  startEdit(t);
                }
              }}
              className="rounded-lg border border-border bg-card p-3 flex items-start justify-between gap-3 cursor-pointer hover:border-primary/40 hover:bg-card/80 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <TemplateBadge slug={t.slug} name={t.name} />
                  <span className="text-sm font-medium">{t.name}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {t.slug} · v{t.version}
                  </span>
                  {t.is_system && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      system
                    </span>
                  )}
                </div>
                {t.description && (
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                )}
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                  {t.default_priority && <span>priority: {t.default_priority}</span>}
                  {t.default_story_points != null && (
                    <span>· points: {t.default_story_points}</span>
                  )}
                  {t.default_labels.length > 0 && (
                    <span>· labels: {t.default_labels.join(', ')}</span>
                  )}
                  {(t.field_layout ?? []).filter((f) => f.source === 'custom').length > 0 && (
                    <span>
                      · {(t.field_layout ?? []).filter((f) => f.source === 'custom').length} custom
                      fields
                    </span>
                  )}
                </div>
              </div>
              {!t.is_system && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(t);
                    }}
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ),
        )}
      </div>
    </div>
  );
}

interface EditorProps {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  isSystem: boolean;
  version: number;
  slug: string | null;
}

function Editor({
  draft,
  setDraft,
  onSave,
  onCancel,
  saving,
  error,
  isSystem,
  version,
  slug,
}: EditorProps) {
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const [tab, setTab] = useState<'settings' | 'template'>('settings');

  return (
    <div className="rounded-lg border border-primary/40 bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wand2 className="h-3.5 w-3.5 text-primary" />
          <span className="text-sm font-medium">
            {slug ? `Edit ${slug}` : 'New ticket template'}
          </span>
          {slug && <span className="text-[10px] text-muted-foreground font-mono">v{version}</span>}
          {isSystem && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              system — edits update org-wide
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel} aria-label="Cancel">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-1 border-b border-border">
        <TabButton active={tab === 'settings'} onClick={() => setTab('settings')}>
          Settings
        </TabButton>
        <TabButton active={tab === 'template'} onClick={() => setTab('template')}>
          Template
        </TabButton>
      </div>

      {tab === 'settings' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Name">
            <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Icon (lucide name)">
            <Input value={draft.icon} onChange={(e) => set({ icon: e.target.value })} />
          </Field>
          <Field label="Default priority">
            <select
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
              value={draft.default_priority}
              onChange={(e) => set({ default_priority: e.target.value })}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p || '—'}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Default story points">
            <Input
              type="number"
              value={draft.default_story_points}
              onChange={(e) => set({ default_story_points: e.target.value })}
            />
          </Field>
          <Field label="Default labels (comma-separated)" className="md:col-span-2">
            <Input
              value={draft.default_labels}
              onChange={(e) => set({ default_labels: e.target.value })}
            />
          </Field>
          <Field label="Description" className="md:col-span-2">
            <Textarea
              value={draft.description}
              onChange={(e) => set({ description: e.target.value })}
              rows={2}
            />
          </Field>
          <Field
            label="Prompt fragment (composed into the AI generation prompt — bumps version on save)"
            className="md:col-span-2"
          >
            <Textarea
              value={draft.prompt_fragment}
              onChange={(e) => set({ prompt_fragment: e.target.value })}
              rows={4}
              placeholder="Use 'this template' for tasks where…"
            />
          </Field>
          <Field label="Acceptance criteria template (one per line)" className="md:col-span-2">
            <Textarea
              value={draft.acceptance_criteria_template}
              onChange={(e) => set({ acceptance_criteria_template: e.target.value })}
              rows={3}
            />
          </Field>
          <Field
            label="Applicability — blueprint sections (comma-separated, leave blank for any)"
            className="md:col-span-2"
          >
            <Input
              value={draft.applicability_sections}
              onChange={(e) => set({ applicability_sections: e.target.value })}
              placeholder="e.g. ui_ux, api_integrations"
            />
          </Field>
        </div>
      ) : (
        <TemplateLayoutPreview
          layout={draft.field_layout}
          onChange={(next) => set({ field_layout: next })}
          draftDefaults={{
            defaultPriority: draft.default_priority || null,
            defaultStoryPoints: draft.default_story_points
              ? Number(draft.default_story_points)
              : null,
            defaultLabels: draft.default_labels
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          }}
        />
      )}

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
          ) : (
            <Save className="h-3.5 w-3.5 mr-1" />
          )}
          Save
        </Button>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition ${
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

// Studio Template tab — reuses the same drag/rename/required toolbar as the
// live ticket panel, but rendered against draft state and using preview-mode
// renderers (no API calls). The Save button on the editor card persists the
// resulting field_layout via the existing draftToBody → PATCH/POST flow.
function TemplateLayoutPreview({
  layout,
  onChange,
  draftDefaults,
}: {
  layout: FieldLayoutEntry[];
  onChange: (next: FieldLayoutEntry[]) => void;
  draftDefaults: PreviewDraftDefaults;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const titleEntry = layout.find((e) => e.placement === 'header');
  const mainEntries = layout.filter((e) => e.placement === 'main');
  const sidebarEntries = layout.filter((e) => e.placement === 'sidebar');

  const patchEntry = (key: string, patch: Partial<FieldLayoutEntry>) => {
    onChange(layout.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  };
  const removeEntry = (key: string) => {
    onChange(layout.filter((e) => e.key !== key));
  };
  const addEntry = (entry: FieldLayoutEntry) => {
    let final = entry;
    if (layout.some((e) => e.key === entry.key)) {
      final = { ...entry, key: `${entry.key}_${Date.now()}` };
    }
    onChange([...layout, final]);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;
    const activeIdx = layout.findIndex((e) => e.key === activeId);
    if (activeIdx === -1) return;

    let next: FieldLayoutEntry[];
    if (overId.startsWith('zone:')) {
      const zone = overId.split(':')[1] as 'main' | 'sidebar';
      const moved: FieldLayoutEntry = { ...layout[activeIdx], placement: zone };
      next = layout.filter((_, i) => i !== activeIdx);
      next.push(moved);
    } else {
      const overIdx = layout.findIndex((e) => e.key === overId);
      if (overIdx === -1) return;
      const overEntry = layout[overIdx];
      const activeEntry = layout[activeIdx];
      if (activeEntry.placement !== overEntry.placement) {
        const moved: FieldLayoutEntry = { ...activeEntry, placement: overEntry.placement };
        const without = layout.filter((_, i) => i !== activeIdx);
        const insertAt = without.findIndex((e) => e.key === overId);
        without.splice(insertAt < 0 ? without.length : insertAt, 0, moved);
        next = without;
      } else {
        next = arrayMove(layout, activeIdx, overIdx);
      }
    }
    onChange(next);
  };

  // Wrapper around SortableLayoutField that swaps the live TicketField inside
  // for the preview dispatcher. SortableLayoutField always renders TicketField,
  // so the Studio version copies the surrounding toolbar via composition: we
  // pass a render-prop-shaped child by rendering the toolbar pieces ourselves.
  // To keep the drag/sort row identical to the live editor, we instead reuse
  // SortableLayoutField but tell it to render only the toolbar — the field
  // itself comes from TemplatePreviewField positioned right below the toolbar.
  // (Implementation detail: SortableLayoutField already renders the field
  // beneath the toolbar; in preview mode we rely on the template field
  // dispatcher swapping to inert renderers, so we wrap it once and let it run.)

  const renderRow = (entry: FieldLayoutEntry) => (
    <PreviewSortableRow
      key={entry.key}
      entry={entry}
      draftDefaults={draftDefaults}
      onPatch={(patch) => patchEntry(entry.key, patch)}
      onRemove={() => removeEntry(entry.key)}
    />
  );

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        Preview — drag, rename, toggle required, hide built-ins or add custom fields. Sample data is
        shown for context; nothing here saves until you press Save.
      </p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="rounded-lg border border-border bg-background/60 p-3 space-y-3 max-h-[70vh] overflow-y-auto">
          {/* Title row — locked to header */}
          {titleEntry && (
            <PreviewTitleRow
              entry={titleEntry}
              onPatch={(patch) => patchEntry(titleEntry.key, patch)}
            />
          )}

          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_240px] gap-4">
            <LayoutZoneDroppable zone="main">
              <SortableContext
                items={mainEntries.map((e) => e.key)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-4">{mainEntries.map(renderRow)}</div>
              </SortableContext>
              <div className="mt-3">
                <AddCustomFieldButton zone="main" onAdd={addEntry} />
              </div>
            </LayoutZoneDroppable>

            <LayoutZoneDroppable zone="sidebar">
              <aside className="space-y-4">
                <SortableContext
                  items={sidebarEntries.map((e) => e.key)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-4">{sidebarEntries.map(renderRow)}</div>
                </SortableContext>
                <AddCustomFieldButton zone="sidebar" onAdd={addEntry} />
              </aside>
            </LayoutZoneDroppable>
          </div>
        </div>
      </DndContext>
    </div>
  );
}

// Title is fixed to the header zone so it never enters the DnD context. We
// still give it a minimal rename + required toolbar so the studio matches the
// live ticket experience.
function PreviewTitleRow({
  entry,
  onPatch,
}: {
  entry: FieldLayoutEntry;
  onPatch: (patch: Partial<FieldLayoutEntry>) => void;
}) {
  return (
    <div className="rounded-md border border-dashed border-primary/30 bg-primary/5 px-3 py-2">
      <div className="flex items-center gap-2 mb-1">
        <Input
          value={entry.label}
          onChange={(e) => onPatch({ label: e.target.value })}
          className="h-6 text-xs flex-1 min-w-0"
          placeholder="Title label"
        />
        <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground select-none whitespace-nowrap">
          <input
            type="checkbox"
            checked={entry.required}
            onChange={(e) => onPatch({ required: e.target.checked })}
            className="h-3 w-3"
          />
          required
        </label>
      </div>
      <div className="text-lg font-semibold text-foreground">Example feature ticket</div>
    </div>
  );
}

// Wrapper for non-title entries — uses the shared SortableLayoutField for the
// drag-aware row chrome but passes a custom body (the preview renderer)
// instead of the default live TicketField.
function PreviewSortableRow({
  entry,
  draftDefaults,
  onPatch,
  onRemove,
}: {
  entry: FieldLayoutEntry;
  draftDefaults: PreviewDraftDefaults;
  onPatch: (patch: Partial<FieldLayoutEntry>) => void;
  onRemove: () => void;
}) {
  return (
    <SortableLayoutField
      entry={entry}
      onPatch={onPatch}
      onRemove={onRemove}
      inSidebar={entry.placement === 'sidebar'}
      previewSlot={<TemplatePreviewField entry={entry} draftDefaults={draftDefaults} />}
    />
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children}
    </div>
  );
}
