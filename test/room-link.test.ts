// The link from a plan to the vendored session row that the call and the
// board hang off: made from the plan's name, found by the engine id.

import { describe, expect, it } from 'vitest';
import { linkBody, linkQuery, pickLinked } from '../src/renderer/lib/planning/room-link';

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
