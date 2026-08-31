'use client';

// The model list: every preset the provider ships, one trait line each, and a
// Custom… row for anything else the credential can reach. Shared by the setup
// flow and Settings.

import { cn } from '@/lib/utils';

// Trait lines for well-known model families, used when the backend sends no
// hint for an id. Honest one-liners, not marketing; unknown ids get nothing.
const MODEL_TRAITS: [RegExp, string][] = [
  [/opus/i, 'Deepest reasoning — best for hard planning; slower and pricier.'],
  [/sonnet/i, 'Balanced speed and depth — the daily driver.'],
  [/haiku/i, 'Fastest and lightest — quick work on a budget.'],
  [/mini|nano|flash|lite/i, 'Small and quick — cheap for routine work.'],
];

export function modelTrait(id: string, hints: Record<string, string>): string | undefined {
  return hints[id] ?? MODEL_TRAITS.find(([re]) => re.test(id))?.[1];
}

export const CUSTOM_MODEL = '__custom__';

/** The amber radio dot; the real input sits sr-only beside it for semantics. */
export function RadioDot({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ring-1 transition-colors ${
        selected ? 'ring-primary' : 'ring-border'
      }`}
    >
      {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
    </span>
  );
}

const rowClass = (selected: boolean) =>
  cn(
    'flex cursor-pointer items-start gap-3 rounded-xl px-3.5 py-3 transition-colors',
    selected ? 'bg-primary/10 ring-1 ring-primary/40' : 'bg-secondary/40 hover:bg-secondary/70',
  );

export function ModelChoice({
  models,
  recommended,
  hints,
  value,
  custom,
  onPick,
  onCustom,
  name = 'model',
  busy = false,
}: {
  models: readonly string[];
  /** The provider's own default, which wears the "recommended" pill. */
  recommended: string;
  hints: Record<string, string>;
  /** A model id, or CUSTOM_MODEL. */
  value: string;
  custom: string;
  onPick: (id: string) => void;
  onCustom: (value: string) => void;
  name?: string;
  busy?: boolean;
}) {
  return (
    <div className={cn('space-y-1.5', busy && 'animate-pulse motion-reduce:animate-none')}>
      {models.map((id) => {
        const selected = value === id;
        const trait = modelTrait(id, hints);
        return (
          <label key={id} className={rowClass(selected)}>
            <input
              type="radio"
              name={name}
              checked={selected}
              onChange={() => onPick(id)}
              className="sr-only"
            />
            <RadioDot selected={selected} />
            <span className="min-w-0 flex-1">
              <code className="block font-mono text-[13px] text-foreground">{id}</code>
              {trait && (
                <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
                  {trait}
                </span>
              )}
            </span>
            {id === recommended && (
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary ring-1 ring-primary/25">
                recommended
              </span>
            )}
          </label>
        );
      })}
      <label className={rowClass(value === CUSTOM_MODEL)}>
        <input
          type="radio"
          name={name}
          checked={value === CUSTOM_MODEL}
          onChange={() => onPick(CUSTOM_MODEL)}
          className="sr-only"
        />
        <RadioDot selected={value === CUSTOM_MODEL} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] text-foreground">Custom…</span>
          {value === CUSTOM_MODEL ? (
            <input
              autoFocus
              value={custom}
              aria-label="Custom model id"
              placeholder={`e.g. ${recommended}`}
              onChange={(event) => onCustom(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-border/40 bg-secondary/40 px-3 py-1.5 font-mono text-[12.5px] text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary/50 focus:outline-none"
            />
          ) : (
            <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
              Paste any model id this credential can reach.
            </span>
          )}
        </span>
      </label>
    </div>
  );
}
