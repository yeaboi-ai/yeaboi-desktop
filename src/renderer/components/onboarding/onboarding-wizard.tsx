'use client';

// The first-run wizard: the duck walks you in. One Duck reacts to real state
// (startled on a rejected key, joined when a credential verifies, locked while
// the subscription sign-in waits on the browser), the step helper copy is its
// speech bubble, and progress is the duck's own life cycle — five sprites of
// the brand art, egg to full-grown bird, lit as far as you've hatched (see
// scripts/gen_lifecycle_sprites.py). Mirrors the TUI's
// setup wizard: the provider step is required, everything after is optional.

import { useEffect, useReducer, useState } from 'react';
import { Duck, useDuckPulse, type DuckRest } from '@/components/brand/duck';
import {
  WIZARD_STEPS,
  type WizardStep,
  canEscape,
  canGoTo,
  initialWizardState,
  wizardReducer,
} from '@/lib/onboarding/wizard-steps';
import { useYeaboiBackend } from '@/hooks/yeaboi/use-yeaboi-backend';
import { useSettingsSnapshot } from '@/hooks/yeaboi/use-settings-snapshot';
import {
  useProviderSetup,
  type ProviderSetupEvent,
  type ProviderSetupSaved,
} from '@/hooks/yeaboi/use-provider-setup';
import { ProviderSetupFlow } from '@/components/yeaboi/provider-setup-flow';
import { VoiceStep } from './steps/voice-step';
import { ConnectionsStep } from './steps/connections-step';
import { StepBackendNote } from './step-backend-note';
import { Button } from '@/components/ui/button';
import eggSprite from '@/assets/onboarding/lifecycle-egg.png';
import crackSprite from '@/assets/onboarding/lifecycle-crack.png';
import hatchSprite from '@/assets/onboarding/lifecycle-hatch.png';
import ducklingSprite from '@/assets/onboarding/lifecycle-duckling.png';
import duckSprite from '@/assets/onboarding/lifecycle-duck.png';

const STEP_COPY: Record<WizardStep, { label: string; headline: string; quip: string }> = {
  welcome: {
    label: 'hello',
    headline: 'A duck moves in.',
    quip: "I'll need a brain. The rest is optional.",
  },
  provider: {
    label: 'model',
    headline: 'Connect a model',
    quip: 'Pick a provider — subscription or API key.',
  },
  voice: {
    label: 'voice',
    headline: 'Give it a voice & a face',
    quip: "Optional. I'm told I have a face for video.",
  },
  connections: {
    label: 'tools',
    headline: 'Wire up your tools',
    quip: 'Optional — I can read your tracker and repos.',
  },
  done: { label: 'quack', headline: "Quack. You're set.", quip: 'Off we waddle.' },
};

/** A key-cap chip for the footer's shortcut hint. */
function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-[5px] bg-secondary/50 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground/80 ring-1 ring-border/50">
      {children}
    </kbd>
  );
}

// The life cycle, one committed sprite per step, rendered by
// scripts/gen_lifecycle_sprites.py from the same master duck art as the dock
// icon — the finale is literally the brand bird.
const LIFECYCLE_ART: Record<WizardStep, string> = {
  welcome: eggSprite,
  provider: crackSprite,
  voice: hatchSprite,
  connections: ducklingSprite,
  done: duckSprite,
};

/** One lifecycle frame: dim while ahead, full colour once hatched, alive when current. */
function LifecycleFrame({
  step,
  state,
}: {
  step: WizardStep;
  state: 'walked' | 'current' | 'ahead';
}) {
  return (
    <img
      src={LIFECYCLE_ART[step]}
      alt=""
      draggable={false}
      className={`h-6 w-auto select-none ${
        state === 'current'
          ? 'origin-bottom motion-safe:animate-[hatch-wobble_2.2s_ease-in-out_infinite]'
          : state === 'walked'
            ? 'opacity-80 motion-safe:animate-[hatch-pop_0.45s_ease-out]'
            : 'opacity-30 grayscale'
      }`}
    />
  );
}

