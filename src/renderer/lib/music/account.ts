// What a service's catalogue row lets the Music page offer: a sign-in, a
// library to browse, or nothing more than the shelf — including against an
// older backend that has no sign-in at all.

import type { MusicService } from '@shared/music-links';
import type { MusicServiceState } from '@/lib/yeaboi/ambience';

export interface AccountFeatures {
  /** The backend predates the sign-in: hide Sign in and Browse, keep the shelf. */
  olderBackend: boolean;
  /** Offer Sign in. */
  signIn: boolean;
  /** Signed in, with the name to show. */
  signedIn: boolean;
  account: string;
  /** Show the Browse block: a signed-in library, or Apple's local one. */
  browse: boolean;
}

export function accountFeatures(
  service: MusicService,
  state: MusicServiceState | null,
): AccountFeatures {
  const olderBackend = !state || state.signed_in === undefined;
  if (olderBackend)
    return { olderBackend, signIn: false, signedIn: false, account: '', browse: false };
  const canSignIn = state.can_sign_in === true;
  const signedIn = canSignIn && state.signed_in === true;
  return {
    olderBackend,
    signIn: canSignIn && !signedIn,
    signedIn,
    account: signedIn ? (state.account ?? '') : '',
    // Apple's library is the Music app's own, read on this Mac, no sign-in.
    browse: signedIn || service === 'apple_music',
  };
}
