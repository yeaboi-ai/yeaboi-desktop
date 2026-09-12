// The link from a plan to the vendored session row that the call and the
// board hang off: made from the plan's name, found by the engine id.

import { describe, expect, it } from 'vitest';
import {
  describedBy,
  linkBody,
  linkNaming,
  linkQuery,
  pickLinked,
} from '../src/renderer/lib/planning/room-link';

describe('linkBody', () => {
  it('names the row after the plan and carries the engine id', () => {
    expect(linkBody('new-abc12345-2026-09-11', ' Barber booking ', ' a barber app ')).toEqual({
      name: 'Barber booking',
      description: 'a barber app',
      yeaboi_session_id: 'new-abc12345-2026-09-11',
    });
  });

  it('still names an untitled plan', () => {
    expect(linkBody('s1', '', '').name).toBe('Plan');
  });
});

describe('linkQuery and pickLinked', () => {
  it('asks the list for the one row, escaped', () => {
    expect(linkQuery('a b')).toBe('/api/sessions?yeaboi_session_id=a%20b');
  });

  it('trusts the id on the row, not the filter', () => {
    const rows = [
      { id: 'v1', yeaboi_session_id: 'other' },
      { id: 'v2', yeaboi_session_id: 's1' },
    ];
    expect(pickLinked(rows, 's1')?.id).toBe('v2');
    expect(pickLinked(rows, 'nope')).toBeNull();
    expect(pickLinked([{ id: 'v3' }], 's1')).toBeNull();
  });
});

describe('describedBy and linkNaming', () => {
  const said = (text: string) => ({ type: 'user' as const, text });
  const view = (opening: string, transcript: { type: 'user'; text: string }[]) =>
    ({ title: 'Barber booking', opening, transcript, stage: 'intake', question: null }) as never;

  it('uses the description while it is still waiting to be sent', () => {
    expect(describedBy(view('  A booking site.  ', []))).toBe('A booking site.');
  });

  it('falls back to the first thing the reader said once the opening is gone', () => {
    expect(describedBy(view('', [said('A booking site.'), said('Jira')]))).toBe('A booking site.');
  });

  it('is empty with nothing to go on, and names the row after the plan', () => {
    expect(describedBy(null)).toBe('');
    expect(linkNaming(null)).toEqual({ title: '', description: '' });
    expect(linkNaming(view('', [said('A booking site.')]))).toEqual({
      title: 'Barber booking',
      description: 'A booking site.',
    });
  });
});
