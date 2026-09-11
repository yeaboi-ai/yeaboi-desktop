// The stage strip: six words, and which one a wire stage lights.

import { describe, expect, it } from 'vitest';
import { STAGE_WORDS, stageStep } from '../src/renderer/lib/planning/stages';

describe('the strip', () => {
  it('reads as the terminal does, in plain words', () => {
    expect(STAGE_WORDS).toEqual(['Describe', 'Questions', 'Review', 'Epic', 'Build', 'Sprints']);
  });

  it('lights Describe until a question is asked, then walks the pipeline', () => {
    expect(stageStep('intake', false)).toBe(0);
    expect(stageStep('intake', true)).toBe(1);
    expect(stageStep('review', true)).toBe(2);
    expect(stageStep('epic', true)).toBe(3);
    for (const stage of ['pipeline', 'capacity', 'spike'] as const) {
      expect(stageStep(stage, true)).toBe(4);
    }
    expect(stageStep('chat', true)).toBe(5);
  });
});
