'use client';

// Connections — optional, grouped by what each tool is for (code, tickets,
// docs, chat). The card itself is shared with Settings > Credentials; this
// step only arranges the groups and owns the wizard's own buttons.

import { useRef, useState } from 'react';
import type { SettingsSnapshot } from '@/lib/yeaboi/settings';
import {
  CONNECTION_CARDS,
  ConnectionCard,
  GROUPS,
  groupConnections,
} from '@/components/yeaboi/connection-card';
import { Button } from '@/components/ui/button';

export function ConnectionsStep({
  snapshot,
  onSaved,
  onContinue,
  onBack,
}: {
  snapshot: SettingsSnapshot | null;
  onSaved: (title: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const [openSection, setOpenSection] = useState('');
  const headerRefs = useRef<(HTMLButtonElement | null)[]>([]);

  if (!snapshot) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  const grouped = groupConnections(snapshot, CONNECTION_CARDS, GROUPS);

  // Up/down arrows walk the card headers across group boundaries.
  let flat = -1;
  const headerKeyHandler = (index: number) => (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    headerRefs.current[index + (event.key === 'ArrowDown' ? 1 : -1)]?.focus();
  };

  return (
    <div>
      <div className="space-y-4">
        {grouped.map((group) => (
          <div key={group.label}>
            <h3 className="mb-1.5 font-mono text-[10px] tracking-widest text-muted-foreground/60 uppercase">
              {group.label}
            </h3>
            <div className="space-y-2">
              {group.items.map(({ card, fields }) => {
                flat += 1;
                const index = flat;
                return (
                  <ConnectionCard
                    key={card.section}
                    card={card}
                    fields={fields}
                    open={openSection === card.section}
                    onToggle={() => setOpenSection((s) => (s === card.section ? '' : card.section))}
                    onSaved={onSaved}
                    headerRef={(el) => {
                      headerRefs.current[index] = el;
                    }}
                    onHeaderKeyDown={headerKeyHandler(index)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onBack}>
          Back
        </Button>
        <Button size="sm" onClick={onContinue}>
          Continue
        </Button>
      </div>
    </div>
  );
}
