/**
 * A provider failure is shown in our words, not the backend's.
 *
 * The banner used to render the snapshot's `message` verbatim, which is how
 * "Provider anthropic circuit open (consecutive_failures=2); failing fast to
 * prevent retry amplification" reached a user — and, because the open circuit
 * re-classified the failure as transient, it said "Anthropic is having
 * trouble" when the real answer was an unreplaced placeholder key.
 */

import { describe, expect, it } from 'vitest';

import {
  providerFailureDetail,
  providerFailureLabel,
  providerLabel,
} from '../src/shared/provider-copy';

const CODES = [
  'PROVIDER_INVALID_KEY',
  'PROVIDER_CREDIT_EXHAUSTED',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_TRANSIENT',
  'PROVIDER_ERROR',
  null,
  undefined,
];

/** Words that only mean something to whoever wrote the retry helper. */
const INTERNALS = ['circuit', 'consecutive_failures', 'amplification', 'PROVIDER_', 'fail fast'];

describe('providerFailureDetail', () => {
  it('never leaks the retry helper’s vocabulary', () => {
    for (const code of CODES) {
      const detail = providerFailureDetail(code, 'anthropic');
      for (const word of INTERNALS) {
        expect(detail.toLowerCase(), `${String(code)} → ${detail}`).not.toContain(
          word.toLowerCase(),
        );
      }
    }
  });

  it('always names the provider and stays one sentence a person can act on', () => {
    for (const code of CODES) {
      const detail = providerFailureDetail(code, 'anthropic');
      expect(detail).toContain('Anthropic');
      expect(detail.length).toBeLessThan(200);
    }
  });

  it('points an invalid key at the placeholder case, which is the common one', () => {
    const detail = providerFailureDetail('PROVIDER_INVALID_KEY', 'anthropic');
    expect(detail).toContain('Settings → Set-up');
    expect(detail).toContain('placeholder');
  });

  it('says whose key it is when the org brought their own', () => {
    expect(providerFailureDetail('PROVIDER_INVALID_KEY', 'openai', true)).toContain('your API key');
    expect(providerFailureDetail('PROVIDER_INVALID_KEY', 'openai', false)).toContain('the API key');
  });

  it('distinguishes credit from auth — they need different actions', () => {
    expect(providerFailureDetail('PROVIDER_CREDIT_EXHAUSTED', 'anthropic')).toContain('credit');
    expect(providerFailureDetail('PROVIDER_INVALID_KEY', 'anthropic')).not.toContain('credit');
  });
});

describe('providerFailureLabel', () => {
  it('gives the settings row a reason, never a bare "error"', () => {
    expect(providerFailureLabel('PROVIDER_INVALID_KEY')).toBe('key rejected');
    expect(providerFailureLabel('PROVIDER_CREDIT_EXHAUSTED')).toBe('out of credits');
    expect(providerFailureLabel('PROVIDER_RATE_LIMITED')).toBe('rate limited');
  });

  it('falls back rather than rendering an unknown code at the user', () => {
    for (const code of ['PROVIDER_TRANSIENT', 'SOMETHING_NEW', null, undefined]) {
      expect(providerFailureLabel(code)).toBe('not responding');
    }
  });
});

describe('providerLabel', () => {
  it('uses the vendor’s own capitalisation where we know it', () => {
    expect(providerLabel('openai')).toBe('OpenAI');
    expect(providerLabel('elevenlabs')).toBe('ElevenLabs');
  });

  it('title-cases anything it has not met', () => {
    expect(providerLabel('newvendor')).toBe('Newvendor');
  });
});
