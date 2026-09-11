// Every run page offers the context picker and sends what it chose. The pages
// are read as text: the node lane renders nothing, and what matters here is
// that a mount and its run body cannot drift apart page by page.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PAGES = join(import.meta.dirname, '..', 'src', 'renderer', 'pages', 'yeaboi');
const read = (rel: string) => readFileSync(join(PAGES, rel), 'utf8');

// page → the mode its picker reads options for
const MOUNTS: Record<string, string> = {
  'standup/standup-page.tsx': 'standup',
  'analysis/analysis-setup-page.tsx': 'analysis',
  'reporting/reporting-setup-page.tsx': 'reporting',
  'poker/poker-setup-page.tsx': 'poker',
  'retro/retro-page.tsx': 'retro',
  'review/review-page.tsx': 'review',
};

describe('the context picker on the run pages', () => {
  for (const [page, mode] of Object.entries(MOUNTS)) {
    it(`${page} mounts the picker for ${mode} and spreads its body into the run`, () => {
      const src = read(page);
      expect(src).toContain(`useContextScope('${mode}')`);
      expect(src).toContain('<ContextPicker');
      expect(src).toContain(`mode="${mode}"`);
      expect(src).toContain('...reads.body()');
    });
  }

  it('never hard-codes the three keys — the hook owns them', () => {
    for (const page of Object.keys(MOUNTS)) {
      const src = read(page);
      expect(src).not.toMatch(/project_label:/);
      expect(src).not.toMatch(/\bcontext:\s/);
    }
  });
});
