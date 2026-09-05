// The music routes' error vocabulary and what a catalogue row lets the page offer.

import { describe, expect, it } from 'vitest';
import { accountFeatures } from '../src/renderer/lib/music/account';
import { MusicApiError, fallsBackToApp, musicError } from '../src/renderer/lib/yeaboi/music';

describe('musicError', () => {
  it('keeps the vendor code and its status', () => {
    const error = musicError(409, { error: 'Sign in again', code: 'signed_out' });
    expect(error).toBeInstanceOf(MusicApiError);
    expect(error.code).toBe('signed_out');
    expect(error.status).toBe(409);
    expect(error.message).toBe('Sign in again');
    expect(
      musicError(429, { error: 'slow down', code: 'rate_limited', retry_after: 7 }).retryAfter,
    ).toBe(7);
  });

  it('reads a bare 404 as an older backend', () => {
    expect(musicError(404, { error: 'not found' }, '/api/music/spotify/library').code).toBe(
      'older_backend',
    );
    expect(musicError(404, { error: 'x', code: 'unsupported_shelf' }).code).toBe(
      'unsupported_shelf',
    );
  });

  it('never invents a code', () => {
    expect(musicError(400, { error: 'q must not be empty' }).code).toBe('bad_request');
    expect(musicError(500, {}, '/x').code).toBe('unknown');
    expect(musicError(500, null, '/x').message).toBe('/x → 500');
    expect(musicError(403, { error: 'no', code: 'made_up' }).code).toBe('unknown');
  });

  it('names the codes the Spotify app answers instead', () => {
    expect(fallsBackToApp(musicError(403, { error: 'Premium', code: 'premium_required' }))).toBe(
      true,
    );
    expect(fallsBackToApp(musicError(409, { error: 'idle', code: 'no_active_device' }))).toBe(true);
    expect(fallsBackToApp(musicError(409, { error: 'out', code: 'signed_out' }))).toBe(false);
    expect(fallsBackToApp(new Error('plain'))).toBe(false);
  });
});

describe('accountFeatures', () => {
  const base = { key: 'spotify' as const, label: 'Spotify', connected: true, playback: 'desktop' };

  it('offers nothing against an older backend, and keeps the shelf', () => {
    expect(accountFeatures('spotify', base)).toMatchObject({
      olderBackend: true,
      signIn: false,
      browse: false,
    });
    expect(accountFeatures('spotify', null).olderBackend).toBe(true);
  });

  it('offers Sign in, then the name and Browse', () => {
    const out = accountFeatures('spotify', {
      ...base,
      can_sign_in: true,
      signed_in: false,
      account: '',
    });
    expect(out).toMatchObject({
      olderBackend: false,
      signIn: true,
      signedIn: false,
      browse: false,
    });
    const on = accountFeatures('spotify', {
      ...base,
      can_sign_in: true,
      signed_in: true,
      account: 'dinho',
    });
    expect(on).toMatchObject({ signIn: false, signedIn: true, account: 'dinho', browse: true });
  });

  it('asks for a client before offering a sign-in it cannot start', () => {
    const row = { ...base, key: 'youtube_music' as const, can_sign_in: true, account: '' };
    expect(
      accountFeatures('youtube_music', { ...row, signed_in: false, client: 'none' }),
    ).toMatchObject({
      signIn: true,
      needsClient: true,
      ownClient: false,
    });
    expect(
      accountFeatures('youtube_music', { ...row, signed_in: false, client: 'own' }),
    ).toMatchObject({
      signIn: true,
      needsClient: false,
      ownClient: true,
    });
    // A backend that knows sign-ins but not clients reads as configured.
    expect(accountFeatures('youtube_music', { ...row, signed_in: false }).needsClient).toBe(false);
    // Signed in, the client no longer matters.
    expect(
      accountFeatures('youtube_music', { ...row, signed_in: true, client: 'none' }).needsClient,
    ).toBe(false);
  });

  it('browses Apple without any sign-in', () => {
    const apple = accountFeatures('apple_music', {
      ...base,
      key: 'apple_music',
      label: 'Apple Music',
      can_sign_in: false,
      signed_in: false,
      account: '',
    });
    expect(apple).toMatchObject({ signIn: false, signedIn: false, browse: true });
  });
});
