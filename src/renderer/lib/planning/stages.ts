// The stage strip: the plan as the conversation walks it, in the terminal's
// six words, and which one a wire stage lights. Pure (test/stages.test.ts).

import type { Stage } from '@/lib/yeaboi/chat';

export const STAGE_WORDS = ['Describe', 'Questions', 'Review', 'Epic', 'Build', 'Sprints'] as const;

/** The index of the word a stage lights. Intake is Describe until a question
 *  has been asked, then Questions; the three build stages share Build; the
 *  free chat after the sprint plan is Sprints, done. */
export function stageStep(stage: Stage, asked: boolean): number {
  switch (stage) {
    case 'intake':
      return asked ? 1 : 0;
    case 'review':
      return 2;
    case 'epic':
      return 3;
    case 'pipeline':
    case 'capacity':
    case 'spike':
      return 4;
    case 'chat':
      return 5;
  }
}
