'use client';

import { CoachMarks as SharedCoachMarks, type CoachMarkStep } from '@/components/ui/coach-marks';

const STORAGE_KEY = 'coach-marks-seen-v1';

const STEPS: CoachMarkStep[] = [
  {
    title: 'Speak naturally',
    body: "Your AI facilitator listens through your microphone and responds in real time. Start a thought — it'll join in at natural pauses.",
    position: { top: 'calc(50% - 80px)', left: 'calc(50% - 200px)' },
  },
  {
    title: 'Watch the orb',
    body: "The AI orb shows what the agent is doing right now: listening, thinking, speaking, or paused. If it's silent, it's probably listening.",
    position: { top: '120px', right: '32px' },
  },
  {
    title: 'Open the transcript',
    body: 'Everything said is captured live in the chat drawer. You can correct mis-heard words there — corrections also teach the agent for next time.',
    position: { bottom: '120px', right: '32px' },
  },
];

/** Session-page coach marks. localStorage-gated; one-shot per browser. */
export function CoachMarks() {
  return (
    <SharedCoachMarks steps={STEPS} gate={{ kind: 'localStorage', storageKey: STORAGE_KEY }} />
  );
}
