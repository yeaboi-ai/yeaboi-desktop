'use client';

// The sidebar's brand lockup, which is also the world switcher. The shell
// lives in one world at a time and the world repaints the chrome, so the top
// of the sidebar states which world you are in rather than offering all three:
// the current world's mascot, the wordmark, and the world's name in its accent.
// Flipping is a menu — a deliberate gesture, matching an act that swaps the
// whole nav — and the copy comes from WORLD_COPY, the same source the
// full-screen chooser reads.

import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { BrandName } from '@/components/brand/duck';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { BetaChip } from '@/components/yeaboi/beta-chip';
import { WORLD_MASCOT } from '@/lib/audience/worlds';
import { useAudience } from '@/components/providers/audience-provider';
import { AUDIENCES, WORLD_COPY, type Audience } from '@shared/audience';

export function WorldSwitcher({ onSwitch }: { onSwitch: (audience: Audience) => void }) {
  const { audience } = useAudience();
  const [open, setOpen] = useState(false);
  const Mascot = WORLD_MASCOT[audience];

  const choose = (next: Audience) => {
    setOpen(false);
    onSwitch(next);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`World: ${WORLD_COPY[audience].title}`}
            className="group flex w-full items-center gap-2.5 rounded-lg px-3 md:px-5 py-2 justify-center md:justify-start hover:bg-secondary/50 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Mascot size={26} />
            <span className="hidden md:flex min-w-0 flex-col items-start leading-none">
              <BrandName className="text-xl leading-none" />
              <span
                data-audience-accented
                className="mt-1 text-[10px] font-body font-semibold uppercase tracking-widest"
                style={{ color: 'var(--audience-accent)' }}
              >
                {WORLD_COPY[audience].title}
              </span>
            </span>
            <ChevronsUpDown className="hidden md:block ml-auto h-3 w-3 shrink-0 text-muted-foreground opacity-40 group-hover:opacity-100 transition-opacity duration-200" />
          </button>
        }
      />

      <PopoverContent side="right" align="start" className="w-64 p-1.5">
        <div role="menu" aria-label="World" className="flex flex-col gap-0.5">
          {AUDIENCES.map((key) => {
            const world = WORLD_COPY[key];
            const active = key === audience;
            const RowMascot = WORLD_MASCOT[key];
            return (
              <button
                key={key}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => choose(key)}
                className={`flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-150 ${
                  active ? 'bg-secondary/60' : 'hover:bg-secondary/40'
                }`}
                style={{
                  boxShadow: active ? `inset 2px 0 0 0 ${world.accentBright}` : 'none',
                }}
              >
                <span className="shrink-0 pt-0.5">
                  <RowMascot size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="font-display text-[13px]"
                      style={{ color: active ? world.accentBright : 'var(--foreground)' }}
                    >
                      {world.title}
                    </span>
                    {world.beta && <BetaChip dim={!active} />}
                    {active && (
                      <Check
                        className="ml-auto h-3 w-3 shrink-0"
                        style={{ color: world.accentBright }}
                      />
                    )}
                  </span>
                  <span className="mt-0.5 block text-[11px] font-body text-foreground/80">
                    {world.verb}
                  </span>
                  <span className="mt-1 block text-[10px] font-body text-muted-foreground leading-relaxed">
                    {world.capabilities.join(' · ')}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
