// The rule that decides where a window in this app may navigate. Pure, so it
// needs no Electron to be tested.

import { describe, expect, it } from 'vitest';
import { navigationAllowed } from '../src/main/permissions';

describe('navigationAllowed', () => {
  it('allows the loopback backend on any port', () => {
    expect(navigationAllowed('http://127.0.0.1:8000/api/me')).toBe(true);
    expect(navigationAllowed('http://localhost:5173/')).toBe(true);
  });

  it('allows the packaged renderer origin', () => {
    expect(navigationAllowed('app://yeaboi/index.html')).toBe(true);
    expect(navigationAllowed('app://other/index.html')).toBe(false);
  });

  it('refuses a host that merely starts with the loopback address', () => {
    // A prefix test would accept this, and a page that navigated there would
    // still hold the preload bridge.
    expect(navigationAllowed('http://127.0.0.1.attacker.example/')).toBe(false);
    expect(navigationAllowed('http://127.0.0.1evil.example/')).toBe(false);
  });

  it('refuses the outside world and unparseable input', () => {
    expect(navigationAllowed('https://example.com/')).toBe(false);
    expect(navigationAllowed('file:///etc/passwd')).toBe(false);
    expect(navigationAllowed('not a url')).toBe(false);
  });

  it('allows the dev server it was given, by origin', () => {
    expect(navigationAllowed('http://dev.internal:5399/#/home', 'http://dev.internal:5399/')).toBe(
      true,
    );
    expect(navigationAllowed('http://other.internal:5399/', 'http://dev.internal:5399/')).toBe(
      false,
    );
  });

  it('refuses everything else when no dev server is running', () => {
    expect(navigationAllowed('https://yeaboi.ai/')).toBe(false);
  });
});
