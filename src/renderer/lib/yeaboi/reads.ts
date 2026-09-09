// What each run inside a project reads from the runs before it, and what it
// leaves for the next. Mirrors `projects/flow.py` in the yeaboi package; the
// two tables are kept equal by hand. The Agents world's reports scope by
// repo, not by what earlier runs left, so it has no flow.

import type { Audience } from '@shared/audience';
import { SOLO_EXCLUDED } from './capabilities';

export interface FlowStep {
  key: string;
  label: string;
  /** Context tokens, the vocabulary of `context-deps.ts`. */
  reads: readonly string[];
  leaves: string;
}

export const FLOW: readonly FlowStep[] = [
  {
    key: 'project-planning',
    label: 'Plan',
    reads: ['retro', 'standup', 'analysis'],
    leaves: 'the sprint plan every other run frames itself with',
  },
  {
    key: 'team-analysis',
    label: 'Analysis',
    reads: [],
    leaves: 'the team profile a scoped plan starts from',
  },
  {
    key: 'daily-standup',
    label: 'Standup',
    reads: ['plan'],
    leaves: 'blockers and a confidence trend',
  },
  {
    key: 'poker',
    label: 'Poker',
    reads: ['plan', 'standup', 'retro', 'analysis'],
    leaves: 'estimates sized to this project',
  },
  {
    key: 'retro',
    label: 'Retro',
    reads: ['retro', 'standup'],
    leaves: 'action items and carry-over',
  },
  {
    key: 'reporting',
    label: 'Report',
    reads: ['plan'],
    leaves: 'a report about this project alone',
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
