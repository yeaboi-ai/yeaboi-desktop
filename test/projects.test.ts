// The Projects lists' pure half: the status split and the one control's words.

import { describe, expect, it } from 'vitest';
import {
  isDone,
  nextStatus,
  splitProjects,
  statusActionLabel,
  statusWord,
} from '../src/renderer/lib/yeaboi/projects';

const row = (id: string, created_at: string, over: Record<string, unknown> = {}) => ({
  id,
  created_at,
  ...over,
});

describe('isDone', () => {
  it('is true only for the explicit word', () => {
    expect(isDone({ status: 'completed' })).toBe(true);
    expect(isDone({ status: 'active' })).toBe(false);
    expect(isDone({ status: null })).toBe(false);
    expect(isDone({})).toBe(false);
  });
});

describe('splitProjects', () => {
  it('counts a row with no status as in progress', () => {
    const { active, done } = splitProjects([row('a', '2026-09-01T00:00:00')]);
    expect(active.map((r) => r.id)).toEqual(['a']);
    expect(done).toEqual([]);
  });

  it('puts done rows under Completed', () => {
    const { active, done } = splitProjects([
      row('a', '2026-09-01T00:00:00', { status: 'active' }),
      row('b', '2026-09-02T00:00:00', { status: 'completed' }),
    ]);
    expect(active.map((r) => r.id)).toEqual(['a']);
    expect(done.map((r) => r.id)).toEqual(['b']);
  });

  it('orders each list newest first by updated_at, falling back to created_at', () => {
    const { active } = splitProjects([
      row('old', '2026-08-01T00:00:00'),
      row('touched', '2026-07-01T00:00:00', { updated_at: '2026-09-04T00:00:00' }),
      row('new', '2026-09-01T00:00:00'),
    ]);
    expect(active.map((r) => r.id)).toEqual(['touched', 'new', 'old']);
  });

  it('leaves the input untouched', () => {
    const rows = [row('a', '2026-08-01T00:00:00'), row('b', '2026-09-01T00:00:00')];
    splitProjects(rows);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('nextStatus', () => {
  it('toggles between the two words', () => {
    expect(nextStatus('active')).toBe('completed');
    expect(nextStatus('completed')).toBe('active');
    expect(nextStatus(undefined)).toBe('completed');
  });
});

describe('the words', () => {
  it('state the status in sentence case', () => {
    expect(statusWord('completed')).toBe('Completed');
    expect(statusWord('active')).toBe('In progress');
    expect(statusWord(undefined)).toBe('In progress');
  });

  it('name the action that moves it', () => {
    expect(statusActionLabel('completed')).toBe('Reopen');
    expect(statusActionLabel('active')).toBe('Mark done');
    expect(statusActionLabel(null)).toBe('Mark done');
  });
});
