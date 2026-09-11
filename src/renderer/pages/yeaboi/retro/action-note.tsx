'use client';

// One open action, as a sticky note you can act on.
//
// The wall is not a display: what the last retro asked of you is the one list
// on this page you are meant to change, and every gesture here is the same
// `artifact_edit_apply` a teammate correcting the shared document makes. There
// is no separate "hub edit" path, which is why the text and the status are the
// only two things a note offers — those are what the artifact's allowlist
// holds, and anything else would be this screen inventing a write the rest of
// the product cannot honour.

import { useEffect, useRef, useState } from 'react';
import { Check, Pencil, Trash2, Undo2 } from 'lucide-react';

import type { OpenAction } from '@/lib/yeaboi/boards';

/** Words for a status that is still open. A closed one never reaches the wall. */
const STATUS_WORDS: Record<string, string> = {
  pending: 'open',
  in_progress: 'in progress',
  carried_over: 'carried over',
};

/** One number per action, so its lean and its colour are the same every time
 *  the page draws. Random would re-deal the wall on every render, which is a
 *  pile of paper that shuffles itself while you read it. */
function deal(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

/** A pad's worth. Desaturated rather than highlighter — they sit on a near
 *  black screen, and full-strength paper colours glow on it. */
const PAPER = ['#e0cd8c', '#b7cca6', '#a8c2d6', '#d9b2b6'];

/** A mark on the note. Ink on paper, not a button on a dark surface — the
 *  app's own button would bring its card background onto the sticky. */
function Mark({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid size-[22px] place-items-center rounded-sm transition-colors ${
        danger ? 'text-black/45 hover:bg-black/10 hover:text-[#7f1d1d]' : 'text-black/45 hover:bg-black/10 hover:text-black'
      }`}
    >
      {children}
    </button>
  );
}

function NoteEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave(text: string): void;
  onCancel(): void;
}) {
  // Seeded once: later reads of the report change the prop and must not change
  // what you have typed.
  const [text, setText] = useState(() => initial);
  const done = useRef(false);
  const box = useRef<HTMLTextAreaElement | null>(null);

  const commit = (next: string): void => {
    if (done.current) return;
    done.current = true;
    const trimmed = next.trim();
    // An empty note is not a delete — the engine refuses it, and the trash is
    // how you mean it. Leaving the field empty is a change of mind.
    if (!trimmed || trimmed === initial.trim()) onCancel();
    else onSave(trimmed);
  };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  return (
    <textarea
      ref={(el) => {
        box.current = el;
        if (el) {
          el.style.height = 'auto';
          el.style.height = `${el.scrollHeight}px`;
        }
      }}
      value={text}
      rows={1}
      aria-label="Edit action"
      className="w-full resize-none border-0 bg-transparent p-0 font-body text-[12.5px] leading-snug text-[#1c1c1c] outline-none [overflow-wrap:anywhere] focus:ring-0"
      onInput={(event) => {
        const el = event.target as HTMLTextAreaElement;
        setText(el.value);
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
      }}
      // Clicking away is a commit: there is no Save mark to reach instead.
      onBlur={() => commit(text)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          done.current = true;
          onCancel();
        } else if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          commit(text);
        }
      }}
    />
  );
}

export function ActionNote({
  row,
  busy,
  onEdit,
  onClose,
}: {
  row: OpenAction;
  /** A correction is in flight for this note. */
  busy: boolean;
  onEdit(row: OpenAction, text: string): void;
  /** `done` or `not_relevant` — either takes it off the wall. */
  onClose(row: OpenAction, status: string): void;
}) {
  const [editing, setEditing] = useState(false);
  // A pending drop. The status write is not undoable from this page, and the
  // trash sits a few pixels from the pencil.
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (editing) setConfirming(false);
  }, [editing]);

  return (
    <li
      style={{
        // Pinned by hand, so no two sit the same way — and the same way every
        // render, or the wall reshuffles while you read it.
        rotate: `${((deal(row.id) % 13) - 6) / 2}deg`,
        translate: `${(deal(`${row.id}x`) % 7) - 3}px ${(deal(`${row.id}y`) % 9) - 4}px`,
        backgroundColor: PAPER[deal(row.id) % PAPER.length],
      }}
      className={`group relative flex min-h-[104px] w-[148px] flex-col rounded-sm p-3 text-[#1c1c1c] shadow-lg transition-[rotate,translate,opacity] duration-200 ease-out hover:translate-y-[-2px] hover:rotate-0 ${
        busy ? 'opacity-50' : ''
      }`}
    >
      {editing ? (
        <NoteEditor
          initial={row.text}
          onCancel={() => setEditing(false)}
          onSave={(text) => {
            setEditing(false);
            onEdit(row, text);
          }}
        />
      ) : (
        // The text is the way into the editor; the pencil beside it is the
        // same action for a keyboard.
        <button
          type="button"
          // A button does not wrap its label on its own, and the text on a
          // sticky is the only thing holding the note to its width.
          className="w-full cursor-text whitespace-pre-wrap text-left font-body text-[12.5px] leading-snug [overflow-wrap:anywhere]"
          onClick={() => setEditing(true)}
        >
          {row.text}
        </button>
      )}

      {confirming ? (
        // The whole row is replaced rather than added to: a pending close
        // wants the note saying one thing, and leaving the pencil beside it
        // invites the wrong press again.
        <div className="mt-auto flex items-center gap-1 pt-2" role="group" aria-label="Close this action">
          <span className="font-code text-[10px] text-black/55">Close as</span>
          <Mark label="Done" onClick={() => { setConfirming(false); onClose(row, 'done'); }}>
            <Check size={13} strokeWidth={2.2} />
          </Mark>
          <Mark
            label="Not relevant"
            danger
            onClick={() => { setConfirming(false); onClose(row, 'not_relevant'); }}
          >
            <Trash2 size={13} strokeWidth={2.2} />
          </Mark>
          <Mark label="Keep it open" onClick={() => setConfirming(false)}>
            <Undo2 size={13} strokeWidth={2.2} />
          </Mark>
        </div>
      ) : (
        <div className="mt-auto flex items-center gap-1 pt-2">
          <span className="truncate font-code text-[10px] text-black/55">
            {row.author}
            {row.status && STATUS_WORDS[row.status] ? ` · ${STATUS_WORDS[row.status]}` : ''}
          </span>
          {/* Held back until the note is reached for: the wall is meant to be
              read at a glance, and three marks on every sticky is a toolbar. */}
          <span className="ml-auto flex shrink-0 gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            <Mark label={`Edit action: ${row.text.slice(0, 40)}`} onClick={() => setEditing(true)}>
              <Pencil size={13} strokeWidth={2.2} />
            </Mark>
            <Mark
              label={`Close action: ${row.text.slice(0, 40)}`}
              danger
              onClick={() => setConfirming(true)}
            >
              <Trash2 size={13} strokeWidth={2.2} />
            </Mark>
          </span>
        </div>
      )}
    </li>
  );
}
