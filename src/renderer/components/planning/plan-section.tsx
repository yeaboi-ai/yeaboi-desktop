'use client';

// One section of the living plan: its title, where it stands, its lines; a
// flash when the engine changes it, a tick once it is accepted, and an
// editor that sends the change back as a turn rather than saving it here.

import { useEffect, useRef, useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { STATUS_WORDS, type PlanItem, type PlanSection as Section } from '@/lib/planning/plan-view';
import { cn } from '@/lib/utils';

export interface PlanSectionProps {
  section: Section;
  items: PlanItem[];
  /** The lines as one text, seeding the editor. */
  text: string;
  editing: boolean;
  /** An edit is a turn; while one runs nothing else may be sent. */
  busy: boolean;
  onEdit: () => void;
  onSend: (instruction: string) => void;
  onCancel: () => void;
  onHistory?: () => void;
}

export function PlanSection({
  section,
  items,
  text,
  editing,
  busy,
  onEdit,
  onSend,
  onCancel,
  onHistory,
}: PlanSectionProps) {
  const [draft, setDraft] = useState('');
  const [flash, setFlash] = useState(false);
  const previous = useRef(text);
  const first = useRef(true);

  useEffect(() => {
    if (editing) setDraft('');
  }, [editing]);

  // A quiet flash on any change after the first draw, so a section the
  // engine just rewrote is the one the eye lands on.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      previous.current = text;
      return;
    }
    if (previous.current !== text) {
      previous.current = text;
      setFlash(true);
      const timer = setTimeout(() => setFlash(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [text]);

  const word = STATUS_WORDS[section.status];
  const accepted = section.status === 'accepted';

  return (
    <section
      className={cn(
        'rounded-xl px-3 py-2.5 transition-colors duration-500',
        flash ? 'bg-success/[0.08] ring-1 ring-success/40' : 'hover:bg-secondary/30',
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-[17px] text-foreground">
          {section.title}
          {accepted && (
            <Check aria-label="accepted" className="ml-1.5 inline h-3.5 w-3.5 text-success" />
          )}
        </h3>
        <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {word}
          {section.versions > 0 && onHistory && (
            <button type="button" onClick={onHistory} className="hover:text-foreground">
              {section.versions === 1 ? '1 version' : `${section.versions} versions`}
            </button>
          )}
          {!editing && items.length > 0 && (
            <button
              type="button"
              onClick={onEdit}
              disabled={busy}
              aria-label={`Edit ${section.title}`}
              className="rounded p-0.5 hover:text-foreground disabled:opacity-40"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
        </span>
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          {text && (
            <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md bg-secondary/40 px-2 py-1.5 font-body text-[12px] text-muted-foreground">
              {text}
            </pre>
          )}
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            autoFocus
            placeholder="What should change here?"
            className="text-[13px]"
          />
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              <X className="h-3 w-3" />
              Keep it
            </Button>
            <Button size="sm" disabled={!draft.trim() || busy} onClick={() => onSend(draft)}>
              <Check className="h-3 w-3" />
              Ask for the change
            </Button>
          </div>
        </div>
      ) : items.length === 0 ? (
        <p className="mt-1 text-[12px] text-muted-foreground/70">Nothing here yet.</p>
      ) : (
        <ul className="mt-1.5 space-y-1">
          {items.map((item) => (
            <li key={item.id} className="text-[13px] leading-snug text-foreground/90">
              {item.text}
              {item.note && <span className="ml-2 text-muted-foreground">{item.note}</span>}
              {item.source && item.source !== 'answered' && (
                <span className="ml-2 rounded-full bg-secondary/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {item.source}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
