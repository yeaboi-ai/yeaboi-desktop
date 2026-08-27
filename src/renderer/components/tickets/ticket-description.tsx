'use client';

import type { AcceptanceCriterion } from '@/hooks/use-board';
import { AcceptanceCriteria } from './acceptance-criteria';
import { RichTextEditor } from './rich-text-editor';

interface Props {
  description: string | null;
  acceptanceCriteria: AcceptanceCriterion[];
  onDescriptionChange: (value: string) => void;
  onAcceptanceCriteriaChange: (value: AcceptanceCriterion[]) => void;
  /** Optional hooks fired on focus/blur so the workspace can broadcast
   *  ``card.editing.start``/``stop`` over the board WebSocket. */
  onEditingStart?: () => void;
  onEditingStop?: () => void;
  /** Override the section heading. Defaults to "Description". */
  label?: string;
  /** When the layout-aware renderer takes over AC, the description-only render
   *  should skip its inline AC list. */
  showAcceptanceCriteria?: boolean;
  /** When false, the heading row is omitted (outer toolbar owns the label). */
  showHeading?: boolean;
  /** Card id — required for inline image/file uploads inside the editor. */
  cardId?: string | null;
}

export function TicketDescription({
  description,
  acceptanceCriteria,
  onDescriptionChange,
  onAcceptanceCriteriaChange,
  onEditingStart,
  onEditingStop,
  label = 'Description',
  showAcceptanceCriteria = true,
  showHeading = true,
  cardId,
}: Props) {
  return (
    <section className="space-y-6">
      <div>
        {showHeading && (
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
            {label}
          </h3>
        )}
        <RichTextEditor
          value={description}
          onChange={onDescriptionChange}
          onEditingStart={onEditingStart}
          onEditingStop={onEditingStop}
          cardId={cardId}
          placeholder="Add a description… drop images or paste files inline."
        />
      </div>

      {showAcceptanceCriteria && (
        <AcceptanceCriteria criteria={acceptanceCriteria} onChange={onAcceptanceCriteriaChange} />
      )}
    </section>
  );
}
