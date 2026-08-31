// Every provider yeaboi ships must draw its own mark on the setup screen.
//
// `ProviderIcon` falls back to a two-letter monogram for names it does not
// know. That fallback exists for genuinely unknown ids, and it fails silently:
// a typo'd key or a provider added on the Python side alone still renders, just
// as "DE" in a box. This pins the set instead.

import { describe, expect, it } from 'vitest';
import { FALLBACK_GLYPHS, ICON_PATHS } from '../src/renderer/components/yeaboi/provider-icon';

// Mirrors `_PROVIDER_CARDS` in yeaboi.ai's src/yeaboi/ui/provider_select/_constants.py,
// which is what /api/settings/providers serves this app. Adding a provider
// there is a change here too — that is the point of this list.
const PROVIDERS = [
  'anthropic',
  'google',
  'openai',
  'bedrock',
  'ollama',
  'xai',
  'deepseek',
  'moonshot',
  'mistral',
  'qwen',
  'zai',
];

describe('every shipped provider has a mark', () => {
  it.each(PROVIDERS)('%s resolves to a path or a glyph, never a monogram', (provider) => {
    const drawn = provider in ICON_PATHS || provider in FALLBACK_GLYPHS;
    expect(drawn, `${provider} would render as a two-letter monogram`).toBe(true);
  });

  it.each(PROVIDERS.filter((p) => p !== 'bedrock'))('%s has real path data', (provider) => {
    // Bedrock is the documented exception: no usable mark ships in any icon set
    // we bundle, so it wears a lucide cloud.
    expect(ICON_PATHS[provider]?.length ?? 0).toBeGreaterThan(50);
  });

  it('every path is a valid SVG path starting with a move command', () => {
    for (const [provider, d] of Object.entries(ICON_PATHS)) {
      expect(
        d.startsWith('M') || d.startsWith('m'),
        `${provider} path does not start with a move`,
      ).toBe(true);
      expect(
        /[^MmLlHhVvCcSsQqTtAaZz0-9.,\s-]/.test(d),
        `${provider} path has stray characters`,
      ).toBe(false);
    }
  });

  it('marks are distinct — no provider silently reuses another’s logo', () => {
    const paths = Object.values(ICON_PATHS);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
