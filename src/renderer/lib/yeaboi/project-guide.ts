// What the duck in the Projects header says: a three-line walkthrough of how
// a project works, and the words on the bubble's controls. Pure so the copy
// and the stepping are covered from the node lane; the component reads them.

import type { FlowStep } from './reads';

/** localStorage key: the walkthrough was read on this machine. */
export const GUIDE_SEEN_KEY = 'projects-guide-seen';

export const GOT_IT_LABEL = 'Got it';
export const REOPEN_LABEL = 'How projects work';
export const PREV_LABEL = 'Previous';
export const NEXT_LABEL = 'Next';

export const FIRST_LINE =
  'A project is one piece of work you plan once and keep coming back to. Describe it below and yeaboi names it.';

export const LAST_LINE =
  'It grows as you go: each run reads what the runs before it left. A session is the other door, one run with nothing carried.';

/** What each step of the flow does for the project, one clause each. */
export const RELATED_CLAUSE: Record<string, string> = {
  'project-planning': 'the plan frames every other run',
  'team-analysis': 'analysis profiles the team',
  'daily-standup': 'standups track its blockers',
  poker: 'poker sizes its tickets',
  retro: 'retros carry actions over',
  reporting: 'reports read all of it',
};

/** The Agents world has no flow: its projects scope by repository (flow.py's AGENTS_FLOW_LINE). */
export const AGENTS_RELATED_LINE =
  'Agents projects scope their reports to one repository, so every report inside reads the same code.';

const RELATED_OPENING = 'Everything inside stays related: ';

function joinClauses(clauses: string[]): string {
  if (clauses.length <= 1) return clauses.join('');
  return `${clauses.slice(0, -1).join(', ')} and ${clauses[clauses.length - 1]}`;
}

/** The middle line, true for the world: its steps' clauses in flow order. */
export function relatedLine(steps: readonly FlowStep[]): string {
  const clauses = steps.map((step) => RELATED_CLAUSE[step.key]).filter((c): c is string => !!c);
  if (clauses.length === 0) return AGENTS_RELATED_LINE;
  return `${RELATED_OPENING}${joinClauses(clauses)}.`;
}

/** The walkthrough, three lines. */
export function guideLines(steps: readonly FlowStep[]): string[] {
  return [FIRST_LINE, relatedLine(steps), LAST_LINE];
}

/** The line to show after stepping by `delta`; the ends hold rather than wrap,
 *  so the last line is where Got it lands. */
export function stepIndex(index: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, index + delta));
}
