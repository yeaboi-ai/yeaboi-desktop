// Reaching into the screensaver: the one exemption to "anything wakes it".
//
// The saver's promise is that it leaves the instant somebody is there, and
// this is the only thing that bends it. Every branch below is a way that
// promise could quietly stop holding, so the table is exhaustive on purpose.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isModifierKey,
  reachHint,
  reachInput,
  reachStep,
  type ReachState,
} from '../src/renderer/lib/screensaver/reach';

const read = (...parts: string[]) => readFileSync(join(__dirname, '..', ...parts), 'utf8');

const PASSIVE: ReachState = { reachable: true, reaching: false };
const REACHING: ReachState = { reachable: true, reaching: true };
const CANVAS: ReachState = { reachable: false, reaching: false };

const ev = (type: string, over: { key?: string; mod?: boolean } = {}) => ({
  type,
  key: over.key,
  mod: over.mod ?? false,
});

describe('a scene with nothing to click', () => {
  it('wakes on everything, exactly as it always has', () => {
    for (const type of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'focus']) {
      expect(reachStep(ev(type), CANVAS).wakes).toBe(true);
    }
  });

  it('never opens a reach, not even on the modifier', () => {
    // Exempting a key on a canvas scene would be pure loss: there is nothing
    // there to click.
    const out = reachStep(ev('keydown', { key: 'Meta', mod: true }), CANVAS);
    expect(out.reaching).toBe(false);
    expect(out.wakes).toBe(true);
  });
});

describe('opening the reach', () => {
  it('the bare modifier holds instead of dismissing', () => {
    for (const key of ['Meta', 'Control']) {
      const out = reachStep(ev('keydown', { key, mod: true }), PASSIVE);
      expect(out.reaching).toBe(true);
      expect(out.wakes).toBe(false);
    }
  });

  it('any other key is a person, and dismisses', () => {
    const out = reachStep(ev('keydown', { key: 'k', mod: true }), REACHING);
    expect(out.wakes).toBe(true);
    expect(out.reaching).toBe(false);
  });

  it('Escape dismisses like anything else', () => {
    expect(reachStep(ev('keydown', { key: 'Escape' }), REACHING).wakes).toBe(true);
  });
});

describe('pointer events while reaching', () => {
  it('movement does not dismiss — moving to a story is the whole point', () => {
    expect(reachStep(ev('pointermove', { mod: true }), REACHING).wakes).toBe(false);
  });

  it('a press does not dismiss, so the click can land on the anchor', () => {
    // The regression this guards: the overlay swallowing pointerdown is what
    // made the links unclickable in the first place.
    expect(reachStep(ev('pointerdown', { mod: true }), REACHING).wakes).toBe(false);
  });

  it('movement dismisses when nothing is held', () => {
    expect(reachStep(ev('pointermove'), PASSIVE).wakes).toBe(true);
    expect(reachStep(ev('pointerdown'), PASSIVE).wakes).toBe(true);
  });

  it('a keyup lost to an app switch cannot hold the reach open', () => {
    // The flag is read off the event, not off remembered state, so the first
    // movement without the modifier both ends the reach and dismisses.
    const out = reachStep(ev('pointermove', { mod: false }), REACHING);
    expect(out.reaching).toBe(false);
    expect(out.wakes).toBe(true);
  });
});

describe('releasing', () => {
  it('returns to passive without dismissing', () => {
    // A held key is self-cancelling, so release needs no grace window: the
    // next movement dismisses through the ordinary contract.
    const out = reachStep(ev('keyup', { key: 'Meta', mod: false }), REACHING);
    expect(out.reaching).toBe(false);
    expect(out.wakes).toBe(false);
  });

  it('a second modifier still down keeps the reach', () => {
    expect(reachStep(ev('keyup', { key: 'Control', mod: true }), REACHING).reaching).toBe(true);
  });

  it('never wakes, even when nothing was being held', () => {
    expect(reachStep(ev('keyup', { key: 'a' }), PASSIVE).wakes).toBe(false);
  });
});

describe('focus', () => {
  it('does not dismiss while reaching — clicking a story focuses its anchor', () => {
    // The listener is capture-phase on the window, so it sees inner focus
    // changes too. Without this the saver would vanish on mousedown, before
    // the click ever reached the link.
    expect(reachStep(ev('focus'), REACHING).wakes).toBe(false);
  });

  it('dismisses when nothing is being reached', () => {
    // Coming back from the browser: blur has already ended the reach.
    expect(reachStep(ev('focus'), PASSIVE).wakes).toBe(true);
  });
});

