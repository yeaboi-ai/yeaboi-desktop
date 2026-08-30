// The onboarding step machine: the provider step is the one required gate,
// voice/connections are skippable, and "skip the rest" exists only once a
// provider is saved — the same contract as the TUI's setup wizard.

import { describe, expect, it } from 'vitest';
import {
  WIZARD_STEPS,
  type WizardState,
  canEscape,
  canSkipStep,
  initialWizardState,
  wizardReducer,
} from '../src/renderer/lib/onboarding/wizard-steps';

const at = (step: WizardState['step'], llmConfigured = false): WizardState => ({
  step,
  llmConfigured,
});

describe('wizardReducer', () => {
  it('walks the steps in order', () => {
    expect(WIZARD_STEPS).toEqual(['welcome', 'provider', 'voice', 'connections', 'done']);
    let state = initialWizardState;
    state = wizardReducer(state, { type: 'NEXT' });
    expect(state.step).toBe('provider');
    state = wizardReducer(state, { type: 'LLM_SAVED' });
    expect(state.step).toBe('voice');
    state = wizardReducer(state, { type: 'NEXT' });
    expect(state.step).toBe('connections');
    state = wizardReducer(state, { type: 'NEXT' });
    expect(state.step).toBe('done');
  });

  it('the provider step cannot be passed without a saved provider', () => {
    expect(wizardReducer(at('provider'), { type: 'NEXT' }).step).toBe('provider');
    expect(wizardReducer(at('provider'), { type: 'SKIP_STEP' }).step).toBe('provider');
    expect(canSkipStep('provider')).toBe(false);
  });

  it('voice and connections are skippable', () => {
    expect(canSkipStep('voice')).toBe(true);
    expect(canSkipStep('connections')).toBe(true);
    expect(wizardReducer(at('voice', true), { type: 'SKIP_STEP' }).step).toBe('connections');
    expect(wizardReducer(at('connections', true), { type: 'SKIP_STEP' }).step).toBe('done');
  });

  it('LLM_SAVED advances only from the provider step, but always records the save', () => {
    expect(wizardReducer(at('provider'), { type: 'LLM_SAVED' })).toEqual(at('voice', true));
    expect(wizardReducer(at('connections'), { type: 'LLM_SAVED' })).toEqual(
      at('connections', true),
    );
  });

  it('"skip the rest" exists only after the provider is saved, and jumps to done', () => {
    expect(canEscape(at('voice'))).toBe(false);
    expect(canEscape(at('voice', true))).toBe(true);
    expect(canEscape(at('done', true))).toBe(false);
    expect(wizardReducer(at('voice'), { type: 'FINISH' }).step).toBe('voice');
    expect(wizardReducer(at('voice', true), { type: 'FINISH' }).step).toBe('done');
  });

  it('the trail jumps back freely, forward only once the provider is saved', () => {
    expect(wizardReducer(at('connections', true), { type: 'GO_TO', step: 'provider' }).step).toBe(
      'provider',
    );
    expect(wizardReducer(at('connections'), { type: 'GO_TO', step: 'welcome' }).step).toBe(
      'welcome',
    );
    expect(wizardReducer(at('welcome'), { type: 'GO_TO', step: 'voice' }).step).toBe('welcome');
    expect(wizardReducer(at('provider', true), { type: 'GO_TO', step: 'done' }).step).toBe('done');
  });

  it('back never leaves the wizard, and done steps back to connections', () => {
    expect(wizardReducer(at('welcome'), { type: 'BACK' }).step).toBe('welcome');
    expect(wizardReducer(at('done', true), { type: 'BACK' }).step).toBe('connections');
    expect(wizardReducer(at('voice', true), { type: 'BACK' }).step).toBe('provider');
  });
});
