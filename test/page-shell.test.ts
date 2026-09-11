// The page frame. Every page inside the app shell renders through PageShell,
// so moving between pages — or between settings sections — never shifts the
// column, the header or the scrollbar. A hand-rolled `mx-auto max-w-*`
// container is how the frame drifted apart page by page, so none may remain.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAGE_FRAME } from '../src/renderer/components/page-shell';

const ROOT = join(import.meta.dirname, '..');
const RENDERER = join(ROOT, 'src', 'renderer');
const read = (rel: string) => readFileSync(join(RENDERER, rel), 'utf8');

// Outside the frame by design. The session room and recap are rendered bare
// by app-shell.tsx; the rest keep a wide viewer or workspace layout of their
// own (the ticket workspace is shared with the side panel and sizes itself).
const OUTSIDE_THE_FRAME = [
  'pages/session/session-page.tsx',
  'pages/session/session-completed-page.tsx',
  'pages/recordings/',
  'pages/board-page.tsx',
  'pages/ticket-page.tsx',
  'pages/projects/blueprint-page.tsx',
];

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : entry.name.endsWith('.tsx') ? [path] : [];
  });
}

const PAGES = walk(join(RENDERER, 'pages'))
  .map((path) => relative(RENDERER, path))
  .filter((rel) => !OUTSIDE_THE_FRAME.some((prefix) => rel.startsWith(prefix)));

// A route page has a default export; the other files under pages/ are pieces
// of one and render inside its frame.
const ROUTE_PAGES = PAGES.filter((rel) => /^export default function/m.test(read(rel)));

// A string literal that centres a page-sized column of its own: an xl size or
// a pixel width beside mx-auto. Text measures (max-w-md, max-w-prose) are not
// columns, and the frame's own token is the one width a band outside PageShell
// may line up against.
function centresOwnColumn(src: string): boolean {
  const literals = src.match(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g) ?? [];
  return literals.some((lit) => /\bmx-auto\b/.test(lit) && /\bmax-w-(\d?xl|\[\d)/.test(lit));
}

describe('the page frame', () => {
  it('is one fixed column: a width token, one top and one bottom padding', () => {
    expect(PAGE_FRAME).toBe('mx-auto w-full max-w-[var(--page-w)] px-6 pt-10 pb-[var(--page-pb)]');
  });

  it('declares its tokens once, in globals.css', () => {
    const css = read('styles/globals.css');
    for (const token of ['--page-w:', '--page-pb:', '--page-min-h:']) {
      expect(css, `${token} missing from :root`).toContain(token);
    }
    // Without a permanent track a page that scrolls and one that does not
    // centre on different pixels.
    expect(css).toMatch(/html\s*\{[^}]*overflow-y:\s*scroll/);
  });

  it('is what the app shell sizes to — never the bare viewport', () => {
    const shell = read('components/app-shell.tsx');
    expect(shell).not.toContain('min-h-screen');
    expect(shell).toContain('min-h-[var(--page-min-h)]');
  });

  it('every route page renders through it', () => {
    const offenders = ROUTE_PAGES.filter(
      (rel) => !/\b(PageShell|SettingsPageShell)\b/.test(read(rel)),
    );
    expect(offenders, 'wrap the page in PageShell (components/page-shell.tsx)').toEqual([]);
  });

  it('no page hand-rolls a centred column of its own', () => {
    const offenders = PAGES.filter((rel) => centresOwnColumn(read(rel)));
    expect(offenders, 'use PageShell (components/page-shell.tsx) instead').toEqual([]);
  });

  it('no page adds a viewport-height wrapper inside the frame', () => {
    const offenders = PAGES.filter((rel) => read(rel).includes('min-h-screen'));
    expect(offenders, 'the app shell already sets the page height').toEqual([]);
  });

  it('every settings section wears the same shell, with nothing to widen it', () => {
    const shell = read('components/settings/settings-page-shell.tsx');
    expect(shell).not.toContain('maxWidth');
    expect(shell).toContain('<PageShell>');
    for (const rel of PAGES) {
      for (const m of read(rel).matchAll(/<SettingsPageShell\b([^>]*)>/g)) {
        expect(m[1]!.trim(), `${rel}: ${m[0]}`).toMatch(/^active=(\{[^}]+\}|"[^"]+")$/);
      }
    }
  });

  it('the backend gate sits inside a frame and never supplies one', () => {
    expect(read('components/yeaboi/backend-gate.tsx')).not.toMatch(/max-w-|mx-auto/);
  });
});
