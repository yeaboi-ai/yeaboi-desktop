// What each mode leaves behind for the modes after it — the sentences under
// the ledger that say what the flow is for. The Agents world's reports scope
// by repo rather than by what earlier runs left, so it has no flow.

import type { Audience } from '@shared/audience';
import { SOLO_EXCLUDED } from './capabilities';

export interface FlowStep {
  key: string;
  label: string;
  leaves: string;
}

export const FLOW: readonly FlowStep[] = [
  {
    key: 'project-planning',
    label: 'Plan',
    leaves: 'a sprint plan with epics, stories and tasks',
  },
  {
    key: 'team-analysis',
    label: 'Analysis',
    leaves: 'a team profile a plan can start from',
  },
  {
    key: 'daily-standup',
    label: 'Standup',
    leaves: 'blockers and a confidence trend',
  },
  {
    key: 'poker',
    label: 'Poker',
    leaves: 'estimates the team agreed on',
  },
  {
    key: 'retro',
    label: 'Retro',
    leaves: 'action items and carry-over',
  },
  {
    key: 'reporting',
    label: 'Report',
    leaves: 'a report you can send as it is',
  },
];

/** The steps a world's menu covers, in flow order. `available` is the world's
 *  card keys as the sidecar serves them (its whole menu, not the one-off runs:
 *  planning is a step and never a one-off run). */
export function flowFor(_audience: Audience, available: Iterable<string>): FlowStep[] {
  const keys = new Set(available);
  return FLOW.filter((step) => keys.has(step.key));
}

/** The world's flow keys when the sidecar cannot be asked. */
export function fallbackFlowKeys(audience: Audience): string[] {
  const keys = FLOW.map((step) => step.key);
  return audience === 'solo' ? keys.filter((key) => !SOLO_EXCLUDED.has(key)) : keys;
}
