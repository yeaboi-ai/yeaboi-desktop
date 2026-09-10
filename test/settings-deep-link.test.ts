// The way back from the Catalog.
//
// Credentials now hides what is not set up, so the Catalog's "this one lives
// in Credentials" rows have to point at something that will actually appear.
// ?add=<section> is that contract, and the parameter is consumed so a
// bookmarked link does not reveal a card forever.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { credentialsHref } from '../src/renderer/lib/settings/deep-link';

const read = (...parts: string[]) => readFileSync(join(__dirname, '..', ...parts), 'utf8');

const page = read('src', 'renderer', 'pages', 'yeaboi', 'settings', 'yeaboi-settings-page.tsx');
const panel = read('src', 'renderer', 'components', 'settings', 'system-panel.tsx');

describe('credentialsHref', () => {
  it('addresses an ordinary integration by its settings section', () => {
    expect(credentialsHref({ key: 'github', section: 'github' })).toBe(
      '/settings/credentials?add=github',
    );
  });

  it('addresses the voice pair by key, because they share a section', () => {
    // ElevenLabs and Tavus are both section 'voice'; only the key tells them apart.
    expect(credentialsHref({ key: 'elevenlabs', section: 'voice' })).toBe(
      '/settings/system?add=elevenlabs',
    );
    expect(credentialsHref({ key: 'tavus', section: 'voice' })).toBe('/settings/system?add=tavus');
  });
});

describe('the credentials page answers it', () => {
  it('reveals the card the parameter names', () => {
    expect(page).toContain("searchParams.get('add')");
    expect(page).toContain('setRevealed(wanted)');
    expect(page).toContain('setOpenCard(wanted)');
  });

  it('consumes the parameter, so a bookmark does not pin the card open', () => {
    // Deletes the one key rather than clearing the query string, so the next
    // parameter added to these routes does not vanish with it.
    expect(page).toContain("rest.delete('add')");
    expect(page).toContain('setSearchParams(rest, { replace: true })');
    expect(page).not.toContain('setSearchParams({}');
  });
});

describe('the system tab answers it too', () => {
  it('takes a reveal and honours it for the voice cards', () => {
    expect(page).toContain('reveal={revealed}');
    expect(panel).toContain("reveal === 'elevenlabs'");
    expect(panel).toContain("reveal === 'tavus'");
  });
});

describe('the catalog sends people there', () => {
  it('the managed branch links the computed href, not a bare page', () => {
    const sheet = read('src', 'renderer', 'components', 'yeaboi', 'connector-sheet.tsx');
    expect(sheet).toContain('credentialsHref(row)');
  });

  it('export destinations reuse the same mechanism', () => {
    const card = read('src', 'renderer', 'components', 'settings', 'export-destinations-card.tsx');
    expect(card).toContain('/settings/credentials?add=');
  });
});
