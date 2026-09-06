'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const SHORTCUTS: { category: string; rows: { keys: string[]; label: string }[] }[] = [
  {
    category: 'Navigation',
    rows: [
      { keys: ['/'], label: 'Focus search' },
      { keys: ['j'], label: 'Next card' },
      { keys: ['k'], label: 'Previous card' },
      { keys: ['e'], label: 'Open selected card' },
      { keys: ['Esc'], label: 'Close panel / clear selection' },
    ],
  },
  {
    category: 'Editing',
    rows: [
      { keys: ['c'], label: 'Create card in focused column' },
      { keys: ['x'], label: 'Toggle card selection' },
    ],
  },
  {
    category: 'Help',
    rows: [{ keys: ['?'], label: 'Show this shortcut help' }],
  },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutHelp({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {SHORTCUTS.map((group) => (
            <div key={group.category}>
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                {group.category}
              </div>
              <ul className="space-y-1.5">
                {group.rows.map((row) => (
                  <li key={row.label} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="flex items-center gap-1">
                      {row.keys.map((k) => (
                        <kbd
                          key={k}
                          className="px-1.5 py-0.5 rounded border border-border bg-muted text-xs font-mono"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
