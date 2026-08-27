'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDroppable } from '@dnd-kit/core';
import { Eye, EyeOff, GripVertical, Plus, Trash2 } from 'lucide-react';
import {
  invalidateTicketTemplatesCache,
  type FieldLayoutEntry,
} from '@/hooks/use-ticket-templates';
import { TicketField, type FieldRendererContext } from './ticket-field-renderer';

const CUSTOM_FIELD_TYPES = ['text', 'rich_text', 'number', 'date', 'url', 'select', 'multi_select'];

// Hook owning the local layout draft and persistence to the active template.
// While editing, the workspace renders from `layout` (local optimistic copy);
// changes are auto-saved with a short debounce and the templates cache is
// invalidated so other tabs pick up the new shape on next mount.
export function useLayoutEditor(args: {
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  templateId: string | null;
  remoteLayout: FieldLayoutEntry[];
  active: boolean;
}) {
  const { authFetch, templateId, remoteLayout, active } = args;
  const [draft, setDraft] = useState<FieldLayoutEntry[] | null>(null);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<FieldLayoutEntry[] | null>(null);

  // Hydrate the draft when the user toggles edit mode on; reset when off.
  // Also reset whenever the underlying remote layout shifts (e.g. a teammate
  // edited the same template) so we don't fight their changes.
  const remoteKey = useMemo(() => remoteLayout.map((e) => e.key).join('|'), [remoteLayout]);
  const [hydrationKey, setHydrationKey] = useState<string | null>(null);
  if (active && hydrationKey !== remoteKey) {
    setHydrationKey(remoteKey);
    setDraft(remoteLayout);
  }
  if (!active && hydrationKey !== null) {
    setHydrationKey(null);
    setDraft(null);
  }

  const persist = useCallback(
    async (next: FieldLayoutEntry[]) => {
      if (!templateId) return;
      setSaving(true);
      try {
        const resp = await authFetch(`/api/ticket-templates/${templateId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ field_layout: next }),
        });
        if (!resp.ok) {
          // Surface failure by reverting the draft to the latest remote.
          setDraft(remoteLayout);
        } else {
          invalidateTicketTemplatesCache();
        }
      } finally {
        setSaving(false);
      }
    },
    [authFetch, remoteLayout, templateId],
  );

  const flush = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (latestRef.current) void persist(latestRef.current);
  }, [persist]);

  const update = useCallback(
    (next: FieldLayoutEntry[]) => {
      setDraft(next);
      latestRef.current = next;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void persist(next);
      }, 350);
    },
    [persist],
  );

  // Flush any pending save when the editor is dismissed mid-debounce.
  useEffect(() => {
    if (!active) flush();
  }, [active, flush]);

  return {
    layout: draft,
    saving,
    update,
    flush,
  };
}

// One sortable row wrapping a TicketField with the inline edit toolbar.
export function SortableLayoutField({
  entry,
  ctx,
  inSidebar,
  onPatch,
  onRemove,
  previewSlot,
}: {
  entry: FieldLayoutEntry;
  /** Live ticket context. Required when `previewSlot` is not supplied. */
  ctx?: FieldRendererContext;
  inSidebar: boolean;
  onPatch: (patch: Partial<FieldLayoutEntry>) => void;
  onRemove: () => void;
  /** Optional render-the-body override. When set, this is rendered in place
   *  of the live TicketField — used by the Studio Template tab to swap in
   *  inert preview renderers. */
  previewSlot?: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.key,
    data: { placement: entry.placement },
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const isBuiltin = entry.source === 'builtin';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative rounded-md ring-1 ring-transparent hover:ring-primary/20 transition"
    >
      <LayoutEditToolbar
        entry={entry}
        dragAttributes={attributes}
        dragListeners={listeners}
        isBuiltin={isBuiltin}
        onPatch={onPatch}
        onRemove={onRemove}
      />

      <div className={entry.visible ? '' : 'opacity-40 pointer-events-none'}>
        {previewSlot ?? (
          <TicketField
            entry={{ ...entry, visible: true }}
            ctx={ctx as FieldRendererContext}
            inSidebar={inSidebar}
            headless
          />
        )}
      </div>
    </div>
  );
}

// A heading-styled control row. The label input is styled like the section
// heading the field would normally render itself, so swapping it in (with the
// renderer's heading suppressed via `headless`) gives one visible label per
// row instead of two or three.
function LayoutEditToolbar({
  entry,
  dragAttributes,
  dragListeners,
  isBuiltin,
  onPatch,
  onRemove,
}: {
  entry: FieldLayoutEntry;
  dragAttributes: React.HTMLAttributes<HTMLButtonElement>;
  dragListeners: React.HTMLAttributes<HTMLButtonElement> | undefined;
  isBuiltin: boolean;
  onPatch: (patch: Partial<FieldLayoutEntry>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-1 mb-2">
      <button
        type="button"
        {...dragAttributes}
        {...dragListeners}
        aria-label="Drag to reorder"
        title="Drag to reorder"
        className="cursor-grab text-muted-foreground/40 hover:text-foreground transition shrink-0"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <input
        value={entry.label}
        onChange={(e) => onPatch({ label: e.target.value })}
        placeholder="Label"
        aria-label="Field label"
        className="h-6 flex-1 min-w-0 bg-transparent border-0 px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground focus:text-foreground focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 rounded"
      />

      {!isBuiltin && (
        <select
          value={entry.type}
          onChange={(e) => onPatch({ type: e.target.value })}
          className="h-6 rounded border border-border bg-background px-1 text-[11px]"
          title="Field type"
        >
          {CUSTOM_FIELD_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      )}

      <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground select-none whitespace-nowrap opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
        <input
          type="checkbox"
          checked={entry.required}
          onChange={(e) => onPatch({ required: e.target.checked })}
          className="h-3 w-3"
        />
        required
      </label>

      <button
        type="button"
        onClick={() => onPatch({ visible: !entry.visible })}
        className="rounded p-1 text-muted-foreground/60 hover:text-foreground opacity-0 group-hover:opacity-100 transition"
        aria-label={entry.visible ? 'Hide field' : 'Show field'}
        title={entry.visible ? 'Hide on this template' : 'Show on this template'}
      >
        {entry.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      </button>

      <button
        type="button"
        onClick={onRemove}
        disabled={isBuiltin}
        className="rounded p-1 text-muted-foreground/60 hover:text-destructive disabled:opacity-0 opacity-0 group-hover:opacity-100 transition"
        aria-label="Delete field"
        title={
          isBuiltin ? 'Built-in fields can be hidden but not removed' : 'Delete this custom field'
        }
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// Drop-target wrapper that gives the column a sentinel id so a field dragged
// into an empty zone still resolves to a meaningful target.
export function LayoutZoneDroppable({
  zone,
  children,
}: {
  zone: 'main' | 'sidebar';
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `zone:${zone}` });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-md transition ${
        isOver ? 'ring-2 ring-primary/30 ring-offset-2 ring-offset-background' : ''
      }`}
    >
      {children}
    </div>
  );
}

export function AddCustomFieldButton({
  onAdd,
  zone,
}: {
  onAdd: (entry: FieldLayoutEntry) => void;
  zone: 'main' | 'sidebar';
}) {
  const handleClick = () => {
    const slug = `new_field_${Math.floor(Math.random() * 10_000)}`;
    onAdd({
      key: `custom:${slug}`,
      label: 'New field',
      type: zone === 'main' ? 'rich_text' : 'text',
      source: 'custom',
      placement: zone,
      visible: true,
      required: false,
    });
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 text-xs text-muted-foreground hover:text-foreground py-1.5 transition"
    >
      <Plus className="h-3.5 w-3.5" /> Add field to {zone}
    </button>
  );
}
