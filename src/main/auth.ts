// Token minting — the desktop's whole replacement for NextAuth. The planning
// backend (backend/src/app/auth.py::decode_jwt) verifies an HS256 signature
// and exp, then creates or looks up the user by the email claim. Any process
// holding the shared secret can therefore be "signed in"; main holds it, the
// renderer asks for a fresh token whenever it needs one. HMAC is microseconds,
// so every mint is fresh and there is no refresh state machine.

import { SignJWT } from 'jose';
import type { Settings } from './settings';

export interface AuthPayload {
  token: string;
  apiUrl: string;
  wsUrl: string;
}

export async function mintToken(settings: Settings): Promise<AuthPayload | null> {
  const identity = settings.identity;
  if (!identity) return null; // first run — the renderer shows the identity screen
  const secret = new TextEncoder().encode(settings.jwtSecret);
  const token = await new SignJWT({
    email: identity.email,
    name: identity.name,
    picture: null,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);
  return { token, apiUrl: settings.apiUrl, wsUrl: settings.wsUrl };
}