describe('the wheel', () => {
  it('scrolls the paper while reaching, rather than dismissing it', () => {
    // The paper is taller than the window: reaching in to read the rest is
    // the same gesture as reaching in to click.
    expect(reachStep(ev('wheel', { mod: true }), REACHING).wakes).toBe(false);
  });

  it('dismisses when nothing is held', () => {
    expect(reachStep(ev('wheel'), PASSIVE).wakes).toBe(true);
    expect(reachStep(ev('wheel', { mod: true }), PASSIVE).wakes).toBe(true);
  });

  it('a lost keyup cannot leave the paper scrollable', () => {
    const out = reachStep(ev('wheel', { mod: false }), REACHING);
    expect(out.reaching).toBe(false);
    expect(out.wakes).toBe(true);
  });

  it('never dismisses on a canvas scene by accident', () => {
    expect(reachStep(ev('wheel', { mod: true }), CANVAS).wakes).toBe(true);
  });
});

describe('reachInput', () => {
  it('reads the type, the key and either modifier', () => {
    expect(reachInput({ type: 'keydown', key: 'Meta', metaKey: true } as unknown as Event)).toEqual(
      {
        type: 'keydown',
        key: 'Meta',
        mod: true,
      },
    );
    expect(reachInput({ type: 'pointermove', ctrlKey: true } as unknown as Event).mod).toBe(true);
    expect(reachInput({ type: 'focus' } as unknown as Event)).toEqual({
      type: 'focus',
      key: undefined,
      mod: false,
    });
  });
});

describe('isModifierKey', () => {
  it('is Meta and Control on every platform', () => {
    expect(isModifierKey('Meta')).toBe(true);
    expect(isModifierKey('Control')).toBe(true);
    expect(isModifierKey('Shift')).toBe(false);
    expect(isModifierKey(undefined)).toBe(false);
  });
});

describe('the hint', () => {
  it('shows the key to hold, then what to do while holding it', () => {
    const passive = reachHint('⌘', false);
    expect(passive.key).toBe('⌘');
    expect(passive.text).toMatch(/hold/i);

    const held = reachHint('⌘', true);
    expect(held.key).toBeNull();
    expect(held.text).toMatch(/click/i);
  });

  it('names whatever key the platform uses', () => {
    expect(reachHint('Ctrl', false).key).toBe('Ctrl');
  });

  it('names both things holding buys you', () => {
    expect(reachHint('⌘', false).text).toMatch(/scroll/i);
    expect(reachHint('⌘', false).text).toMatch(/click/i);
    expect(reachHint('⌘', true).text).toMatch(/scroll/i);
  });

  it('reads as an affordance rather than a watermark', () => {
    // It is the feature's only chance to be found: any pointer movement
    // dismisses the saver, so nobody will ever hover it to learn what it is.
    const hint = read('src', 'renderer', 'components', 'screensaver', 'reach-hint.tsx');
    expect(hint).toContain('<kbd');
    expect(hint).toMatch(/rounded-full[\s\S]{0,120}border/);
    // Fading on a timer left an hour-old screen with no hint at all.
    expect(hint).not.toContain('saver-hint-settle');
    expect(read('src', 'renderer', 'styles', 'globals.css')).not.toContain('saver-hint-settle');
  });
});

describe('the wiring, at the source', () => {
  const host = read('src', 'renderer', 'components', 'screensaver', 'screensaver-host.tsx');
  const story = read('src', 'renderer', 'components', 'news', 'story.tsx');

  it('decides the exemption before it touches the idle clock', () => {
    // noteActivity both resets the clock and flips the saver off, so inside
    // the activity handler the guard has to come first.
    const handler = host.slice(host.indexOf('const onActivity'));
    expect(handler.indexOf('reachStep(')).toBeGreaterThanOrEqual(0);
    expect(handler.indexOf('reachStep(')).toBeLessThan(handler.indexOf('noteActivity'));
    expect(handler).toMatch(/if \(!outcome\.wakes\) return;[\s\S]{0,120}noteActivity/);
  });

  it('clears a reach the moment the saver stops being reachable', () => {
    expect(host).toMatch(/if \(!reachable\)[\s\S]{0,80}applyReach\(false\)/);
  });

  it('lets a press through to the story while reaching', () => {
    expect(host).toMatch(/onPointerDownCapture[\s\S]{0,300}if \(reaching\) return/);
  });

  it('ends the reach when the window loses focus', () => {
    expect(host).toContain("addEventListener('blur'");
  });

  it('opens a story by letting the anchor do its own work', () => {
    // target="_blank" becomes a window.open that main turns into
    // shell.openExternal; preventing the default would break exactly that.
    expect(host).toContain("closest?.('a[href]')");
    const click = host.slice(host.indexOf('onClick={(event)'), host.indexOf('className={cn('));
    expect(click).toMatch(/closest\?\.\('a\[href\]'\)[\s\S]{0,500}setTimeout/);
    // The call, not the word — the comment above it names it too.
    expect(click).not.toMatch(/event\.preventDefault\(\)/);
  });

  it('shows the cursor only while reaching', () => {
    expect(host).toMatch(/reaching[\s\S]{0,120}cursor-none/);
  });

  it('leaves the home page ignorant of all this', () => {
    // story.tsx is shared: a plain click on the home page must keep opening
    // the link with nothing dismissed.
    expect(story).not.toMatch(/reach|screensaver|saver/i);
  });
});
