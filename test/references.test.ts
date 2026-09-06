// The composer's @ menu, pure half: which sources are offered, where a
// trigger sits, how a pick becomes a chip, what a screenshot may be, and the
// sentences the menu says.

import { describe, expect, it } from 'vitest';
import {
  LINK_SOURCE,
  REFERENCE_COPY,
  SCREENSHOT_MAX_BYTES,
  SCREENSHOT_SOURCE,
  attachmentSrc,
  chipLabel,
  iconFor,
  isHttpUrl,
  linkReference,
  menuSources,
  pickedReference,
  referenceSources,
  removeTrigger,
  sameReference,
  screenshotVerdict,
  sidecarSource,
  triggerAt,
  typedReference,
} from '../src/renderer/lib/yeaboi/references';

const row = (key: string, connected = true, label = key) => ({
  key,
  label,
  connected,
  family: 'tracker',
  accent: 'rgb(1,2,3)',
  glyph: '',
});

describe('referenceSources', () => {
  it('offers every connected integration in catalog order, then Link and Screenshot', () => {
    const sources = referenceSources([
      row('jira'),
      row('github', false),
      row('aws'),
      row('notion'),
    ]);
    expect(sources.map((s) => s.key)).toEqual(['jira', 'aws', 'notion', 'link', 'screenshot']);
    expect(sources.at(-2)).toBe(LINK_SOURCE);
    expect(sources.at(-1)).toBe(SCREENSHOT_SOURCE);
  });

  it('knows which sources the sidecar can list; the rest take a typed subject', () => {
    const sources = referenceSources([row('jira'), row('aws'), row('azure'), row('custom-thing')]);
    expect(sources.map((s) => [s.key, s.searchable])).toEqual([
      ['jira', true],
      ['aws', false],
      ['azure', true],
      ['custom-thing', false],
      ['link', false],
      ['screenshot', false],
    ]);
    expect(sidecarSource('azure')).toBe('azdevops');
    expect(iconFor('azdevops')).toBe('azure');
    expect(iconFor('jira')).toBe('jira');
    expect(sources[2]!.icon).toBe('azure');
    expect(iconFor('azdevops')).toBe('azure');
    expect(iconFor('jira')).toBe('jira');
    expect(sources[2]!.icon).toBe('azure');
    expect(sidecarSource('jira')).toBe('jira');
  });

  it('leaves out the music and voice services, which are not things to point at', () => {
    const rows = [
      row('jira'),
      { ...row('spotify'), family: 'music' },
      { ...row('elevenlabs'), family: 'media' },
    ];
    expect(referenceSources(rows).map((s) => s.key)).toEqual(['jira', 'link', 'screenshot']);
  });

  it('is only the two built-ins with nothing connected', () => {
    expect(referenceSources([]).map((s) => s.key)).toEqual(['link', 'screenshot']);
  });
});

describe('menuSources', () => {
  const sources = referenceSources([row('jira'), row('github')]);

  it('leads with the connections on @ and with the built-ins on /', () => {
    expect(menuSources(sources, '@').map((s) => s.key)).toEqual([
      'jira',
      'github',
      'link',
      'screenshot',
    ]);
    expect(menuSources(sources, '/').map((s) => s.key)).toEqual([
      'link',
      'screenshot',
      'jira',
      'github',
    ]);
  });

  it('narrows by the word typed after the trigger', () => {
    expect(menuSources(sources, '@', 'git').map((s) => s.key)).toEqual(['github']);
    expect(menuSources(sources, '/', 'SCR').map((s) => s.key)).toEqual(['screenshot']);
    expect(menuSources(sources, '@', 'zzz')).toEqual([]);
  });
});

describe('triggerAt', () => {
  it('opens on @ or / at the start or after a space or punctuation', () => {
    expect(triggerAt('@', 1)).toEqual({ start: 0, trigger: '@', query: '' });
    expect(triggerAt('todo app @ji', 12)).toEqual({ start: 9, trigger: '@', query: 'ji' });
    expect(triggerAt('/screen', 7)).toEqual({ start: 0, trigger: '/', query: 'screen' });
    expect(triggerAt('done, /link', 11)).toEqual({ start: 6, trigger: '/', query: 'link' });
  });

  it('never opens inside a word or a URL', () => {
    expect(triggerAt('mail me@example', 15)).toBeNull();
    expect(triggerAt('see https://x.y/z', 17)).toBeNull();
    expect(triggerAt('a/b', 3)).toBeNull();
  });

  it('closes once the caret leaves the word', () => {
    expect(triggerAt('@jira ', 6)).toBeNull();
    expect(triggerAt('@jira more', 3)).toEqual({ start: 0, trigger: '@', query: 'ji' });
    expect(triggerAt('plain words', 11)).toBeNull();
  });
});

