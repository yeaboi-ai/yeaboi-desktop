// The planning interview's flow, without a chat to click through.
//
// The whole point of keeping the script pure is that "what happens when you
// turn down the name twice" is a table of cases rather than an afternoon in
// the app.

import { describe, expect, it } from 'vitest';

import {
  type Interview,
  advance,
  resolve,
  running,
  start,
  takesTyping,
  turnFor,
} from '../src/renderer/lib/yeaboi/planning-interview';

/** The interview at the step a description has just been given. */
function described(said = 'a billing rewrite'): Interview {
  const [naming] = advance(advance(start(), 'new')[0], said);
  return naming;
}

describe('the opening', () => {
  it('offers a way on, a way in and a way out', () => {
    const chips = turnFor(start()).bubble;
    expect(chips?.kind).toBe('chips');
    expect(chips?.kind === 'chips' && chips.choices.map((c) => c.id)).toEqual([
      'new',
      'roadmap',
      'dismiss',
    ]);
  });

  it('offers the project in progress by name, when there is one', () => {
    const chips = turnFor(start({ id: 'p1', title: 'Billing' })).bubble;
    const carry = chips?.kind === 'chips' && chips.choices.find((c) => c.id === 'carry');
    expect(carry && carry.label).toBe('Carry on: Billing');
  });

  it('turning it down closes it without creating anything', () => {
    const [next, effect] = advance(start(), 'dismiss');
    expect(effect).toEqual({ do: 'close' });
    expect(next.done).toBe('dismissed');
    expect(running(next)).toBe(false);
  });

  it('carrying on opens the project rather than starting one', () => {
    const [, effect] = advance(start({ id: 'p1', title: 'Billing' }), 'carry');
    expect(effect).toEqual({ do: 'open', id: 'p1' });
  });
});

describe('describing', () => {
  it('takes the composer’s words only while it is asking for them', () => {
    const [asking] = advance(start(), 'new');
    expect(takesTyping(asking)).toBe(true);
    expect(takesTyping(described())).toBe(false);
  });

  it('an empty answer changes nothing', () => {
    const [asking] = advance(start(), 'new');
    const [same, effect] = advance(asking, '   ');
    expect(same).toEqual(asking);
    expect(effect).toEqual({ do: 'none' });
  });

  it('sends the description off to be named', () => {
    const [next, effect] = advance(advance(start(), 'new')[0], 'a billing rewrite');
    expect(next.step).toBe('naming');
    expect(effect).toEqual({ do: 'name', description: 'a billing rewrite' });
  });
});

describe('the name', () => {
  it('is offered for correction, not announced', () => {
    const turn = turnFor(resolve(described(), { name: 'billing rewrite' }));
    expect(turn.say).toContain('billing rewrite');
    expect(turn.bubble?.kind).toBe('field');
    expect(turn.bubble?.kind === 'field' && turn.bubble.value).toBe('billing rewrite');
  });

  it('turning it down asks for another, naming the one already refused', () => {
    const offered = resolve(described(), { name: 'billing rewrite' });
    const [next, effect] = advance(offered, 'retry');
    expect(next.step).toBe('naming');
    // The description is what gets named; the refused name rides on the state.
    expect(effect).toEqual({ do: 'name', description: 'a billing rewrite' });
    expect(next.name).toBe('billing rewrite');
  });

  it('an edited name is the one created, not the one offered', () => {
    const offered = resolve(described(), { name: 'billing rewrite' });
    const [next, effect] = advance(offered, 'invoicing overhaul');
    expect(next.name).toBe('invoicing overhaul');
    expect(effect).toEqual({
      do: 'create',
      description: 'a billing rewrite',
      name: 'invoicing overhaul',
    });
  });

  it('confirming with nothing typed keeps the one offered', () => {
    const offered = resolve(described(), { name: 'billing rewrite' });
    const [, effect] = advance(offered, '');
    expect(effect).toEqual({
      do: 'create',
      description: 'a billing rewrite',
      name: 'billing rewrite',
    });
  });
});

describe('a step that is waiting', () => {
  it('takes no answers', () => {
    const waiting = described();
    expect(advance(waiting, 'yes')).toEqual([waiting, { do: 'none' }]);
  });

  it('says what it is doing rather than spinning', () => {
    expect(turnFor(described()).bubble).toEqual({ kind: 'working', note: 'Finding it a name' });
  });
});

describe('failure', () => {
  it('puts the question back rather than ending the interview', () => {
    const offered = resolve(described(), { name: 'billing rewrite' });
    const [creating] = advance(offered, 'billing rewrite');
    const after = resolve(creating, { failed: 'the backend said no' });
    expect(after.step).toBe('confirming');
    expect(running(after)).toBe(true);
  });
});

describe('the end', () => {
  it('hands back the project it made', () => {
    const offered = resolve(described(), { name: 'billing rewrite' });
    const [creating] = advance(offered, 'billing rewrite');
    const done = resolve(creating, { created: { id: 'p9' } });
    expect(done.done).toEqual({ id: 'p9' });
    const turn = turnFor(done);
    expect(turn.bubble?.kind).toBe('card');
    expect(turn.bubble?.kind === 'card' && turn.bubble.title).toBe('billing rewrite');
    expect(advance(done, 'open')[1]).toEqual({ do: 'open', id: 'p9' });
  });
});
