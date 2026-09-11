'use client';

// The room's one box: Enter sends, Shift+Enter breaks a line, a leading
// slash opens the commands, a pasted screenshot becomes a chip, the mic
// dictates into it. Slash input never reaches the model — the page parses it.

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { MicButton } from '@/components/yeaboi/mic-button';
import { completionFor, matchingCommands } from '@/lib/yeaboi/commands';
import { appendSpoken } from '@/lib/yeaboi/voice';

export interface ComposerHandle {
  focus(): void;
}

export interface ComposerProps {
  draft: string;
  onDraft: (next: string) => void;
  onSubmit: (line: string) => void;
  onPaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onStop: () => void;
  busy: boolean;
  attachments: number;
  /** What the conversation is waiting on, as the placeholder. */
  hint: string;
}

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { draft, onDraft, onSubmit, onPaste, onStop, busy, attachments, hint },
  ref,
) {
  const field = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => field.current?.focus() }), []);

  // The /-menu, on the same rule the terminal uses: a leading slash on the
  // first line. A slash anywhere else is prose ("http://…", "and/or").
  const menu = busy || draft.includes('\n') ? [] : matchingCommands(draft);

  return (
    <div className="px-6 pb-4 pt-2">
      {menu.length > 0 && (
        <ul className="mb-2 overflow-hidden rounded-xl bg-card ring-1 ring-border/60">
          {menu.map((command, index) => (
            <li key={command.name}>
              <button
                type="button"
                onClick={() => onSubmit(`/${command.name}`)}
                className={`flex w-full items-baseline gap-3 px-3 py-1.5 text-left transition-colors hover:bg-secondary/50 ${
                  index === 0 ? 'bg-secondary/30' : ''
                }`}
              >
                <span className="font-mono text-[12px] text-primary">/{command.name}</span>
                <span className="text-[11px] text-muted-foreground">{command.help}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div
        data-audience-accented
        className="rounded-2xl bg-card px-4 py-3 ring-1 ring-border/60 focus-within:ring-[color:var(--audience-accent)]"
      >
        <textarea
          ref={field}
          rows={2}
          placeholder={busy ? 'Working…' : hint}
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              // A half-typed verb completes rather than submitting.
              const complete = completionFor(draft);
              if (complete) onDraft(`/${complete.name}`);
              else onSubmit(draft);
            } else if (e.key === 'Escape' && menu.length) {
              e.preventDefault();
              onDraft('');
            }
          }}
          aria-label="Your reply"
          className="w-full resize-none bg-transparent text-[13.5px] leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
        />
        <div className="mt-2 flex items-center gap-3">
          <MicButton disabled={busy} onText={(text) => onDraft(appendSpoken(draft, text))} />
          <span className="flex-1 text-[11px] text-muted-foreground/70">
            Enter sends, Shift+Enter for a new line, / for commands
            {attachments ? `, ${attachments} image${attachments > 1 ? 's' : ''} attached` : ''}
          </span>
          {busy ? (
            <Button variant="outline" size="sm" onClick={onStop} title="Stops at the next step">
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={!draft.trim() && !attachments}
              onClick={() => onSubmit(draft)}
            >
              Send
            </Button>
          )}
        </div>
      </div>
    </div>
  );
});
