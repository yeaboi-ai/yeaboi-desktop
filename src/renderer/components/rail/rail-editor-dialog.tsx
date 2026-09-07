'use client';

// Arranging the rail: the "+" opens this to add a page, a square's menu opens
// it to change one. Adding is two steps — which page, then what it looks
// like — so the list of pages stays a list and the icon choice gets room.

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft } from 'lucide-react';
import { RAIL_LIMITS, type RailIcon, type RailItem } from '@shared/rail';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { RailIconPicker } from '@/components/rail/rail-icon-picker';
import { RailItemIcon } from '@/components/rail/rail-item-icon';
import { useAudience } from '@/components/providers/audience-provider';
import { useRail } from '@/components/providers/rail-provider';
import { RAIL_GROUPS, railCatalogue, type RailDestination } from '@/lib/nav/rail-catalogue';
import { cn } from '@/lib/utils';

export type RailEditorMode = { kind: 'add' } | { kind: 'edit'; itemId: string };

interface Draft {
  route: string;
  title: string;
  label: string;
  icon: RailIcon;
}

function draftFor(destination: RailDestination): Draft {
  return {
    route: destination.route,
    title: destination.title,
    label: destination.label,
    icon: { kind: 'lucide', name: destination.icon },
  };
}

function draftOf(item: RailItem, title: string): Draft {
  return { route: item.route, title, label: item.label, icon: item.icon };
}

export function RailEditorDialog({
  mode,
  onClose,
}: {
  /** Null keeps the dialog closed. */
  mode: RailEditorMode | null;
  onClose: () => void;
}) {
  const { audience } = useAudience();
  const { items, addItem, updateItem, removeItem, resetWorld } = useRail();
  const confirm = useConfirm();
  const catalogue = useMemo(() => railCatalogue(audience), [audience]);
  const onRail = useMemo(() => new Set(items.map((item) => item.route)), [items]);
  const editing = mode?.kind === 'edit' ? items.find((item) => item.id === mode.itemId) : undefined;

  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);

  // A fresh dialog per opening: adding starts at the list, editing at the square.
  useEffect(() => {
    setQuery('');
    if (editing) {
      const title =
        catalogue.find((entry) => entry.route === editing.route)?.title ?? editing.route;
      setDraft(draftOf(editing, title));
    } else {
      setDraft(null);
    }
  }, [mode, editing, catalogue]);

  const open = mode !== null && (mode.kind === 'add' || editing !== undefined);
  const full = items.length >= RAIL_LIMITS.items;

  const matching = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return catalogue;
    return catalogue.filter(
      (entry) =>
        entry.label.toLowerCase().includes(needle) ||
        entry.title.toLowerCase().includes(needle) ||
        entry.route.toLowerCase().includes(needle),
    );
  }, [catalogue, query]);

  const save = () => {
    if (!draft) return;
    const label = draft.label.trim() || draft.title;
    if (editing) updateItem(editing.id, { label, icon: draft.icon });
    else addItem({ route: draft.route, label, icon: draft.icon });
    onClose();
  };

  const remove = () => {
    if (!editing) return;
    removeItem(editing.id);
    onClose();
  };

  const reset = async () => {
    const ok = await confirm({
      title: 'Reset this rail?',
      message: 'Back to Projects and Sessions. Icons and images you added here are forgotten.',
      confirmLabel: 'Reset',
      variant: 'warning',
    });
    if (!ok) return;
    resetWorld();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {draft === null ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-xl font-normal">
                Add to the rail
              </DialogTitle>
              <DialogDescription>
                {full
                  ? `The rail holds ${RAIL_LIMITS.items}. Remove one to add another.`
                  : 'Any page, as a square you can click.'}
              </DialogDescription>
            </DialogHeader>
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a page"
              aria-label="Find a page"
            />
            <div className="-mx-1 max-h-[50vh] overflow-y-auto px-1">
              {RAIL_GROUPS.map((group) => {
                const entries = matching.filter((entry) => entry.group === group.key);
                if (entries.length === 0) return null;
                return (
                  <section key={group.key} className="mb-3">
                    <h3 className="mb-1 px-2 text-[10px] font-body font-medium uppercase tracking-wide text-muted-foreground/70">
                      {group.title}
                    </h3>
                    <ul className="flex flex-col gap-0.5">
                      {entries.map((entry) => {
                        const taken = onRail.has(entry.route);
                        return (
                          <li key={entry.route}>
                            <button
                              type="button"
                              disabled={taken || full}
                              onClick={() => setDraft(draftFor(entry))}
                              className={cn(
                                'flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors',
                                'hover:bg-secondary/60 disabled:cursor-default disabled:hover:bg-transparent',
                              )}
                            >
                              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-secondary/60 text-foreground/70 ring-1 ring-border/40">
                                <RailItemIcon
                                  icon={{ kind: 'lucide', name: entry.icon }}
                                  audience={audience}
                                  size={14}
                                />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span
                                  className={cn(
                                    'block truncate text-[12px] font-body',
                                    taken ? 'text-muted-foreground' : 'text-foreground',
                                  )}
                                >
                                  {entry.label}
                                </span>
                                {entry.title !== entry.label && (
                                  <span className="block truncate text-[10.5px] font-body text-muted-foreground/70">
                                    {entry.title}
                                  </span>
                                )}
                              </span>
                              {taken && (
                                <span className="flex items-center gap-1 text-[10px] font-body text-muted-foreground">
                                  <Check aria-hidden className="size-3" />
                                  On the rail
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
              {matching.length === 0 && (
                <p className="px-2 py-6 text-center text-[12px] font-body text-muted-foreground">
                  No page by that name.
                </p>
              )}
            </div>
            <DialogFooter className="sm:justify-between">
              <Button variant="ghost" size="sm" onClick={() => void reset()}>
                Reset this rail
              </Button>
              <Button variant="outline" size="sm" onClick={onClose}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-display text-xl font-normal">
                {!editing && (
                  <button
                    type="button"
                    onClick={() => setDraft(null)}
                    aria-label="Back to the pages"
                    className="-ml-1 rounded-md p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                )}
                {draft.title}
              </DialogTitle>
              <DialogDescription>
                {editing ? 'How this square looks and what it says.' : 'How its square will look.'}
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center gap-4">
              <span
                aria-hidden
                className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-secondary text-foreground"
              >
                <RailItemIcon icon={draft.icon} audience={audience} size={20} />
              </span>
              <label className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[11px] font-body text-muted-foreground">Name</span>
                <Input
                  value={draft.label}
                  maxLength={RAIL_LIMITS.label}
                  onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') save();
                  }}
                />
              </label>
            </div>

            <RailIconPicker
              value={draft.icon}
              onChange={(icon) => setDraft({ ...draft, icon })}
              audience={audience}
            />

            <DialogFooter className="sm:justify-between">
              {editing ? (
                <Button variant="ghost" size="sm" className="text-destructive" onClick={remove}>
                  Remove from the rail
                </Button>
              ) : (
                <span />
              )}
              <Button size="sm" onClick={save}>
                {editing ? 'Save' : 'Add'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
