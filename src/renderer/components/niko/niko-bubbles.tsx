'use client';

// What a scripted turn puts under Niko's words.
//
// These are not the model's — a streamed answer is prose, and prose is what
// `NikoMarkdown` is for. These are the four shapes the planning interview
// needs: a row of answers, a value to correct, a thing to open, and a note
// that says what is happening while it happens.
//
// Painted with the app's tokens, on the bubble's own ground, so they follow the
// theme like everything else in the bar.

import { useEffect, useRef, useState } from 'react';
import { Check, Pencil } from 'lucide-react';

import type { Bubble, Choice } from '@/lib/yeaboi/planning-interview';

/** One answer. Bordered rather than filled: a row of filled pills is a row of
 *  primary actions, and only one of these is ever the likely one. */
function Chip({ choice, onPick }: { choice: Choice; onPick: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(choice.id)}
      // Each one carries its own ground; nothing carries them. A panel behind a
      // row of buttons is a second object saying they belong together, which
      // the row already says.
      className={`rounded-full border px-3 py-1 font-body text-[12px] backdrop-blur-sm transition-colors ${
        choice.muted
          ? 'border-border/40 bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground'
          : 'border-border/60 bg-popover text-foreground hover:border-primary/50 hover:bg-primary/10'
      }`}
    >
      {choice.label}
    </button>
  );
}

function FieldBubble({
  label,
  value,
  confirm,
  retry,
  onAnswer,
}: {
  label: string;
  value: string;
  confirm: string;
  retry?: string;
  onAnswer: (answer: string) => void;
}) {
  // Seeded once: a later turn changes the prop and must not change what has
  // been typed over it.
  const [text, setText] = useState(() => value);
  const [editing, setEditing] = useState(false);
  const box = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) box.current?.select();
  }, [editing]);

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center gap-2 rounded-xl border border-border/50 px-2.5 py-1.5">
        {editing ? (
          <input
            ref={box}
            value={text}
            aria-label={label}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onAnswer(text.trim() || value);
              if (event.key === 'Escape') {
                setText(value);
                setEditing(false);
              }
            }}
            className="min-w-0 flex-1 bg-transparent font-body text-[13px] text-foreground outline-none"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate font-body text-[13px] text-foreground">
            {text}
          </span>
        )}
        <button
          type="button"
          aria-label={editing ? `Keep ${label}` : `Edit ${label}`}
          onClick={() => setEditing((was) => !was)}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        >
          {editing ? <Check className="size-3.5" /> : <Pencil className="size-3.5" />}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Chip
          choice={{ id: 'confirm', label: confirm }}
          onPick={() => onAnswer(text.trim() || value)}
        />
        {retry && <Chip choice={{ id: 'retry', label: retry, muted: true }} onPick={onAnswer} />}
      </div>
    </div>
  );
}

/** The thing itself, in the conversation. Acting on it acts on the page. */
function CardBubble({
  title,
  detail,
  actions,
  onAnswer,
}: {
  title: string;
  detail: string;
  actions?: Choice[];
  onAnswer: (answer: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border/50 px-3 py-2">
      <p className="font-display text-[14px] leading-none text-foreground">{title}</p>
      <p className="mt-1.5 font-code text-[10px] tracking-wide text-muted-foreground uppercase">
        {detail}
      </p>
      {actions && actions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {actions.map((action) => (
            <Chip key={action.id} choice={action} onPick={onAnswer} />
          ))}
        </div>
      )}
    </div>
  );
}

/** What is happening, while it happens. A spinner says something is; this says
 *  what. */
function WorkingBubble({ note }: { note: string }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <span className="size-1.5 animate-pulse rounded-full bg-primary/50" />
      <span className="size-1.5 animate-pulse rounded-full bg-primary/50 [animation-delay:150ms]" />
      <span className="size-1.5 animate-pulse rounded-full bg-primary/50 [animation-delay:300ms]" />
      <span className="font-body text-[12px] text-muted-foreground">{note}</span>
    </div>
  );
}

export function NikoBubble({
  bubble,
  onAnswer,
}: {
  bubble: Bubble;
  /** A choice id, or the field's value. */
  onAnswer: (answer: string) => void;
}) {
  switch (bubble.kind) {
    case 'chips':
      return (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {bubble.choices.map((choice) => (
            <Chip key={choice.id} choice={choice} onPick={onAnswer} />
          ))}
        </div>
      );
    case 'field':
      return (
        <FieldBubble
          label={bubble.label}
          value={bubble.value}
          confirm={bubble.confirm}
          {...(bubble.retry ? { retry: bubble.retry } : {})}
          onAnswer={onAnswer}
        />
      );
    case 'card':
      return (
        <CardBubble
          title={bubble.title}
          detail={bubble.detail}
          {...(bubble.actions ? { actions: bubble.actions } : {})}
          onAnswer={onAnswer}
        />
      );
    case 'working':
      return <WorkingBubble note={bubble.note} />;
  }
}
