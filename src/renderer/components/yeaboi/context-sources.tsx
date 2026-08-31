'use client';

// Context sources — which cross-mode feeds an engine run may read.
//
// The value model mirrors the engine contract (yeaboi projects/scope.py):
// null = inherit (every source on, or the project's saved default), [] =
// incognito, else the enabled subset. Incognito is context isolation, not
// ephemerality — the session and its artifacts still persist.

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import {
  CONTEXT_SOURCES,
  serializeContextSpec,
  toggleContextSource,
  type ContextDeps,
} from '@/lib/yeaboi/context-deps';

export { CONTEXT_SOURCES, serializeContextSpec, type ContextDeps };

export interface ContextSourcesPanelProps {
  value: ContextDeps;
  onChange: (next: ContextDeps) => void;
  disabled?: boolean;
  /** Extra line under the header, e.g. where the setting is persisted. */
  note?: string;
}

/**
 * Collapsible "Context sources" panel: an incognito switch atop one chip per
 * source. Toggling a chip materialises the inherit state to the full set
 * first, so switching one source off leaves the other four explicitly on.
 */
export function ContextSourcesPanel({ value, onChange, disabled, note }: ContextSourcesPanelProps) {
  const [open, setOpen] = useState(false);
  const incognito = value !== null && value.length === 0;
  const enabled = (token: string) => value === null || value.includes(token);

  const toggle = (token: string) => onChange(toggleContextSource(value, token));

  const summary =
    value === null
      ? 'inherited'
      : incognito
        ? 'incognito'
        : `${value.length} of ${CONTEXT_SOURCES.length}`;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-xl bg-secondary/40 px-3 py-2 mb-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-muted-foreground">
          Context sources <span className="text-muted-foreground/70">· {summary}</span>
        </span>
        <CollapsibleTrigger className="flex items-center justify-center h-6 w-6 rounded hover:bg-accent transition-colors">
          {open ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="pt-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-muted-foreground">
              Incognito run
              <span className="block text-[10px] text-muted-foreground/70">
                No cross-mode context; the session still persists.
              </span>
            </span>
            <Switch
              checked={incognito}
              disabled={disabled}
              onCheckedChange={(checked) => onChange(checked ? [] : null)}
              className="scale-75"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CONTEXT_SOURCES.map((source) => {
              const on = enabled(source.token);
              return (
                <button
                  key={source.token}
                  type="button"
                  disabled={disabled || incognito}
                  onClick={() => toggle(source.token)}
                  title={source.blurb}
                  aria-pressed={on && !incognito}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors ${
                    on && !incognito
                      ? 'bg-primary/15 text-primary border-primary/40'
                      : 'bg-background/60 text-foreground/70 border-border hover:text-foreground'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {source.label}
                </button>
              );
            })}
          </div>
          {note ? <p className="text-[10px] text-muted-foreground/70">{note}</p> : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
