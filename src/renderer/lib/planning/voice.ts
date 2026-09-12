// The facilitator's voice settings as data: the personas the vendored agent
// can speak as and the four dials the room's Settings drawer turns. The
// descriptions mirror backend/src/app/services/pace.py and facilitator.py.
// Pure (test/voice.test.ts).

export interface Persona {
  id: string;
  label: string;
  description: string;
}

export const PERSONAS: readonly Persona[] = [
  { id: 'default', label: 'Senior Engineer', description: 'Drives technical decisions' },
  { id: 'pm', label: 'Product Manager', description: 'User-focused, impact-driven' },
  { id: 'architect', label: 'System Architect', description: 'Scalability and patterns' },
  { id: 'mentor', label: 'Patient Mentor', description: 'Explains and teaches' },
  { id: 'challenger', label: "Devil's Advocate", description: 'Stress-tests ideas' },
];

export interface Level<V extends string = string> {
  value: V;
  label: string;
  description: string;
}

export const ASSERTIVENESS_LEVELS: readonly Level[] = [
  { value: 'passive', label: 'Passive', description: 'Only speaks when asked' },
  { value: 'balanced', label: 'Balanced', description: 'Interjects at natural pauses' },
  { value: 'active', label: 'Active', description: 'Guides firmly, keeps pace high' },
];

export const INVOLVEMENT_LEVELS: readonly Level[] = [
  { value: 'observer', label: 'Observer', description: 'Silent; speaks only when summoned' },
  {
    value: 'responsive',
    label: 'Responsive',
    description: 'Answers when addressed, never interrupts',
  },
  {
    value: 'facilitator',
    label: 'Facilitator',
    description: 'Speaks at natural breaks, balances air time',
  },
  { value: 'driver', label: 'Driver', description: 'Pushes the agenda on every turn' },
];

export const PACE_LEVELS: readonly Level[] = [
  { value: 'fast', label: 'Fast', description: '3 questions per persona, 1 follow-up' },
  { value: 'balanced', label: 'Balanced', description: '5 questions per persona, 2 follow-ups' },
  { value: 'deep', label: 'Deep', description: '8 questions per persona, 3 follow-ups' },
];

export const TECHNICAL_COMFORT_LEVELS: readonly Level[] = [
  {
    value: 'non_technical',
    label: 'Plain',
    description: 'Explain technical terms in plain English',
  },
  { value: 'comfortable', label: 'Comfortable', description: 'Only explain when asked' },
  { value: 'expert', label: 'Expert', description: 'Skip definitions, go straight to trade-offs' },
];

/** What the Settings drawer says until a call has made the vendored row. */
export const VOICE_WAITING_LINE = 'Voice settings apply once a call has started.';

/** The persona's spoken name; the facilitator's when the slug is unknown. */
export function personaName(slug: string | null | undefined): string {
  return PERSONAS.find((p) => p.id === slug)?.label ?? 'Facilitator';
}

export interface VoiceConfig {
  persona: string;
  assertiveness: string;
  involvement: string;
  pace: string;
  technical_comfort: string;
}

/** The dials as the drawer draws them, with the backend's defaults filled in. */
export function voiceConfigOf(raw: Record<string, unknown> | null | undefined): VoiceConfig {
  const pick = (key: string, fallback: string) => {
    const value = raw?.[key];
    return typeof value === 'string' && value ? value : fallback;
  };
  return {
    persona: pick('persona', 'default'),
    assertiveness: pick('assertiveness', 'balanced'),
    involvement: pick('involvement', 'facilitator'),
    pace: pick('pace', 'balanced'),
    technical_comfort: pick('technical_comfort', 'comfortable'),
  };
}
