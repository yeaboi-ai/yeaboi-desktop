'use client';

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { X } from 'lucide-react';

import { formatShortcut, type SessionShortcut } from '@/hooks/use-session-shortcuts';

interface ShortcutsOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shortcuts: SessionShortcut[];
}

export function ShortcutsOverlay({ open, onOpenChange, shortcuts }: ShortcutsOverlayProps) {
  // Group + filter: hide entries explicitly marked `hideFromHelp`, and entries
  // with no keyboard binding (those appear in Cmd-K only).
  const visible = shortcuts.filter((s) => !s.hideFromHelp && !!s.keys);
  const groups = visible.reduce<Record<string, SessionShortcut[]>>((acc, s) => {
    const g = s.group ?? 'Misc';
    (acc[g] ??= []).push(s);
    return acc;
  }, {});
  const order: Array<keyof typeof groups> = ['Call', 'Agent', 'Navigation', 'Misc'];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-[280] bg-background/70 backdrop-blur-sm data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 transition-opacity duration-150" />
        <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-[290] -translate-x-1/2 -translate-y-1/2 w-[min(560px,calc(100vw-2rem))] rounded-2xl bg-card ring-1 ring-border/70 shadow-2xl outline-none data-[starting-style]:opacity-0 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:scale-95 transition-[opacity,transform] duration-150">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
            <DialogPrimitive.Title className="text-sm font-semibold text-foreground">
              Keyboard shortcuts
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="p-1 rounded-md text-muted-foreground/50 hover:text-foreground/80 hover:bg-foreground/[0.05] transition-colors"
              aria-label="Close shortcuts"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
            {order
              .filter((g) => groups[g]?.length)
              .map((g) => (
                <div key={g} className="space-y-2">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70 font-medium">
                    {g}
                  </p>
                  <ul className="space-y-1">
                    {groups[g].map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-3">
                        <span className="text-[13px] text-foreground/90">{s.label}</span>
                        <kbd className="text-[11px] text-muted-foreground font-mono bg-foreground/[0.06] border border-border/70 rounded px-2 py-0.5">
                          {formatShortcut(s.keys)}
                        </kbd>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
          <div className="px-5 py-3 border-t border-border/60 text-[11px] text-muted-foreground/70">
            Press{' '}
            <kbd className="font-mono bg-foreground/[0.06] border border-border/70 rounded px-1.5 py-0.5">
              ?
            </kbd>{' '}
            any time to open this list.
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
