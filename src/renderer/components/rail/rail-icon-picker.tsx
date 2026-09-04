'use client';

// What a rail square shows: one of the drawn glyphs, one of the persona
// ducks, or an image of your own. The three are tabs; the choice is one
// value, so switching tabs never loses what was picked on another.

import { useState } from 'react';
import type { Audience } from '@shared/audience';
import { PERSONAS } from '@shared/personas';
import { RAIL_LUCIDE_ICONS, type RailIcon } from '@shared/rail';
import { RailImageUpload } from '@/components/rail/rail-image-upload';
import { RailItemIcon } from '@/components/rail/rail-item-icon';
import { cn } from '@/lib/utils';

type Tab = RailIcon['kind'];

const TABS: { key: Tab; title: string }[] = [
  { key: 'lucide', title: 'Icons' },
  { key: 'persona', title: 'Ducks' },
  { key: 'image', title: 'Your image' },
];

const CHIP =
  'flex items-center justify-center rounded-xl border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50';

function chipClass(active: boolean, extra?: string): string {
  return cn(
    CHIP,
    active
      ? 'border-foreground bg-secondary/60 text-foreground ring-2 ring-ring/40'
      : 'border-border/60 text-muted-foreground hover:border-foreground/50 hover:text-foreground',
    extra,
  );
}

export function RailIconPicker({
  value,
  onChange,
  audience,
}: {
  value: RailIcon;
  onChange: (icon: RailIcon) => void;
  audience: Audience;
}) {
  const [tab, setTab] = useState<Tab>(value.kind);
  const image = value.kind === 'image' ? value.dataUrl : null;

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Icon source" className="flex gap-1">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={tab === entry.key}
            onClick={() => setTab(entry.key)}
            className={cn(
              'rounded-full px-3 py-1 text-[11px] font-body font-medium transition-colors',
              tab === entry.key
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {entry.title}
          </button>
        ))}
      </div>

      {tab === 'lucide' && (
        <div
          role="group"
          aria-label="Icons"
          className="grid max-h-56 grid-cols-8 gap-1.5 overflow-y-auto pr-1"
        >
          {RAIL_LUCIDE_ICONS.map((name) => {
            const active = value.kind === 'lucide' && value.name === name;
            return (
              <button
                key={name}
                type="button"
                aria-pressed={active}
                title={name}
                onClick={() => onChange({ kind: 'lucide', name })}
                className={chipClass(active, 'size-9')}
              >
                <RailItemIcon icon={{ kind: 'lucide', name }} audience={audience} size={16} />
              </button>
            );
          })}
        </div>
      )}

      {tab === 'persona' && (
        <div role="group" aria-label="Ducks" className="flex flex-wrap gap-2">
          {PERSONAS.map((persona) => {
            const active = value.kind === 'persona' && value.id === persona.id;
            return (
              <button
                key={persona.id}
                type="button"
                aria-pressed={active}
                title={persona.blurb}
                onClick={() => onChange({ kind: 'persona', id: persona.id })}
                className={chipClass(active, 'w-[72px] flex-col gap-1 px-1 pt-3 pb-2')}
              >
                <span className="flex h-10 items-end">
                  <RailItemIcon
                    icon={{ kind: 'persona', id: persona.id }}
                    audience={audience}
                    size={24}
                  />
                </span>
                <span className="text-center text-[10px] leading-tight font-body">
                  {persona.name}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {tab === 'image' && (
        <RailImageUpload
          value={image}
          onChange={(dataUrl) => onChange({ kind: 'image', dataUrl })}
        />
      )}
    </div>
  );
}
