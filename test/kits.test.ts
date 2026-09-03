// Who wears what: six kits, one per world and door, no two the same, so a
// screen says which way of working and which world with no label.

import { describe, expect, it } from 'vitest';
import { AUDIENCES } from '../src/shared/audience';
import { DOORS } from '../src/renderer/lib/yeaboi/home';
import { KITS, KIT_NAMES, KIT_SLOT, kitFor } from '../src/renderer/lib/yeaboi/kits';

describe('the kits', () => {
  it('give every world and door its own, none shared', () => {
    const worn = AUDIENCES.flatMap((audience) => DOORS.map((door) => kitFor(audience, door)));
    expect(worn).toHaveLength(6);
    expect(new Set(worn).size).toBe(6);
    expect([...worn].sort()).toEqual([...KIT_NAMES].sort());
  });

  it('keep Team apart from Solo on both doors', () => {
    expect(KITS.team.projects).not.toBe(KITS.solo.projects);
    expect(KITS.team.sessions).not.toBe(KITS.solo.sessions);
  });

  it('put the ring around the body and everything else on top', () => {
    for (const kit of KIT_NAMES) expect(['body', 'top']).toContain(KIT_SLOT[kit]);
    expect(KIT_SLOT.ring).toBe('body');
    expect(KIT_NAMES.filter((kit) => KIT_SLOT[kit] === 'body')).toEqual(['ring']);
  });
});
