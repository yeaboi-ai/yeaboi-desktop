// What the duck in the Projects header says: three pages on how a project
// works, and the words on the bubble's controls. Pure so the copy and the
// stepping are covered from the node lane; the component reads them.

import type { FlowStep } from './reads';

/** localStorage key: the walkthrough was read on this machine. */
export const GUIDE_SEEN_KEY = 'projects-guide-seen';

export const GOT_IT_LABEL = 'Got it';
export const NEXT_LABEL = 'Next';
export const REOPEN_LABEL = 'How projects work';
/** The page dots' labels, one per page. */
export const PAGE_LABEL = (n: number) => `Page ${n}`;

/** One step's part in a project, as a verb phrase after its label. */
export const RELATED_CLAUSE: Record<string, string> = {
  'project-planning': 'frames every other run',
  'team-analysis': 'profiles the team',
  'daily-standup': 'tracks its blockers',
  poker: 'sizes its tickets',
  retro: 'carries actions over',
  reporting: 'reads all of it',
};

export const RELATED_TITLE = 'Everything inside stays related';
/** The Agents world has no flow: its projects scope by repository (flow.py's AGENTS_FLOW_LINE). */
export const AGENTS_RELATED_TITLE = 'Reports scope by repository';
export const AGENTS_RELATED_LINE =
  'Agents projects scope their reports to one repository, so every report inside reads the same code.';

export interface GuideItem {
  key: string;
  label: string;
  clause: string;
}

export interface GuidePage {
  title: string;
  body: string;
  /** The world's steps and their parts; only the related page carries them. */
  items?: GuideItem[];
}

const FIRST_PAGE: GuidePage = {
  title: 'One piece of work',
  body: 'Plan it once and keep coming back to it. Describe it below and yeaboi names it — a description is a start, not a commitment.',
};

const LAST_PAGE: GuidePage = {
  title: 'It grows as you go',
  body: 'Each run reads what the runs before it left. A session is the other door: one run, nothing carried.',
};

/** The world's steps that have a part to play, in flow order. */
export function relatedItems(steps: readonly FlowStep[]): GuideItem[] {
  return steps.flatMap((step) => {
    const clause = RELATED_CLAUSE[step.key];
    return clause ? [{ key: step.key, label: step.label, clause }] : [];
  });
}

function joinClauses(clauses: string[]): string {
  if (clauses.length <= 1) return clauses.join('');
  return `${clauses.slice(0, -1).join(', ')} and ${clauses[clauses.length - 1]}`;
}

/** The related page as one sentence, for a reader who hears it rather than sees it. */
export function relatedLine(steps: readonly FlowStep[]): string {
  const items = relatedItems(steps);
  if (items.length === 0) return AGENTS_RELATED_LINE;
  const clauses = items.map((item) => `${item.label.toLowerCase()} ${item.clause}`);
  return `${RELATED_TITLE}: ${joinClauses(clauses)}.`;
}

function relatedPage(steps: readonly FlowStep[]): GuidePage {
  const items = relatedItems(steps);
  if (items.length === 0) return { title: AGENTS_RELATED_TITLE, body: AGENTS_RELATED_LINE };
  return { title: RELATED_TITLE, body: '', items };
}

/** The walkthrough, three pages. */
export function guidePages(steps: readonly FlowStep[]): GuidePage[] {
  return [FIRST_PAGE, relatedPage(steps), LAST_PAGE];
}

/** The page to show after stepping by `delta`; the ends hold rather than wrap,
 *  so the last page is where Got it lands. */
export function stepIndex(index: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, index + delta));
}
