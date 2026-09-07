// Every provider yeaboi ships must draw its own mark on the setup screen.
//
// `ProviderIcon` falls back to a two-letter monogram for names it does not
// know. That fallback exists for genuinely unknown ids, and it fails silently:
// a typo'd key or a provider added on the Python side alone still renders, just
// as "DE" in a box. This pins the set instead.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

describe('the music services', () => {
  const contract = JSON.parse(
    readFileSync(join(__dirname, '..', 'contracts', 'v1', 'connectors.json'), 'utf8'),
  ) as { connectors: { key: string; family: string; managed_by: string }[] };

  it('are catalogue rows in the music family with a real logomark each', () => {
    for (const key of ['spotify', 'apple_music', 'youtube_music']) {
      const row = contract.connectors.find((c) => c.key === key);
      expect(row, `${key} is not in the vendored contract`).toBeDefined();
      expect(row?.family).toBe('music');
      expect(row?.managed_by).toBe('connections');
      expect(ICON_PATHS).toHaveProperty(key);
    }
  });
});

describe('every catalogued connector has a mark', () => {
  // The vendored identity table (contracts/v1/connectors.json) is the roster
  // the catalog page renders — a key with no mark falls through to a monogram,
  // which is what "we forgot" looks like. Since schema 3 the wire carries a
  // per-vendor emoji, so a key we ship no logomark for still has a deliberate
  // identity — but a logomark is preferred, so keys expected to rely on the
  // emoji tier are named, not silently accumulated.
  const contract = JSON.parse(
    readFileSync(join(__dirname, '..', 'contracts', 'v1', 'connectors.json'), 'utf8'),
  ) as { connectors: { key: string; accent: string; glyph: string }[] };

  const MARK_ALIASES: Record<string, string> = { azdevops: 'azure' };
  // No icon set we bundle carries these vendors' marks; their wire emoji is
  // the mark, on purpose.
  const EMOJI_ONLY = new Set(['launchdarkly']);

  it.each(contract.connectors.map((c) => c.key))('%s resolves, never a monogram', (key) => {
    const name = MARK_ALIASES[key] ?? key;
    const drawn = name in ICON_PATHS || name in FALLBACK_GLYPHS || EMOJI_ONLY.has(key);
    expect(drawn, `${key} would render as a two-letter monogram`).toBe(true);
  });

  it.each([...EMOJI_ONLY])(
    '%s stays honest — no forgotten logomark shadowed by the emoji',
    (key) => {
      expect(key in ICON_PATHS || key in FALLBACK_GLYPHS).toBe(false);
    },
  );

  it('every row carries the emoji the terminal shows and a surface may fall back to', () => {
    for (const { key, glyph } of contract.connectors) {
      expect(glyph?.trim().length ?? 0, `${key} carries no glyph`).toBeGreaterThan(0);
    }
  });

  it('every accent is an rgb() triple the tile can bloom', () => {
    for (const { key, accent } of contract.connectors) {
      expect(/^rgb\(\d{1,3},\d{1,3},\d{1,3}\)$/.test(accent), `${key} accent ${accent}`).toBe(true);
    }
  });
});
