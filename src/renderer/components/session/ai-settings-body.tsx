'use client';

// The facilitator's voice settings, as a column: the persona it speaks as and
// the four dials. Drawn inside the room's Settings drawer; the values are
// data in lib/planning/voice.ts.

import { PersonaThumbnail } from './persona-thumbnail';
import {
  ASSERTIVENESS_LEVELS,
  INVOLVEMENT_LEVELS,
  PACE_LEVELS,
  PERSONAS,
  TECHNICAL_COMFORT_LEVELS,
  type Level,
  type VoiceConfig,
} from '@/lib/planning/voice';
import { cn } from '@/lib/utils';

function Dial({
  name,
  levels,
  value,
  onChange,
  disabled,
}: {
  name: string;
  levels: readonly Level[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const current = levels.find((l) => l.value === value) ?? levels[0];
  return (
    <div className="space-y-1.5">
      <p className="font-display text-[15px] italic text-foreground">{name}</p>
      <div
        className="flex gap-1 rounded-md bg-foreground/[0.04] p-1"
        role="radiogroup"
        aria-label={name}
      >
        {levels.map((level) => {
          const active = level.value === value;
          return (
            <button
              key={level.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(level.value)}
              title={level.description}
              className={cn(
                'flex-1 rounded py-1.5 text-[12px] transition-colors',
                active
                  ? 'bg-foreground/[0.12] text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
                disabled && 'cursor-default hover:text-muted-foreground',
              )}
            >
              {level.label}
            </button>
          );
        })}
      </div>
      <p className="text-[12px] leading-snug text-muted-foreground">{current?.description}</p>
    </div>
  );
}

export function AISettingsBody({
  config,
  onChange,
  disabled,
}: {
  config: VoiceConfig;
  onChange: (patch: Partial<VoiceConfig>) => void;
  disabled?: boolean;
}) {
  return (
    <div className={cn('space-y-6', disabled && 'opacity-60')}>
      <div className="space-y-1.5">
        <p className="font-display text-[15px] italic text-foreground">Persona</p>
        <div className="space-y-1">
          {PERSONAS.map((persona) => {
            const active = config.persona === persona.id;
            return (
              <button
                key={persona.id}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ persona: persona.id })}
                aria-pressed={active}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors',
                  active
                    ? 'border-border bg-foreground/[0.08]'
                    : 'border-transparent hover:bg-foreground/[0.05]',
                  disabled && 'cursor-default hover:bg-transparent',
                )}
              >
                <PersonaThumbnail
                  videoPreviewUrl={null}
                  slug={persona.id}
                  alt={persona.label}
                  className="h-5 w-5 shrink-0 rounded-full object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block text-[13px] leading-tight',
                      active ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {persona.label}
                  </span>
                  <span className="block text-[11px] leading-tight text-muted-foreground/70">
                    {persona.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <Dial
        name="Involvement"
        levels={INVOLVEMENT_LEVELS}
        value={config.involvement}
        onChange={(involvement) => onChange({ involvement })}
        disabled={disabled}
      />
      <Dial
        name="Assertiveness"
        levels={ASSERTIVENESS_LEVELS}
        value={config.assertiveness}
        onChange={(assertiveness) => onChange({ assertiveness })}
        disabled={disabled}
      />
      <Dial
        name="Pace"
        levels={PACE_LEVELS}
        value={config.pace}
        onChange={(pace) => onChange({ pace })}
        disabled={disabled}
      />
      <Dial
        name="Technical comfort"
        levels={TECHNICAL_COMFORT_LEVELS}
        value={config.technical_comfort}
        onChange={(technical_comfort) => onChange({ technical_comfort })}
        disabled={disabled}
      />
    </div>
  );
}
