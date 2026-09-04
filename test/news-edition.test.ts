// The rest of the edition at the foot of the sheet.

import { describe, expect, it } from 'vitest';
import { INSIDE_TITLE, insideLabel, insideLines } from '../src/renderer/lib/news/edition';
import type { NewsItem } from '../src/renderer/lib/news/types';

const item = (id: string): NewsItem => ({
  id,
  title: `Story ${id}`,
  url: `https://x.example/${id}`,
  source_id: 'a',
  source_name: 'A',
  published: '',
  summary: '',
  image_url: null,
  kind: 'article',
  topic: 'general',
  column: 'ai',
});

describe('insideLines', () => {
  const stories = ['a', 'b', 'c', 'd'].map(item);

  it('lists every other story in edition order, with its index and its page', () => {
    expect(insideLines(stories, 1).map((line) => [line.index, line.page, line.item.id])).toEqual([
      [0, 1, 'a'],
      [2, 3, 'c'],
      [3, 4, 'd'],
    ]);
  });

  it('is empty with two stories or fewer, where the chevrons already say it all', () => {
    expect(insideLines(stories.slice(0, 2), 0)).toEqual([]);
    expect(insideLines([], 0)).toEqual([]);
  });

  it('has a title in the paper voice', () => {
    expect(INSIDE_TITLE).toBe('Inside this edition');
    expect(INSIDE_TITLE).not.toMatch(/[·→—]/);
  });
});

describe('insideLabel', () => {
  it('says what is folded away, and only the title once it is open', () => {
    expect(insideLabel(false, 11)).toBe('Inside this edition, 11 more stories');
    expect(insideLabel(false, 1)).toBe('Inside this edition, 1 more story');
    expect(insideLabel(true, 11)).toBe('Inside this edition');
  });
});