function HatchTrail({
  step,
  canReach,
  onStep,
}: {
  step: WizardStep;
  canReach: (target: WizardStep) => boolean;
  onStep: (target: WizardStep) => void;
}) {
  const current = WIZARD_STEPS.indexOf(step);
  return (
    <ol className="flex items-center gap-7" aria-label="Setup progress">
      {WIZARD_STEPS.map((name, i) => {
        const reachable = canReach(name) && i !== current;
        return (
          <li key={name}>
            <button
              type="button"
              disabled={!reachable}
              onClick={() => onStep(name)}
              aria-current={i === current ? 'step' : undefined}
              aria-label={`Go to ${STEP_COPY[name].label}`}
              className={`flex flex-col items-center gap-1.5 rounded-md px-1 py-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50 ${
                reachable ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
              }`}
            >
              <LifecycleFrame
                step={name}
                state={i < current ? 'walked' : i === current ? 'current' : 'ahead'}
              />
              <span
                className={`font-mono text-[10px] tracking-widest uppercase ${
                  i === current ? 'text-primary' : 'text-muted-foreground/50'
                }`}
              >
                {STEP_COPY[name].label}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** Shown on the provider step once a provider is already saved (back-navigation). */
function ProviderSavedCard({
  summary,
  onNext,
}: {
  summary: ProviderSetupSaved;
  onNext: () => void;
}) {
  return (
    <section className="rounded-2xl bg-card ring-1 ring-border/60 p-5">
      <p className="text-[13px] text-foreground">
        {summary.providerName} · <code className="font-mono">{summary.model}</code>
      </p>
      <p className="mt-1 text-[12px] text-muted-foreground">
        Saved. You can change providers any time at Settings → Setup.
      </p>
      <div className="mt-4">
        <Button size="sm" onClick={onNext}>
          Continue
        </Button>
      </div>
    </section>
  );
}

export function OnboardingWizard({ onFinished }: { onFinished: () => Promise<void> | void }) {
  const [state, dispatch] = useReducer(wizardReducer, initialWizardState);
  const backend = useYeaboiBackend();
  const { snapshot } = useSettingsSnapshot(backend.kind === 'ready');

  // The duck's mood: locked while the sign-in waits on the browser, pulses for
  // verdicts and saves, idle mannerisms otherwise.
  const [resting, setResting] = useState<DuckRest>('idle');
  const [duckState, pulse] = useDuckPulse(resting);
  const onFlowEvent = (event: ProviderSetupEvent) => {
    setResting('idle');
    if (event === 'signin-open') setResting('locked');
    else if (event === 'rejected') pulse('startled');
    else pulse('joined');
  };

  const [providerSummary, setProviderSummary] = useState<ProviderSetupSaved | null>(null);
  const [voiceSaved, setVoiceSaved] = useState<string[]>([]);
  const [connectionsSaved, setConnectionsSaved] = useState<string[]>([]);
  const [finishing, setFinishing] = useState(false);

  const flow = useProviderSetup({
    onSaved: (result) => {
      setProviderSummary(result);
      dispatch({ type: 'LLM_SAVED' });
    },
    onEvent: onFlowEvent,
  });

  const finish = async () => {
    setFinishing(true);
    try {
      await onFinished();
    } finally {
      setFinishing(false);
    }
  };

  // The TUI's keyboard grammar, kept: Esc steps back (through the provider
  // flow's own phases first), Enter advances where the next move is obvious.
  // The sign-in dialog owns the keyboard while it is open.
  const providerFlowActive = state.step === 'provider' && !(state.llmConfigured && providerSummary);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || flow.signingIn) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (providerFlowActive && flow.phase === 'model') flow.setPhase('credential');
        else if (providerFlowActive && flow.phase === 'credential') flow.setPhase('pick');
        else dispatch({ type: 'BACK' });
        return;
      }
      if (event.key !== 'Enter') return;
      if (state.step === 'welcome') {
        event.preventDefault();
        dispatch({ type: 'NEXT' });
      } else if (state.step === 'done' && !finishing) {
        event.preventDefault();
        void finish();
      } else if (
        providerFlowActive &&
        flow.phase === 'model' &&
        (flow.model !== '__custom__' || flow.custom.trim())
      ) {
        event.preventDefault();
        void flow.finish();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const copy = STEP_COPY[state.step];
  const needsBackend = state.step !== 'welcome' && state.step !== 'done';
  const blocked = needsBackend && backend.kind !== 'ready';
  // Welcome and Done are the wizard's hero moments — a centered stage. The
  // three working steps anchor to the top so their content has room and the
  // header doesn't jump between them.
  const hero = !needsBackend;

  const stepBody = blocked ? (
    <StepBackendNote backend={backend} onEmergencySkip={() => void finish()} />
  ) : (
    <>
      {state.step === 'welcome' && (
        <div className="flex flex-col items-center">
          <p className="mt-6 max-w-md text-[14px] leading-relaxed text-muted-foreground">
            yeaboi is your scrum master. Setup is three short steps: connect the model it thinks
            with, then — if you like — give it a voice and a face for calls, and the keys to your
            tools. Only the model is required.
          </p>
          <Button size="lg" className="mt-9 px-7" onClick={() => dispatch({ type: 'NEXT' })}>
            Get started
          </Button>
        </div>
      )}

      {state.step === 'provider' &&
        (state.llmConfigured && providerSummary ? (
          <ProviderSavedCard summary={providerSummary} onNext={() => dispatch({ type: 'NEXT' })} />
        ) : (
          <ProviderSetupFlow flow={flow} saveLabel="Save & continue" />
        ))}

      {state.step === 'voice' && (
        <VoiceStep
          snapshot={snapshot}
          onSaved={(envs) => {
            setVoiceSaved(envs);
            pulse('joined');
          }}
          onContinue={() => dispatch({ type: 'NEXT' })}
          onBack={() => dispatch({ type: 'BACK' })}
        />
      )}

      {state.step === 'connections' && (
        <ConnectionsStep
          snapshot={snapshot}
          onSaved={(title) => {
            setConnectionsSaved((current) =>
              current.includes(title) ? current : [...current, title],
            );
            pulse('joined');
          }}
          onContinue={() => dispatch({ type: 'NEXT' })}
          onBack={() => dispatch({ type: 'BACK' })}
        />
      )}

      {state.step === 'done' && (
        <div className="flex flex-col items-center">
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {providerSummary && (
              <span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-mono text-primary ring-1 ring-primary/25">
                {providerSummary.providerName} · {providerSummary.model}
              </span>
            )}
            <span className="rounded-full bg-secondary/60 px-3 py-1 text-[11px] font-mono text-muted-foreground">
              voice {voiceSaved.length ? '✓' : 'skipped'}
            </span>
            <span className="rounded-full bg-secondary/60 px-3 py-1 text-[11px] font-mono text-muted-foreground">
              {connectionsSaved.length
                ? `${connectionsSaved.length} connection${connectionsSaved.length > 1 ? 's' : ''} ✓`
                : 'connections skipped'}
            </span>
          </div>
          <p className="mt-5 max-w-md text-[14px] leading-relaxed text-muted-foreground">
            Everything here can be changed later in Settings. The skipped steps wait at Settings →
            Setup.
          </p>
          <div className="mt-9 flex items-center gap-3">
            <Button
              variant="outline"
              size="lg"
              disabled={finishing}
              onClick={() => dispatch({ type: 'BACK' })}
            >
              Back
            </Button>
            <Button size="lg" className="px-7" disabled={finishing} onClick={() => void finish()}>
              {finishing ? 'Waddling in…' : 'Take me in'}
            </Button>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-background text-foreground overflow-y-auto">
      {/* One quiet pool of light behind the stage — the void reads intentional. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(640px 440px at 50% 26%, color-mix(in oklab, var(--primary) 7%, transparent), transparent 72%)',
        }}
      />

      <div className="relative mx-auto flex min-h-full w-full max-w-3xl flex-1 flex-col px-8 pt-10 pb-6">
        {hero ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="flex items-end gap-4">
              <Duck state={duckState} size={104} />
              <p className="mb-7 rounded-2xl rounded-bl-sm bg-secondary/70 px-4 py-2.5 text-[13px] text-muted-foreground shadow-sm">
                {copy.quip}
              </p>
            </div>
            <h1 className="font-display italic tracking-tight text-5xl md:text-6xl mt-8">
              {copy.headline}
            </h1>
            {stepBody}
          </div>
        ) : (
          <>
            <header className="flex items-end gap-4">
              <Duck state={duckState} size={60} />
              <p className="mb-3 rounded-2xl rounded-bl-sm bg-secondary/70 px-4 py-2.5 text-[12.5px] text-muted-foreground shadow-sm">
                {copy.quip}
              </p>
            </header>
            <h1 className="font-display italic tracking-tight text-3xl md:text-4xl mt-6 mb-8">
              {copy.headline}
            </h1>
            <main className="flex-1 pb-10">{stepBody}</main>
          </>
        )}

        <footer className="relative mt-2 flex items-center justify-center border-t border-border/30 pt-5">
          {state.step !== 'welcome' && (
            <span className="absolute left-0 top-1/2 mt-2.5 flex -translate-y-1/2 items-center gap-1.5 text-[10.5px] font-body lowercase text-muted-foreground/50">
              <Key>esc</Key> back
              {/* Only promise Enter where the handler actually advances. */}
              {(state.step === 'done' || (providerFlowActive && flow.phase === 'model')) && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <Key>↵</Key> continue
                </>
              )}
            </span>
          )}
          <HatchTrail
            step={state.step}
            canReach={(target) => canGoTo(state, target)}
            onStep={(target) => dispatch({ type: 'GO_TO', step: target })}
          />
          {canEscape(state) && (
            <button
              type="button"
              className="absolute right-0 top-1/2 mt-2.5 -translate-y-1/2 rounded-full px-3 py-1 text-[11px] font-body text-muted-foreground/70 ring-1 ring-border/50 transition-colors hover:text-foreground hover:ring-primary/40"
              onClick={() => dispatch({ type: 'FINISH' })}
            >
              Skip the rest →
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
