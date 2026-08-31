// The privacy chrome: the /privacy and /system-check routes, the About hook
// that lands on them, and the onboarding welcome paragraph — which restates
// the backend's copy owner (yeaboi.ai's src/yeaboi/privacy.py) and is pinned
// here so the two surfaces cannot drift apart silently.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import registry from '../src/renderer/lib/yeaboi/routes.json';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const ROUTES_TSX = read('../src/renderer/app/routes.tsx');
const MAIN_TSX = read('../src/renderer/main.tsx');
const WIZARD_TSX = read('../src/renderer/components/onboarding/onboarding-wizard.tsx');

describe('privacy chrome', () => {
  it('registers /privacy and /system-check as capability-null routes', () => {
    const byPath = new Map(registry.routes.map((r) => [r.path, r]));
    expect(byPath.get('/privacy')?.capability).toBeNull();
    expect(byPath.get('/system-check')?.capability).toBeNull();
  });

  it('serves both routes from real pages in routes.tsx', () => {
    expect(ROUTES_TSX).toContain(`'/privacy': <PrivacyPage />`);
    expect(ROUTES_TSX).toContain(`'/system-check': <SystemCheckPage />`);
  });

  it('the About gesture lands on the privacy page', () => {
    // onAbout had no renderer listener for years — the tray's About just
    // raised the window. Keep the subscription alive.
    expect(MAIN_TSX).toContain('onAbout');
    expect(MAIN_TSX).toContain(`navigate('/privacy')`);
  });

  it('the privacy section joined the System settings tab', () => {
    const system = registry.settings_tabs.find((t) => t.title === 'System');
    expect(system?.sections).toContain('privacy');
  });

  it('the onboarding welcome restates the privacy statement', () => {
    // The wizard cannot fetch /api/meta/privacy — the backend may not be up on
    // the welcome step — so the paragraph is hardcoded. This pin holds it to
    // the claims yeaboi.privacy makes; change both together or not at all.
    expect(WIZARD_TSX).toContain('yeaboi collects nothing about you.');
    expect(WIZARD_TSX).toContain('~/.yeaboi');
    expect(WIZARD_TSX).toContain('Ollama keeps them fully local');
    expect(WIZARD_TSX).toContain('unless you choose to send feedback');
  });
});
