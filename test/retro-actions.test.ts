// What the hub calls an open action, and how one is corrected.
//
// The wall on the retro page is the only place outside a live board where a
// retro's actions can be changed, so the two facts it rests on are tested
// here: which cards are actions at all, and the artifact path that addresses
// one of them.

import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/renderer/lib/yeaboi/api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiStream: vi.fn(),
  callTool: vi.fn(async (tool: string, args: unknown) => ({ data: { tool, args } })),
}));

import { callTool } from '../src/renderer/lib/yeaboi/api';
import { editAction, openActions } from '../src/renderer/lib/yeaboi/boards';

const REPORT = {
  cards: [
    { id: 'c1', text: 'Split the deploy job', grid: 'action_items', status: 'pending' },
    { id: 'c2', text: 'The demo landed well', grid: 'went_well' },
    { id: 'c3', text: 'Write the runbook', grid: 'action_items', status: 'done' },
  ],
  carried_action_items: [
    { id: 'k1', text: 'Chase the vendor', grid: 'action_items', status: 'carried_over' },
    { id: 'c1', text: 'Split the deploy job', grid: 'action_items', status: 'pending' },
  ],
};

describe('openActions', () => {
  const rows = openActions(REPORT);

  it('takes only the action column, not the whole board', () => {
    expect(rows.map((row) => row.id)).toEqual(['c1', 'k1']);
  });

  it('drops an action somebody already closed', () => {
    expect(rows.some((row) => row.id === 'c3')).toBe(false);
  });

  it('keeps a carried item once, under the list it was first seen in', () => {
    expect(rows.filter((row) => row.id === 'c1')).toHaveLength(1);
    expect(rows[0]!.anchor).toBe('cards[id=c1]');
  });

  it('addresses a carried item by its own list', () => {
    expect(rows[1]!.anchor).toBe('carried_action_items[id=k1]');
  });

  it('is empty for a session with no retro behind it', () => {
    expect(openActions(null)).toEqual([]);
  });
});

describe('editAction', () => {
  const row = openActions(REPORT)[0]!;

  it('corrects the text against the value it is replacing', async () => {
    await editAction('sess-1', row, { text: 'Split the deploy job in two' }, 'Ada');
    expect(callTool).toHaveBeenLastCalledWith('artifact_edit_apply', {
      kind: 'retro',
      session_id: 'sess-1',
      edits: [
        {
          op: 'set',
          path: 'cards[id=c1].text',
          value: 'Split the deploy job in two',
          base: 'Split the deploy job',
        },
      ],
      author: 'Ada',
    });
  });

  it('closes an action by writing its status, not by removing the row', async () => {
    await editAction('sess-1', row, { status: 'done' }, 'Ada');
    expect(callTool).toHaveBeenLastCalledWith(
      'artifact_edit_apply',
      expect.objectContaining({
        edits: [{ op: 'set', path: 'cards[id=c1].status', value: 'done', base: 'pending' }],
      }),
    );
  });
});
