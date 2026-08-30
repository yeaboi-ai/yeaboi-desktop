// Shim for `next-auth/react`, aliased in electron.vite.config.ts.
//
// The desktop has no NextAuth: identity is a name and email stored by the
// main process (settings.json, auto-minted at startup), and every consumer of
// useSession() in the planning UI reads only session.user.{name,email,image}
// plus a loading status. SessionProvider here IS the identity provider —
// providers.tsx keeps its import untouched.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

/** The identity main auto-mints; repeated here only as a render-safe fallback
 *  for a malformed settings store. */
const FALLBACK_USER = { name: 'You', email: 'you@yeaboi.local', image: null };

export interface Session {
  user: { id?: string; name?: string | null; email?: string | null; image?: string | null };
  expires?: string;
}

type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface SessionContextValue {
  data: Session | null;
  status: SessionStatus;
  update: () => Promise<Session | null>;
}

const SessionContext = createContext<SessionContextValue>({
  data: null,
  status: 'loading',
  update: async () => null,
});

export function SessionProvider({ children }: { children: ReactNode; session?: unknown }) {
  const [state, setState] = useState<{ data: Session | null; status: SessionStatus }>({
    data: null,
    status: 'loading',
  });

  const load = useCallback(async (): Promise<Session | null> => {
    const identity = await window.yeaboi.getIdentity();
    const session: Session = {
      user: identity ? { name: identity.name, email: identity.email, image: null } : FALLBACK_USER,
    };
    setState({ data: session, status: 'authenticated' });
    return session;
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SessionContext.Provider value={{ ...state, update: load }}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}

export async function signIn(): Promise<void> {
  // Identity is set on first run; nothing to sign in to.
}

export function getCsrfToken(): Promise<string> {
  return Promise.resolve('');
}
