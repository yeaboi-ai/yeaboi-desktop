// The onboarding wizard's step machine, pure so vitest can hold it still.
//
// Order mirrors the TUI's setup wizard: the provider step is the one required
// gate (the engine cannot run without a brain), voice/video and connections
// are optional, and "skip the rest" exists only once a provider is saved.

export type WizardStep = 'welcome' | 'provider' | 'voice' | 'connections' | 'done';

export const WIZARD_STEPS: readonly WizardStep[] = [
  'welcome',
  'provider',
  'voice',
  'connections',
  'done',
];

export interface WizardState {
  step: WizardStep;
  llmConfigured: boolean;
}

export type WizardAction =
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'GO_TO'; step: WizardStep }
  | { type: 'LLM_SAVED' }
  | { type: 'SKIP_STEP' }
  | { type: 'FINISH' };

export const initialWizardState: WizardState = { step: 'welcome', llmConfigured: false };

export function canSkipStep(step: WizardStep): boolean {
  return step === 'voice' || step === 'connections';
}

/** Whether the trail may jump straight to `target` — back always, forward
 *  only once a provider is saved (the wizard's one required gate). */
export function canGoTo(state: WizardState, target: WizardStep): boolean {
  const to = WIZARD_STEPS.indexOf(target);
  return to >= 0 && (to <= WIZARD_STEPS.indexOf(state.step) || state.llmConfigured);
}

/** Whether "skip the rest" may end the wizard from here. */
export function canEscape(state: WizardState): boolean {
  return state.llmConfigured && state.step !== 'done';
}

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  const index = WIZARD_STEPS.indexOf(state.step);
  switch (action.type) {
    case 'NEXT': {
      if (state.step === 'done') return state;
      if (state.step === 'provider' && !state.llmConfigured) return state;
      return { ...state, step: WIZARD_STEPS[index + 1] ?? state.step };
    }
    case 'BACK': {
      if (index <= 0) return state;
      return { ...state, step: WIZARD_STEPS[index - 1] ?? state.step };
    }
    case 'GO_TO':
      return canGoTo(state, action.step) ? { ...state, step: action.step } : state;
    case 'LLM_SAVED':
      return { llmConfigured: true, step: state.step === 'provider' ? 'voice' : state.step };
    case 'SKIP_STEP':
      return canSkipStep(state.step)
        ? { ...state, step: WIZARD_STEPS[index + 1] ?? state.step }
        : state;
    case 'FINISH':
      return canEscape(state) ? { ...state, step: 'done' } : state;
  }
}
