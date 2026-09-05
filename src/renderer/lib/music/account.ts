// What a service's catalogue row lets the Music page offer: a sign-in, the
// setup that has to come first when no OAuth app exists to sign in through,
// a library to browse, or nothing more than the shelf — including against an
// older backend that has no sign-in at all.

import type { MusicService } from '@shared/music-links';
import type { MusicServiceState } from '@/lib/yeaboi/ambience';

export interface AccountFeatures {
  /** The backend predates the sign-in: hide Sign in and Browse, keep the shelf. */
  olderBackend: boolean;
  /** Offer Sign in. */
  signIn: boolean;
  /** No OAuth app to sign in through yet: ask for the user's own first. */
  needsClient: boolean;
  /** The sign-in would go through the user's own app. */
  ownClient: boolean;
  /** Signed in, with the name to show. */
  signedIn: boolean;
  account: string;
  /** Show the Browse block: a signed-in library, or Apple's local one. */
  browse: boolean;
}

const NOTHING: AccountFeatures = {
  olderBackend: true,
  signIn: false,
  needsClient: false,
  ownClient: false,
  signedIn: false,
  account: '',
  browse: false,
};

export function accountFeatures(
  service: MusicService,
  state: MusicServiceState | null,
): AccountFeatures {
  if (!state || state.signed_in === undefined) return NOTHING;
  const canSignIn = state.can_sign_in === true;
  const signedIn = canSignIn && state.signed_in === true;
  // A backend that knows sign-ins but not clients reads as configured.
  const client = state.client ?? 'builtin';
  return {
    olderBackend: false,
    signIn: canSignIn && !signedIn,
    needsClient: canSignIn && !signedIn && client === 'none',
    ownClient: client === 'own',
    signedIn,
    account: signedIn ? (state.account ?? '') : '',
    // Apple's library is the Music app's own, read on this Mac, no sign-in.
    browse: signedIn || service === 'apple_music',
  };
}
