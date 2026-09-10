// List-valued settings: the operations between the stored joined string and
// the rows an editor shows.

import { describe, expect, it } from 'vitest';
import {
  addUnique,
  isEmailish,
  joinCsv,
  removeAt,
  replaceAt,
  splitCsv,
} from '../src/renderer/lib/settings/list-edit';

describe('splitCsv', () => {
  it('trims entries and drops blanks', () => {
    expect(splitCsv(' /one , /two ,, ')).toEqual(['/one', '/two']);
  });

  it('an unset value is no entries', () => {
    expect(splitCsv('')).toEqual([]);
  });

  it('round-trips through joinCsv', () => {
    expect(splitCsv(joinCsv(['a@x.com', 'b@y.com']))).toEqual(['a@x.com', 'b@y.com']);
  });
});

describe('addUnique', () => {
  it('appends, preserving order', () => {
    expect(addUnique(['/one'], '/two')).toEqual(['/one', '/two']);
  });

  it('a duplicate changes nothing', () => {
    const items = ['/one'];
    expect(addUnique(items, '/one')).toBe(items);
  });

  it('a blank changes nothing', () => {
    const items = ['/one'];
    expect(addUnique(items, '   ')).toBe(items);
  });
});

describe('replaceAt', () => {
  it('swaps one entry in place', () => {
    expect(replaceAt(['/one', '/two'], 1, '/three')).toEqual(['/one', '/three']);
  });

  it('a replacement that duplicates another entry collapses onto it', () => {
    expect(replaceAt(['/one', '/two'], 1, '/one')).toEqual(['/one']);
  });

  it('an index off the end changes nothing', () => {
    const items = ['/one'];
    expect(replaceAt(items, 4, '/two')).toBe(items);
  });
});

describe('removeAt', () => {
  it('drops the entry at the index', () => {
    expect(removeAt(['/one', '/two', '/three'], 1)).toEqual(['/one', '/three']);
  });
});

describe('isEmailish', () => {
  it('accepts ordinary addresses', () => {
    expect(isEmailish('dev@team.com')).toBe(true);
    expect(isEmailish('first.last+tag@sub.domain.co.uk')).toBe(true);
  });

  it('refuses what cannot be an address', () => {
    expect(isEmailish('nope')).toBe(false);
    expect(isEmailish('a@b')).toBe(false);
    expect(isEmailish('a b@c.com')).toBe(false);
  });

  it('refuses an entry carrying the separator, which would split into two', () => {
    expect(isEmailish('a@x.com,b@y.com')).toBe(false);
  });
});
