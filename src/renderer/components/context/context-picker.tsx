'use client';

// Which earlier sessions this run may read from. One line says what the scope
// reads; opened, it is the sources as chips, the window, the project label,
// the tags, and what the engine finds for that choice. Every rule lives in
// lib/context/scope.ts; this file only draws it.

import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  WINDOW_PRESETS,
  addTag,
  customTags,
  previewLine,
  removeTag,
  scopeSummary,
  serializeScope,
  setProject,
  toggleSource,
  wantsSource,
  windowFromKey,
  windowKey,
  type ContextOptions,
  type ContextScope,
} from '@/lib/context/scope';
import { previewContext } from '@/lib/yeaboi/context';
import { cn } from '@/lib/utils';

const PREVIEW_DEBOUNCE_MS = 300;

export interface ContextPickerProps {
  mode: string;
  /** null draws nothing: the sidecar has no context routes. */
  options: ContextOptions | null;
  scope: ContextScope;
  onChange: (next: ContextScope) => void;
  disabled?: boolean;
}

export function ContextPicker({ mode, options, scope, onChange, disabled }: ContextPickerProps) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const [custom, setCustom] = useState({ start: '', end: '' });
  const latest = useRef(0);

  const serialized = JSON.stringify(serializeScope(scope));
  useEffect(() => {
    if (!options || !open) return;
    const ticket = ++latest.current;
    const timer = setTimeout(() => {
      previewContext(JSON.parse(serialized) as ContextScope, { mode }).then(
        (found) => {
          if (ticket === latest.current) setPreview(previewLine(found));
        },
        () => {
          if (ticket === latest.current) setPreview('');
        },
      );
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [serialized, mode, options, open]);

  if (!options) return null;

  const defaults = options.defaults?.tags ?? [];
  const sources = options.sources;
  const key = windowKey(scope.window);

  const pickWindow = (next: string) => {
    if (next === 'custom') onChange({ ...scope, window: windowFromKey('custom', custom) });
    else onChange({ ...scope, window: windowFromKey(next) });
  };

  const pickDates = (patch: Partial<typeof custom>) => {
    const range = { ...custom, ...patch };
    setCustom(range);
    onChange({ ...scope, window: windowFromKey('custom', range) });
  };

  const submitTag = () => {
    if (!tagDraft.trim()) return;
    onChange(addTag(scope, tagDraft));
    setTagDraft('');
  };

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-2xl bg-card ring-1 ring-border/60 px-4 py-2.5"
    >
      <CollapsibleTrigger
        className="flex w-full items-center justify-between gap-3 text-left"
        disabled={disabled}
      >
        <span className="text-[13px] text-muted-foreground">
          Reads from <span className="text-foreground">{scopeSummary(scope, options.sources)}</span>
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-3 space-y-3 border-t border-[color:var(--audience-accent)]/40 pt-3">
          <Row label="Sources">
            {sources.map((source) => {
              const on = wantsSource(scope, source.key);
              return (
                <Chip
                  key={source.key}
                  on={on}
                  disabled={disabled}
                  title={source.hint}
                  onClick={() => onChange(toggleSource(scope, source.key))}
                >
                  {source.label}
                </Chip>
              );
            })}
          </Row>

          <Row label="Window">
            <select
              value={key}
              disabled={disabled}
              onChange={(event) => pickWindow(event.target.value)}
              className="rounded-md bg-secondary/60 px-2 py-1 text-[12px] text-foreground"
            >
              {WINDOW_PRESETS.map((preset) => (
                <option key={preset.key} value={preset.key}>
                  {preset.label}
                </option>
              ))}
            </select>
            {scope.window.kind === 'custom' && (
              <>
                <input
                  type="date"
                  value={scope.window.start ?? ''}
                  disabled={disabled}
                  onChange={(event) => pickDates({ start: event.target.value })}
                  className="rounded-md bg-secondary/60 px-2 py-1 text-[12px] text-foreground"
                />
                <span className="text-[12px] text-muted-foreground">to</span>
                <input
                  type="date"
                  value={scope.window.end ?? ''}
                  disabled={disabled}
                  onChange={(event) => pickDates({ end: event.target.value })}
                  className="rounded-md bg-secondary/60 px-2 py-1 text-[12px] text-foreground"
                />
              </>
            )}
          </Row>

          <Row label="Project">
            <input
              list={`context-projects-${mode}`}
              value={scope.projects[0] ?? ''}
              disabled={disabled}
              placeholder="any project"
              onChange={(event) => onChange(setProject(scope, event.target.value))}
              className="min-w-[200px] rounded-md bg-secondary/60 px-2 py-1 text-[12px] text-foreground placeholder:text-muted-foreground/60"
            />
            <datalist id={`context-projects-${mode}`}>
              {options.projects.map((project) => (
                <option key={project} value={project} />
              ))}
            </datalist>
          </Row>

          <Row label="Tags">
            {defaults.map((tag) => (
              <Chip key={tag} on fixed>
                {tag}
              </Chip>
            ))}
            {customTags(scope, defaults).map((tag) => (
              <Chip
                key={tag}
                on
                disabled={disabled}
                title="Remove this tag"
                onClick={() => onChange(removeTag(scope, tag, defaults))}
              >
                {tag}
                <X className="ml-1 inline h-3 w-3" />
              </Chip>
            ))}
            <input
              list={`context-tags-${mode}`}
              value={tagDraft}
              disabled={disabled}
              placeholder="add a tag"
              onChange={(event) => setTagDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submitTag();
                }
              }}
              onBlur={submitTag}
              className="min-w-[120px] rounded-md bg-secondary/60 px-2 py-1 text-[12px] text-foreground placeholder:text-muted-foreground/60"
            />
            <datalist id={`context-tags-${mode}`}>
              {options.tags.map((entry) => (
                <option key={entry.tag} value={entry.tag} />
              ))}
            </datalist>
          </Row>

          <p className="px-1 text-[12px] text-muted-foreground" aria-live="polite">
            {preview || 'Looking…'}
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="w-16 shrink-0 text-[12px] text-muted-foreground">{label}</span>
      <span className="flex flex-1 flex-wrap items-center gap-1.5">{children}</span>
    </div>
  );
}

function Chip({
  on,
  fixed,
  disabled,
  title,
  onClick,
  children,
}: {
  on: boolean;
  fixed?: boolean;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  if (fixed)
    return (
      <span
        className="rounded-full bg-secondary/60 px-3 py-1 text-[11px] font-body text-muted-foreground"
        title="A default tag this run always carries"
      >
        {children}
      </span>
    );
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={on}
      title={title}
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1 text-[11px] font-body transition-colors outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50',
        on
          ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
          : 'bg-secondary/60 text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
