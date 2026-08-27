'use client';

import {
  closestCenter,
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight, GripVertical, HelpCircle, Plus, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { HexColorPicker } from 'react-colorful';

import type { Board, BoardColumn, ColumnCreate, ColumnUpdate } from '@/hooks/use-board';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export type RoleKey =
  'is_start_state' | 'agent_trigger_state' | 'agent_review_state' | 'is_done_state';

export const ROLE_FLAGS: Array<{
  key: RoleKey;
  label: string;
  short: string;
  hint: string;
  description: string;
  example: string;
  swatch: string;
}> = [
  {
    key: 'is_start_state',
    label: 'Start',
    short: 'S',
    hint: 'Where new tickets land first.',
    description: 'Where new tickets land. New cards from intake or planning sessions appear here.',
    example: 'Typically: Backlog',
    swatch: 'bg-sky-500',
  },
  {
    key: 'agent_trigger_state',
    label: 'AI picks up',
    short: 'A',
    hint: 'Move a card here for the AI to start working on it.',
    description:
      'When a card lands in this column the AI orchestrator picks it up and starts the investigate → implement → review pipeline.',
    example: 'Typically: To Do',
    swatch: 'bg-amber-500',
  },
  {
    key: 'agent_review_state',
    label: 'Awaiting review',
    short: 'R',
    hint: 'Where the AI parks cards once a PR is open and waiting for human review.',
    description:
      'After the AI opens a pull request, it moves the card here. Approve or reject the PR to advance or send it back.',
    example: 'Typically: Review',
    swatch: 'bg-purple-500',
  },
  {
    key: 'is_done_state',
    label: 'Done',
    short: 'D',
    hint: 'Terminal column. Cards here count as completed.',
    description:
      "Cards here count as finished. Used for dependency resolution — a card with a 'blocks' link is unblocked when its blocker reaches Done.",
    example: 'Typically: Done',
    swatch: 'bg-emerald-500',
  },
];

interface BoardSettingsContentProps {
  board: Board;
  layout?: 'drawer' | 'page';
  onCreateColumn: (data: ColumnCreate) => Promise<BoardColumn | null>;
  onUpdateColumn: (columnId: string, data: ColumnUpdate) => Promise<BoardColumn | null>;
  onDeleteColumn: (columnId: string, reassignTo?: string) => Promise<boolean>;
  onReorderColumns: (orderedIds: string[]) => Promise<boolean>;
}

export function BoardSettingsContent({
  board,
  layout = 'drawer',
  onCreateColumn,
  onUpdateColumn,
  onDeleteColumn,
  onReorderColumns,
}: BoardSettingsContentProps) {
  // Local working copy for optimistic reordering. Mirror the board prop via
  // the render-time sync pattern so WS updates flow through.
  const [columns, setColumns] = useState<BoardColumn[]>(board.columns);
  const [lastBoardColumns, setLastBoardColumns] = useState(board.columns);
  if (lastBoardColumns !== board.columns) {
    setLastBoardColumns(board.columns);
    setColumns(board.columns);
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const reorder = useCallback(
    async (orderedIds: string[]) => {
      const idx = new Map(orderedIds.map((id, i) => [id, i] as const));
      setColumns((prev) =>
        [...prev]
          .sort((a, b) => (idx.get(a.id) ?? 0) - (idx.get(b.id) ?? 0))
          .map((c, i) => ({
            ...c,
            position: i,
          })),
      );
      await onReorderColumns(orderedIds);
    },
    [onReorderColumns],
  );

  const handleDragEnd = async (ev: DragEndEvent) => {
    const { active, over } = ev;
    if (!over || active.id === over.id) return;
    const oldIdx = columns.findIndex((c) => c.id === active.id);
    const newIdx = columns.findIndex((c) => c.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    await reorder(arrayMove(columns, oldIdx, newIdx).map((c) => c.id));
  };

  // Pulse-highlight a column row when its workflow node is clicked.
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const focusColumn = useCallback((columnId: string) => {
    const node = rowRefs.current.get(columnId);
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedId(columnId);
    window.setTimeout(() => {
      setHighlightedId((current) => (current === columnId ? null : current));
    }, 1400);
  }, []);

  const [newColumnName, setNewColumnName] = useState('');
  const handleAdd = async () => {
    const name = newColumnName.trim();
    if (!name) return;
    setNewColumnName('');
    await onCreateColumn({ name });
  };

  const isPage = layout === 'page';

  return (
    <div className={isPage ? 'space-y-10' : 'space-y-7'}>
      {/* ── Workflow diagram ─────────────────────────────────────────────── */}
      <section>
        <SectionHeading
          title="Workflow"
          hint="Drag nodes to reorder. Click a node to jump to its row below."
        />
        <WorkflowDiagram
          columns={columns}
          onReorder={reorder}
          onSelect={focusColumn}
          large={isPage}
        />
        <RolesLegend large={isPage} />
      </section>

      {/* ── Columns editor ───────────────────────────────────────────────── */}
      <section>
        <SectionHeading
          title="Columns"
          hint="Drag ⋮⋮ to reorder · click a name to rename · click the swatch to set an accent."
        />

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={columns.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <ul
              className={`divide-y divide-white/[0.05] rounded-xl border border-white/[0.06] bg-white/[0.015] ${
                isPage ? '' : ''
              }`}
            >
              {columns.map((column) => (
                <SortableColumnRow
                  key={column.id}
                  registerRef={(node) => {
                    if (node) rowRefs.current.set(column.id, node);
                    else rowRefs.current.delete(column.id);
                  }}
                  highlight={highlightedId === column.id}
                  column={column}
                  canDelete={columns.length > 1}
                  columns={columns}
                  onUpdate={(data) => onUpdateColumn(column.id, data)}
                  onDelete={(reassignTo) => onDeleteColumn(column.id, reassignTo)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>

        <div className="mt-3 flex items-center gap-2">
          <Input
            value={newColumnName}
            onChange={(e) => setNewColumnName(e.target.value)}
            placeholder="New column name…"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
            }}
            className="h-9 text-sm"
          />
          <Button onClick={handleAdd} size="sm" className="h-9 gap-1">
            <Plus className="h-3.5 w-3.5" />
            Add column
          </Button>
        </div>
      </section>
    </div>
  );
}

export function SectionHeading({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-white/55">{title}</h3>
      <p className="text-[11px] text-white/35 text-right">{hint}</p>
    </div>
  );
}

/**
 * Collapsible legend explaining what each lifecycle role does. Default
 * collapsed so it doesn't crowd the workflow; click the help icon to expand.
 * Open/closed state persists per browser via localStorage.
 */
const ROLES_LEGEND_PREF_KEY = 'board-settings.rolesLegend';

export function RolesLegend({ large }: { large?: boolean }) {
  // Lazy initial state so the localStorage read happens once on mount and
  // doesn't trigger a setState-in-effect lint warning. SSR returns false; the
  // first client render reads the persisted preference. A brief hydration
  // mismatch on a small UI block is acceptable; React reconciles silently.
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(ROLES_LEGEND_PREF_KEY) === 'open';
    } catch {
      return false;
    }
  });

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(ROLES_LEGEND_PREF_KEY, next ? 'open' : 'closed');
      } catch {
        // best-effort
      }
      return next;
    });
  };

  return (
    <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.015]">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-white/55 transition-colors hover:text-white/85"
      >
        <span className="flex items-center gap-2">
          <HelpCircle className="h-3.5 w-3.5 text-white/45" />
          What do Start / AI picks up / Awaiting review / Done mean?
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-white/40 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <ul
          className={`grid gap-x-5 gap-y-2.5 border-t border-white/[0.06] px-4 py-3 ${
            large ? 'grid-cols-2' : 'grid-cols-1'
          }`}
        >
          {ROLE_FLAGS.map((flag) => (
            <li key={flag.key as string} className="flex gap-2.5">
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${flag.swatch}`} aria-hidden />
              <div className="min-w-0">
                <div className="text-[12px] font-medium text-white/85">{flag.label}</div>
                <p className="text-[11px] leading-snug text-white/50">{flag.description}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wide text-white/30">
                  {flag.example}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ───── Color accent picker ─────────────────────────────────────────── */

// Curated swatch palette tuned to the existing role-flag dot colors so a
// column's accent visually rhymes with its lifecycle role. Order roughly
// follows the spectrum from cool → warm.
const ACCENT_PRESETS: Array<{ name: string; hex: string }> = [
  { name: 'Slate', hex: '#64748b' },
  { name: 'Sky', hex: '#0ea5e9' },
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Indigo', hex: '#6366f1' },
  { name: 'Violet', hex: '#8b5cf6' },
  { name: 'Purple', hex: '#a855f7' },
  { name: 'Pink', hex: '#ec4899' },
  { name: 'Red', hex: '#ef4444' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Yellow', hex: '#eab308' },
  { name: 'Lime', hex: '#84cc16' },
  { name: 'Green', hex: '#22c55e' },
  { name: 'Emerald', hex: '#10b981' },
  { name: 'Teal', hex: '#14b8a6' },
  { name: 'Cyan', hex: '#06b6d4' },
];

interface ColorAccentPickerProps {
  value: string | null;
  onChange: (hex: string) => void;
  onClear: () => void;
}

function ColorAccentPicker({ value, onChange, onClear }: ColorAccentPickerProps) {
  const normalized = value?.toLowerCase() ?? null;

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/40">
          Presets
        </div>
        <div className="grid grid-cols-8 gap-1.5">
          {ACCENT_PRESETS.map((preset) => {
            const active = normalized === preset.hex.toLowerCase();
            return (
              <button
                key={preset.hex}
                type="button"
                onClick={() => onChange(preset.hex)}
                title={`${preset.name} (${preset.hex})`}
                aria-label={`${preset.name} (${preset.hex})`}
                aria-pressed={active}
                className={`h-6 w-6 rounded-md transition-transform hover:scale-110 ${
                  active ? 'ring-2 ring-white/80 ring-offset-2 ring-offset-[#161616]' : ''
                }`}
                style={{ backgroundColor: preset.hex }}
              />
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/40">
          Custom
        </div>
        <HexColorPicker color={value ?? '#888888'} onChange={onChange} />
      </div>

      <div className="flex items-center justify-between gap-2 text-xs">
        <code className="rounded bg-white/5 px-2 py-0.5 font-mono text-white/70">
          {value ?? 'no color'}
        </code>
        <button type="button" onClick={onClear} className="text-white/50 hover:text-white/80">
          Clear
        </button>
      </div>
    </div>
  );
}

/* ───── Workflow diagram ─────────────────────────────────────────────── */

interface WorkflowDiagramProps {
  columns: BoardColumn[];
  onReorder: (orderedIds: string[]) => Promise<void>;
  onSelect: (columnId: string) => void;
  large?: boolean;
}

function WorkflowDiagram({ columns, onReorder, onSelect, large }: WorkflowDiagramProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = async (ev: DragEndEvent) => {
    const { active, over } = ev;
    if (!over || active.id === over.id) return;
    const oldIdx = columns.findIndex((c) => c.id === active.id);
    const newIdx = columns.findIndex((c) => c.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    await onReorder(arrayMove(columns, oldIdx, newIdx).map((c) => c.id));
  };

  if (columns.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-center text-xs text-white/40">
        No columns yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.015] px-4 py-4">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={columns.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
          <div className={`flex min-w-max items-stretch ${large ? 'gap-3' : 'gap-1.5'}`}>
            {columns.map((column, i) => (
              <div key={column.id} className="flex items-center gap-1.5">
                <SortableWorkflowNode column={column} onSelect={onSelect} large={large} />
                {i < columns.length - 1 && (
                  <ChevronRight className="h-4 w-4 shrink-0 text-white/25" aria-hidden />
                )}
              </div>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

interface SortableWorkflowNodeProps {
  column: BoardColumn;
  onSelect: (columnId: string) => void;
  large?: boolean;
}

function SortableWorkflowNode({ column, onSelect, large }: SortableWorkflowNodeProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const activeRoles = ROLE_FLAGS.filter((flag) => Boolean(column[flag.key]));

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onSelect(column.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(column.id);
        }
      }}
      className={`group flex flex-col overflow-hidden rounded-lg border border-white/[0.08] bg-[#161616] transition-colors hover:border-white/25 ${
        large ? 'min-w-[150px] max-w-[200px]' : 'min-w-[110px] max-w-[150px]'
      } cursor-grab active:cursor-grabbing`}
    >
      <div
        className="h-1 w-full"
        style={{ backgroundColor: column.accent_color ?? '#3b3b3b' }}
        aria-hidden
      />
      <div className={`flex flex-col gap-1.5 ${large ? 'px-3 py-2.5' : 'px-2.5 py-2'}`}>
        <span
          className={`truncate font-semibold text-white/85 ${large ? 'text-sm' : 'text-[11px]'}`}
        >
          {column.name}
        </span>
        <div
          className={`flex items-center justify-between text-white/40 ${large ? 'text-[11px]' : 'text-[10px]'}`}
        >
          <span>
            {column.cards.length} card{column.cards.length === 1 ? '' : 's'}
          </span>
          {column.wip_limit !== null && column.wip_limit !== undefined && (
            <span className="font-mono">WIP {column.wip_limit}</span>
          )}
        </div>
        {activeRoles.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {activeRoles.map((role) => (
              <span
                key={role.key}
                title={role.hint}
                className={`inline-flex items-center gap-1 rounded-sm bg-white/[0.05] px-1 py-0.5 font-medium text-white/65 ${
                  large ? 'text-[10px]' : 'text-[9px]'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${role.swatch}`} />
                {role.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ───── Column row (editable) ───────────────────────────────────────── */

interface SortableColumnRowProps {
  column: BoardColumn;
  canDelete: boolean;
  columns: BoardColumn[];
  highlight: boolean;
  registerRef: (node: HTMLLIElement | null) => void;
  onUpdate: (data: ColumnUpdate) => Promise<BoardColumn | null>;
  onDelete: (reassignTo?: string) => Promise<boolean>;
}

function SortableColumnRow({
  column,
  canDelete,
  columns,
  highlight,
  registerRef,
  onUpdate,
  onDelete,
}: SortableColumnRowProps) {
  const sortable = useSortable({ id: column.id });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const confirm = useConfirm();

  const wipLimitFromProp =
    column.wip_limit !== null && column.wip_limit !== undefined ? String(column.wip_limit) : '';
  const [lastSeen, setLastSeen] = useState({
    name: column.name,
    wipLimit: wipLimitFromProp,
  });
  const [name, setName] = useState(column.name);
  const [wipLimitInput, setWipLimitInput] = useState<string>(wipLimitFromProp);
  if (lastSeen.name !== column.name || lastSeen.wipLimit !== wipLimitFromProp) {
    setLastSeen({ name: column.name, wipLimit: wipLimitFromProp });
    setName(column.name);
    setWipLimitInput(wipLimitFromProp);
  }

  const fallbackOptions = useMemo(
    () => columns.filter((c) => c.id !== column.id),
    [columns, column.id],
  );

  const commitName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === column.name) {
      setName(column.name);
      return;
    }
    await onUpdate({ name: trimmed });
  };

  const commitWipLimit = async () => {
    const trimmed = wipLimitInput.trim();
    if (trimmed === '') {
      if (column.wip_limit !== null) await onUpdate({ wip_limit: null });
      return;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      setWipLimitInput(
        column.wip_limit !== null && column.wip_limit !== undefined ? String(column.wip_limit) : '',
      );
      return;
    }
    if (parsed !== column.wip_limit) await onUpdate({ wip_limit: parsed });
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: `Delete "${column.name}"?`,
      message:
        column.cards.length > 0
          ? `${column.cards.length} card${column.cards.length === 1 ? '' : 's'} will move to "${
              fallbackOptions[0]?.name ?? 'the first remaining column'
            }".`
          : "This column has no cards. It can't be undone, but you can recreate it later.",
      variant: 'danger',
      confirmLabel: 'Delete column',
    });
    if (!ok) return;
    await onDelete(fallbackOptions[0]?.id);
  };

  const composedRef = (node: HTMLLIElement | null) => {
    setNodeRef(node);
    registerRef(node);
  };

  return (
    <li
      ref={composedRef}
      style={style}
      className={`px-3 py-3 transition-colors ${
        highlight ? 'bg-amber-500/[0.08] ring-1 ring-amber-400/40' : ''
      }`}
    >
      {/* Top row — handle, name, color, delete */}
      <div className="flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="cursor-grab text-white/25 hover:text-white/60"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setName(column.name);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="h-8 flex-1 text-sm"
        />

        <Popover>
          <PopoverTrigger
            aria-label="Column accent color"
            className="h-7 w-7 rounded-md border border-white/[0.12] hover:border-white/30"
            style={{
              backgroundColor: column.accent_color ?? 'transparent',
              backgroundImage: column.accent_color
                ? undefined
                : 'linear-gradient(45deg, transparent 45%, rgba(255,255,255,0.18) 45%, rgba(255,255,255,0.18) 55%, transparent 55%)',
            }}
          />
          <PopoverContent className="w-[260px] p-3">
            <ColorAccentPicker
              value={column.accent_color ?? null}
              onChange={(hex) => onUpdate({ accent_color: hex })}
              onClear={() => onUpdate({ accent_color: null })}
            />
          </PopoverContent>
        </Popover>

        <button
          type="button"
          onClick={handleDelete}
          disabled={!canDelete}
          aria-label="Delete column"
          className="rounded-md p-1.5 text-white/35 hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Supporting controls — WIP limit, role chips, count */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 pl-6">
        <div className="flex items-center gap-1.5 text-[11px] text-white/45">
          <span>WIP</span>
          <Input
            value={wipLimitInput}
            onChange={(e) => setWipLimitInput(e.target.value)}
            onBlur={commitWipLimit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            inputMode="numeric"
            placeholder="—"
            className="h-6 w-12 px-1.5 text-center text-[11px]"
          />
        </div>

        <span className="text-[11px] text-white/35">
          {column.cards.length} card{column.cards.length === 1 ? '' : 's'}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-1">
          {ROLE_FLAGS.map((flag) => {
            const checked = Boolean(column[flag.key]);
            return (
              <label
                key={flag.key as string}
                title={flag.hint}
                className={`flex cursor-pointer select-none items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] transition-colors ${
                  checked
                    ? 'bg-white/10 text-white/85'
                    : 'text-white/35 hover:bg-white/[0.04] hover:text-white/55'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => onUpdate({ [flag.key]: e.target.checked } as ColumnUpdate)}
                  className="sr-only"
                />
                <span
                  className={`h-1.5 w-1.5 rounded-full ${checked ? flag.swatch : 'bg-white/20'}`}
                />
                {flag.label}
              </label>
            );
          })}
        </div>
      </div>
    </li>
  );
}
