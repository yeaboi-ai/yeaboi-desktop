'use client';

import { useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AcceptanceCriterion } from '@/hooks/use-board';

interface Props {
  criteria: AcceptanceCriterion[];
  onChange: (next: AcceptanceCriterion[]) => void;
  /** When false, suppresses the "Acceptance criteria" heading row so an
   *  outer toolbar/section can own the label without duplication. */
  showHeading?: boolean;
}

interface RowProps {
  id: string;
  index: number;
  text: string;
  done: boolean;
  onTextChange: (idx: number, text: string) => void;
  onToggleDone: (idx: number) => void;
  onRemove: (idx: number) => void;
}

function Row({ id, index, text, done, onTextChange, onToggleDone, onRemove }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const [draft, setDraft] = useState(text);
  const [snapshot, setSnapshot] = useState(text);
  if (snapshot !== text) {
    setSnapshot(text);
    setDraft(text);
  }

  const commit = () => {
    if (draft !== text) onTextChange(index, draft);
  };

  return (
    <li ref={setNodeRef} style={style} className="flex items-center gap-1.5 group">
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Reorder criterion"
        className="cursor-grab text-muted-foreground/50 hover:text-foreground"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <input
        type="checkbox"
        checked={done}
        onChange={() => onToggleDone(index)}
        aria-label={`Criterion ${index + 1}`}
      />
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === 'Backspace' && !draft) {
            e.preventDefault();
            onRemove(index);
          }
        }}
        className={`flex-1 bg-transparent text-sm py-1 outline-none border-b border-transparent focus:border-primary ${
          done ? 'line-through text-muted-foreground' : ''
        }`}
      />
      <button
        type="button"
        onClick={() => onRemove(index)}
        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
        aria-label="Delete criterion"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

// Editable, reorderable acceptance criteria list. Persists every change via
// the parent's onChange so the same PATCH /api/cards/{id} pipeline updates
// the underlying card. Done items float to the bottom but keep their original
// position in the source array — unchecking restores their original spot.
export function AcceptanceCriteria({ criteria, onChange, showHeading = true }: Props) {
  // Render order: open items first (in source order), then done items (also in
  // source order). The displayed index ≠ the source index — the renderer maps
  // both ways via `displayed[i].sourceIndex`.
  const displayed = useMemo(() => {
    const open: { sourceIndex: number; ac: AcceptanceCriterion }[] = [];
    const closed: { sourceIndex: number; ac: AcceptanceCriterion }[] = [];
    criteria.forEach((ac, i) => {
      (ac.done ? closed : open).push({ sourceIndex: i, ac });
    });
    return [...open, ...closed];
  }, [criteria]);
  const openCount = displayed.findIndex((d) => d.ac.done);
  const partitionAt = openCount === -1 ? displayed.length : openCount;

  const ids = displayed.map((d) => `ac-${d.sourceIndex}`);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldDisp = ids.indexOf(active.id as string);
    const newDisp = ids.indexOf(over.id as string);
    if (oldDisp === -1 || newDisp === -1) return;
    // Block reorders that cross the open/done partition — done items belong at
    // the bottom; the user toggles `done` to move them, not by dragging.
    const crossesPartition =
      (oldDisp < partitionAt && newDisp >= partitionAt) ||
      (oldDisp >= partitionAt && newDisp < partitionAt);
    if (crossesPartition) return;

    // Reorder within the displayed view, then map back to source-array order.
    const newDisplayedOrder = arrayMove(displayed, oldDisp, newDisp);
    onChange(newDisplayedOrder.map((d) => d.ac));
  };

  const updateText = (sourceIdx: number, text: string) => {
    const next = criteria.map((c, i) => (i === sourceIdx ? { ...c, text } : c));
    onChange(next);
  };

  const toggleDone = (sourceIdx: number) => {
    const next = criteria.map((c, i) => (i === sourceIdx ? { ...c, done: !c.done } : c));
    onChange(next);
  };

  const removeAt = (sourceIdx: number) => {
    onChange(criteria.filter((_, i) => i !== sourceIdx));
  };

  const add = () => onChange([...criteria, { text: '', done: false }]);

  return (
    <div>
      <div className={`flex items-center ${showHeading ? 'justify-between' : 'justify-end'} mb-2`}>
        {showHeading && (
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Acceptance criteria
          </h3>
        )}
        <Button variant="ghost" size="sm" onClick={add}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add
        </Button>
      </div>
      {criteria.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No acceptance criteria yet.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ul className="space-y-1">
              {displayed.map((d) => (
                <Row
                  key={`ac-${d.sourceIndex}`}
                  id={`ac-${d.sourceIndex}`}
                  index={d.sourceIndex}
                  text={d.ac.text}
                  done={d.ac.done}
                  onTextChange={updateText}
                  onToggleDone={toggleDone}
                  onRemove={removeAt}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