describe('removeTrigger', () => {
  it('takes the trigger word out and lands the caret where it was', () => {
    const hit = { start: 9, trigger: '@' as const, query: 'ji' };
    expect(removeTrigger('todo app @ji', hit, 12)).toEqual({ text: 'todo app', caret: 8 });
    expect(removeTrigger('todo app @ji for ops', hit, 12)).toEqual({
      text: 'todo app for ops',
      caret: 9,
    });
    expect(removeTrigger('@', { start: 0, trigger: '@', query: '' }, 1)).toEqual({
      text: '',
      caret: 0,
    });
  });
});

describe('the chip a pick makes', () => {
  const jira = referenceSources([row('jira', true, 'Jira')])[0]!;

  it('labels a typed subject with its source', () => {
    expect(typedReference(jira, '  OPS-12  ')).toEqual({
      source: 'jira',
      subject: 'OPS-12',
      label: 'Jira OPS-12',
      url: null,
    });
  });

  it('keeps a picked row’s words and link', () => {
    const item = {
      id: 'jira:OPS-1',
      subject: 'OPS-1',
      label: 'OPS-1 Fix login',
      detail: 'Open',
      url: '',
    };
    expect(pickedReference(jira, item)).toEqual({
      source: 'jira',
      subject: 'OPS-1',
      label: 'OPS-1 Fix login',
      url: null,
    });
    expect(pickedReference(jira, { ...item, url: 'https://x/OPS-1' }).url).toBe('https://x/OPS-1');
  });

  it('labels a link by its host and path', () => {
    expect(linkReference('https://stripe.com/docs/webhooks')).toEqual({
      source: 'link',
      subject: 'https://stripe.com/docs/webhooks',
      label: 'stripe.com/docs/webhooks',
      url: 'https://stripe.com/docs/webhooks',
    });
    expect(linkReference('https://example.com/').label).toBe('example.com');
    expect(isHttpUrl('https://x.y')).toBe(true);
    expect(isHttpUrl('ftp://x.y')).toBe(false);
    expect(isHttpUrl('x.y')).toBe(false);
  });

  it('is the same thing by source and subject, and shows its label or subject', () => {
    const a = { source: 'jira', subject: 'OPS-1', label: 'OPS-1 Fix', url: null };
    expect(sameReference(a, { ...a, label: 'other' })).toBe(true);
    expect(sameReference(a, { ...a, source: 'linear' })).toBe(false);
    expect(chipLabel(a)).toBe('OPS-1 Fix');
    expect(chipLabel({ ...a, label: '' })).toBe('OPS-1');
  });
});

describe('attachmentSrc', () => {
  it('prefixes the backend origin onto a relative upload path', () => {
    expect(attachmentSrc('http://127.0.0.1:8000', '/uploads/projects/a.png')).toBe(
      'http://127.0.0.1:8000/uploads/projects/a.png',
    );
    expect(attachmentSrc('http://127.0.0.1:8000/', 'uploads/a.png')).toBe(
      'http://127.0.0.1:8000/uploads/a.png',
    );
  });

  it('leaves an absolute, blob or data url alone', () => {
    expect(attachmentSrc('http://x', 'https://cdn/a.png')).toBe('https://cdn/a.png');
    expect(attachmentSrc('http://x', 'blob:abc')).toBe('blob:abc');
  });
});

describe('screenshotVerdict', () => {
  it('takes png, jpeg, webp and gif under the cap', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
      expect(screenshotVerdict({ name: 'a', type, size: 10 })).toEqual({ ok: true });
    }
    expect(
      screenshotVerdict({ name: 'a.png', type: 'image/png', size: SCREENSHOT_MAX_BYTES }),
    ).toEqual({ ok: true });
  });

  it('refuses the wrong kind, an empty file, and an oversize one, naming the file', () => {
    expect(screenshotVerdict({ name: 'notes.txt', type: 'text/plain', size: 10 })).toEqual({
      refusal: 'notes.txt is not a PNG, JPEG, WebP or GIF image.',
    });
    expect(screenshotVerdict({ name: 'a.png', type: 'image/png', size: 0 })).toEqual({
      refusal: 'a.png is empty.',
    });
    expect(
      screenshotVerdict({ name: 'a.png', type: 'image/png', size: SCREENSHOT_MAX_BYTES + 1 }),
    ).toEqual({
      refusal: 'a.png is over 8 MB.',
    });
  });
});

describe('the words on the menu', () => {
  it('keeps every sentence in sentence case with no arrows', () => {
    const texts = [
      ...(Object.values(REFERENCE_COPY).filter((value) => typeof value === 'string') as string[]),
      REFERENCE_COPY.searchPlaceholder('Jira'),
      REFERENCE_COPY.useTyped('OPS-1'),
      REFERENCE_COPY.noReader('AWS'),
      REFERENCE_COPY.notAttached(['a.png', 'b.png']),
      REFERENCE_COPY.removeLabel('a.png'),
    ];
    expect(texts.length).toBeGreaterThan(10);
    for (const text of texts) {
      expect(text).not.toMatch(/[→←·]/);
      expect(text.replace(/\b(PNG|JPEG|WebP|GIF|URL|MB|AWS|OPS-1)\b/g, '')).not.toMatch(
        /\b[A-Z]{2,}\b/,
      );
    }
  });
});
