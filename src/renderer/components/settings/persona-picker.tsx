'use client';

// Who the duck is: one choice for the desktop duck and the screensaver.
// It lives on the Duck tab, where the duck lives — Appearance used to show a
// second copy of it, which was two places to change one thing.

import { DuckSprite } from '@/components/settings/tabs/duck-sprite';
import { usePetPrefs } from '@/hooks/use-pet-prefs';
import { PERSONAS, PLAIN, ROTATE, type PersonaChoice } from '@shared/personas';
import { cn } from '@/lib/utils';

const SPRITE = 34;

export function PersonaPicker({ className }: { className?: string }) {
  const { prefs, update } = usePetPrefs();
  const options: { id: PersonaChoice; name: string; blurb: string }[] = [
    { id: PLAIN, name: 'Just the duck', blurb: 'No hat, no props. The duck as drawn.' },
    { id: ROTATE, name: 'Changes on its own', blurb: 'A different persona every half hour.' },
    ...PERSONAS,
  ];
  return (
    <div className={cn('flex flex-wrap gap-2', className)} role="group" aria-label="Persona">
      {options.map((option) => {
        const active = prefs.persona === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => update({ persona: option.id })}
            aria-pressed={active}
            title={option.blurb}
            className={cn(
              'flex w-[76px] flex-col items-center gap-1.5 rounded-md border px-1 pt-3 pb-2 transition-colors',
              active
                ? 'border-foreground ring-2 ring-ring/40'
                : 'border-border hover:border-foreground/50',
            )}
          >
            <span className="flex h-12 items-end justify-center">
              {option.id === ROTATE ? (
                <span className="relative">
                  <DuckSprite width={SPRITE} />
                  <span className="absolute -top-1 -right-2 font-display italic text-[15px] leading-none text-primary">
                    ?
                  </span>
                </span>
              ) : option.id === PLAIN ? (
                <DuckSprite width={SPRITE} />
              ) : (
                <DuckSprite width={SPRITE} persona={option.id} />
              )}
            </span>
            <span
              className={cn(
                'text-center text-[11px] leading-tight font-body',
                active ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {option.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
